import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  forwardRef,
  Inject,
} from '@nestjs/common';
import * as qrcode from 'qrcode';
import { BatchService } from '../batch/batch.service';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs';
import * as path from 'path';
import { SourcesService } from '../sources/sources.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DebounceStore, DueBuffer } from './debounce.store';
import type {
  WAMessage,
  WAMessageContent,
  WASocket,
} from '@whiskeysockets/baileys';
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger';
import type { IncomingMessagePayload } from '../batch/batch.service';

/** The dynamically loaded Baileys module (ESM-only; loaded via eval-import). */
type BaileysModule = typeof import('@whiskeysockets/baileys');

/** Structural shape shared by Baileys Contact and Chat objects when all
 *  we need is an id plus the best available display name. */
export interface ContactLike {
  id: string;
  name?: string | null;
  verifiedName?: string | null;
  notify?: string | null;
  pushName?: string | null;
}

/** Loose contact/chat shape as delivered by Baileys events (proto
 *  conversations may lack an id or any name field). */
export interface ContactLikeInput {
  id?: string | null;
  name?: string | null;
  verifiedName?: string | null;
  notify?: string | null;
  pushName?: string | null;
}

/** WAMessage plus the R2 URL handleIncomingMessage stashes on it. */
type WAMessageWithOrigin = WAMessage & { _originalUrl?: string };

/** Baileys timestamps arrive as number | protobuf Long | (after a JSON
 *  round-trip) a {low, high} plain object. Normalize to epoch seconds. */
export function toContactLikes(
  chats: readonly ContactLikeInput[],
): { id: string; name: string }[] {
  return chats
    .map((c) => ({
      id: c.id ?? undefined,
      name: c.name || c.verifiedName || c.pushName || c.notify,
    }))
    .filter((c): c is { id: string; name: string } => !!c.name && !!c.id);
}

export function messageTimestampSeconds(
  ts: WAMessage['messageTimestamp'],
): number {
  if (typeof ts === 'number') return ts;
  if (ts && typeof ts === 'object') {
    // Both a real protobuf Long and its JSON round-trip form expose
    // {low, high}; reconstruct the 64-bit value from the two halves.
    const parts = ts as { low?: number; high?: number };
    return (parts.high ?? 0) * 2 ** 32 + ((parts.low ?? 0) >>> 0);
  }
  if (ts === null || ts === undefined) return 0;
  return parseInt(String(ts), 10);
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  // NOTE: the Baileys socket Maps below inherently stay in-process — a
  // live WhatsApp socket connection cannot be externalized to Redis.
  // Only the debounce buffering moved to Redis (see DebounceStore);
  // that is the part that previously lost messages on restart.
  private clients: Map<string, WASocket> = new Map();
  private qrUrls: Map<string, string | null> = new Map();
  private clientsReady: Map<string, boolean> = new Map();

  private readonly logger = new Logger(WhatsappService.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private groupNameCache: Map<string, string> = new Map();
  private baileysModule: BaileysModule | null = null;
  private initializing: Set<string> = new Set();

  constructor(
    private readonly batchService: BatchService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => SourcesService))
    private readonly sourcesService: SourcesService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly debounceStore: DebounceStore,
  ) {}

  private cachedWaVersion: {
    version: [number, number, number];
    isLatest: boolean;
  } | null = null;

  onModuleInit() {
    // Drain Redis debounce buffers whose silence window has elapsed.
    // Runs in every replica; DebounceStore.collectDue claims each
    // buffer atomically, so a buffer is flushed exactly once.
    this.sweepTimer = setInterval(() => {
      void this.sweepDebounceBuffers();
    }, 400);
    this.sweepTimer.unref?.();

    // Run initialization in background so NestJS can bind to port 3001 immediately
    setImmediate(() => {
      void this.initializeAllUsers();
    });
  }

  private async initializeAllUsers() {
    try {
      const users = await this.prisma.user.findMany();
      for (const user of users) {
        this.initializeWhatsApp(user.id).catch((err) => {
          this.logger.error(
            `Failed to initialize WhatsApp for user ${user.id}:`,
            err,
          );
        });
      }
    } catch (err) {
      this.logger.error('Failed to load users for WhatsApp init:', err);
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

  private async loadBaileys(): Promise<BaileysModule> {
    if (!this.baileysModule) {
      // Baileys ships ESM; this codebase is CommonJS, hence eval-import.
      this.baileysModule = (await eval(
        'import("@whiskeysockets/baileys")',
      )) as BaileysModule;
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
          // Baileys' typed emitter requires an event name for
          // removeAllListeners; remove exactly the events registered
          // in initializeWhatsApp below (the runtime emitter is Node's,
          // where the no-arg form would clear everything).
          for (const event of [
            'creds.update',
            'connection.update',
            'contacts.upsert',
            'contacts.update',
            'chats.upsert',
            'chats.update',
            'messages.upsert',
            'messaging-history.set',
          ] as const) {
            existingClient.ev.removeAllListeners(event);
          }
          Promise.resolve(existingClient.end(undefined)).catch(() => {
            // Socket teardown is best-effort.
          });
        } catch {
          // The old socket may already be torn down; nothing to clean up.
        }
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
        } catch {
          this.cachedWaVersion = {
            version: [2, 3000, 1046623424],
            isLatest: true,
          };
        }
      }
      const { version, isLatest } = this.cachedWaVersion;
      this.logger.log(
        `Using WhatsApp Web version v${version.join('.')}, isLatest: ${isLatest}`,
      );

      const client = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
      });

      this.clients.set(userId, client);

      client.ev.on('creds.update', () => {
        void saveCreds();
      });

      client.ev.on('connection.update', (update) => {
        void (async () => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.logger.log(`New QR code generated for user ${userId}!`);
            try {
              this.qrUrls.set(userId, await qrcode.toDataURL(qr));
            } catch (err) {
              this.logger.error(
                `Failed to generate QR data URL for user ${userId}`,
                err,
              );
            }
          }

          if (connection === 'close') {
            const boomError = lastDisconnect?.error as
              { output?: { statusCode?: number } } | undefined;
            const statusCode = boomError?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            this.logger.warn(
              `WhatsApp disconnected for user ${userId}. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`,
            );
            this.clientsReady.set(userId, false);

            if (shouldReconnect) {
              this.initializeWhatsApp(userId).catch((err) => {
                this.logger.error(
                  `Failed to reconnect WhatsApp for user ${userId}:`,
                  err,
                );
              });
            } else {
              // If logged out (401), we MUST clear the session data so the user can scan a new QR code!
              this.logger.warn(
                `Session for ${userId} was logged out or invalid. Clearing session data.`,
              );
              const authFolder = `./sessions/user_${userId}_auth`;
              if (fs.existsSync(authFolder)) {
                fs.rmSync(authFolder, { recursive: true, force: true });
              }
              // Now re-initialize to trigger a fresh QR code generation
              this.initializeWhatsApp(userId).catch((err) => {
                this.logger.error(
                  `Failed to reinitialize WhatsApp for user ${userId}:`,
                  err,
                );
              });
            }
          } else if (connection === 'open') {
            this.logger.log(
              `✅ WhatsApp Linked Device connected and active for user ${userId}!`,
            );
            this.clientsReady.set(userId, true);
            this.qrUrls.set(userId, null);
          }
        })();
      });

      client.ev.on('contacts.upsert', (contacts) => {
        void (async () => {
          this.logger.log(
            `Received contacts upsert for ${contacts.length} contacts.`,
          );
          if (contacts && contacts.length > 0) {
            await this.sourcesService.syncContacts(userId, contacts);
          }
        })();
      });

      client.ev.on('contacts.update', (contacts) => {
        void (async () => {
          this.logger.log(
            `Received contacts update for ${contacts.length} contacts.`,
          );
          if (contacts && contacts.length > 0) {
            await this.sourcesService.syncContacts(userId, contacts);
          }
        })();
      });

      client.ev.on('chats.upsert', (chats) => {
        void (async () => {
          this.logger.log(`Received chats upsert for ${chats.length} chats.`);
          const chatContacts = toContactLikes(chats);
          if (chatContacts.length > 0) {
            await this.sourcesService.syncContacts(userId, chatContacts);
          }
        })();
      });

      client.ev.on('chats.update', (chats) => {
        void (async () => {
          const chatContacts = toContactLikes(chats);
          if (chatContacts.length > 0) {
            await this.sourcesService.syncContacts(userId, chatContacts);
          }
        })();
      });

      client.ev.on('messages.upsert', (m) => {
        void (async () => {
          this.logger.log(
            `RAW messages.upsert EVENT TYPE: ${m.type}, count: ${m.messages?.length || 0}`,
          );

          const debugLog = `[${new Date().toISOString()}] UP EVENT: ${m.type} for ${userId}, count: ${m.messages?.length || 0}\n`;
          fs.appendFileSync(
            path.join(process.cwd(), 'debug-messages.log'),
            debugLog,
          );

          // Privacy gate FIRST: nothing is cached or buffered before the
          // paused check and the per-source allowlist check have passed.
          // Previously every incoming message was written to the on-disk
          // history cache before either check ran.
          const settings = await this.settingsService.getSettings(userId);
          if (!settings.isSyncActive) {
            this.logger.log(
              'Live Sync is paused in settings. Ignoring incoming messages.',
            );
            return;
          }

          if (m.type === 'notify' || m.type === 'append') {
            const cacheable: WAMessage[] = [];
            for (const msg of m.messages) {
              const senderId = msg.key.remoteJid;
              if (!senderId) continue;

              let pushName = msg.key.fromMe
                ? undefined
                : (msg.pushName ?? undefined);

              // Auto-resolve WhatsApp Channel (newsletter) names
              if (senderId.endsWith('@newsletter') && !pushName) {
                try {
                  const meta = await client.newsletterMetadata('jid', senderId);
                  if (meta && meta.name) pushName = meta.name;
                } catch {
                  this.logger.warn(
                    `Could not fetch channel metadata for ${senderId}`,
                  );
                }
              }

              const isAllowed = await this.sourcesService.isSourceAllowed(
                senderId,
                pushName,
                userId,
              );

              fs.appendFileSync(
                path.join(process.cwd(), 'debug-messages.log'),
                `[DEBUG] fromMe: ${msg.key.fromMe}, isAllowed: ${isAllowed}, senderId: ${senderId}\n`,
              );

              // Ignore messages sent by ourselves from being processed as product drops
              if (msg.key.fromMe) continue;

              if (!isAllowed) continue;

              // Only allowlisted, non-own messages may enter the history cache.
              cacheable.push(msg);

              // Buffer in Redis (DebounceStore): the buffer survives an
              // API restart, and each push re-arms a 3.5s silence window
              // before the sweeper flushes — heavy videos get time to
              // catch up with the rest of their burst.
              await this.debounceStore.push(userId, senderId, msg);
            }

            if (cacheable.length > 0) {
              this.saveMessagesToCache(userId, cacheable);
            }
          }
        })();
      });

      client.ev.on('messaging-history.set', (history) => {
        void (async () => {
          const contacts = history.contacts || [];
          const chats = history.chats || [];
          const messages = history.messages || [];
          this.logger.log(
            `Received historical sync for user ${userId}: ${contacts.length} contacts, ${chats.length} chats, ${messages.length} messages.`,
          );

          // NOTE: messages are deliberately NOT written to the history
          // cache here. Caching happens further down, after the paused
          // check and the per-source allowlist gate, and only for sources
          // the user has explicitly enabled.

          // 1. Synchronize Address Book & Contacts first
          const uniqueContacts = new Map<string, ContactLike>();
          for (const c of contacts) {
            const like = c as ContactLikeInput;
            if (
              c.id &&
              (like.name || like.verifiedName || like.pushName || like.notify)
            ) {
              uniqueContacts.set(c.id, c);
            }
          }
          for (const c of chats) {
            const like = c as ContactLike;
            const name =
              like.name || like.verifiedName || like.pushName || like.notify;
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
            this.sourcesService
              .syncContacts(userId, allContacts)
              .catch((err) =>
                this.logger.error(
                  `Failed async syncContacts for user ${userId}`,
                  err,
                ),
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

          // 3. Filter messages by timestamp and not fromMe
          let droppedCount = 0;
          const chatGroups: Record<string, WAMessage[]> = {};

          for (const msg of messages) {
            if (!msg.message || msg.key?.fromMe) continue;

            const sender = msg.key?.remoteJid;
            if (!sender) continue;

            const msgTime = messageTimestampSeconds(msg.messageTimestamp);

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
          const allowedMessages: WAMessage[] = [];

          for (const sender in chatGroups) {
            const chatMsgs = chatGroups[sender];
            if (!chatMsgs || chatMsgs.length === 0) continue;

            // Register/resolve the source and apply the allowlist gate.
            // isSourceAllowed registers unknown sources as DISABLED (so the
            // user can enable them in the UI) and returns true only for
            // sources the user explicitly enabled. An empty allowlist
            // therefore ingests ZERO messages, and history import never
            // auto-enables a source the user did not select.
            let pushName = chatMsgs[0]?.pushName;
            if (sender.endsWith('@newsletter') && !pushName) {
              try {
                const meta = await client.newsletterMetadata('jid', sender);
                if (meta?.name) pushName = meta.name;
              } catch {
                // Channel metadata is best-effort; the JID alone is enough.
              }
            }
            const isAllowed = await this.sourcesService.isSourceAllowed(
              sender,
              pushName ?? undefined,
              userId,
            );
            if (!isAllowed) {
              this.logger.log(
                `Skipping historical messages for source not in allowlist: ${sender}`,
              );
              continue;
            }
            allowedMessages.push(...chatMsgs);

            // Sort messages strictly by timestamp
            const sortedChatMessages = chatMsgs.sort(
              (a, b) =>
                messageTimestampSeconds(a.messageTimestamp) -
                messageTimestampSeconds(b.messageTimestamp),
            );

            const productBundles =
              this.extractProductBundles(sortedChatMessages);

            for (const bundle of productBundles) {
              const isMsgDuplicate = bundle.some(
                (m) => m.key?.id && existingMsgIds.has(m.key.id),
              );
              const bundleText = bundle
                .map((m) => {
                  const c = this.unwrapMessage(m.message);
                  return (
                    c?.imageMessage?.caption ||
                    c?.videoMessage?.caption ||
                    c?.conversation ||
                    c?.extendedTextMessage?.text ||
                    ''
                  );
                })
                .join('\n')
                .trim();

              const isContentDuplicate =
                bundleText.length > 20 &&
                existingBatches.some(
                  (b) =>
                    b.senderId === sender &&
                    b.rawText &&
                    b.rawText.trim() === bundleText,
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

          // Only now — after the allowlist gate — may messages enter the cache.
          if (allowedMessages.length > 0) {
            this.saveMessagesToCache(userId, allowedMessages);
          }

          this.logger.log(
            `Finished retroactive historical sync for user ${userId}: ${totalBundlesIngested} product drops ingested.`,
          );

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
        })();
      });

      this.logger.log('Initializing WhatsApp Web Bridge (Baileys)...');
    } finally {
      this.initializing.delete(userId);
    }
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Flush every Redis debounce buffer whose silence window elapsed. */
  private async sweepDebounceBuffers() {
    let due: DueBuffer[];
    try {
      due = await this.debounceStore.collectDue();
    } catch (err) {
      this.logger.error('Debounce sweep failed', err);
      return;
    }
    for (const buffer of due) {
      try {
        await this.flushMessageBuffer(
          buffer.userId,
          buffer.senderId,
          buffer.messages,
        );
      } catch (err) {
        this.logger.error(
          `Failed to flush debounce buffer for ${buffer.senderId}`,
          err,
        );
      }
    }
  }

  private async flushMessageBuffer(
    userId: string,
    senderId: string,
    messages: WAMessage[],
  ) {
    fs.appendFileSync(
      path.join(process.cwd(), 'debug-messages.log'),
      `[DEBUG FLUSH] bufferKey: ${userId}_${senderId}, messages: ${messages.length}\n`,
    );

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

  private unwrapMessage(
    message: WAMessageContent | null | undefined,
  ): WAMessageContent | null | undefined {
    let content = message;
    while (content) {
      const next =
        content.ephemeralMessage?.message ??
        content.viewOnceMessage?.message ??
        content.viewOnceMessageV2?.message ??
        content.viewOnceMessageV2Extension?.message ??
        content.documentWithCaptionMessage?.message;
      if (!next) break;
      content = next;
    }
    return content;
  }

  async handleIncomingMessage(userId: string, msg: WAMessage) {
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
        } catch {
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
    const mimeType =
      imageMessage?.mimetype ||
      videoMessage?.mimetype ||
      documentMessage?.mimetype ||
      (isImageDocument
        ? 'image/jpeg'
        : isVideoDocument
          ? 'video/mp4'
          : 'image/jpeg');
    const messageId = msg.key.id;

    if (isMedia) {
      try {
        const buffer = await downloadMediaMessage(
          msg,
          'buffer',
          {},
          {
            // Nest's Logger does not structurally match Baileys' ILogger;
            // it is only used for download diagnostics inside the library.
            logger: this.logger as unknown as ILogger,
            reuploadRequest: client.updateMediaMessage,
          },
        );

        const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpeg'; // Strip out any charset etc
        const fileName = `${messageId}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
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

        try {
          const r2Url = await this.storageService.uploadBuffer(
            buffer,
            fileName,
            mimeType,
          );
          this.logger.log(`Uploaded media to R2: ${r2Url}`);
          // Pass the R2 URL to batch service via payload
          (msg as WAMessageWithOrigin)._originalUrl = r2Url;
        } catch (r2Err) {
          this.logger.error('Failed to upload media to R2', r2Err);
        }
      } catch (err) {
        this.logger.error('Failed to download media from Baileys', err);
      }
    }

    const payload: IncomingMessagePayload = {
      id: messageId,
      from: jid,
      userId: userId,
      senderName: senderName,
      timestamp: msg.messageTimestamp?.toString() || Date.now().toString(),
      type: isMedia ? 'image' : 'text', // BatchService uses 'image' to detect media, so we keep it for now
      _localPath: localPath,
      _originalUrl: (msg as WAMessageWithOrigin)._originalUrl || null,
      text: !isMedia ? { body: caption } : undefined,
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
        this.logger.error(
          `Error logging out WhatsApp client for user ${userId}`,
          err,
        );
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
    this.initializeWhatsApp(userId).catch((err) => {
      this.logger.error(
        `Failed to reinitialize WhatsApp after disconnect:`,
        err,
      );
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

  private saveMessagesToCache(userId: string, newMessages: WAMessage[]) {
    try {
      const filePath = this.getHistoryCachePath(userId);
      let existing: WAMessage[] = [];
      if (fs.existsSync(filePath)) {
        try {
          // The cache file is written only by this service; parse to
          // unknown first, then treat the array as WAMessages.
          const parsed: unknown = JSON.parse(
            fs.readFileSync(filePath, 'utf-8'),
          );
          if (Array.isArray(parsed)) existing = parsed as WAMessage[];
        } catch {
          existing = [];
        }
      }

      const map = new Map<string, WAMessage>();
      for (const m of existing) {
        if (m?.key?.id) map.set(m.key.id, m);
      }
      for (const m of newMessages) {
        if (m?.key?.id) map.set(m.key.id, m);
      }

      const all = Array.from(map.values()).sort(
        (a, b) =>
          messageTimestampSeconds(a.messageTimestamp) -
          messageTimestampSeconds(b.messageTimestamp),
      );

      // Keep latest 10,000 messages to prevent unbounded growth
      const trimmed = all.slice(-10000);
      fs.writeFileSync(filePath, JSON.stringify(trimmed));
    } catch (err) {
      this.logger.error(
        `Failed to save messages to history cache for user ${userId}`,
        err,
      );
    }
  }

  private loadMessagesFromCache(userId: string): WAMessage[] {
    try {
      const filePath = this.getHistoryCachePath(userId);
      if (fs.existsSync(filePath)) {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(parsed)) return parsed as WAMessage[];
      }
    } catch (err) {
      this.logger.error(
        `Failed to load messages from history cache for user ${userId}`,
        err,
      );
    }
    return [];
  }

  private extractProductBundles(
    sortedChatMessages: WAMessage[],
  ): WAMessage[][] {
    let currentBundle: WAMessage[] = [];
    let bundleHasDesc = false;
    let bundleFirstItemType: 'media' | 'desc' | 'both' | null = null;
    let lastTimestamp = 0;
    const productBundles: WAMessage[][] = [];

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
      else if (content.videoMessage)
        caption = content.videoMessage.caption || '';
      else if (content.documentMessage)
        caption = content.documentMessage.caption || '';
      else if (content.conversation) caption = content.conversation;
      else if (content.extendedTextMessage)
        caption = content.extendedTextMessage.text || '';

      const hasMedia = isMedia;
      const hasDesc = caption.trim().length > 5;

      if (!hasMedia && !hasDesc) continue;

      let shouldStartNewBundle = false;
      const ts = messageTimestampSeconds(msg.messageTimestamp);

      if (
        currentBundle.length > 0 &&
        lastTimestamp > 0 &&
        ts - lastTimestamp > 300
      ) {
        shouldStartNewBundle = true;
      } else if (hasDesc && !hasMedia) {
        if (bundleHasDesc) shouldStartNewBundle = true;
      } else if (hasMedia && !hasDesc) {
        if (
          bundleHasDesc &&
          (bundleFirstItemType === 'media' || bundleFirstItemType === 'both')
        ) {
          shouldStartNewBundle = true;
        }
      } else if (hasMedia && hasDesc) {
        if (bundleHasDesc) shouldStartNewBundle = true;
      }

      if (shouldStartNewBundle) {
        if (currentBundle.length > 0) productBundles.push(currentBundle);
        currentBundle = [msg];
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

    if (
      customDepthHours &&
      customDepthHours !== settings.historySyncDepthHours
    ) {
      await this.settingsService.updateSettings(userId, {
        historySyncDepthHours: customDepthHours,
      });
    }

    const messages = this.loadMessagesFromCache(userId);
    if (!messages || messages.length === 0) {
      return {
        success: false,
        message:
          'No messages found in historical archive yet. Disconnect & link WhatsApp once via QR code to seed the retroactive archive.',
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

    const chatGroups: Record<string, WAMessage[]> = {};
    for (const msg of messages) {
      if (!msg.message || msg.key?.fromMe) continue;
      const sender = msg.key?.remoteJid;
      if (!sender) continue;

      const msgTime = messageTimestampSeconds(msg.messageTimestamp);

      if (msgTime < cutoffSeconds) continue;

      if (!chatGroups[sender]) chatGroups[sender] = [];
      chatGroups[sender].push(msg);
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const sender in chatGroups) {
      const chatMsgs = chatGroups[sender];
      if (!chatMsgs || chatMsgs.length === 0) continue;

      // Allowlist gate: unknown sources are registered as disabled by
      // isSourceAllowed and rejected here; a source is imported only when
      // the user explicitly enabled it. Re-sync never auto-enables sources.
      const isAllowed = await this.sourcesService.isSourceAllowed(
        sender,
        chatMsgs[0]?.pushName ?? undefined,
        userId,
      );
      if (!isAllowed) {
        this.logger.log(
          `Skipping retroactive sync for source not in allowlist: ${sender}`,
        );
        continue;
      }

      const sortedChatMessages = chatMsgs.sort(
        (a, b) =>
          messageTimestampSeconds(a.messageTimestamp) -
          messageTimestampSeconds(b.messageTimestamp),
      );

      const productBundles = this.extractProductBundles(sortedChatMessages);

      for (const bundle of productBundles) {
        // DEDUPLICATION: Skip if ANY message ID is already registered
        const isMsgDuplicate = bundle.some(
          (m) => m.key?.id && existingMsgIds.has(m.key.id),
        );

        // Also skip if rawText identically matches existing batch from this sender
        const bundleText = bundle
          .map((m) => {
            const c = this.unwrapMessage(m.message);
            return (
              c?.imageMessage?.caption ||
              c?.videoMessage?.caption ||
              c?.conversation ||
              c?.extendedTextMessage?.text ||
              ''
            );
          })
          .join('\n')
          .trim();

        const isContentDuplicate =
          bundleText.length > 20 &&
          existingBatches.some(
            (b) =>
              b.senderId === sender &&
              b.rawText &&
              b.rawText.trim() === bundleText,
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
