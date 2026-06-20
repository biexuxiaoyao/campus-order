import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';

const mockNotifyService = {
  sendSubscribeMessage: jest.fn().mockResolvedValue(undefined),
  notifyCouponExpiring: jest.fn().mockResolvedValue(undefined),
};
const mockPaymentService = {
  queryWechatOrder: jest.fn().mockResolvedValue(null),
  refund: jest
    .fn()
    .mockResolvedValue({ id: 'mock-refund-id', status: 'completed' }),
};

describe('ScheduleService', () => {
  let service: ScheduleService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        PrismaService,
        { provide: NotifyService, useValue: mockNotifyService },
        { provide: PaymentService, useValue: mockPaymentService },
      ],
    }).compile();
    service = module.get<ScheduleService>(ScheduleService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    TENANT_ID = demo!.id;
    STORE_ID = (await prisma.store.findFirst({
      where: { tenantId: TENANT_ID },
    }))!.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('handlePaymentTimeout', () => {
    it('should cancel expired pending orders and release stock', async () => {
      // Create a dedicated SKU with known stock
      const dish = await prisma.dish.findFirst({
        where: { storeId: STORE_ID },
      });
      const qty = 2;
      const sku = await prisma.sku.create({
        data: {
          id: `sku-t-${Date.now()}`,
          dishId: dish!.id,
          specs: [],
          price: 500,
          stock: 20,
          availableStock: 10,
        },
      });
      // Deduct stock to simulate real order flow (OrderService.create does this)
      await prisma.sku.update({
        where: { id: sku.id },
        data: { availableStock: { decrement: qty } },
      });
      const stockAfterDeduct = 8;

      const userId = `sch_${Date.now()}`;
      await prisma.user.create({
        data: {
          id: userId,
          tenantId: TENANT_ID,
          openid: `sch_${Date.now()}`,
          nickname: 'S',
        },
      });
      await prisma.order.create({
        data: {
          orderNo: `EXP_${Date.now()}`,
          tenantId: TENANT_ID,
          userId,
          storeId: STORE_ID,
          type: 'individual',
          status: 'pending',
          totalAmount: qty * 500,
          createdAt: new Date(Date.now() - 20 * 60 * 1000),
          items: {
            create: {
              skuId: sku.id,
              dishName: 'T',
              specName: '',
              price: 500,
              quantity: qty,
            },
          },
          timeline: { create: { status: 'pending' } },
        },
      });

      await service.handlePaymentTimeout();

      const restored = await prisma.sku.findUnique({ where: { id: sku.id } });
      expect(restored!.availableStock).toBe(stockAfterDeduct + qty); // 8 + 2 = 10
    });

    it('should not cancel recent pending orders', async () => {
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 1 },
        },
      });
      const userId = `sch2_${Date.now()}`;
      await prisma.user.create({
        data: {
          id: userId,
          tenantId: TENANT_ID,
          openid: `sch2_${Date.now()}`,
          nickname: 'S2',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNo: `FRESH_${Date.now()}`,
          tenantId: TENANT_ID,
          userId,
          storeId: STORE_ID,
          type: 'individual',
          status: 'pending',
          totalAmount: 500,
          createdAt: new Date(), // just now
          items: {
            create: {
              skuId: sku!.id,
              dishName: 'Test',
              specName: '',
              price: 500,
              quantity: 1,
            },
          },
          timeline: { create: { status: 'pending' } },
        },
      });

      await service.handlePaymentTimeout();

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated!.status).toBe('pending'); // still pending, not expired yet
    });
  });

  describe('handleDishScheduledPublish', () => {
    it('should publish dishes whose scheduled time has arrived', async () => {
      const dish = await prisma.dish.create({
        data: {
          storeId: STORE_ID,
          categoryId: 'cat-001',
          name: '定时上架测试',
          status: 'draft',
          scheduledPublishAt: new Date('2020-01-01'),
        },
      });
      await service.handleDishScheduledPublish();
      const updated = await prisma.dish.findUnique({ where: { id: dish.id } });
      expect(updated!.status).toBe('published');
    });

    it('should unpublish dishes whose scheduled unpublish time has arrived', async () => {
      const dish = await prisma.dish.create({
        data: {
          storeId: STORE_ID,
          categoryId: 'cat-001',
          name: '定时下架测试',
          status: 'published',
          scheduledUnpublishAt: new Date('2020-01-01'),
        },
      });
      await service.handleDishScheduledPublish();
      const updated = await prisma.dish.findUnique({ where: { id: dish.id } });
      expect(updated!.status).toBe('offline');
    });
  });

  describe('handleEndOfDayComplete', () => {
    it('should move ready orders to picked', async () => {
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 1 },
        },
      });
      const userId = `sch3_${Date.now()}`;
      await prisma.user.create({
        data: {
          id: userId,
          tenantId: TENANT_ID,
          openid: `sch3_${Date.now()}`,
          nickname: 'S3',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNo: `READY_${Date.now()}`,
          tenantId: TENANT_ID,
          userId,
          storeId: STORE_ID,
          type: 'individual',
          status: 'ready',
          totalAmount: 1000,
          items: {
            create: {
              skuId: sku!.id,
              dishName: 'T',
              specName: '',
              price: 1000,
              quantity: 1,
            },
          },
          timeline: { create: { status: 'pending' } },
        },
      });
      await service.handleEndOfDayComplete();
      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated!.status).toBe('picked');
    });
  });
});
