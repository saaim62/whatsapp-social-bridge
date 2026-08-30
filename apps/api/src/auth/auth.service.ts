import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(email: string, password: string, name?: string, city?: string, country?: string) {
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
        settings: {
          create: {}
        }
      }
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
      throw new UnauthorizedException('Please verify your email address before logging in.');
    }
    
    if (user.isBlocked) {
      throw new UnauthorizedException('Your account is blocked. Please contact the company at saaim62@gmail.com');
    }

    // Update lastActiveAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() }
    });

    // Check trial expiration
    const trialExpired = !user.isPaid && user.trialEndsAt && new Date() > user.trialEndsAt;

    const payload = { email: user.email, sub: user.id, trialExpired };
    return {
      access_token: this.jwtService.sign(payload),
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        trialExpired
      }
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verificationToken: token } });
    if (!user) throw new BadRequestException('Invalid or expired verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, verificationToken: null }
    });

    return { message: 'Email successfully verified. You can now log in.' };
  }

  async generatePasswordResetToken(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token }
    });

    return token;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { resetPasswordToken: token } });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null }
    });

    return { message: 'Password has been successfully reset. You can now log in.' };
  }

  async mockPay(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isPaid: true }
    });

    return { message: 'Payment successful.' };
  }
}
