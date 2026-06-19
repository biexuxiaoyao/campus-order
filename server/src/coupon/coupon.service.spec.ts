import { Test, TestingModule } from '@nestjs/testing';
import { CouponService } from './coupon.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CouponService', () => {
  let service: CouponService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_A: string;
  let USER_B: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponService, PrismaService],
    }).compile();

    service = module.get<CouponService>(CouponService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    if (!demo) throw new Error('Seed data required');
    TENANT_ID = demo.id;
    STORE_ID = (await prisma.store.findFirst({ where: { tenantId: TENANT_ID } }))!.id;

    USER_A = 'test-coupon-user-a';
    USER_B = 'test-coupon-user-b';
    await prisma.user.upsert({ where: { tenantId_openid: { tenantId: TENANT_ID, openid: 'coupon_test_a' } }, create: { id: USER_A, tenantId: TENANT_ID, openid: 'coupon_test_a', nickname: 'A' }, update: {} });
    await prisma.user.upsert({ where: { tenantId_openid: { tenantId: TENANT_ID, openid: 'coupon_test_b' } }, create: { id: USER_B, tenantId: TENANT_ID, openid: 'coupon_test_b', nickname: 'B' }, update: {} });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  afterEach(async () => {
    await prisma.userCoupon.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.couponTemplate.deleteMany({ where: { storeId: STORE_ID, name: { startsWith: 'TEST:' } } });
  });

  // ==================== Template CRUD ====================
  describe('Template CRUD', () => {
    it('should create and find template', async () => {
      const t = await service.createTemplate(STORE_ID, {
        name: 'TEST: 满20减5', type: 'full_reduction', threshold: 2000, value: 500, totalQty: 100, validDays: 7,
      });
      expect(t.name).toBe('TEST: 满20减5');
      expect(t.totalQty).toBe(100);

      const list = await service.findTemplates(STORE_ID);
      expect(list.some((l: any) => l.id === t.id)).toBe(true);
    });

    it('should soft-delete template (sets to inactive)', async () => {
      const t = await service.createTemplate(STORE_ID, {
        name: 'TEST: to-delete', type: 'full_reduction', threshold: 1000, value: 100, totalQty: 10,
      });
      await service.removeTemplate(t.id);
      const updated = await service.findTemplateById(t.id);
      expect(updated.status).toBe('inactive');
    });

    it('should throw on non-existent template', async () => {
      await expect(service.findTemplateById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== claim() — 核心事务方法 ====================
  describe('claim', () => {
    it('should claim coupon successfully', async () => {
      const t = await createTemplate('TEST: 满10减3', 100, 10, 1000);

      const uc = await service.claim(USER_A, t.id);
      expect(uc.status).toBe('available');
      expect(uc.templateId).toBe(t.id);

      const updated = await prisma.couponTemplate.findUnique({ where: { id: t.id } });
      expect(updated!.usedQty).toBe(1);
    });

    it('should reject duplicate claim (unique constraint)', async () => {
      const t = await createTemplate('TEST: dup', 1, 10, 500);
      await service.claim(USER_A, t.id);
      await expect(service.claim(USER_A, t.id)).rejects.toThrow(BadRequestException);
    });

    it('should reject when stock exhausted', async () => {
      const t = await createTemplate('TEST: soldout', 1, 10, 500);
      await service.claim(USER_A, t.id); // user A claims the only one
      await expect(service.claim(USER_B, t.id)).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive template', async () => {
      const t = await service.createTemplate(STORE_ID, {
        name: 'TEST: inactive', type: 'full_reduction', threshold: 100, value: 10, totalQty: 100,
      });
      await service.removeTemplate(t.id); // soft-delete → inactive
      await expect(service.claim(USER_A, t.id)).rejects.toThrow(BadRequestException);
    });

    it('should allow different users to claim same template', async () => {
      const t = await createTemplate('TEST: multi', 100, 10, 500);
      const a = await service.claim(USER_A, t.id);
      const b = await service.claim(USER_B, t.id);
      expect(a.userId).toBe(USER_A);
      expect(b.userId).toBe(USER_B);

      const updated = await prisma.couponTemplate.findUnique({ where: { id: t.id } });
      expect(updated!.usedQty).toBe(2);
    });
  });

  // ==================== getClaimableTemplates() ====================
  describe('getClaimableTemplates', () => {
    it('should list claimable templates', async () => {
      const t = await createTemplate('TEST: claimable', 100, 10, 500);
      const list = await service.getClaimableTemplates(STORE_ID, USER_A);
      expect(list.some((l: any) => l.id === t.id)).toBe(true);
    });

    it('should exclude already-claimed templates', async () => {
      const t = await createTemplate('TEST: claimed', 100, 10, 500);
      await service.claim(USER_A, t.id);
      const list = await service.getClaimableTemplates(STORE_ID, USER_A);
      expect(list.some((l: any) => l.id === t.id)).toBe(false);
    });

    it('should exclude sold-out templates', async () => {
      const t = await createTemplate('TEST: soldout2', 1, 10, 500);
      await service.claim(USER_B, t.id);
      const list = await service.getClaimableTemplates(STORE_ID, USER_A);
      expect(list.some((l: any) => l.id === t.id)).toBe(false);
    });

    it('should exclude expired templates', async () => {
      const t = await prisma.couponTemplate.create({
        data: { storeId: STORE_ID, name: 'TEST: expired2', type: 'full_reduction', threshold: 100, value: 10, totalQty: 100, endAt: new Date('2020-01-01'), status: 'active' },
      });
      const list = await service.getClaimableTemplates(STORE_ID, USER_A);
      expect(list.some((l: any) => l.id === t.id)).toBe(false);
    });
  });

  // ==================== getAvailableForOrder() + 折扣计算 ====================
  describe('getAvailableForOrder', () => {
    it('should filter coupons by threshold', async () => {
      const t = await createTemplate('TEST: threshold', 100, 10, 5000); // threshold=5000
      const uc = await service.claim(USER_A, t.id);

      // Order ¥30 (3000分) — below threshold
      const low = await service.getAvailableForOrder(USER_A, 3000);
      expect(low.some((c: any) => c.id === uc.id)).toBe(false);

      // Order ¥60 (6000分) — above threshold
      const high = await service.getAvailableForOrder(USER_A, 6000);
      expect(high.some((c: any) => c.id === uc.id)).toBe(true);
    });

    it('should calculate full_reduction discount correctly', async () => {
      // value parameter in createTemplate sets the coupon value
      const t = await service.createTemplate(STORE_ID, {
        name: 'TEST: fr', type: 'full_reduction', threshold: 1000, value: 1000, totalQty: 100, validDays: 30,
      });
      await service.claim(USER_A, t.id);
      const result = await service.getAvailableForOrder(USER_A, 5000);
      expect((result[0] as any).discountAmount).toBe(1000);
    });

    it('should calculate discount coupon (percent_off) correctly', async () => {
      const t = await prisma.couponTemplate.create({
        data: { storeId: STORE_ID, name: 'TEST: pct', type: 'discount', threshold: 3000, value: 80, maxValue: 1500, totalQty: 100, validDays: 30, status: 'active' },
      });
      await service.claim(USER_A, t.id);
      // Order ¥100 (10000分), 8折 = 2000 off, capped at 1500
      const result = await service.getAvailableForOrder(USER_A, 10000);
      expect((result[0] as any).discountAmount).toBe(1500);
    });

    it('should calculate product coupon value correctly', async () => {
      const t = await prisma.couponTemplate.create({
        data: { storeId: STORE_ID, name: 'TEST: prod', type: 'product', threshold: null!, value: 500, totalQty: 100, status: 'active' },
      });
      await service.claim(USER_A, t.id);
      const result = await service.getAvailableForOrder(USER_A, 2000);
      expect((result[0] as any).discountAmount).toBe(500);
    });
  });

  // ==================== useCoupon() ====================
  describe('useCoupon', () => {
    it('should mark coupon as used', async () => {
      const t = await createTemplate('TEST: use', 100, 10, 500);
      const uc = await service.claim(USER_A, t.id);

      await service.useCoupon(uc.id, 'order-1');
      const updated = await prisma.userCoupon.findUnique({ where: { id: uc.id } });
      expect(updated!.status).toBe('used');
      expect(updated!.usedAt).toBeDefined();
    });

    it('should reject using already-used coupon', async () => {
      const t = await createTemplate('TEST: use2', 100, 10, 500);
      const uc = await service.claim(USER_A, t.id);
      await service.useCoupon(uc.id, 'order-1');
      await expect(service.useCoupon(uc.id, 'order-2')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== expireCheck() ====================
  describe('expireCheck', () => {
    it('should expire coupons past validDays', async () => {
      // Create coupon with validDays=1, then manually set createdAt to 2 days ago
      const t = await prisma.couponTemplate.create({
        data: { storeId: STORE_ID, name: 'TEST: expire-soon', type: 'full_reduction', threshold: 100, value: 10, totalQty: 100, validDays: 1, status: 'active' },
      });
      const uc = await service.claim(USER_A, t.id);
      // Set createdAt to 2 days ago so validDays=1 is expired
      await prisma.userCoupon.update({ where: { id: uc.id }, data: { createdAt: new Date(Date.now() - 2 * 86400000) } });

      const result = await service.expireCheck();
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const coupons = await service.getUserCoupons(USER_A, 'available');
      expect(coupons.length).toBe(0);
    });

    it('should expire coupons past endAt', async () => {
      const t = await prisma.couponTemplate.create({
        data: { storeId: STORE_ID, name: 'TEST: expire-endat', type: 'full_reduction', threshold: 100, value: 10, totalQty: 100, endAt: new Date('2020-01-01'), status: 'active' },
      });
      await service.claim(USER_A, t.id);

      const result = await service.expireCheck();
      expect(result.expired).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== helpers ====================
  async function createTemplate(name: string, totalQty: number, validDays: number, threshold: number) {
    return service.createTemplate(STORE_ID, {
      name, type: 'full_reduction', threshold, value: 500, totalQty, validDays,
    });
  }
});
