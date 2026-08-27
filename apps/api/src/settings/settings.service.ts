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

  async updateSettings(userId: string, data: {
    isSyncActive?: boolean;
    historySyncDepthHours?: number;
  }) {
    return this.prisma.settings.update({
      where: { userId },
      data,
    });
  }
}
