import { Test, TestingModule } from '@nestjs/testing';
import { DiscountService } from './discount.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DiscountService', () => {
  let service: DiscountService;
  let prisma: PrismaService;
  let STORE_ID: string;
  let DISH_A = 'dish-001'; // 红烧肉, cat-001
  let CAT_1 = 'cat-001';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscountService, PrismaService],
    }).compile();

    service = module.get<DiscountService>(DiscountService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    STORE_ID = (await prisma.store.findFirst({
      where: { tenantId: demo!.id },
    }))!.id;

    // Deactivate seed discount rule to prevent interference
    await prisma.discountRule.updateMany({
      where: { storeId: STORE_ID },
      data: { status: 'inactive' },
    });
  });

  afterAll(async () => {
    // Reactivate seed rules
    await prisma.discountRule.updateMany({
      where: { storeId: STORE_ID },
      data: { status: 'active' },
    });
    await prisma.$disconnect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
  afterEach(async () => {
    await prisma.discountRule.deleteMany({
      where: { storeId: STORE_ID, name: { startsWith: 'TEST:' } },
    });
  });
  // Extra safety: clean before ALL tests
  beforeAll(async () => {
    await prisma.discountRule.deleteMany({
      where: { storeId: STORE_ID, name: { startsWith: 'TEST:' } },
    });
  });

  const item = (
    price: number,
    qty: number,
    dishId?: string,
    catId?: string,
  ) => ({ price, quantity: qty, dishId, categoryId: catId });

  // ==================== CRUD ====================
  describe('CRUD', () => {
    it('should create and list rules', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: rule1',
        conditions: { type: 'min_amount', value: 1000 },
        actions: { type: 'amount_off', value: 100 },
        priority: 10,
      });
      const list = await service.findAll(STORE_ID);
      expect(list.some((r: any) => r.name === 'TEST: rule1')).toBe(true);
    });

    it('should soft-delete rule', async () => {
      const r = await service.create(STORE_ID, {
        name: 'TEST: del',
        conditions: { type: 'min_amount', value: 100 },
        actions: { type: 'amount_off', value: 10 },
      });
      await service.remove(r.id);
      const updated = await service.findOne(r.id);
      expect(updated.status).toBe('inactive');
    });
  });

  // ==================== 条件匹配 ====================
  describe('condition matching', () => {
    it('should match min_amount', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: min50',
        conditions: { type: 'min_amount', value: 5000 },
        actions: { type: 'amount_off', value: 1000 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(3000, 1)]);
      expect(r.discountAmount).toBe(0); // ¥30 < ¥50 threshold

      const r2 = await service.calculateDiscount(STORE_ID, [item(6000, 1)]);
      expect(r2.discountAmount).toBe(1000); // ¥60 >= ¥50
    });

    it('should match min_quantity', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: minQty3',
        conditions: { type: 'min_quantity', value: 3 },
        actions: { type: 'amount_off', value: 500 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(1000, 2)]); // qty=2 < 3
      expect(r.discountAmount).toBe(0);
      const r2 = await service.calculateDiscount(STORE_ID, [item(1000, 3)]); // qty=3 >= 3
      expect(r2.discountAmount).toBe(500);
    });

    it('should match specific_dishes', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: dishA',
        conditions: { type: 'specific_dishes', value: [DISH_A] },
        actions: { type: 'amount_off', value: 200 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [
        item(1000, 1, DISH_A),
      ]);
      expect(r.discountAmount).toBe(200);
      const r2 = await service.calculateDiscount(STORE_ID, [
        item(1000, 1, 'dish-002'),
      ]);
      expect(r2.discountAmount).toBe(0);
    });

    it('should match specific_category', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: cat1',
        conditions: { type: 'specific_category', value: [CAT_1] },
        actions: { type: 'amount_off', value: 300 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [
        item(1000, 1, DISH_A, CAT_1),
      ]);
      expect(r.discountAmount).toBe(300);
    });
  });

  // ==================== 动作计算 ====================
  describe('action calculation', () => {
    it('should compute amount_off (cap at total)', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: cap',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 5000 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(1000, 1)]); // total=¥10, discount=¥50 → capped to ¥10
      expect(r.discountAmount).toBe(1000);
      expect(r.finalAmount).toBe(0);
    });

    it('should compute percent_off', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: pct20',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'percent_off', value: 20 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(10000, 1)]); // ¥100 * 20% = ¥20 off
      expect(r.discountAmount).toBe(2000);
      expect(r.finalAmount).toBe(8000);
    });

    it('should compute free_item (min price item)', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: free',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'free_item', value: 1 },
        priority: 10,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [
        item(5000, 1),
        item(1000, 1),
      ]); // min price = 1000
      expect(r.discountAmount).toBe(1000);
    });
  });

  // ==================== 叠加规则 ====================
  describe('stackability', () => {
    it('should apply only highest priority non-stackable rule', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: high',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 1000 },
        priority: 10,
        isStackable: false,
      });
      await service.create(STORE_ID, {
        name: 'TEST: low',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 500 },
        priority: 5,
        isStackable: false,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(5000, 1)]);
      // Only the highest priority (10) should apply
      expect(r.discountAmount).toBe(1000);
      expect(r.appliedRules).toEqual(['TEST: high']);
    });

    it('should stack stackable rules', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: base',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 500 },
        priority: 10,
        isStackable: true,
      });
      await service.create(STORE_ID, {
        name: 'TEST: extra',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 300 },
        priority: 5,
        isStackable: true,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(5000, 1)]);
      expect(r.discountAmount).toBe(800); // 500 + 300
      expect(r.appliedRules).toContain('TEST: base');
      expect(r.appliedRules).toContain('TEST: extra');
    });

    it('should apply non-stackable + stackables on top', async () => {
      await service.create(STORE_ID, {
        name: 'TEST: nonstack',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 1000 },
        priority: 10,
        isStackable: false,
      });
      await service.create(STORE_ID, {
        name: 'TEST: stack',
        conditions: { type: 'first_order', value: true },
        actions: { type: 'amount_off', value: 200 },
        priority: 5,
        isStackable: true,
      });
      const r = await service.calculateDiscount(STORE_ID, [item(5000, 1)]);
      // Non-stackable (1000) + stackable (200) = 1200
      expect(r.discountAmount).toBe(1200);
    });
  });

  // ==================== 边界情况 ====================
  describe('edge cases', () => {
    it('should return zero discount with no rules', async () => {
      const r = await service.calculateDiscount(STORE_ID, [item(5000, 1)]);
      expect(r.discountAmount).toBe(0);
      expect(r.finalAmount).toBe(5000);
    });

    it('should filter expired rules by date', async () => {
      await prisma.discountRule.create({
        data: {
          storeId: STORE_ID,
          name: 'TEST: past',
          conditions: { type: 'first_order', value: true },
          actions: { type: 'amount_off', value: 999 },
          priority: 10,
          isStackable: false,
          endAt: new Date('2020-01-01'),
          status: 'active',
        },
      });
      await prisma.discountRule.create({
        data: {
          storeId: STORE_ID,
          name: 'TEST: future',
          conditions: { type: 'first_order', value: true },
          actions: { type: 'amount_off', value: 999 },
          priority: 10,
          isStackable: false,
          startAt: new Date('2099-01-01'),
          status: 'active',
        },
      });
      const r = await service.calculateDiscount(STORE_ID, [item(5000, 1)]);
      expect(r.discountAmount).toBe(0); // Both filtered out
    });
  });
});
