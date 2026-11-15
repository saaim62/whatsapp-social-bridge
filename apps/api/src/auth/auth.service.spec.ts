import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

const VALID_TOKEN = 'a'.repeat(64); // matches the issued format: 64 lowercase hex chars

function makeService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
  const service = new AuthService(prisma as any, jwt as any);
  return { service, prisma, jwt };
}

describe('AuthService password reset token handling', () => {
  it.each([undefined, null, '', 'not-a-token', 'zzzz', 42])(
    'rejects malformed token %p BEFORE any database call',
    async (token: any) => {
      const { service, prisma } = makeService();
      await expect(service.resetPassword(token, 'new-password-123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );

  it('rejects a well-formed token that matches no unexpired row (expired / unknown / already used)', async () => {
    const { service, prisma } = makeService();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resetPassword(VALID_TOKEN, 'new-password-123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // The consume must be conditional on the token AND its expiry.
    const where = prisma.user.updateMany.mock.calls[0][0].where;
    expect(where.resetPasswordToken).toBe(VALID_TOKEN);
    expect(where.resetPasswordTokenExpiresAt.gt).toBeInstanceOf(Date);
  });

  it('consumes a valid token exactly once: clears it and bumps sessionVersion', async () => {
    const { service, prisma } = makeService();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.resetPassword(VALID_TOKEN, 'new-password-123');
    expect(res.message).toMatch(/successfully reset/);
    const data = prisma.user.updateMany.mock.calls[0][0].data;
    expect(data.resetPasswordToken).toBeNull();
    expect(data.resetPasswordTokenExpiresAt).toBeNull();
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(typeof data.passwordHash).toBe('string');
    expect(data.passwordHash).not.toBe('new-password-123');
  });

  it('issues reset tokens with a ~1 hour expiry', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({});
    const before = Date.now();
    const token = await service.generatePasswordResetToken('a@b.c');
    const after = Date.now();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const data = prisma.user.update.mock.calls[0][0].data;
    const expiry = data.resetPasswordTokenExpiresAt.getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 61 * 60 * 1000);
  });
});

describe('AuthService email verification token handling', () => {
  it.each([undefined, null, '', 'nope'])(
    'rejects malformed token %p BEFORE any database call',
    async (token: any) => {
      const { service, prisma } = makeService();
      await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects an expired or already-consumed verification token', async () => {
    const { service, prisma } = makeService();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyEmail(VALID_TOKEN)).rejects.toBeInstanceOf(BadRequestException);
    const where = prisma.user.updateMany.mock.calls[0][0].where;
    expect(where.verificationToken).toBe(VALID_TOKEN);
    expect(where.verificationTokenExpiresAt.gt).toBeInstanceOf(Date);
  });

  it('verifies and clears the token on success', async () => {
    const { service, prisma } = makeService();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.verifyEmail(VALID_TOKEN);
    expect(res.message).toMatch(/successfully verified/);
    const data = prisma.user.updateMany.mock.calls[0][0].data;
    expect(data.isEmailVerified).toBe(true);
    expect(data.verificationToken).toBeNull();
  });

  it('registration issues a verification token with a ~24 hour expiry', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));
    const before = Date.now();
    const user: any = await service.register('new@b.c', 'password-123');
    const after = Date.now();
    const expiry = user.verificationTokenExpiresAt.getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 23 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 25 * 60 * 60 * 1000);
  });
});

describe('AuthService login payload', () => {
  it('embeds the user sessionVersion as `sv` so resets revoke older tokens', async () => {
    const { service, prisma, jwt } = makeService();
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash('pw-123456', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      passwordHash,
      isEmailVerified: true,
      isBlocked: false,
      isPaid: true,
      trialEndsAt: null,
      role: 'USER',
      sessionVersion: 3,
    });
    prisma.user.update.mockResolvedValue({});
    await service.login('a@b.c', 'pw-123456');
    const payload = jwt.sign.mock.calls[0][0];
    expect(payload.sv).toBe(3);
  });
});
