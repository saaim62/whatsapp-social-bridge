import { Controller, Post, Body, UnauthorizedException, Get, Query, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';

@Controller('api/account')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private authService: AuthService,
    private emailService: EmailService
  ) {}

  @Post('login')
  async login(@Body() body) {
    return this.authService.login(body.email, body.password);
  }

  @Post('register')
  async register(@Body() body) {
    this.logger.log(`[Register] Starting register process for ${body.email}`);
    const user = await this.authService.register(body.email, body.password, body.name, body.city, body.country);
    this.logger.log(`[Register] User created in database: ${user.id}`);

    // Send verification email
    this.logger.log('[Register] Triggering verification email...');
    // We intentionally don't await this to avoid any potential event loop blocking
    this.emailService.sendVerificationEmail(user.email, user.verificationToken as string).catch(e => {
      this.logger.error('[Register] Error triggering email', e);
    });
    this.logger.log('[Register] Returning success response');
    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    this.logger.log(`[ForgotPassword] Starting forgot password process for ${email}`);
    const token = await this.authService.generatePasswordResetToken(email);
    this.logger.log(`[ForgotPassword] Token generated? ${!!token}`);
    if (token) {
      this.logger.log('[ForgotPassword] Triggering reset email...');
      this.emailService.sendPasswordResetEmail(email, token).catch(e => {
        this.logger.error('[ForgotPassword] Error triggering reset email', e);
      });
    }
    this.logger.log('[ForgotPassword] Returning success response');
    return { message: 'If an account with that email exists, we sent a password reset link.' };
  }

  @Post('reset-password')
  async resetPassword(@Body() body) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('mock-pay')
  async mockPay(@Body('email') email: string) {
    return this.authService.mockPay(email);
  }
}
