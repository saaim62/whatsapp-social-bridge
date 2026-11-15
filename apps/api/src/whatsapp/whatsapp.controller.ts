import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Delete,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { ResyncHistoryDto } from './dto/whatsapp.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  getStatus(@Request() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const client = this.whatsappService.getClient(userId);

    if (!client) {
      // Initialize if missing (e.g. user registered after module init)
      this.whatsappService.initializeWhatsApp(userId).catch(console.error);
    }

    const isReady = this.whatsappService.isReady(userId);
    const qrUrl = this.whatsappService.getQrCodeUrl(userId);
    let phoneNumber: string | null = null;

    if (isReady && client?.user?.id) {
      phoneNumber = client.user.id.split(':')[0].split('@')[0];
    }

    return {
      isReady,
      qrUrl,
      phoneNumber,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('resync-history')
  async resyncHistory(
    @Request() req: AuthenticatedRequest,
    @Body() body: ResyncHistoryDto,
  ) {
    const customDepth = body?.depthHours;
    return this.whatsappService.resyncHistoricalBuffer(
      req.user.userId,
      customDepth,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disconnect')
  async disconnectWhatsApp(@Request() req: AuthenticatedRequest) {
    return this.whatsappService.disconnectWhatsApp(req.user.userId);
  }
}
