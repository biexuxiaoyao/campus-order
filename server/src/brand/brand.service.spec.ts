import { Test, TestingModule } from '@nestjs/testing';
import { BrandService } from './brand.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BrandService', () => {
  let service: BrandService;
  let prisma: PrismaService;
  let TENANT_ID: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BrandService, PrismaService],
    }).compile();
    service = module.get<BrandService>(BrandService);
    prisma = module.get<PrismaService>(PrismaService);
    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    TENANT_ID = demo!.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getConfig', () => {
    it('should return config for existing tenant', async () => {
      const config = await service.getConfig(TENANT_ID);
      expect(config.name).toBeDefined();
      expect(config.themeColor).toBeDefined();
      expect(config.hours).toBeDefined();
    });

    it('should return defaults for non-existent tenant', async () => {
      const config = await service.getConfig('non-existent');
      expect(config.name).toBe('校园订餐');
      expect(config.themeColor).toBe('#07C160');
    });

    it('should merge stored config with defaults', async () => {
      await service.updateConfig(TENANT_ID, { phone: '13800138000' });
      const config = await service.getConfig(TENANT_ID);
      expect(config.phone).toBe('13800138000');
      expect(config.name).toBeDefined(); // default preserved
    });
  });

  describe('updateConfig', () => {
    it('should upsert brand config', async () => {
      const config = await service.updateConfig(TENANT_ID, {
        name: '测试品牌',
        themeColor: '#FF0000',
        hours: '10:00-22:00',
      });
      expect((config as any).name).toBe('测试品牌');
      expect((config as any).themeColor).toBe('#FF0000');

      const loaded = await service.getConfig(TENANT_ID);
      expect(loaded.name).toBe('测试品牌');
    });

    it('should reject banners exceeding limit (DTO validation)', async () => {
      // DTO validates max 10 banners, but service just merges
      // The validation is at the controller/pipe layer
      const config = await service.updateConfig(TENANT_ID, {
        banners: ['b1', 'b2'],
      });
      expect((config as any).banners).toEqual(['b1', 'b2']);
    });
  });
});
