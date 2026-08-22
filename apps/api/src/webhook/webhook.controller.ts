import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { WebhookService } from './webhook.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/whatsapp')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode && token) {
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('WEBHOOK_VERIFIED');
        return res.status(HttpStatus.OK).send(challenge);
      } else {
        return res.sendStatus(HttpStatus.FORBIDDEN);
      }
    }
    return res.sendStatus(HttpStatus.BAD_REQUEST);
  }

  @Post()
  async handleIncomingMessage(@Body() body: any, @Res() res: Response) {
    // Acknowledge quickly
    res.sendStatus(HttpStatus.OK);

    try {
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (
              change.value &&
              change.value.messages &&
              change.value.messages[0]
            ) {
              await this.webhookService.processIncomingMessage(
                change.value.messages[0],
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling webhook payload:', error);
    }
  }
}
