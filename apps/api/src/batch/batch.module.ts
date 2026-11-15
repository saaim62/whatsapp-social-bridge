import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { AiModule } from '../ai/ai.module';
import { StorageService } from '../storage/storage.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'batch-processing',
    }),
    BullModule.registerQueue({
      name: 'history-sync-queue',
    }),
    BullModule.registerQueue({
      name: 'image-blur',
    }),
    AiModule,
    MediaModule,
  ],
  controllers: [BatchController],
  providers: [BatchService, StorageService],
  exports: [BatchService],
})
export class BatchModule {}

