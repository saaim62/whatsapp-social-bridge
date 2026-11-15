import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { BatchModule } from '../batch/batch.module';
import { ConfigModule } from '@nestjs/config';
import { SettingsModule } from '../settings/settings.module';
import { SourcesModule } from '../sources/sources.module';
import { StorageService } from '../storage/storage.service';
import { DebounceStore } from './debounce.store';

@Module({
  imports: [
    BatchModule,
    ConfigModule,
    SettingsModule,
    forwardRef(() => SourcesModule),
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    StorageService,
    {
      provide: DebounceStore,
      useFactory: (configService: ConfigService) =>
        new DebounceStore(
          new Redis({
            host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
            port: configService.get<number>('REDIS_PORT', 6379),
          }),
        ),
      inject: [ConfigService],
    },
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
