import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Tokens are issued as randomBytes(32).toString('hex') — 64 lowercase hex chars.
const TOKEN_FORMAT = /^[0-9a-f]{64}$/;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Reject missing/empty/malformed tokens BEFORE any database query.
   * A token filter built from undefined/empty input can be silently dropped
   * by Prisma, turning a findFirst into "return the first user in the table" —
   * that must never reach the database.
   */
  private assertWellFormedToken(token: unknown): asserts token is string {
    if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  async register(
    email: string,
    password: string,
    name?: string,
    city?: string,
    country?: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(32).toString('hex');

    // Set trial ends at 30 days from now
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        city,
        country,
        trialEndsAt,
        verificationToken,
        verificationTokenExpiresAt: new Date(
          Date.now() + VERIFICATION_TOKEN_TTL_MS,
        ),
        settings: {
          create: {},
        },
      },
    });

    return user;
  }

  async login(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in.',
      );
    }

    if (user.isBlocked) {
      throw new UnauthorizedException(
        'Your account is blocked. Please contact the company at saaim62@gmail.com',
      );
    }

    // Update lastActiveAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Check trial expiration
    const trialExpired =
      !user.isPaid && user.trialEndsAt && new Date() > user.trialEndsAt;

    const payload = {
      email: user.email,
      sub: user.id,
      trialExpired,
      sv: user.sessionVersion,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        trialExpired,
      },
    };
  }

  async verifyEmail(token: string) {
    this.assertWellFormedToken(token);

    // Atomic consume: the token is cleared only when it matches AND is
    // unexpired, so an expired or already-used token updates zero rows.
    const result = await this.prisma.user.updateMany({
      where: {
        verificationToken: token,
        verificationTokenExpiresAt: { gt: new Date() },
      },
      data: {
        isEmailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    return { message: 'Email successfully verified. You can now log in.' };
  }

  /**
   * Issue a FRESH verification token for an existing UNVERIFIED account.
   * Returns null when there is nothing to do (unknown email, or the
   * account is already verified) so the controller can answer uniformly
   * and never reveal which case applied (no account enumeration).
   *
   * This is also the recovery path for pre-migration accounts: their
   * verificationTokenExpiresAt is NULL, so the strict verifyEmail check
   * can never accept their original token — and re-registering with the
   * same email is rejected as a duplicate. Without a resend flow those
   * users are stranded. Resend replaces the token (the old one dies)
   * and gives it a real 24h expiry. The same applies to new users who
   * simply miss the 24h window.
   */
  async generateVerificationToken(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified) return null;

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: token,
        verificationTokenExpiresAt: new Date(
          Date.now() + VERIFICATION_TOKEN_TTL_MS,
        ),
      },
    });

    return token;
  }

  async generatePasswordResetToken(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    return token;
  }

  async resetPassword(token: string, newPassword: string) {
    this.assertWellFormedToken(token);
    if (typeof newPassword !== 'string' || newPassword.length === 0) {
      throw new BadRequestException('A new password is required');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Atomic consume: the password changes only when the token matches AND
    // is unexpired. Consuming clears the token (single use) and bumps
    // sessionVersion, which revokes every JWT issued before this reset.
    const result = await this.prisma.user.updateMany({
      where: {
        resetPasswordToken: token,
        resetPasswordTokenExpiresAt: { gt: new Date() },
      },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordTokenExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    return {
      message: 'Password has been successfully reset. You can now log in.',
    };
  }

  async mockPay(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isPaid: true },
    });

    return { message: 'Payment successful.' };
  }
}
