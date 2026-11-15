import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { MediaModule } from './media/media.module';
import { WebhookModule } from './webhook/webhook.module';
import { BatchModule } from './batch/batch.module';
import { ProcessorModule } from './processor/processor.module';
import { SocialModule } from './social/social.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AiModule } from './ai/ai.module';
import { SettingsModule } from './settings/settings.module';
import { SourcesModule } from './sources/sources.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { NotificationModule } from './notification/notification.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // root .env or apps/api/.env
    }),
    // NOTE (P1-5): the uploads directory is deliberately NOT served
    // statically anymore — supplier media was reachable by anyone who
    // knew a filename. Media is delivered through MediaModule:
    // JWT + tenant-checked /api/media/:id for the dashboard and
    // short-lived signed /api/media/signed/:token URLs for Meta.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
            port: configService.get<number>('REDIS_PORT', 6379),
          }
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    MediaModule,
    WebhookModule,
    BatchModule,
    ProcessorModule.register(),
    SocialModule,
    WhatsappModule,
    AiModule,
    SettingsModule,
    SourcesModule,
    AuthModule,
    AdminModule,
    NotificationModule,
  ],
})
export class AppModule { }
