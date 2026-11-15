import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  tokenNeedsEncryption,
  assertTokenEncryptionConfigured,
} from './token-crypto';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

describe('token-crypto (AES-256-GCM at rest)', () => {
  const prevKey = process.env.TOKEN_ENCRYPTION_KEY;
  const prevEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (prevKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = prevKey;
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  });

  it('round-trips a token through encrypt/decrypt', () => {
    const plain = 'EAABwzLixnjYBQZD-long-lived-meta-token';
    const stored = encryptToken(plain);
    expect(stored).not.toBe(plain);
    expect(isEncryptedToken(stored)).toBe(true);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(decryptToken(stored)).toBe(plain);
  });

  it('uses a random IV — the same plaintext encrypts differently twice', () => {
    expect(encryptToken('same-token')).not.toBe(encryptToken('same-token'));
  });

  it('treats legacy plaintext as usable (passthrough, flagged for backfill)', () => {
    const legacy = 'legacy-plaintext-token';
    expect(isEncryptedToken(legacy)).toBe(false);
    expect(tokenNeedsEncryption(legacy)).toBe(true);
    expect(decryptToken(legacy)).toBe(legacy);
    expect(tokenNeedsEncryption(encryptToken(legacy))).toBe(false);
    expect(tokenNeedsEncryption('')).toBe(false);
    expect(tokenNeedsEncryption(null)).toBe(false);
  });

  it('rejects tampered ciphertext', () => {
    const stored = encryptToken('genuine-token');
    const parts = stored.split(':');
    // Flip a character in the ciphertext segment.
    const ct = parts[3];
    parts[3] = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('rejects a token encrypted under a different key', () => {
    const stored = encryptToken('genuine-token');
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptToken(stored)).toThrow();
  });

  it('production refuses to boot without a key; non-production does not', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => assertTokenEncryptionConfigured()).toThrow(
      'TOKEN_ENCRYPTION_KEY',
    );
    process.env.NODE_ENV = 'test';
    expect(() => assertTokenEncryptionConfigured()).not.toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => assertTokenEncryptionConfigured()).not.toThrow();
  });
});
