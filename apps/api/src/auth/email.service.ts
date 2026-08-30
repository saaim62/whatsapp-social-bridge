import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.initTransporter();
  }

  private async initTransporter() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Easiest method for testing: Auto-generate a mock test account!
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log('Created mock Ethereal email account for testing.');
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    
    // During dev, just log it so the user can click it from the console
    this.logger.log(`\n\n======================================================\n`);
    this.logger.log(`VERIFICATION EMAIL SENT TO: ${email}`);
    this.logger.log(`Please click the link below to verify your account:`);
    this.logger.log(`${url}`);
    this.logger.log(`\n======================================================\n\n`);

    try {
      const info = await this.transporter.sendMail({
        from: '"DropRoute" <noreply@droproute.com>',
        to: email,
        subject: 'Verify your DropRoute Account',
        html: `<p>Please click <a href="${url}">here</a> to verify your account.</p>`,
      });
      this.logger.log(`Ethereal Email Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (e) {
      this.logger.error('Failed to send verification email', e);
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    // During dev, just log it
    this.logger.log(`\n\n======================================================\n`);
    this.logger.log(`PASSWORD RESET EMAIL SENT TO: ${email}`);
    this.logger.log(`Please click the link below to reset your password:`);
    this.logger.log(`${url}`);
    this.logger.log(`\n======================================================\n\n`);

    try {
      const info = await this.transporter.sendMail({
        from: '"DropRoute" <noreply@droproute.com>',
        to: email,
        subject: 'Reset your DropRoute Password',
        html: `<p>Please click <a href="${url}">here</a> to reset your password.</p>`,
      });
      this.logger.log(`Ethereal Email Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    } catch (e) {
      this.logger.error('Failed to send reset email', e);
    }
  }
}
