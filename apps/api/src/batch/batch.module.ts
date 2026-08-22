import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { AiModule } from '../ai/ai.module';

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
  ],
  controllers: [BatchController],
  providers: [BatchService],
  exports: [BatchService],
})
export class BatchModule {}
