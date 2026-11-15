import { Injectable, Logger } from '@nestjs/common';
import { BatchService, IncomingMessagePayload } from '../batch/batch.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly batchService: BatchService) {}

  async processIncomingMessage(message: IncomingMessagePayload) {
    this.logger.log(`Received message: ${message.id}`);

    // Add to batch processing queue or handle directly
    // For MVP, we will handle it directly by calling BatchService
    await this.batchService.handleMessage(message);
  }
}
