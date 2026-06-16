import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const DEFAULT_SETTINGS = {
  hours: '09:00-21:00',
  paused: false,
  pauseReason: '',
  printers: [],
  autoPrint: false,
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    const record = await this.prisma.brandConfig.findUnique({
      where: { tenantId },
    });

    if (!record || !record.config) {
      return DEFAULT_SETTINGS;
    }

    const stored = record.config as Record<string, unknown>;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateSettings(tenantId: string, dto: UpdateSettingsDto) {
    const existing = await this.prisma.brandConfig.findUnique({
      where: { tenantId },
    });

    const currentConfig = (existing?.config as Record<string, unknown>) || {};
    const merged = { ...currentConfig, ...dto };

    const record = await this.prisma.brandConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        config: merged,
      },
      update: {
        config: merged,
      },
    });

    return record.config;
  }
}
