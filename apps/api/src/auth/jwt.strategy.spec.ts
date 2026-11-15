import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const OLD_ENV = process.env.JWT_SECRET;
  let prisma: any;
  let strategy: JwtStrategy;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = OLD_ENV;
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma);
  });

  it('rejects when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'gone', email: 'a@b.c', sv: 0 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a BLOCKED user even with an otherwise valid token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      isBlocked: true,
      sessionVersion: 0,
    });
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c', sv: 0 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects tokens issued before a password reset (sessionVersion moved on)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      isBlocked: false,
      sessionVersion: 2,
    });
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c', sv: 1 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a current token for an active user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      isBlocked: false,
      sessionVersion: 2,
    });
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c', sv: 2 })).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.c',
    });
  });
});
