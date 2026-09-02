import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(userId: string) {
    let settings = await this.prisma.settings.findUnique({
      where: { userId },
    });
    
    if (!settings) {
      settings = await this.prisma.settings.create({
        data: {
          userId,
          isSyncActive: true,
          historySyncDepthHours: 24,
        },
      });
    }
    
    return settings;
  }

  async updateSettings(userId: string, data: any) {
    const isSyncActive = typeof data?.isSyncActive === 'boolean' ? data.isSyncActive : undefined;
    let historySyncDepthHours: number | undefined = undefined;
    if (data?.historySyncDepthHours !== undefined && data?.historySyncDepthHours !== null) {
      const parsed = parseInt(String(data.historySyncDepthHours), 10);
      if (!isNaN(parsed) && parsed > 0) {
        historySyncDepthHours = parsed;
      }
    }

    return this.prisma.settings.upsert({
      where: { userId },
      create: {
        userId,
        isSyncActive: isSyncActive ?? true,
        historySyncDepthHours: historySyncDepthHours ?? 24,
      },
      update: {
        ...(isSyncActive !== undefined ? { isSyncActive } : {}),
        ...(historySyncDepthHours !== undefined ? { historySyncDepthHours } : {}),
      },
    });
  }
}
