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
        secure: Number(process.env.SMTP_PORT) === 465,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
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

    // Never log the link itself — it carries a live token. Recipient + template only.
    this.logger.log(
      `Verification email queued for ${email} (template: verify-email)`,
    );

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      '"DropRoute" <noreply@droproute.com>';

    // Fire and forget so we don't block the UI
    setTimeout(() => {
      this.logger.log(
        '[EmailService] Executing background sendMail for verification...',
      );
      this.transporter
        .sendMail({
          from,
          to: email,
          subject: 'Verify your DropRoute account',
          html: this.verificationEmailHtml(url),
          text: this.verificationEmailText(url),
        })
        .then(() => {
          this.logger.log(
            '[EmailService] Verification sendMail completed successfully.',
          );
        })
        .catch((e) => {
          this.logger.error('Failed to send verification email', e);
        });
    }, 0);
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    // Never log the link itself — it carries a live token. Recipient + template only.
    this.logger.log(
      `Password reset email queued for ${email} (template: reset-password)`,
    );

    const from =
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      '"DropRoute" <noreply@droproute.com>';

    // Fire and forget so we don't block the UI
    setTimeout(() => {
      this.logger.log(
        '[EmailService] Executing background sendMail for reset password...',
      );
      this.transporter
        .sendMail({
          from,
          to: email,
          subject: 'Reset your DropRoute password',
          html: this.passwordResetEmailHtml(url),
          text: this.passwordResetEmailText(url),
        })
        .then(() => {
          this.logger.log(
            '[EmailService] Reset password sendMail completed successfully.',
          );
        })
        .catch((e) => {
          this.logger.error('Failed to send reset email', e);
        });
    }, 0);
  }

  private emailLayout(
    heading: string,
    intro: string,
    buttonLabel: string,
    url: string,
    footnote: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${heading} — DropRoute</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:32px 0;">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e4e4e7;">
<tr>
<td style="background-color:#0b0b0c; padding:28px 40px;">
<span style="font-size:22px; font-weight:700; color:#ffffff; letter-spacing:0.2px;">DropRoute</span>
<span style="font-size:20px; color:#d9a521;">&#9889;</span>
<div style="font-size:11px; color:#a1a1aa; margin-top:5px; letter-spacing:1.2px;">AI-POWERED SOCIAL COMMERCE</div>
</td>
</tr>
<tr>
<td style="padding:36px 40px 0 40px;">
<h1 style="margin:0 0 14px 0; font-size:22px; line-height:28px; color:#111111; font-weight:700;">${heading}</h1>
<p style="margin:0 0 26px 0; font-size:15px; line-height:23px; color:#3f3f46;">${intro}</p>
</td>
</tr>
<tr>
<td style="padding:0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="border-radius:8px; background-color:#d9a521;">
<a href="${url}" target="_blank" style="display:inline-block; padding:14px 30px; font-size:15px; font-weight:700; color:#111111; text-decoration:none; border-radius:8px;">${buttonLabel}</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:26px 40px 0 40px;">
<p style="margin:0 0 6px 0; font-size:13px; line-height:19px; color:#71717a;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="margin:0; font-size:12px; line-height:18px; word-break:break-all;"><a href="${url}" style="color:#92600a; text-decoration:underline;">${url}</a></p>
</td>
</tr>
<tr>
<td style="padding:28px 40px 34px 40px;">
<div style="border-top:1px solid #e4e4e7; padding-top:20px;">
<p style="margin:0; font-size:13px; line-height:19px; color:#71717a;">${footnote}</p>
</div>
</td>
</tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
<tr>
<td align="center" style="padding:22px 40px 0 40px;">
<p style="margin:0; font-size:12px; line-height:18px; color:#a1a1aa;">DropRoute turns WhatsApp product drops into published Facebook and Instagram listings.<br>&copy; 2026 DropRoute. All rights reserved.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
  }

  private verificationEmailHtml(url: string): string {
    return this.emailLayout(
      'Verify your email address',
      'Welcome to DropRoute. Confirm this email address to activate your account and start turning WhatsApp product drops into published listings.',
      'Verify my account',
      url,
      "You received this email because a DropRoute account was created with this address. If that wasn't you, you can safely ignore this email.",
    );
  }

  private passwordResetEmailHtml(url: string): string {
    return this.emailLayout(
      'Reset your password',
      'We received a request to reset the password for your DropRoute account. Click the button below to choose a new password.',
      'Reset my password',
      url,
      "If you didn't request a password reset, you can safely ignore this email — your password will not change.",
    );
  }

  private verificationEmailText(url: string): string {
    return `Welcome to DropRoute.\n\nConfirm this email address to activate your account:\n${url}\n\nIf you didn't create a DropRoute account, you can safely ignore this email.`;
  }

  private passwordResetEmailText(url: string): string {
    return `We received a request to reset the password for your DropRoute account.\n\nChoose a new password here:\n${url}\n\nIf you didn't request this, ignore this email — your password will not change.`;
  }
}
