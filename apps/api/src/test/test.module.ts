import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { BatchModule } from '../batch/batch.module';

@Module({
  imports: [BatchModule],
  controllers: [TestController],
})
export class TestModule {}
