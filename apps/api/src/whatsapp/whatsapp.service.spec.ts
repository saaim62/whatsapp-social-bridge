import { WhatsappService } from './whatsapp.service';

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

  let handlers: Record<string, Function>;
  let service: WhatsappService;
  let batchService: any;
  let settingsService: any;
  let sourcesService: any;
  let prisma: any;
  let debounceStore: {
    push: jest.Mock;
    collectDue: jest.Mock;
    pendingMessages: jest.Mock;
  };
  let buffered: Map<string, any[]>;
  let saveCacheSpy: jest.Mock;
  let handleIncomingSpy: jest.Mock;

  function msg(jid: string, id: string, text = 'New product drop, price 1850') {
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
        on: jest.fn((name: string, fn: Function) => {
          handlers[name] = fn;
        }),
        removeAllListeners: jest.fn(),
      },
      end: jest.fn(),
      user: { id: '92300@s.whatsapp.net' },
    };
    const fakeBaileys = {
      default: jest.fn(() => fakeClient),
      useMultiFileAuthState: jest.fn(async () => ({
        state: {},
        saveCreds: jest.fn(),
      })),
      DisconnectReason: { loggedOut: 401 },
      fetchLatestWaWebVersion: jest.fn(async () => ({
        version: [2, 3000, 0],
        isLatest: true,
      })),
    };

    batchService = {
      handleMessage: jest.fn().mockResolvedValue(undefined),
      forceCloseActiveBatch: jest.fn().mockResolvedValue(undefined),
    };
    settingsService = {
      getSettings: jest.fn().mockResolvedValue({
        isSyncActive: opts.syncActive,
        historySyncDepthHours: 24,
      }),
    };
    sourcesService = {
      isSourceAllowed: jest.fn(async (jid: string) => opts.allowed(jid)),
      syncContacts: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      whatsappSource: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      productBatch: { findMany: jest.fn().mockResolvedValue([]) },
      mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: jest.fn().mockResolvedValue({}) },
    };

    buffered = new Map<string, any[]>();
    debounceStore = {
      push: jest.fn(async (userId: string, senderId: string, message: any) => {
        const key = `${userId}_${senderId}`;
        if (!buffered.has(key)) buffered.set(key, []);
        buffered.get(key)!.push(message);
      }),
      collectDue: jest.fn(async () => []),
      pendingMessages: jest.fn(
        async (userId: string, senderId: string) =>
          buffered.get(`${userId}_${senderId}`) ?? [],
      ),
    };

    service = new WhatsappService(
      batchService,
      settingsService,
      sourcesService,
      prisma,
      {} as any,
      debounceStore as any,
    );
    (service as any).loadBaileys = jest.fn().mockResolvedValue(fakeBaileys);
    saveCacheSpy = jest.fn();
    (service as any).saveMessagesToCache = saveCacheSpy;
    handleIncomingSpy = jest.fn().mockResolvedValue(undefined);
    (service as any).handleIncomingMessage = handleIncomingSpy;

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
      await handlers['messages.upsert']({
        type: 'notify',
        messages: [msg(GOOD_JID, 'm1')],
      });
      await settle();
      expect(saveCacheSpy).not.toHaveBeenCalled();
      expect(debounceStore.push).not.toHaveBeenCalled();
    });

    it('empty allowlist → nothing cached, nothing buffered', async () => {
      await setup({ syncActive: true, allowed: () => false });
      await handlers['messages.upsert']({
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
      await handlers['messages.upsert']({
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
      await handlers['messaging-history.set']({
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
      await handlers['messaging-history.set']({
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
      await handlers['messaging-history.set']({
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
