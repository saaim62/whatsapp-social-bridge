import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';

@Controller('api/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('qr')
  getQrCode(@Res() res: Response) {
    const qrUrl = this.whatsappService.getQrCodeUrl();
    const isReady = this.whatsappService.isReady();

    if (isReady) {
      return res.send(`
        <html>
          <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f0f2f5;">
            <div style="text-align:center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <h1 style="color: #25D366;">✅ Connected!</h1>
              <p>Your WhatsApp is successfully linked.</p>
              <p>You can close this tab.</p>
            </div>
          </body>
        </html>
      `);
    }

    if (!qrUrl) {
      return res.send(`
        <html>
          <head><meta http-equiv="refresh" content="3"></head>
          <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
            <div style="text-align:center;">
              <h2>Loading WhatsApp Web...</h2>
              <p>Please wait...</p>
            </div>
          </body>
        </html>
      `);
    }

    return res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f0f2f5;">
          <div style="text-align:center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2>Scan to Link WhatsApp</h2>
            <img src="${qrUrl}" alt="QR Code" style="width:300px; height:300px; margin: 20px 0; border: 1px solid #eee; padding: 10px; border-radius: 8px;" />
            <p>Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device</p>
            <p style="color: #666; font-size: 0.9em;">(Auto-refreshes every 5s to prevent expiration)</p>
          </div>
        </body>
      </html>
    `);
  }
}
