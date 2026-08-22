import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as qrcode from 'qrcode';
import { BatchService } from '../batch/batch.service';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs';
import * as path from 'path';
import { SourcesService } from '../sources/sources.service';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: any;
  private readonly logger = new Logger(WhatsappService.name);
  private currentQrUrl: string | null = null;
  private clientReady: boolean = false;
  private messageBuffer: Map<string, any[]> = new Map();
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map();
  private groupNameCache: Map<string, string> = new Map();
  private baileysModule: any;

  constructor(
    private readonly batchService: BatchService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => SourcesService))
    private readonly sourcesService: SourcesService,
  ) {}

  onModuleInit() {
    this.initializeWhatsApp();
  }

  getQrCodeUrl() {
    return this.currentQrUrl;
  }

  isReady() {
    return this.clientReady;
  }

  getClient() {
    return this.client;
  }

  private async loadBaileys() {
    if (!this.baileysModule) {
      this.baileysModule = await eval('import("@whiskeysockets/baileys")');
    }
    return this.baileysModule;
  }

  private async initializeWhatsApp() {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
    } = await this.loadBaileys();
    const { state, saveCreds } = await useMultiFileAuthState('./.baileys_auth');

    this.client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    this.client.ev.on('creds.update', saveCreds);

    this.client.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger.log(
          'New QR code generated! View it at http://localhost:3001/api/whatsapp/qr',
        );
        try {
          this.currentQrUrl = await qrcode.toDataURL(qr);
        } catch (err) {
          this.logger.error('Failed to generate QR data URL', err);
        }
      }

      if (connection === 'close') {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
        this.logger.warn(
          'WhatsApp disconnected. Reconnecting: ' + shouldReconnect,
        );
        this.clientReady = false;
        if (shouldReconnect) {
          this.initializeWhatsApp();
        }
      } else if (connection === 'open') {
        this.logger.log('✅ WhatsApp Linked Device connected and active!');
        this.clientReady = true;
        this.currentQrUrl = null;
      }
    });

    this.client.ev.on('messages.upsert', async (m: any) => {
      const settings = await this.settingsService.getSettings();
      if (!settings.isSyncActive) {
        this.logger.log(
          'Live Sync is paused in settings. Ignoring incoming messages.',
        );
        return;
      }

      if (m.type === 'notify') {
        for (const msg of m.messages) {
          // Allow messages from ourselves for testing
          // if (msg.key.fromMe) continue;

          const senderId = msg.key.remoteJid;
          if (!senderId) continue;
          
          const isAllowed = await this.sourcesService.isSourceAllowed(senderId, msg.pushName);
          if (!isAllowed) continue;

          if (!this.messageBuffer.has(senderId)) {
            this.messageBuffer.set(senderId, []);
          }
          this.messageBuffer.get(senderId)!.push(msg);

          if (this.bufferTimers.has(senderId)) {
            clearTimeout(this.bufferTimers.get(senderId));
          }

          // Wait 3.5 seconds of silence before processing to allow heavy videos to catch up
          this.bufferTimers.set(
            senderId,
            setTimeout(() => this.flushMessageBuffer(senderId), 3500),
          );
        }
      }
    });

    this.client.ev.on(
      'messaging-history.set',
      async ({ chats, contacts, messages, isLatest }: any) => {
        this.logger.log(
          `Received historical sync: ${messages?.length || 0} messages`,
        );

        const settings = await this.settingsService.getSettings();
        if (!settings.isSyncActive) {
          this.logger.log(
            'Live Sync is paused in settings. Ignoring historical sync as well.',
          );
          return;
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

          const msgTime = parseInt(msg.messageTimestamp) || 0;
          if (msgTime < cutoffSeconds) {
            droppedCount++;
            continue;
          }

          const sender = msg.key.remoteJid;
          if (!chatGroups[sender]) {
            const isAllowed = await this.sourcesService.isSourceAllowed(sender, msg.pushName);
            if (!isAllowed) {
              chatGroups[sender] = null; // Mark as disabled
            } else {
              chatGroups[sender] = [];
            }
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
              await this.handleIncomingMessage(msg);
            }
            // Add a tiny delay between bundles so BatchService can isolate them safely
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      },
    );

    this.logger.log('Initializing WhatsApp Web Bridge (Baileys)...');
  }

  private async flushMessageBuffer(senderId: string) {
    const messages = this.messageBuffer.get(senderId) || [];
    this.messageBuffer.delete(senderId);
    this.bufferTimers.delete(senderId);

    if (messages.length === 0) return;

    this.logger.log(
      `Flushing buffered ${messages.length} messages for ${senderId}`,
    );

    // DO NOT sort by messageTimestamp.
    // WhatsApp processes forwarded text messages faster than media, so sorting by timestamp
    // puts all texts before all media, destroying the natural sequence of forwarded batches.
    // The arrival order (m.messages push order) is the most accurate reflection of the chat.

    for (const msg of messages) {
      await this.handleIncomingMessage(msg);
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

  async handleIncomingMessage(msg: any) {
    const { downloadMediaMessage } = await this.loadBaileys();
    const messageContent = this.unwrapMessage(msg.message);
    if (!messageContent) return;

    const jid = msg.key.remoteJid;
    let senderName = msg.pushName;

    if (jid?.endsWith('@g.us')) {
      if (this.groupNameCache.has(jid)) {
        senderName = this.groupNameCache.get(jid)!;
      } else {
        try {
          const groupMeta = await this.client.groupMetadata(jid);
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
            reuploadRequest: this.client.updateMediaMessage,
          },
        );

        mimeType =
          imageMessage?.mimetype ||
          videoMessage?.mimetype ||
          documentMessage?.mimetype ||
          'image/jpeg';
        const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpeg'; // Strip out any charset etc
        const fileName = `${messageId}.${ext}`.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const relPath = `uploads/${fileName}`;
        const absolutePath = path.join(process.cwd(), relPath);

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
}
