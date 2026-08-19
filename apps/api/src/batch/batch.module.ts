import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'batch-processing',
    }),
  ],
  controllers: [BatchController],
  providers: [BatchService],
  exports: [BatchService],
})
export class BatchModule {}
