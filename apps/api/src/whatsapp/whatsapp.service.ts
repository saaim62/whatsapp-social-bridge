import { Injectable, OnModuleInit, Logger, forwardRef, Inject } from '@nestjs/common';
import * as qrcode from 'qrcode';
import { BatchService } from '../batch/batch.service';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs';
import * as path from 'path';
import { SourcesService } from '../sources/sources.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private clients: Map<string, any> = new Map();
  private qrUrls: Map<string, string | null> = new Map();
  private clientsReady: Map<string, boolean> = new Map();
  
  private readonly logger = new Logger(WhatsappService.name);
  private messageBuffer: Map<string, any[]> = new Map();
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map();
  private groupNameCache: Map<string, string> = new Map();
  private baileysModule: any;

  constructor(
    private readonly batchService: BatchService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => SourcesService))
    private readonly sourcesService: SourcesService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const users = await this.prisma.user.findMany();
    for (const user of users) {
      this.initializeWhatsApp(user.id);
    }
  }

  getQrCodeUrl(userId: string) {
    return this.qrUrls.get(userId) || null;
  }

  isReady(userId: string) {
    return !!this.clientsReady.get(userId);
  }

  getClient(userId: string) {
    return this.clients.get(userId);
  }

  private async loadBaileys() {
    if (!this.baileysModule) {
      this.baileysModule = await eval('import("@whiskeysockets/baileys")');
    }
    return this.baileysModule;
  }

  async initializeWhatsApp(userId: string) {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
    } = await this.loadBaileys();
    
    // Store session files securely in separate folders per user
    const sessionDir = `./sessions/user_${userId}_auth`;
    if (!fs.existsSync('./sessions')) {
      fs.mkdirSync('./sessions');
    }
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });
    
    this.clients.set(userId, client);

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger.log(`New QR code generated for user ${userId}!`);
        try {
          this.qrUrls.set(userId, await qrcode.toDataURL(qr));
        } catch (err) {
          this.logger.error(`Failed to generate QR data URL for user ${userId}`, err);
        }
      }

      if (connection === 'close') {
        const boomError = lastDisconnect?.error as any;
        const statusCode = boomError?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        this.logger.warn(`WhatsApp disconnected for user ${userId}. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        this.clientsReady.set(userId, false);
        
        if (shouldReconnect) {
          this.initializeWhatsApp(userId);
        } else {
          // If logged out (401), we MUST clear the session data so the user can scan a new QR code!
          this.logger.warn(`Session for ${userId} was logged out or invalid. Clearing session data.`);
          const authFolder = `./sessions/user_${userId}_auth`;
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
          // Now re-initialize to trigger a fresh QR code generation
          this.initializeWhatsApp(userId);
        }
      } else if (connection === 'open') {
        this.logger.log(`✅ WhatsApp Linked Device connected and active for user ${userId}!`);
        this.clientsReady.set(userId, true);
        this.qrUrls.set(userId, null);
      }
    });

    client.ev.on('contacts.upsert', async (contacts: any[]) => {
      this.logger.log(`Received contacts upsert for ${contacts.length} contacts.`);
      if (contacts && contacts.length > 0) {
        await this.sourcesService.syncContacts(userId, contacts);
      }
    });

    client.ev.on('messages.upsert', async (m: any) => {
      const settings = await this.settingsService.getSettings(userId);
      if (!settings.isSyncActive) {
        this.logger.log(
          'Live Sync is paused in settings. Ignoring incoming messages.',
        );
        return;
      }

      if (m.type === 'notify' || m.type === 'append') {
        for (const msg of m.messages) {
          const senderId = msg.key.remoteJid;
          if (!senderId) continue;
          
          let pushName = msg.key.fromMe ? undefined : msg.pushName;
          
          // Auto-resolve WhatsApp Channel (newsletter) names
          if (senderId.endsWith('@newsletter') && !pushName) {
            try {
              const meta = await client.newsletterMetadata('jid', senderId);
              if (meta && meta.name) pushName = meta.name;
            } catch (err) {
              this.logger.warn(`Could not fetch channel metadata for ${senderId}`);
            }
          }
          
          const isAllowed = await this.sourcesService.isSourceAllowed(senderId, pushName, userId);
          
          // Ignore messages sent by ourselves from being processed as product drops
          if (msg.key.fromMe) continue;
          
          if (!isAllowed) continue;
          
          // Only process 'notify' messages as new incoming product drops
          if (m.type !== 'notify') continue;

          const bufferKey = `${userId}_${senderId}`;
          if (!this.messageBuffer.has(bufferKey)) {
            this.messageBuffer.set(bufferKey, []);
          }
          this.messageBuffer.get(bufferKey)!.push(msg);

          if (this.bufferTimers.has(bufferKey)) {
            clearTimeout(this.bufferTimers.get(bufferKey));
          }

          // Wait 3.5 seconds of silence before processing to allow heavy videos to catch up
          this.bufferTimers.set(
            bufferKey,
            setTimeout(() => this.flushMessageBuffer(userId, senderId), 3500),
          );
        }
      }
    });

    client.ev.on(
      'messaging-history.set',
      async ({ chats, contacts, messages, isLatest }: any) => {
        this.logger.log(
          `Received historical sync: ${messages?.length || 0} messages`,
        );

        const settings = await this.settingsService.getSettings(userId);
        if (!settings.isSyncActive) {
          this.logger.log(
            'Live Sync is paused in settings. Ignoring historical sync as well.',
          );
          return;
        }

        if (contacts && contacts.length > 0) {
          this.logger.log(`Syncing ${contacts.length} contacts...`);
          await this.sourcesService.syncContacts(userId, contacts);
        }

        if (!messages || messages.length === 0) return;

        this.logger.log(
          `Processing total historical messages to form product bundles`,
        );

        const cutoffTimeMs =
          Date.now() - settings.historySyncDepthHours * 60 * 60 * 1000;
        const cutoffSeconds = Math.floor(cutoffTimeMs / 1000);

        // Group messages by chat FIRST to avoid intertwining senders
        const chatGroups: Record<string, any[] | null> = {};
        let droppedCount = 0;
        for (const msg of messages) {
          if (!msg.message) continue;

          // Register EVERY person/group we've ever chatted with in history, regardless of how old the message is
          const sender = msg.key.remoteJid;
          if (sender && !chatGroups[sender]) {
            let pushName = msg.key.fromMe ? undefined : msg.pushName;
            
            // Auto-resolve WhatsApp Channel (newsletter) names
            if (sender.endsWith('@newsletter') && !pushName) {
              try {
                const meta = await client.newsletterMetadata('jid', sender);
                if (meta && meta.name) pushName = meta.name;
              } catch (err) {
                this.logger.warn(`Could not fetch channel metadata for ${sender}`);
              }
            }
            
            const isAllowed = await this.sourcesService.isSourceAllowed(sender, pushName, userId);
            if (!isAllowed) {
              chatGroups[sender] = null; // Mark as disabled
            } else {
              chatGroups[sender] = [];
            }
          }
          
          if (msg.key.fromMe) continue; // Ignore messages sent by ourselves from processing

          const msgTime = parseInt(msg.messageTimestamp) || 0;
          if (msgTime < cutoffSeconds) {
            droppedCount++;
            continue;
          }

          if (chatGroups[sender] !== null) {
            chatGroups[sender].push(msg);
          }
        }
        this.logger.log(
          `Ignored ${droppedCount} historical messages older than ${settings.historySyncDepthHours} hours.`,
        );

        for (const sender in chatGroups) {
          if (chatGroups[sender] === null) continue;
          
          // Sort messages strictly by WhatsApp timestamp
          const sortedChatMessages = chatGroups[sender].sort(
            (a: any, b: any) =>
              (parseInt(a.messageTimestamp) || 0) -
              (parseInt(b.messageTimestamp) || 0),
          );

          let currentBundle: any[] = [];
          let bundleHasMedia = false;
          let bundleHasDesc = false;
          let bundleFirstItemType: 'media' | 'desc' | 'both' | null = null;
          let lastTimestamp = 0;

          const productBundles: any[][] = [];

          for (const msg of sortedChatMessages) {
            const content = this.unwrapMessage(msg.message);
            const isMedia = !!(
              content.imageMessage ||
              content.videoMessage ||
              content.documentMessage?.mimetype?.startsWith('image/') ||
              content.documentMessage?.mimetype?.startsWith('video/')
            );

            let caption = '';
            if (content.imageMessage)
              caption = content.imageMessage.caption || '';
            else if (content.videoMessage)
              caption = content.videoMessage.caption || '';
            else if (content.documentMessage)
              caption = content.documentMessage.caption || '';
            else if (content.conversation) caption = content.conversation;
            else if (content.extendedTextMessage)
              caption = content.extendedTextMessage.text || '';

            const hasMedia = isMedia;
            const hasDesc = caption.trim().length > 5;

            if (!hasMedia && !hasDesc) {
              // Log what we're dropping so we can debug
              const droppedKeys = Object.keys(content).filter(
                (k) => k !== 'messageContextInfo',
              );
              if (caption.trim().length > 0) {
                this.logger.log(
                  `  [bundle-drop] Msg ${msg.key.id} from ${sender}: too short (${caption.length} chars): "${caption.substring(0, 50)}"`,
                );
              }
              continue;
            }

            let shouldStartNewBundle = false;
            const ts = parseInt(msg.messageTimestamp) || 0;

            if (
              currentBundle.length > 0 &&
              lastTimestamp > 0 &&
              ts - lastTimestamp > 300
            ) {
              // Strict Fallback: 5 minutes gap guarantees a new product drop
              shouldStartNewBundle = true;
            } else if (hasDesc && !hasMedia) {
              if (bundleHasDesc) shouldStartNewBundle = true;
            } else if (hasMedia && !hasDesc) {
              if (
                bundleHasDesc &&
                (bundleFirstItemType === 'media' ||
                  bundleFirstItemType === 'both')
              )
                shouldStartNewBundle = true;
            } else if (hasMedia && hasDesc) {
              if (bundleHasDesc) shouldStartNewBundle = true;
            }

            if (shouldStartNewBundle) {
              if (currentBundle.length > 0) productBundles.push(currentBundle);
              currentBundle = [msg];
              bundleHasMedia = hasMedia;
              bundleHasDesc = hasDesc;
              bundleFirstItemType =
                hasMedia && hasDesc ? 'both' : hasMedia ? 'media' : 'desc';
              lastTimestamp = ts;
            } else {
              currentBundle.push(msg);
              if (!bundleFirstItemType) {
                bundleFirstItemType =
                  hasMedia && hasDesc ? 'both' : hasMedia ? 'media' : 'desc';
              }
              if (hasMedia) bundleHasMedia = true;
              if (hasDesc) bundleHasDesc = true;
              lastTimestamp = ts;
            }
          }
          if (currentBundle.length > 0) productBundles.push(currentBundle);

          // Process each bundle as a live message blast to reuse the exact same logic
          for (const bundle of productBundles) {
            for (const msg of bundle) {
              await this.handleIncomingMessage(userId, msg);
            }
            // Add a tiny delay between bundles so BatchService can isolate them safely
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      },
    );

    this.logger.log('Initializing WhatsApp Web Bridge (Baileys)...');
  }

  private async flushMessageBuffer(userId: string, senderId: string) {
    const bufferKey = `${userId}_${senderId}`;
    const messages = this.messageBuffer.get(bufferKey) || [];
    this.messageBuffer.set(bufferKey, []);
    this.bufferTimers.delete(bufferKey);

    if (messages.length === 0) return;

    this.logger.log(
      `Flushing buffered ${messages.length} messages for ${senderId}`,
    );

    // DO NOT sort by messageTimestamp.
    // WhatsApp processes forwarded text messages faster than media, so sorting by timestamp
    // puts all texts before all media, destroying the natural sequence of forwarded batches.
    // The arrival order (m.messages push order) is the most accurate reflection of the chat.

    for (const msg of messages) {
      await this.handleIncomingMessage(userId, msg);
    }
  }

  private unwrapMessage(message: any): any {
    if (!message) return message;
    let content = message;
    let unwrapped = true;
    while (unwrapped) {
      unwrapped = false;
      if (content.ephemeralMessage?.message) {
        content = content.ephemeralMessage.message;
        unwrapped = true;
      } else if (content.viewOnceMessage?.message) {
        content = content.viewOnceMessage.message;
        unwrapped = true;
      } else if (content.viewOnceMessageV2?.message) {
        content = content.viewOnceMessageV2.message;
        unwrapped = true;
      } else if (content.viewOnceMessageV2Extension?.message) {
        content = content.viewOnceMessageV2Extension.message;
        unwrapped = true;
      } else if (content.documentWithCaptionMessage?.message) {
        content = content.documentWithCaptionMessage.message;
        unwrapped = true;
      }
    }
    return content;
  }

  async handleIncomingMessage(userId: string, msg: any) {
    const { downloadMediaMessage } = await this.loadBaileys();
    const messageContent = this.unwrapMessage(msg.message);
    if (!messageContent) return;
    
    const client = this.clients.get(userId);
    if (!client) return;

    const jid = msg.key.remoteJid;
    let senderName = msg.pushName;

    if (jid?.endsWith('@g.us')) {
      if (this.groupNameCache.has(jid)) {
        senderName = this.groupNameCache.get(jid)!;
      } else {
        try {
          const groupMeta = await client.groupMetadata(jid);
          if (groupMeta && groupMeta.subject) {
            senderName = groupMeta.subject;
            this.groupNameCache.set(jid, senderName);
          }
        } catch (err) {
          this.logger.warn(`Could not fetch group metadata for ${jid}`);
        }
      }
    }

    if (!senderName) {
      senderName = 'Direct Message';
    }

    this.logger.log(`Received WhatsApp message from: ${senderName} (${jid})`);

    const imageMessage = messageContent.imageMessage;
    const videoMessage = messageContent.videoMessage;
    const documentMessage = messageContent.documentMessage;
    const isImageDocument =
      documentMessage && documentMessage.mimetype?.startsWith('image/');
    const isVideoDocument =
      documentMessage && documentMessage.mimetype?.startsWith('video/');
    const isMedia =
      !!imageMessage || !!videoMessage || isImageDocument || isVideoDocument;

    let caption = '';
    if (imageMessage) caption = imageMessage.caption || '';
    else if (videoMessage) caption = videoMessage.caption || '';
    else if (documentMessage) caption = documentMessage.caption || '';
    else if (messageContent.conversation) caption = messageContent.conversation;
    else if (messageContent.extendedTextMessage)
      caption = messageContent.extendedTextMessage.text || '';

    // DEBUG: Log what we extracted
    const msgKeys = Object.keys(messageContent).filter(
      (k) => k !== 'messageContextInfo',
    );
    this.logger.log(
      `  -> msgKeys: [${msgKeys.join(', ')}], isMedia: ${isMedia}, captionLen: ${caption.length}, captionPreview: "${caption.substring(0, 80)}"`,
    );

    // DEBUG: Dump raw message structure for non-media messages to find text
    if (!isMedia) {
      this.logger.log(
        `  -> RAW TEXT MSG: ${JSON.stringify(messageContent).substring(0, 500)}`,
      );
    }

    if (!isMedia && !caption) return;

    let localPath: string | null = null;
    let mimeType = '';
    const messageId = msg.key.id;

    if (isMedia) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            logger: this.logger as any,
            reuploadRequest: client.updateMediaMessage,
          },
        );

        mimeType =
          imageMessage?.mimetype ||
          videoMessage?.mimetype ||
          documentMessage?.mimetype ||
          'image/jpeg';
        const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpeg'; // Strip out any charset etc
        const fileName = `${messageId}.${ext}`.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const relPath = `api/uploads/${fileName}`;
        // Store physical files in 'uploads' without the api prefix in the filesystem
        const absolutePath = path.join(process.cwd(), 'uploads', fileName);

        const uploadsDir = path.dirname(absolutePath);
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        fs.writeFileSync(absolutePath, buffer);
        localPath = relPath;
        this.logger.log(`Downloaded media to ${localPath}`);
      } catch (err) {
        this.logger.error('Failed to download media from Baileys', err);
      }
    }

    const payload: any = {
      id: messageId,
      from: jid,
      senderName: senderName,
      timestamp: msg.messageTimestamp?.toString() || Date.now().toString(),
      type: isMedia ? 'image' : 'text', // BatchService uses 'image' to detect media, so we keep it for now
      userId: userId,
    };

    if (payload.type === 'image') {
      payload.image = {
        id: messageId,
        mime_type: mimeType,
        caption: caption,
      };
      payload._localPath = localPath; // Tells BatchService the media is already downloaded
    }

    // ALWAYS provide payload.text if caption exists, even for media messages,
    // so BatchService can detect isDescMsg accurately!
    if (caption) {
      payload.text = { body: caption };
    }

    // Hand off to existing BatchService pipeline
    await this.batchService.handleMessage(payload);
  }

  async disconnectWhatsApp(userId: string) {
    const client = this.clients.get(userId);
    if (client) {
      try {
        await client.logout();
      } catch (err) {
        this.logger.error(`Error logging out WhatsApp client for user ${userId}`, err);
      }
      this.clients.delete(userId);
    }
    
    this.qrUrls.delete(userId);
    this.clientsReady.set(userId, false);

    const sessionDir = `./sessions/user_${userId}_auth`;
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    this.logger.log(`Disconnected WhatsApp for user ${userId}`);
    
    // Automatically reinitialize so the user can scan a new QR code right away
    this.initializeWhatsApp(userId).catch(err => {
      this.logger.error(`Failed to reinitialize WhatsApp after disconnect:`, err);
    });

    return { success: true };
  }
}
