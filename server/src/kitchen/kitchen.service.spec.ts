import { Test, TestingModule } from '@nestjs/testing';
import { KitchenService } from './kitchen.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { BadRequestException } from '@nestjs/common';

const mockNotifyService = {
  notifyOrderPicked: jest.fn().mockResolvedValue(undefined),
  notifyOrderCooking: jest.fn().mockResolvedValue(undefined),
  notifyOrderReady: jest.fn().mockResolvedValue(undefined),
};

describe('KitchenService', () => {
  let service: KitchenService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_ID: string;
  let SKU_ID: string;

  const ORDER_IDS: string[] = [];
  const PREFIX = `kt-${Date.now()}-`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        PrismaService,
        { provide: NotifyService, useValue: mockNotifyService },
      ],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    if (!demo) throw new Error('Seed required');
    TENANT_ID = demo.id;

    STORE_ID = (
      await prisma.store.findFirst({ where: { tenantId: TENANT_ID } })
    )!.id;

    const sku = await prisma.sku.findFirst({
      where: { dish: { storeId: STORE_ID }, status: 'active' },
      include: { dish: true },
    });
    if (!sku) throw new Error('No SKU found');
    SKU_ID = sku.id;

    USER_ID = `test-kitchen-user-${Date.now()}`;
    await prisma.user.upsert({
      where: {
        tenantId_openid: { tenantId: TENANT_ID, openid: `kitchen_test_${Date.now()}` },
      },
      create: {
        id: USER_ID,
        tenantId: TENANT_ID,
        openid: `kitchen_test_${Date.now()}`,
        nickname: 'KitchenTest',
      },
      update: {},
    });

    // Create orders in different statuses
    const statuses = ['confirmed', 'confirmed', 'cooking', 'ready'];
    for (let i = 0; i < statuses.length; i++) {
      const orderId = `${PREFIX}order-${i}`;
      ORDER_IDS.push(orderId);

      await prisma.order.create({
        data: {
          id: orderId,
          orderNo: `${PREFIX}ON${i}`,
          tenantId: TENANT_ID,
          storeId: STORE_ID,
          userId: USER_ID,
          type: 'normal',
          status: statuses[i],
          totalAmount: 1000,
          version: 0,
          items: {
            create: {
              skuId: SKU_ID,
              dishName: `Test Dish ${i}`,
              specName: '默认',
              price: 1000,
              quantity: 1,
            },
          },
          timeline: {
            create: { status: statuses[i] },
          },
        },
      });
    }
  });

  afterAll(async () => {
    // Clean up in FK order
    await prisma.orderTimeline.deleteMany({
      where: { order: { id: { in: ORDER_IDS } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { id: { in: ORDER_IDS } } },
    });
    await prisma.paymentRecord.deleteMany({
      where: { order: { id: { in: ORDER_IDS } } },
    });
    await prisma.order.deleteMany({ where: { id: { in: ORDER_IDS } } });
    await prisma.$disconnect();
  });

  describe('getKitchenOrders', () => {
    it('should return orders grouped by status', async () => {
      const result = await service.getKitchenOrders(STORE_ID, TENANT_ID);

      expect(result.pending).toBeDefined();
      expect(result.cooking).toBeDefined();
      expect(result.ready).toBeDefined();

      // 2 confirmed → pending group
      expect(result.pendingCount).toBeGreaterThanOrEqual(2);
      expect(result.pending.every((o: any) => o.status === 'confirmed')).toBe(
        true,
      );

      // 1 cooking
      expect(result.cookingCount).toBeGreaterThanOrEqual(1);
      expect(result.cooking.every((o: any) => o.status === 'cooking')).toBe(
        true,
      );

      // 1 ready
      expect(result.readyCount).toBeGreaterThanOrEqual(1);
      expect(result.ready.every((o: any) => o.status === 'ready')).toBe(true);

      // All groups include items
      for (const order of result.pending) {
        expect(order.items.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('batchStartCooking', () => {
    it('should transition confirmed → cooking', async () => {
      const confirmedOrders = ORDER_IDS.filter((id, i) =>
        id.includes('order-0') || id.includes('order-1'),
      );

      const result = await service.batchStartCooking(
        STORE_ID,
        confirmedOrders,
        'op-1',
      );

      expect(result.results.length).toBeGreaterThanOrEqual(1);
      for (const r of result.results) {
        expect(r.status).toBe('cooking');
      }

      // Verify in DB
      for (const id of confirmedOrders) {
        const order = await prisma.order.findUnique({ where: { id } });
        if (order) {
          expect(['cooking']).toContain(order.status);
        }
      }
    });

    it('should reject orders not in confirmed status', async () => {
      const readyOrder = ORDER_IDS[3]; // status = ready
      const result = await service.batchStartCooking(STORE_ID, [readyOrder], 'op-1');

      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].error).toContain('无法');
    });
  });

  describe('batchMarkReady', () => {
    it('should transition cooking → ready with pickupNo', async () => {
      const cookingOrder = ORDER_IDS[2]; // status = cooking

      const result = await service.batchMarkReady(
        STORE_ID,
        [cookingOrder],
        'op-1',
      );

      expect(result.results.length).toBe(1);
      expect(result.results[0].status).toBe('ready');
      expect(result.results[0].pickupNo).toMatch(/^A\d{3}$/);

      // Verify in DB
      const order = await prisma.order.findUnique({
        where: { id: cookingOrder },
      });
      expect(order!.status).toBe('ready');
      expect(order!.pickupNo).toMatch(/^A\d{3}$/);
    });
  });

  describe('batchPickup', () => {
    it('should transition ready → picked', async () => {
      const readyOrder = ORDER_IDS[3];

      const result = await service.batchPickup(STORE_ID, [readyOrder], 'op-1');

      expect(result.results.length).toBe(1);
      expect(result.results[0].status).toBe('picked');

      // Verify in DB
      const order = await prisma.order.findUnique({
        where: { id: readyOrder },
      });
      expect(order!.status).toBe('picked');
    });

    it('should reject invalid store', async () => {
      const result = await service.batchPickup(
        'invalid-store',
        [ORDER_IDS[0]],
        'op-1',
      );

      expect(result.results.length).toBe(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
