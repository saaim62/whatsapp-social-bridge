import { Controller, Post, Body, UnauthorizedException, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';

@Controller('api/account')
export class AuthController {
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
    const user = await this.authService.register(body.email, body.password, body.name, body.city, body.country);
    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, user.verificationToken as string);
    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    const token = await this.authService.generatePasswordResetToken(email);
    if (token) {
      await this.emailService.sendPasswordResetEmail(email, token);
    }
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
