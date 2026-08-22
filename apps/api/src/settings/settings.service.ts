import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.settings.findFirst();
    if (!settings) {
      settings = await this.prisma.settings.create({
        data: {
          isSyncActive: true,
          historySyncDepthHours: 24,
        },
      });
    }
    return settings;
  }

  async updateSettings(data: {
    isSyncActive?: boolean;
    historySyncDepthHours?: number;
  }) {
    const settings = await this.getSettings();
    return this.prisma.settings.update({
      where: { id: settings.id },
      data,
    });
  }
}
