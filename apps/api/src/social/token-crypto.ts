import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption at rest for Meta (SocialAccount) access tokens.
 *
 * Format: `enc:v1:<iv b64>:<authTag b64>:<ciphertext b64>` — AES-256-GCM
 * with a random 12-byte IV per token. The key comes from the
 * TOKEN_ENCRYPTION_KEY env var (base64-encoded 32 bytes).
 *
 * Legacy rows hold plaintext tokens. decryptToken passes those through
 * unchanged, so existing connections keep working; the backfill script
 * (scripts/encrypt-social-tokens.ts) converts them, and every new
 * token written by the OAuth flow is encrypted on write.
 *
 * Production refuses to boot without a key (same fail-fast pattern as
 * JWT_SECRET): silently storing OAuth tokens in plaintext is exactly
 * the failure this module exists to remove. Outside production a
 * missing key degrades to plaintext storage with the format detection
 * still applied on read, so dev/test behavior is unchanged.
 */

const PREFIX = 'enc:v1:';

export function isEncryptedToken(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

/** True when a stored value still needs encrypting (non-empty plaintext). */
export function tokenNeedsEncryption(stored: unknown): boolean {
  return (
    typeof stored === 'string' && stored.length > 0 && !isEncryptedToken(stored)
  );
}

function loadKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256)',
    );
  }
  return key;
}

/** Fail fast at startup in production when the key is absent/invalid. */
export function assertTokenEncryptionConfigured(): void {
  if (process.env.NODE_ENV === 'production') {
    if (!loadKey()) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY environment variable is not set — refusing to start',
      );
    }
  } else {
    // Validate format early in dev too, so a malformed key surfaces at
    // boot instead of at the first token write.
    loadKey();
  }
}

export function encryptToken(plain: string): string {
  const key = loadKey();
  if (!key) {
    // Only reachable outside production (production refuses to boot
    // without a key). Store as-is so dev/test flows keep working.
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptToken(stored: string): string {
  if (!isEncryptedToken(stored)) {
    // Legacy plaintext row — still usable as-is.
    return stored;
  }
  const key = loadKey();
  if (!key) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is required to decrypt stored Meta tokens',
    );
  }
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Stored Meta token has an invalid encrypted format');
  }
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  // Throws on tampered ciphertext/tag (GCM authentication failure).
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
