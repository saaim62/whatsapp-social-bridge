import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { BatchModule } from '../batch/batch.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [BatchModule, ConfigModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
