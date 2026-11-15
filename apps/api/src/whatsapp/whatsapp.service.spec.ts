import { WhatsappService } from './whatsapp.service';
import type { BatchService } from '../batch/batch.service';
import type { IncomingMessagePayload } from '../batch/batch.service';
import type { SettingsService } from '../settings/settings.service';
import type {
  SourcesService,
  SyncContactInput,
} from '../sources/sources.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { DebounceStore } from './debounce.store';

interface TestMessage {
  key: { remoteJid: string; fromMe: boolean; id: string };
  pushName: string;
  message: { conversation: string };
  messageTimestamp: number;
}

interface HandlerPayload {
  type?: string;
  messages?: TestMessage[];
  contacts?: unknown[];
  chats?: unknown[];
}

type EventHandler = (arg: HandlerPayload) => void;

/** Private seams the suite drives directly. */
interface ServiceInternals {
  loadBaileys: () => Promise<unknown>;
  saveMessagesToCache: (
    userId: string,
    messages: TestMessage[],
  ) => Promise<void>;
  handleIncomingMessage: (userId: string, msg: TestMessage) => Promise<void>;
}

interface SettingsShape {
  isSyncActive: boolean;
  historySyncDepthHours: number;
}

// Baileys listeners are fire-and-forget (the emitter never awaits them),
// so after invoking a captured handler the test must let the handler's
// async chain settle before asserting.
const settle = () => new Promise((r) => setTimeout(r, 600));

/**
 * Ingestion privacy gate: a message may be cached or buffered ONLY when
 * (1) sync is not paused for the user, and (2) its source is in the user's
 * enabled allowlist. An empty allowlist captures ZERO messages, and history
 * import never auto-enables a source.
 *
 * These tests drive the real Baileys event handlers registered by
 * initializeWhatsApp, with the Baileys module replaced by a fake socket.
 */
describe('WhatsappService ingestion allowlist gate', () => {
  const USER = 'user-1';
  const GOOD_JID = '111@g.us';
  const BAD_JID = '222@g.us';

  let handlers: Record<string, EventHandler>;
  let service: WhatsappService;
  let batchService: {
    handleMessage: jest.Mock<Promise<void>, [IncomingMessagePayload]>;
    forceCloseActiveBatch: jest.Mock<Promise<void>, [string, string]>;
  };
  let settingsService: {
    getSettings: jest.Mock<Promise<SettingsShape>, [string]>;
  };
  let sourcesService: {
    isSourceAllowed: jest.Mock<
      Promise<boolean>,
      [string, string | undefined, string]
    >;
    syncContacts: jest.Mock<Promise<void>, [string, SyncContactInput[]]>;
  };
  let prisma: {
    user: { findMany: jest.Mock<Promise<unknown[]>, [unknown]> };
    whatsappSource: {
      count: jest.Mock<Promise<number>, [unknown]>;
      findUnique: jest.Mock<Promise<null>, [unknown]>;
      updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    };
    productBatch: { findMany: jest.Mock<Promise<unknown[]>, [unknown]> };
    mediaAsset: { findMany: jest.Mock<Promise<unknown[]>, [unknown]> };
    notification: { create: jest.Mock<Promise<unknown>, [unknown]> };
  };
  let debounceStore: {
    push: jest.Mock<Promise<void>, [string, string, TestMessage]>;
    collectDue: jest.Mock<Promise<never[]>, []>;
    pendingMessages: jest.Mock<Promise<TestMessage[]>, [string, string]>;
  };
  let buffered: Map<string, TestMessage[]>;
  let saveCacheSpy: jest.Mock<Promise<void>, [string, TestMessage[]]>;
  let handleIncomingSpy: jest.Mock<Promise<void>, [string, TestMessage]>;

  function msg(
    jid: string,
    id: string,
    text = 'New product drop, price 1850',
  ): TestMessage {
    return {
      key: { remoteJid: jid, fromMe: false, id },
      pushName: 'Supplier',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
  }

  async function setup(opts: {
    syncActive: boolean;
    allowed: (jid: string) => boolean;
  }) {
    handlers = {};
    const fakeClient = {
      ev: {
        on: jest.fn((name: string, fn: EventHandler) => {
          handlers[name] = fn;
        }),
        removeAllListeners: jest.fn(),
      },
      end: jest.fn(),
      user: { id: '92300@s.whatsapp.net' },
    };
    const fakeBaileys = {
      default: jest.fn(() => fakeClient),
      useMultiFileAuthState: jest.fn(() =>
        Promise.resolve({
          state: {},
          saveCreds: jest.fn(),
        }),
      ),
      DisconnectReason: { loggedOut: 401 },
      fetchLatestWaWebVersion: jest.fn(() =>
        Promise.resolve({
          version: [2, 3000, 0] as [number, number, number],
          isLatest: true,
        }),
      ),
    };

    batchService = {
      handleMessage: jest
        .fn<Promise<void>, [IncomingMessagePayload]>()
        .mockResolvedValue(undefined),
      forceCloseActiveBatch: jest
        .fn<Promise<void>, [string, string]>()
        .mockResolvedValue(undefined),
    };
    settingsService = {
      getSettings: jest
        .fn<Promise<SettingsShape>, [string]>()
        .mockResolvedValue({
          isSyncActive: opts.syncActive,
          historySyncDepthHours: 24,
        }),
    };
    sourcesService = {
      isSourceAllowed: jest.fn<
        Promise<boolean>,
        [string, string | undefined, string]
      >((jid: string) => Promise.resolve(opts.allowed(jid))),
      syncContacts: jest
        .fn<Promise<void>, [string, SyncContactInput[]]>()
        .mockResolvedValue(undefined),
    };
    prisma = {
      user: {
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([]),
      },
      whatsappSource: {
        count: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(0),
        findUnique: jest.fn<Promise<null>, [unknown]>(),
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 0 }),
      },
      productBatch: {
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([]),
      },
      mediaAsset: {
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([]),
      },
      notification: {
        create: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({}),
      },
    };

    buffered = new Map<string, TestMessage[]>();
    debounceStore = {
      push: jest.fn(
        (userId: string, senderId: string, message: TestMessage) => {
          const key = `${userId}_${senderId}`;
          if (!buffered.has(key)) buffered.set(key, []);
          buffered.get(key)!.push(message);
          return Promise.resolve();
        },
      ),
      collectDue: jest.fn(() => Promise.resolve([] as never[])),
      pendingMessages: jest.fn((userId: string, senderId: string) =>
        Promise.resolve(buffered.get(`${userId}_${senderId}`) ?? []),
      ),
    };

    service = new WhatsappService(
      batchService as unknown as BatchService,
      settingsService as unknown as SettingsService,
      sourcesService as unknown as SourcesService,
      prisma as unknown as PrismaService,
      {} as unknown as StorageService,
      debounceStore as unknown as DebounceStore,
    );
    const internals = service as unknown as ServiceInternals;
    internals.loadBaileys = jest
      .fn<Promise<unknown>, []>()
      .mockResolvedValue(fakeBaileys);
    saveCacheSpy = jest.fn<Promise<void>, [string, TestMessage[]]>();
    internals.saveMessagesToCache = saveCacheSpy;
    handleIncomingSpy = jest
      .fn<Promise<void>, [string, TestMessage]>()
      .mockResolvedValue(undefined);
    internals.handleIncomingMessage = handleIncomingSpy;

    await service.initializeWhatsApp(USER);
    expect(handlers['messages.upsert']).toBeDefined();
    expect(handlers['messaging-history.set']).toBeDefined();
  }

  afterEach(() => {
    // Debounce state lives in the (fake) Redis store now — nothing
    // in-process to clean up between tests.
    buffered?.clear();
  });

  describe('live messages.upsert', () => {
    it('paused sync → nothing cached, nothing buffered', async () => {
      await setup({ syncActive: false, allowed: () => true });
      handlers['messages.upsert']({
        type: 'notify',
        messages: [msg(GOOD_JID, 'm1')],
      });
      await settle();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(debounceStore.push).not.toHaveBeenCalled();
    });

    it('empty allowlist → nothing cached, nothing buffered', async () => {
      await setup({ syncActive: true, allowed: () => false });
      handlers['messages.upsert']({
        type: 'notify',
        messages: [msg(GOOD_JID, 'm1')],
      });
      await settle();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(debounceStore.push).not.toHaveBeenCalled();
    });

    it('disallowed source → not cached; allowed source → cached and buffered', async () => {
      await setup({ syncActive: true, allowed: (jid) => jid === GOOD_JID });
      const good = msg(GOOD_JID, 'm-good');
      const bad = msg(BAD_JID, 'm-bad');
      handlers['messages.upsert']({
        type: 'notify',
        messages: [good, bad],
      });
      await settle();
      expect(saveCacheSpy).toHaveBeenCalledTimes(1);
      const cached = saveCacheSpy.mock.calls[0][1];
      expect(cached).toEqual([good]);
      expect(buffered.get(`${USER}_${GOOD_JID}`)).toEqual([good]);
      expect(buffered.has(`${USER}_${BAD_JID}`)).toBe(false);
    });
  });

  describe('messaging-history.set', () => {
    it('paused sync → nothing cached, nothing ingested', async () => {
      await setup({ syncActive: false, allowed: () => true });
      handlers['messaging-history.set']({
        contacts: [],
        chats: [],
        messages: [msg(GOOD_JID, 'h1')],
      });
      await settle();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(handleIncomingSpy).not.toHaveBeenCalled();
    });

    it('empty allowlist → zero ingestion and NO auto-enable of sources', async () => {
      await setup({ syncActive: true, allowed: () => false });
      handlers['messaging-history.set']({
        contacts: [],
        chats: [],
        messages: [msg(GOOD_JID, 'h1'), msg(BAD_JID, 'h2')],
      });
      await settle();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(handleIncomingSpy).not.toHaveBeenCalled();
      // The old code flipped isEnabled=true for every sender when the user
      // had selected nothing. That must never happen again.
      expect(prisma.whatsappSource.updateMany).not.toHaveBeenCalled();
    });

    it('allowed source → ingested and cached; disallowed source → skipped entirely', async () => {
      await setup({ syncActive: true, allowed: (jid) => jid === GOOD_JID });
      const good = msg(GOOD_JID, 'h-good');
      const bad = msg(BAD_JID, 'h-bad');
      handlers['messaging-history.set']({
        contacts: [],
        chats: [],
        messages: [good, bad],
      });
      await settle();
      expect(saveCacheSpy).toHaveBeenCalledTimes(1);
      expect(saveCacheSpy.mock.calls[0][1]).toEqual([good]);
      expect(handleIncomingSpy).toHaveBeenCalledTimes(1);
      expect(handleIncomingSpy.mock.calls[0][1]).toBe(good);
      expect(prisma.whatsappSource.updateMany).not.toHaveBeenCalled();
    });
  });
});
