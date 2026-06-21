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
  // Miniprogram configuration defaults (can be overridden per tenant)
  rechargeOptions: [50, 100, 200, 500],
  timeSlots: ['尽快取餐', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45'],
  exchangeRules: [
    { id: 'coupon_10_2', label: '满10减2券', points: 100, type: 'coupon' },
    { id: 'coupon_20_5', label: '满20减5券', points: 200, type: 'coupon' },
  ],
};

@Injectable()
export class BrandService {
  constructor(private prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const record = await this.prisma.brandConfig.findUnique({
      where: { tenantId },
    });

    // Resolve the first active store for this tenant (miniprogram needs storeId)
    const firstStore = await this.prisma.store.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const resolvedConfig: Record<string, unknown> = {
      ...DEFAULT_CONFIG,
      storeId: firstStore?.id || '',
    };

    if (!record || !record.config) {
      return resolvedConfig;
    }

    const stored = record.config as Record<string, unknown>;
    return { ...resolvedConfig, ...stored };
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
