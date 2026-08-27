import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { WebhookModule } from './webhook/webhook.module';
import { BatchModule } from './batch/batch.module';
import { ProcessorModule } from './processor/processor.module';
import { SocialModule } from './social/social.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AiModule } from './ai/ai.module';
import { SettingsModule } from './settings/settings.module';
import { SourcesModule } from './sources/sources.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // root .env or apps/api/.env
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    WebhookModule,
    BatchModule,
    ProcessorModule,
    SocialModule,
    WhatsappModule,
    AiModule,
    SettingsModule,
    SourcesModule,
    AuthModule,
  ],
})
export class AppModule {}
