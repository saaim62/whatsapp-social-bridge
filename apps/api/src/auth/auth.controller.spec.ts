import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { EmailService } from './email.service';
import type { AuthenticatedRequest } from './authenticated-request';

/** Minimal authenticated-request fake (only req.user is read). */
function reqFor(userId: string, email: string): AuthenticatedRequest {
  return {
    user: { userId, email },
  } as unknown as AuthenticatedRequest;
}

describe('AuthController mock-pay production gate', () => {
  const OLD_ENV = process.env.NODE_ENV;
  let authService: {
    mockPay: jest.Mock<Promise<{ message: string }>, [string]>;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      mockPay: jest
        .fn<Promise<{ message: string }>, [string]>()
        .mockResolvedValue({ message: 'Payment successful.' }),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      {} as unknown as EmailService,
    );
  });

  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = OLD_ENV;
  });

  it('returns 410 Gone in production and never touches the account', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.mockPay(reqFor('u1', 'a@b.c')),
    ).rejects.toBeInstanceOf(HttpException);
    try {
      await controller.mockPay(reqFor('u1', 'a@b.c'));
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.GONE);
    }
    expect(authService.mockPay).not.toHaveBeenCalled();
  });

  it('still works outside production (dev behavior unchanged)', async () => {
    process.env.NODE_ENV = 'development';
    const res = await controller.mockPay(reqFor('u1', 'a@b.c'));
    expect(res.message).toBe('Payment successful.');
    expect(authService.mockPay).toHaveBeenCalledWith('a@b.c');
  });
});
