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
