import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { BatchModule } from '../batch/batch.module';

@Module({
  imports: [BatchModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
