import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController mock-pay production gate', () => {
  const OLD_ENV = process.env.NODE_ENV;
  let authService: any;
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      mockPay: jest.fn().mockResolvedValue({ message: 'Payment successful.' }),
    };
    controller = new AuthController(authService, {} as any);
  });

  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = OLD_ENV;
  });

  it('returns 410 Gone in production and never touches the account', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      controller.mockPay({ user: { userId: 'u1', email: 'a@b.c' } } as any),
    ).rejects.toBeInstanceOf(HttpException);
    try {
      await controller.mockPay({ user: { userId: 'u1', email: 'a@b.c' } } as any);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.GONE);
    }
    expect(authService.mockPay).not.toHaveBeenCalled();
  });

  it('still works outside production (dev behavior unchanged)', async () => {
    process.env.NODE_ENV = 'development';
    const res = await controller.mockPay({ user: { userId: 'u1', email: 'a@b.c' } } as any);
    expect(res.message).toBe('Payment successful.');
    expect(authService.mockPay).toHaveBeenCalledWith('a@b.c');
  });
});
