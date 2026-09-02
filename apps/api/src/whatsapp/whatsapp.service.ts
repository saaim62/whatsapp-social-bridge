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
  private initializing: Set<string> = new Set();

  constructor(
    private readonly batchService: BatchService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => SourcesService))
    private readonly sourcesService: SourcesService,
    private readonly prisma: PrismaService,
  ) {}

  private cachedWaVersion: any = null;

  async onModuleInit() {
    // Run initialization in background so NestJS can bind to port 3001 immediately
    setImmediate(async () => {
      try {
        const users = await this.prisma.user.findMany();
        for (const user of users) {
          this.initializeWhatsApp(user.id).catch(err => {
            this.logger.error(`Failed to initialize WhatsApp for user ${user.id}:`, err);
          });
        }
      } catch (err) {
        this.logger.error('Failed to load users for WhatsApp init:', err);
      }
    });
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
    if (this.initializing.has(userId)) {
      this.logger.warn(`Skipping concurrent initializeWhatsApp for ${userId}`);
      return;
    }
    this.initializing.add(userId);

    try {
      const existingClient = this.clients.get(userId);
      if (existingClient) {
        try {
          existingClient.ev.removeAllListeners();
          existingClient.end(undefined);
        } catch (e) {}
      }

      const {
        default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestWaWebVersion,
    } = await this.loadBaileys();
    
    // Store session files securely in separate folders per user
    const sessionDir = `./sessions/user_${userId}_auth`;
    if (!fs.existsSync('./sessions')) {
      fs.mkdirSync('./sessions');
    }
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    if (!this.cachedWaVersion) {
      try {
        this.cachedWaVersion = await fetchLatestWaWebVersion();
      } catch (err) {
        this.cachedWaVersion = { version: [2, 3000, 1046623424], isLatest: true };
      }
    }
    const { version, isLatest } = this.cachedWaVersion;
    this.logger.log(`Using WhatsApp Web version v${version.join('.')}, isLatest: ${isLatest}`);

    const client = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
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

    client.ev.on('contacts.update', async (contacts: any[]) => {
      this.logger.log(`Received contacts update for ${contacts.length} contacts.`);
      if (contacts && contacts.length > 0) {
        await this.sourcesService.syncContacts(userId, contacts);
      }
    });

    client.ev.on('chats.upsert', async (chats: any[]) => {
      this.logger.log(`Received chats upsert for ${chats.length} chats.`);
      const chatContacts = chats.map((c: any) => ({
        id: c.id,
        name: c.name || c.verifiedName || c.pushName || c.notify
      })).filter((c: any) => c.name);
      if (chatContacts.length > 0) {
        await this.sourcesService.syncContacts(userId, chatContacts);
      }
    });

    client.ev.on('chats.update', async (chats: any[]) => {
      const chatContacts = chats.map((c: any) => ({
        id: c.id,
        name: c.name || c.verifiedName || c.pushName || c.notify
      })).filter((c: any) => c.name);
      if (chatContacts.length > 0) {
        await this.sourcesService.syncContacts(userId, chatContacts);
      }
    });

    client.ev.on('messages.upsert', async (m: any) => {
      this.logger.log(`RAW messages.upsert EVENT TYPE: ${m.type}, count: ${m.messages?.length || 0}`);
      
      const debugLog = `[${new Date().toISOString()}] UP EVENT: ${m.type} for ${userId}, count: ${m.messages?.length || 0}\n`;
      require('fs').appendFileSync(require('path').join(process.cwd(), 'debug-messages.log'), debugLog);

      if (m.messages && m.messages.length > 0) {
        this.saveMessagesToCache(userId, m.messages);
      }

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
          
          require('fs').appendFileSync(require('path').join(process.cwd(), 'debug-messages.log'), `[DEBUG] fromMe: ${msg.key.fromMe}, isAllowed: ${isAllowed}, senderId: ${senderId}\n`);

          // Ignore messages sent by ourselves from being processed as product drops
          if (msg.key.fromMe) continue;
          
          if (!isAllowed) continue;
          
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
      async (history: any) => {
        const contacts = history.contacts || [];
        const chats = history.chats || [];
        const messages = history.messages || [];
        this.logger.log(
          `Received historical sync for user ${userId}: ${contacts.length} contacts, ${chats.length} chats, ${messages.length} messages.`,
        );

        if (messages && messages.length > 0) {
          this.saveMessagesToCache(userId, messages);
        }

        // 1. Synchronize Address Book & Contacts first
        const uniqueContacts = new Map<string, any>();
        for (const c of contacts) {
          if (c.id && (c.name || c.verifiedName || c.pushName || c.notify)) {
            uniqueContacts.set(c.id, c);
          }
        }
        for (const c of chats) {
          const name = c.name || c.verifiedName || c.pushName || c.notify;
          if (name && c.id && !uniqueContacts.has(c.id)) {
            uniqueContacts.set(c.id, { id: c.id, name });
          }
        }
        for (const m of messages) {
          const jid = m.key?.remoteJid;
          if (jid && m.pushName && !uniqueContacts.has(jid)) {
            uniqueContacts.set(jid, { id: jid, name: m.pushName });
          }
        }

        const allContacts = Array.from(uniqueContacts.values());
        if (allContacts.length > 0) {
          this.sourcesService.syncContacts(userId, allContacts).catch((err) =>
            this.logger.error(`Failed async syncContacts for user ${userId}`, err),
          );
        }

        // 2. Check settings
        const settings = await this.settingsService.getSettings(userId);
        if (!settings.isSyncActive) {
          this.logger.log(
            'Live Sync is paused in settings. Skipping historical sync.',
          );
          return;
        }

        if (!messages || messages.length === 0) return;

        const depthHours = settings.historySyncDepthHours || 24;
        const cutoffTimeMs = Date.now() - depthHours * 60 * 60 * 1000;
        const cutoffSeconds = Math.floor(cutoffTimeMs / 1000);

        this.logger.log(
          `Historical buffer depth: ${depthHours}h. Filtering ${messages.length} messages since ${new Date(cutoffTimeMs).toISOString()}...`,
        );

        // Check if user has ANY enabled sources already configured in DB
        const enabledSourcesCount = await this.prisma.whatsappSource.count({
          where: { userId, isEnabled: true },
        });

        // 3. Filter messages by timestamp and not fromMe
        let droppedCount = 0;
        const chatGroups: Record<string, any[]> = {};

        for (const msg of messages) {
          if (!msg.message || msg.key?.fromMe) continue;

          const sender = msg.key?.remoteJid;
          if (!sender) continue;

          const tsRaw = msg.messageTimestamp;
          const msgTime = typeof tsRaw === 'number'
            ? tsRaw
            : typeof tsRaw?.toNumber === 'function'
              ? tsRaw.toNumber()
              : (tsRaw?.low || parseInt(tsRaw?.toString() || '0', 10));

          if (msgTime < cutoffSeconds) {
            droppedCount++;
            continue;
          }

          if (!chatGroups[sender]) {
            chatGroups[sender] = [];
          }
          chatGroups[sender].push(msg);
        }

        this.logger.log(
          `Historical buffer filtered: ${Object.keys(chatGroups).length} chats found within ${depthHours}h window. Dropped ${droppedCount} older messages.`,
        );

        // Load existing batches and media to ensure ZERO duplicates
        const existingBatches = await this.prisma.productBatch.findMany({
          where: { userId },
          select: { whatsappMessageId: true, senderId: true, rawText: true },
        });
        const existingMedia = await this.prisma.mediaAsset.findMany({
          where: { batch: { userId } },
          select: { whatsappMediaId: true },
        });
        const existingMsgIds = new Set<string>();
        for (const b of existingBatches) {
          if (b.whatsappMessageId) existingMsgIds.add(b.whatsappMessageId);
        }
        for (const m of existingMedia) {
          if (m.whatsappMediaId) existingMsgIds.add(m.whatsappMediaId);
        }

        let totalBundlesIngested = 0;

        for (const sender in chatGroups) {
          const chatMsgs = chatGroups[sender];
          if (!chatMsgs || chatMsgs.length === 0) continue;

          // Source gating check
          if (enabledSourcesCount > 0) {
            const source = await this.prisma.whatsappSource.findUnique({
              where: { userId_jid: { userId, jid: sender } },
            });
            // If the user already has custom source filtering configured, respect disabled sources
            if (source && !source.isEnabled) {
              this.logger.log(`Skipping historical messages for disabled source: ${sender}`);
              continue;
            }
          }

          // Register/resolve source in DB
          let pushName = chatMsgs[0]?.pushName;
          if (sender.endsWith('@newsletter') && !pushName) {
            try {
              const meta = await client.newsletterMetadata('jid', sender);
              if (meta?.name) pushName = meta.name;
            } catch (err) {}
          }
          await this.sourcesService.isSourceAllowed(sender, pushName, userId);

          // If user has NO sources enabled yet (fresh node connection), auto-enable this source
          if (enabledSourcesCount === 0) {
            await this.prisma.whatsappSource.updateMany({
              where: { userId, jid: sender },
              data: { isEnabled: true },
            });
          }

          // Sort messages strictly by timestamp
          const sortedChatMessages = chatMsgs.sort((a: any, b: any) => {
            const tsA = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : Number(a.messageTimestamp?.toString() || 0);
            const tsB = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : Number(b.messageTimestamp?.toString() || 0);
            return tsA - tsB;
          });

          const productBundles = this.extractProductBundles(sortedChatMessages);

          for (const bundle of productBundles) {
            const isMsgDuplicate = bundle.some((m: any) => m.key?.id && existingMsgIds.has(m.key.id));
            const bundleText = bundle.map((m: any) => {
              const c = this.unwrapMessage(m.message);
              return c?.imageMessage?.caption || c?.videoMessage?.caption || c?.conversation || c?.extendedTextMessage?.text || '';
            }).join('\n').trim();

            const isContentDuplicate = bundleText.length > 20 && existingBatches.some(
              b => b.senderId === sender && b.rawText && b.rawText.trim() === bundleText
            );

            if (isMsgDuplicate || isContentDuplicate) {
              continue; // Skip duplicate!
            }

            for (const msg of bundle) {
              await this.handleIncomingMessage(userId, msg);
              if (msg.key?.id) existingMsgIds.add(msg.key.id);
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
            await this.batchService.forceCloseActiveBatch(userId, sender);
            totalBundlesIngested++;
          }
        }

        this.logger.log(`Finished retroactive historical sync for user ${userId}: ${totalBundlesIngested} product drops ingested.`);

        if (totalBundlesIngested > 0) {
          await this.prisma.notification.create({
            data: {
              userId,
              title: 'Historical Sync Completed',
              message: `Successfully ingested ${totalBundlesIngested} product drops from the last ${depthHours} hours.`,
              type: 'success',
              link: '/catalog',
            },
          });
        }
      },
    );

    this.logger.log('Initializing WhatsApp Web Bridge (Baileys)...');
    } finally {
      this.initializing.delete(userId);
    }
  }

  private async flushMessageBuffer(userId: string, senderId: string) {
    const bufferKey = `${userId}_${senderId}`;
    const messages = this.messageBuffer.get(bufferKey) || [];
    this.messageBuffer.set(bufferKey, []);
    this.bufferTimers.delete(bufferKey);

    require('fs').appendFileSync(require('path').join(process.cwd(), 'debug-messages.log'), `[DEBUG FLUSH] bufferKey: ${bufferKey}, messages: ${messages.length}\n`);

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
    const debugLog = `[${new Date().toISOString()}] from: ${senderName} (${jid})
    msgKeys: [${msgKeys.join(', ')}], isMedia: ${isMedia}, captionLen: ${caption.length}
    RAW: ${JSON.stringify(messageContent)}\n\n`;
    fs.appendFileSync(path.join(process.cwd(), 'debug-messages.log'), debugLog);
    
    if (!isMedia) {
      this.logger.log(
        `  -> RAW TEXT MSG: ${JSON.stringify(messageContent).substring(0, 500)}`,
      );
    }

    if (!isMedia && !caption) return;

    let localPath: string | null = null;
    let mimeType =
      imageMessage?.mimetype ||
      videoMessage?.mimetype ||
      documentMessage?.mimetype ||
      (isImageDocument ? 'image/jpeg' : isVideoDocument ? 'video/mp4' : 'image/jpeg');
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

  private getHistoryCachePath(userId: string): string {
    const dir = `./sessions`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `user_${userId}_history.json`);
  }

  private saveMessagesToCache(userId: string, newMessages: any[]) {
    try {
      const filePath = this.getHistoryCachePath(userId);
      let existing: any[] = [];
      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
          existing = [];
        }
      }

      const map = new Map<string, any>();
      for (const m of existing) {
        if (m?.key?.id) map.set(m.key.id, m);
      }
      for (const m of newMessages) {
        if (m?.key?.id) map.set(m.key.id, m);
      }

      const all = Array.from(map.values()).sort((a, b) => {
        const tsA = Number(a.messageTimestamp?.toString() || 0);
        const tsB = Number(b.messageTimestamp?.toString() || 0);
        return tsA - tsB;
      });

      // Keep latest 10,000 messages to prevent unbounded growth
      const trimmed = all.slice(-10000);
      fs.writeFileSync(filePath, JSON.stringify(trimmed));
    } catch (err) {
      this.logger.error(`Failed to save messages to history cache for user ${userId}`, err);
    }
  }

  private loadMessagesFromCache(userId: string): any[] {
    try {
      const filePath = this.getHistoryCachePath(userId);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (err) {
      this.logger.error(`Failed to load messages from history cache for user ${userId}`, err);
    }
    return [];
  }

  private extractProductBundles(sortedChatMessages: any[]): any[][] {
    let currentBundle: any[] = [];
    let bundleHasMedia = false;
    let bundleHasDesc = false;
    let bundleFirstItemType: 'media' | 'desc' | 'both' | null = null;
    let lastTimestamp = 0;
    const productBundles: any[][] = [];

    for (const msg of sortedChatMessages) {
      const content = this.unwrapMessage(msg.message);
      if (!content) continue;

      const isMedia = !!(
        content.imageMessage ||
        content.videoMessage ||
        content.documentMessage?.mimetype?.startsWith('image/') ||
        content.documentMessage?.mimetype?.startsWith('video/')
      );

      let caption = '';
      if (content.imageMessage) caption = content.imageMessage.caption || '';
      else if (content.videoMessage) caption = content.videoMessage.caption || '';
      else if (content.documentMessage) caption = content.documentMessage.caption || '';
      else if (content.conversation) caption = content.conversation;
      else if (content.extendedTextMessage) caption = content.extendedTextMessage.text || '';

      const hasMedia = isMedia;
      const hasDesc = caption.trim().length > 5;

      if (!hasMedia && !hasDesc) continue;

      let shouldStartNewBundle = false;
      const tsRaw = msg.messageTimestamp;
      const ts = typeof tsRaw === 'number' ? tsRaw : Number(tsRaw?.toString() || 0);

      if (currentBundle.length > 0 && lastTimestamp > 0 && ts - lastTimestamp > 300) {
        shouldStartNewBundle = true;
      } else if (hasDesc && !hasMedia) {
        if (bundleHasDesc) shouldStartNewBundle = true;
      } else if (hasMedia && !hasDesc) {
        if (bundleHasDesc && (bundleFirstItemType === 'media' || bundleFirstItemType === 'both')) {
          shouldStartNewBundle = true;
        }
      } else if (hasMedia && hasDesc) {
        if (bundleHasDesc) shouldStartNewBundle = true;
      }

      if (shouldStartNewBundle) {
        if (currentBundle.length > 0) productBundles.push(currentBundle);
        currentBundle = [msg];
        bundleHasMedia = hasMedia;
        bundleHasDesc = hasDesc;
        bundleFirstItemType = hasMedia && hasDesc ? 'both' : hasMedia ? 'media' : 'desc';
        lastTimestamp = ts;
      } else {
        currentBundle.push(msg);
        if (!bundleFirstItemType) {
          bundleFirstItemType = hasMedia && hasDesc ? 'both' : hasMedia ? 'media' : 'desc';
        }
        if (hasMedia) bundleHasMedia = true;
        if (hasDesc) bundleHasDesc = true;
        lastTimestamp = ts;
      }
    }
    if (currentBundle.length > 0) productBundles.push(currentBundle);
    return productBundles;
  }

  async resyncHistoricalBuffer(userId: string, customDepthHours?: number) {
    const settings = await this.settingsService.getSettings(userId);
    const depthHours = customDepthHours || settings.historySyncDepthHours || 24;

    if (customDepthHours && customDepthHours !== settings.historySyncDepthHours) {
      await this.settingsService.updateSettings(userId, { historySyncDepthHours: customDepthHours });
    }

    const messages = this.loadMessagesFromCache(userId);
    if (!messages || messages.length === 0) {
      return {
        success: false,
        message: 'No messages found in historical archive yet. Disconnect & link WhatsApp once via QR code to seed the retroactive archive.',
        imported: 0,
        skipped: 0,
        depthHours,
      };
    }

    const cutoffTimeMs = Date.now() - depthHours * 60 * 60 * 1000;
    const cutoffSeconds = Math.floor(cutoffTimeMs / 1000);

    const existingBatches = await this.prisma.productBatch.findMany({
      where: { userId },
      select: { whatsappMessageId: true, senderId: true, rawText: true },
    });
    const existingMedia = await this.prisma.mediaAsset.findMany({
      where: { batch: { userId } },
      select: { whatsappMediaId: true },
    });

    const existingMsgIds = new Set<string>();
    for (const b of existingBatches) {
      if (b.whatsappMessageId) existingMsgIds.add(b.whatsappMessageId);
    }
    for (const m of existingMedia) {
      if (m.whatsappMediaId) existingMsgIds.add(m.whatsappMediaId);
    }

    const chatGroups: Record<string, any[]> = {};
    for (const msg of messages) {
      if (!msg.message || msg.key?.fromMe) continue;
      const sender = msg.key?.remoteJid;
      if (!sender) continue;

      const tsRaw = msg.messageTimestamp;
      const msgTime = typeof tsRaw === 'number'
        ? tsRaw
        : typeof tsRaw?.toNumber === 'function'
          ? tsRaw.toNumber()
          : (tsRaw?.low || parseInt(tsRaw?.toString() || '0', 10));

      if (msgTime < cutoffSeconds) continue;

      if (!chatGroups[sender]) chatGroups[sender] = [];
      chatGroups[sender].push(msg);
    }

    const enabledSourcesCount = await this.prisma.whatsappSource.count({
      where: { userId, isEnabled: true },
    });

    let importedCount = 0;
    let skippedCount = 0;

    for (const sender in chatGroups) {
      const chatMsgs = chatGroups[sender];
      if (!chatMsgs || chatMsgs.length === 0) continue;

      if (enabledSourcesCount > 0) {
        const source = await this.prisma.whatsappSource.findUnique({
          where: { userId_jid: { userId, jid: sender } },
        });
        if (source && !source.isEnabled) {
          this.logger.log(`Skipping retroactive sync for disabled source: ${sender}`);
          continue;
        }
      }

      await this.sourcesService.isSourceAllowed(sender, chatMsgs[0]?.pushName, userId);
      if (enabledSourcesCount === 0) {
        await this.prisma.whatsappSource.updateMany({
          where: { userId, jid: sender },
          data: { isEnabled: true },
        });
      }

      const sortedChatMessages = chatMsgs.sort((a: any, b: any) => {
        const tsA = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : Number(a.messageTimestamp?.toString() || 0);
        const tsB = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : Number(b.messageTimestamp?.toString() || 0);
        return tsA - tsB;
      });

      const productBundles = this.extractProductBundles(sortedChatMessages);

      for (const bundle of productBundles) {
        // DEDUPLICATION: Skip if ANY message ID is already registered
        const isMsgDuplicate = bundle.some((m: any) => m.key?.id && existingMsgIds.has(m.key.id));
        
        // Also skip if rawText identically matches existing batch from this sender
        const bundleText = bundle.map((m: any) => {
          const c = this.unwrapMessage(m.message);
          return c?.imageMessage?.caption || c?.videoMessage?.caption || c?.conversation || c?.extendedTextMessage?.text || '';
        }).join('\n').trim();

        const isContentDuplicate = bundleText.length > 20 && existingBatches.some(
          b => b.senderId === sender && b.rawText && b.rawText.trim() === bundleText
        );

        if (isMsgDuplicate || isContentDuplicate) {
          skippedCount++;
          continue; // Skip duplicate!
        }

        for (const msg of bundle) {
          await this.handleIncomingMessage(userId, msg);
          if (msg.key?.id) existingMsgIds.add(msg.key.id);
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
        await this.batchService.forceCloseActiveBatch(userId, sender);
        importedCount++;
      }
    }

    if (importedCount > 0) {
      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Historical Re-sync Complete',
          message: `Ingested ${importedCount} new product drop(s) from the last ${depthHours} hours (${skippedCount} duplicates skipped).`,
          type: 'success',
          link: '/catalog',
        },
      });
    }

    return {
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      depthHours,
    };
  }
}
