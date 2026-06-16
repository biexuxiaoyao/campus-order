import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBrandConfigDto } from './dto/update-brand-config.dto';

const DEFAULT_CONFIG = {
  name: '校园订餐',
  logo: '',
  themeColor: '#07C160',
  banners: [],
  hours: '09:00-21:00',
  phone: '',
};

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const record = await this.prisma.brandConfig.findUnique({
      where: { tenantId },
    });

    if (!record || !record.config) {
      return DEFAULT_CONFIG;
    }

    const stored = record.config as Record<string, unknown>;
    return { ...DEFAULT_CONFIG, ...stored };
  }

  async updateConfig(tenantId: string, dto: UpdateBrandConfigDto) {
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
