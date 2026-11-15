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
    const isSyncActive =
      typeof data?.isSyncActive === 'boolean' ? data.isSyncActive : undefined;
    let historySyncDepthHours: number | undefined = undefined;
    if (
      data?.historySyncDepthHours !== undefined &&
      data?.historySyncDepthHours !== null
    ) {
      const parsed = parseInt(String(data.historySyncDepthHours), 10);
      if (!isNaN(parsed) && parsed > 0) {
        historySyncDepthHours = parsed;
      }
    }

    // Pricing rule (margin engine) — validated, never trusted raw.
    const marginType =
      data?.marginType === 'PERCENT' || data?.marginType === 'FIXED'
        ? data.marginType
        : undefined;
    let marginValue: number | undefined = undefined;
    if (data?.marginValue !== undefined && data?.marginValue !== null) {
      const parsed = parseFloat(String(data.marginValue));
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100000) {
        marginValue = parsed;
      }
    }
    const priceRounding = [0, 10, 50, 100, 500].includes(
      Number(data?.priceRounding),
    )
      ? Number(data.priceRounding)
      : undefined;
    const captionFooter =
      typeof data?.captionFooter === 'string'
        ? data.captionFooter.slice(0, 500)
        : data?.captionFooter === null
          ? null
          : undefined;

    return this.prisma.settings.upsert({
      where: { userId },
      create: {
        userId,
        isSyncActive: isSyncActive ?? true,
        historySyncDepthHours: historySyncDepthHours ?? 24,
        ...(marginType !== undefined ? { marginType } : {}),
        ...(marginValue !== undefined ? { marginValue } : {}),
        ...(priceRounding !== undefined ? { priceRounding } : {}),
        ...(captionFooter !== undefined ? { captionFooter } : {}),
      },
      update: {
        ...(isSyncActive !== undefined ? { isSyncActive } : {}),
        ...(historySyncDepthHours !== undefined
          ? { historySyncDepthHours }
          : {}),
        ...(marginType !== undefined ? { marginType } : {}),
        ...(marginValue !== undefined ? { marginValue } : {}),
        ...(priceRounding !== undefined ? { priceRounding } : {}),
        ...(captionFooter !== undefined ? { captionFooter } : {}),
      },
    });
  }
}
