import { Module, forwardRef } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { BatchModule } from '../batch/batch.module';
import { ConfigModule } from '@nestjs/config';
import { SettingsModule } from '../settings/settings.module';
import { SourcesModule } from '../sources/sources.module';
import { StorageService } from '../storage/storage.service';

@Module({
  imports: [BatchModule, ConfigModule, SettingsModule, forwardRef(() => SourcesModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService, StorageService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
