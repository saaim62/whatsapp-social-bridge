import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchProcessor } from './batch.processor';
import { AiModule } from '../ai/ai.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'batch-processing',
    }),
    AiModule,
    SocialModule
  ],
  providers: [BatchProcessor],
})
export class ProcessorModule {}
