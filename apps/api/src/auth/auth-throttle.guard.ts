import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory rate limiter for the public auth endpoints.
 * Keyed by client IP + route. Limits are generous for real users and
 * tight enough to blunt credential-stuffing and spam signups.
 * (Single-instance deployment: for a multi-instance setup, move the
 * counters into Redis.)
 */
@Injectable()
export class AuthThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  private readonly rules: Array<{ match: string; limit: number; windowMs: number }> = [
    { match: '/login', limit: 10, windowMs: 5 * 60 * 1000 },
    { match: '/register', limit: 5, windowMs: 10 * 60 * 1000 },
    { match: '/forgot-password', limit: 5, windowMs: 10 * 60 * 1000 },
    { match: '/resend-verification', limit: 5, windowMs: 10 * 60 * 1000 },
  ];

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const path: string = req.path || req.url || '';
    const rule = this.rules.find((r) => path.includes(r.match));
    if (!rule) return true;

    const forwarded = (req.headers['x-forwarded-for'] as string) || '';
    const ip = forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${ip}:${rule.match}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }
    if (bucket.count >= rule.limit) {
      throw new HttpException(
        'Too many attempts. Please wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
    return true;
  }
}
