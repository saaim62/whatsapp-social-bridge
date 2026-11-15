import {
  BadRequestException,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthThrottleGuard } from './auth-throttle.guard';
import { EmailService } from './email.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';

interface SeedUser {
  id: string;
  email: string;
  passwordHash: string;
  isEmailVerified: boolean;
  isBlocked: boolean;
  sessionVersion: number;
  verificationToken: string | null;
  verificationTokenExpiresAt: Date | null;
}

const OLD_TOKEN = 'a'.repeat(64);

/**
 * Resend-verification recovery flow.
 *
 * The token-expiry migration left pre-existing unverified accounts with
 * verificationTokenExpiresAt = NULL: the strict verifyEmail check can
 * never accept their token, there was no resend endpoint, and
 * re-registering is rejected as a duplicate — a stranded account.
 *
 * The Prisma fake below is stateful and honors the where semantics the
 * service actually uses, so the resend → verify round trip is exercised
 * for real: the old NULL-expiry token must fail, the resent token must
 * work, and the old token must stay dead after the resend.
 */
function makeStatefulPrisma(seedUsers: SeedUser[]) {
  const store: SeedUser[] = seedUsers.map((u) => ({ ...u }));
  const prisma = {
    user: {
      findUnique: jest.fn(
        ({ where }: { where: { email?: string; id?: string } }) =>
          Promise.resolve(
            store.find(
              (u) =>
                (where.email !== undefined && u.email === where.email) ||
                (where.id !== undefined && u.id === where.id),
            ) ?? null,
          ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SeedUser>;
        }) => {
          const u = store.find((x) => x.id === where.id);
          if (!u) return Promise.reject(new Error('Record not found'));
          Object.assign(u, data);
          return Promise.resolve(u);
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            verificationToken?: string;
            verificationTokenExpiresAt?: { gt: Date };
          };
          data: Partial<SeedUser>;
        }) => {
          let count = 0;
          for (const u of store) {
            if (
              where.verificationToken !== undefined &&
              u.verificationToken !== where.verificationToken
            )
              continue;
            if (where.verificationTokenExpiresAt?.gt) {
              const exp = u.verificationTokenExpiresAt;
              if (
                !exp ||
                !(new Date(exp) > where.verificationTokenExpiresAt.gt)
              )
                continue;
            }
            Object.assign(u, data);
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
  return { prisma, store };
}

function makeService(prisma: unknown) {
  return new AuthService(
    prisma as PrismaService,
    { sign: jest.fn() } as unknown as JwtService,
  );
}

function preMigrationUser(): SeedUser {
  return {
    id: 'user-legacy',
    email: 'legacy@example.com',
    passwordHash: 'hash',
    isEmailVerified: false,
    isBlocked: false,
    sessionVersion: 0,
    verificationToken: OLD_TOKEN,
    verificationTokenExpiresAt: null, // ← pre-migration row: no expiry was ever recorded
  };
}

describe('AuthService resend verification (stateful round trip)', () => {
  it('a pre-migration account (token present, expiry NULL) is stranded until resend, then verifies with the new token only', async () => {
    const { prisma, store } = makeStatefulPrisma([preMigrationUser()]);
    const service = makeService(prisma);

    // Stranded: the original token can never verify — its expiry is NULL.
    await expect(service.verifyEmail(OLD_TOKEN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(store[0].isEmailVerified).toBe(false);

    // Resend issues a fresh token with a real ~24h expiry, replacing the old one.
    const before = Date.now();
    const newToken =
      await service.generateVerificationToken('legacy@example.com');
    expect(newToken).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken).not.toBe(OLD_TOKEN);
    expect(store[0].verificationTokenExpiresAt).toBeInstanceOf(Date);
    const exp = (store[0].verificationTokenExpiresAt as Date).getTime();
    expect(exp).toBeGreaterThan(before + 23 * 60 * 60 * 1000);
    expect(exp).toBeLessThanOrEqual(before + 24 * 60 * 60 * 1000 + 5000);
    expect(store[0].verificationToken).toBe(newToken);

    // The old token is dead even after the resend.
    await expect(service.verifyEmail(OLD_TOKEN)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // The new token verifies, exactly once.
    const res = await service.verifyEmail(newToken as string);
    expect(res.message).toMatch(/successfully verified/);
    expect(store[0].isEmailVerified).toBe(true);
    expect(store[0].verificationToken).toBeNull();
    await expect(
      service.verifyEmail(newToken as string),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an expired-token user (missed the 24h window) recovers the same way', async () => {
    const user = {
      ...preMigrationUser(),
      id: 'user-expired',
      email: 'expired@example.com',
      verificationTokenExpiresAt: new Date(Date.now() - 60 * 1000),
    };
    const { prisma, store } = makeStatefulPrisma([user]);
    const service = makeService(prisma);

    await expect(service.verifyEmail(OLD_TOKEN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const newToken = await service.generateVerificationToken(
      'expired@example.com',
    );
    expect(newToken).toBeTruthy();
    await expect(
      service.verifyEmail(newToken as string),
    ).resolves.toBeDefined();
    expect(store[0].isEmailVerified).toBe(true);
  });

  it('already-verified accounts get no token and are left untouched', async () => {
    const user = {
      ...preMigrationUser(),
      id: 'user-verified',
      email: 'done@example.com',
      isEmailVerified: true,
    };
    const { prisma, store } = makeStatefulPrisma([user]);
    const service = makeService(prisma);

    await expect(
      service.generateVerificationToken('done@example.com'),
    ).resolves.toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(store[0].verificationToken).toBe(OLD_TOKEN);
  });

  it('unknown emails get no token', async () => {
    const { prisma } = makeStatefulPrisma([preMigrationUser()]);
    const service = makeService(prisma);
    await expect(
      service.generateVerificationToken('nobody@example.com'),
    ).resolves.toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthController resend-verification (uniform, non-enumerating response)', () => {
  function makeController(token: string | null) {
    const authService = {
      generateVerificationToken: jest
        .fn<Promise<string | null>, [string]>()
        .mockResolvedValue(token),
    };
    const emailService = {
      sendVerificationEmail: jest.fn<void, [string, string]>(),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
      emailService as unknown as EmailService,
    );
    return { controller, authService, emailService };
  }

  it('sends the email only when a token was issued, and answers identically in all cases', async () => {
    const issued = makeController('b'.repeat(64));
    const resIssued =
      await issued.controller.resendVerification('legacy@example.com');
    expect(issued.emailService.sendVerificationEmail).toHaveBeenCalledWith(
      'legacy@example.com',
      'b'.repeat(64),
    );

    const notIssued = makeController(null);
    const resUnknown =
      await notIssued.controller.resendVerification('nobody@example.com');
    expect(notIssued.emailService.sendVerificationEmail).not.toHaveBeenCalled();

    expect(resIssued).toEqual(resUnknown);
    expect(resIssued.message).toMatch(/If an unverified account/);
  });
});

describe('AuthThrottleGuard rate limiting (resend-verification)', () => {
  function ctx(path: string, ip = '203.0.113.7') {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ path, url: path, headers: {}, ip }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows 5 resend attempts per window, then throws 429', () => {
    const guard = new AuthThrottleGuard();
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx('/api/account/resend-verification'))).toBe(
        true,
      );
    }
    try {
      guard.canActivate(ctx('/api/account/resend-verification'));
      throw new Error('expected the guard to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('does not throttle unrelated routes', () => {
    const guard = new AuthThrottleGuard();
    for (let i = 0; i < 8; i++) {
      expect(guard.canActivate(ctx('/api/account/verify-email'))).toBe(true);
    }
  });
});
