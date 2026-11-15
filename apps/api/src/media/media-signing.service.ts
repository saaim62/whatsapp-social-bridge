import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived signed media URLs (P1-5).
 *
 * Supplier media used to be reachable by anyone who knew a filename:
 * the uploads directory was mounted as unauthenticated static files.
 * Now the only public route to a file is a signed URL:
 *
 *   token = base64url(subject) "." expiryUnix "." HMAC-SHA256 hex
 *
 * Subjects:
 *   "a:<mediaAssetId>" — dashboard media (TTL 2h; the dashboard gets
 *                        these in API responses as `mediaUrl`)
 *   "f:<filename>"     — Meta publishing (TTL 15 min; Meta's servers
 *                        fetch the media once, right after publish)
 *
 * The HMAC key is MEDIA_SIGNING_SECRET, falling back to JWT_SECRET so
 * existing deployments keep working without new configuration.
 */
@Injectable()
export class MediaSigningService {
  constructor(private configService: ConfigService) {}

  private secret(): string {
    const secret =
      this.configService.get<string>('MEDIA_SIGNING_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'MEDIA_SIGNING_SECRET (or JWT_SECRET) is required to sign media URLs',
      );
    }
    return secret;
  }

  private baseUrl(): string {
    return (
      this.configService.get<string>('PUBLIC_API_URL') ||
      'https://api-droproute.duckdns.org'
    );
  }

  sign(subject: string, ttlSeconds: number): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${Buffer.from(subject, 'utf8').toString('base64url')}.${exp}`;
    const sig = createHmac('sha256', this.secret()).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }

  /** Returns the subject when the token is authentic and unexpired. */
  verify(token: string): { subject: string } | null {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) return null;
    const [b64, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    let expected: string;
    try {
      expected = createHmac('sha256', this.secret())
        .update(`${b64}.${expStr}`)
        .digest('hex');
    } catch {
      return null;
    }
    const given = Buffer.from(sig);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      return null;
    }
    return { subject: Buffer.from(b64, 'base64url').toString('utf8') };
  }

  signedUrl(subject: string, ttlSeconds: number): string {
    return `${this.baseUrl()}/api/media/signed/${this.sign(subject, ttlSeconds)}`;
  }
}
