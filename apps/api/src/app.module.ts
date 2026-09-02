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
    ServeStaticModule.forRoot(
      {
        rootPath: join(process.cwd(), 'uploads'),
        serveRoot: '/api/uploads',
      },
      {
        rootPath: join(process.cwd(), 'uploads'),
        serveRoot: '/uploads', // For backward compatibility with old localPath records
      }
    ),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const rawHost = configService.get('REDIS_HOST', 'localhost');
        const host = rawHost.replace(/^https?:\/\//, '').replace(/^redis[s]?:\/\//, '').split(':')[0].split('/')[0];
        return {
          connection: {
            host,
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD'),
            tls: host.includes('upstash') ? { servername: host } : undefined,
          }
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
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
