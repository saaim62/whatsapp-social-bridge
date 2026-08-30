import { Controller, Get, UseGuards, Request, Delete } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  getStatus(@Request() req: any) {
    const userId = req.user.userId;
    const client = this.whatsappService.getClient(userId);
    
    if (!client) {
      // Initialize if missing (e.g. user registered after module init)
      this.whatsappService.initializeWhatsApp(userId).catch(console.error);
    }

    const isReady = this.whatsappService.isReady(userId);
    const qrUrl = this.whatsappService.getQrCodeUrl(userId);
    let phoneNumber = null;

    if (isReady && client?.user?.id) {
      phoneNumber = client.user.id.split(':')[0].split('@')[0];
    }
    
    return {
      isReady,
      qrUrl,
      phoneNumber
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnectWhatsApp(@Request() req: any) {
    return this.whatsappService.disconnectWhatsApp(req.user.userId);
  }
}
