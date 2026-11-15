import axios from 'axios';
import { SocialService } from './social.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Meta OAuth state must be a server-side nonce bound to the initiating
 * user — never a forgeable encoding of the userId.
 */
describe('SocialService Meta OAuth state handling', () => {
  let prisma: any;
  let service: SocialService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      oAuthState: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      socialAccount: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const config = {
      get: jest.fn((key: string) =>
        ({ META_APP_ID: 'app-id', META_APP_SECRET: 'app-secret' })[key],
      ),
    };
    service = new SocialService(config as any, prisma);
  });

  it('issues a random nonce bound to the user with a ~10 minute TTL, and puts only the nonce in the URL', async () => {
    const before = Date.now();
    const url = await service.getMetaOAuthUrl('user-1');
    const after = Date.now();

    expect(prisma.oAuthState.create).toHaveBeenCalledTimes(1);
    const data = prisma.oAuthState.create.mock.calls[0][0].data;
    expect(data.userId).toBe('user-1');
    expect(data.nonce).toMatch(/^[0-9a-f]{64}$/);
    const ttl = data.expiresAt.getTime();
    expect(ttl).toBeGreaterThanOrEqual(before + 9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(after + 11 * 60 * 1000);
    expect(url).toContain(`state=${data.nonce}`);
    // The state must not carry the userId in any decodable form.
    expect(url).not.toContain('user-1');
    expect(url).not.toContain(Buffer.from(JSON.stringify({ userId: 'user-1' })).toString('base64'));
  });

  it('rejects the OLD forgeable base64 userId state without touching the DB or Meta', async () => {
    const forged = Buffer.from(JSON.stringify({ userId: 'victim' })).toString('base64');
    await expect(service.handleMetaOAuthCallback('code-1', forged)).rejects.toThrow(
      'Invalid state parameter',
    );
    expect(prisma.oAuthState.findUnique).not.toHaveBeenCalled();
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(prisma.socialAccount.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown nonce', async () => {
    prisma.oAuthState.findUnique.mockResolvedValue(null);
    await expect(service.handleMetaOAuthCallback('code-1', 'b'.repeat(64))).rejects.toThrow(
      'Invalid state parameter',
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('rejects an expired nonce (consume matches zero rows)', async () => {
    prisma.oAuthState.findUnique.mockResolvedValue({
      nonce: 'c'.repeat(64),
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
    });
    prisma.oAuthState.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.handleMetaOAuthCallback('code-1', 'c'.repeat(64))).rejects.toThrow(
      'Invalid or expired state parameter',
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(prisma.socialAccount.upsert).not.toHaveBeenCalled();
  });

  it('consumes a valid nonce exactly once and stores the token for the BOUND user', async () => {
    const nonce = 'd'.repeat(64);
    prisma.oAuthState.findUnique.mockResolvedValue({
      nonce,
      userId: 'initiator-9',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.oAuthState.deleteMany.mockResolvedValue({ count: 1 });
    mockedAxios.get
      .mockResolvedValueOnce({ data: { access_token: 'short-lived' } })
      .mockResolvedValueOnce({ data: { access_token: 'long-lived' } });

    await service.handleMetaOAuthCallback('code-1', nonce);

    const consumeWhere = prisma.oAuthState.deleteMany.mock.calls[0][0].where;
    expect(consumeWhere.nonce).toBe(nonce);
    expect(consumeWhere.expiresAt.gt).toBeInstanceOf(Date);
    expect(prisma.socialAccount.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prisma.socialAccount.upsert.mock.calls[0][0];
    expect(upsertArg.where.userId_platform.userId).toBe('initiator-9');
    expect(upsertArg.create.accessToken).toBe('long-lived');

    // Replay: the nonce is gone now, so a second callback is rejected.
    prisma.oAuthState.findUnique.mockResolvedValue(null);
    await expect(service.handleMetaOAuthCallback('code-1', nonce)).rejects.toThrow(
      'Invalid state parameter',
    );
    expect(prisma.socialAccount.upsert).toHaveBeenCalledTimes(1);
  });

  it('stores the Meta token ENCRYPTED when TOKEN_ENCRYPTION_KEY is set, and it decrypts back', async () => {
    const prev = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    try {
      const nonce = 'e'.repeat(64);
      prisma.oAuthState.findUnique.mockResolvedValue({
        nonce,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.oAuthState.deleteMany.mockResolvedValue({ count: 1 });
      mockedAxios.get
        .mockResolvedValueOnce({ data: { access_token: 'short-lived' } })
        .mockResolvedValueOnce({ data: { access_token: 'long-lived' } });

      await service.handleMetaOAuthCallback('code-1', nonce);

      const upsertArg = prisma.socialAccount.upsert.mock.calls[0][0];
      const stored = upsertArg.create.accessToken;
      expect(stored).not.toBe('long-lived');
      expect(stored.startsWith('enc:v1:')).toBe(true);
      const { decryptToken } = require('./token-crypto');
      expect(decryptToken(stored)).toBe('long-lived');
    } finally {
      if (prev === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = prev;
    }
  });
});

/**
 * Explicit Meta destination (P0-4): publishing must use ONLY the
 * destination the user saved in Settings — never the auto-picked
 * first page — and must refuse to resolve a context at all when no
 * destination is saved.
 */
describe('SocialService Meta destination selection', () => {
  let prisma: any;
  let service: SocialService;

  const PAGES = [
    { id: 'page-first', name: 'First Shop', access_token: 'token-first' },
    { id: 'page-saved', name: 'Saved Shop', access_token: 'token-saved' },
  ];
  const IG_BY_PAGE: Record<string, { id: string; username: string }> = {
    'page-first': { id: 'ig-first', username: 'firstshop' },
    'page-saved': { id: 'ig-saved', username: 'savedshop' },
  };

  function mockGraph() {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/me/accounts')) {
        return { data: { data: PAGES } };
      }
      const pageId = url.split('/v19.0/')[1];
      const ig = IG_BY_PAGE[pageId];
      return {
        data: {
          instagram_business_account: ig
            ? { id: ig.id, username: ig.username }
            : undefined,
        },
      };
    });
  }

  function setup(savedRow: any) {
    jest.clearAllMocks();
    prisma = {
      oAuthState: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      socialAccount: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(savedRow),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const config = {
      get: jest.fn((key: string) =>
        ({ META_APP_ID: 'app-id', META_APP_SECRET: 'app-secret' })[key],
      ),
    };
    service = new SocialService(config as any, prisma);
    mockGraph();
  }

  it('no destination saved → publishing context throws MetaDestinationNotConfiguredError', async () => {
    setup({
      accessToken: 'user-token',
      facebookPageId: null,
      facebookPageName: null,
      instagramUserId: null,
      instagramUsername: null,
    });
    await expect(
      (service as any).getMetaPublishingContext('user-1'),
    ).rejects.toThrow('No publishing destination selected');
    // It must not fall back to listing pages and picking one.
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('saved destination wins even when it is NOT the first page', async () => {
    setup({
      accessToken: 'user-token',
      facebookPageId: 'page-saved',
      facebookPageName: 'Saved Shop',
      instagramUserId: 'ig-saved',
      instagramUsername: 'savedshop',
    });
    const ctx = await (service as any).getMetaPublishingContext('user-1');
    expect(ctx.pageId).toBe('page-saved');
    expect(ctx.pageName).toBe('Saved Shop');
    expect(ctx.pageAccessToken).toBe('token-saved');
    expect(ctx.igAccountId).toBe('ig-saved');
  });

  it('listMetaPages returns every page with its linked IG account', async () => {
    setup({ accessToken: 'user-token' });
    const pages = await service.listMetaPages('user-1');
    expect(pages).toEqual([
      {
        pageId: 'page-first',
        pageName: 'First Shop',
        instagramAccountId: 'ig-first',
        instagramUsername: 'firstshop',
      },
      {
        pageId: 'page-saved',
        pageName: 'Saved Shop',
        instagramAccountId: 'ig-saved',
        instagramUsername: 'savedshop',
      },
    ]);
  });

  it('saveMetaDestination persists the chosen page + its linked IG, and rejects a page the account does not own', async () => {
    setup({ id: 'acc-1', accessToken: 'user-token' });
    const ok = await service.saveMetaDestination('user-1', 'page-saved');
    expect(ok.success).toBe(true);
    const data = prisma.socialAccount.update.mock.calls[0][0].data;
    expect(data.facebookPageId).toBe('page-saved');
    expect(data.facebookPageName).toBe('Saved Shop');
    expect(data.instagramUserId).toBe('ig-saved');
    expect(data.instagramUsername).toBe('savedshop');

    const bad = await service.saveMetaDestination('user-1', 'page-not-mine');
    expect(bad.success).toBe(false);
    expect(prisma.socialAccount.update).toHaveBeenCalledTimes(1);
  });

  it('saveMetaDestination rejects an IG account that is not linked to the chosen page', async () => {
    setup({ id: 'acc-1', accessToken: 'user-token' });
    const res = await service.saveMetaDestination('user-1', 'page-saved', 'ig-first');
    expect(res.success).toBe(false);
    expect(prisma.socialAccount.update).not.toHaveBeenCalled();
  });
});
