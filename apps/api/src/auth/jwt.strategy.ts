import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // No fallback: a known default secret lets anyone forge any user's token.
    throw new Error(
      'JWT_SECRET environment variable is not set — refusing to start',
    );
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    // A blocked account's existing tokens stop working immediately —
    // checking isBlocked only at login left live sessions untouched.
    if (user.isBlocked) {
      throw new UnauthorizedException();
    }
    // Session revocation: a password reset increments user.sessionVersion,
    // which invalidates every JWT issued before it. Tokens minted before
    // sessionVersion existed carry no `sv` claim and are treated as v0.
    const tokenVersion = typeof payload.sv === 'number' ? payload.sv : 0;
    if (tokenVersion !== user.sessionVersion) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}
