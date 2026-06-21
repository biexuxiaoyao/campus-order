import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

// Mock services that OrderService depends on but aren't the focus of unit tests
const mockNotifyService = {
  notifyRefundApproved: jest.fn().mockResolvedValue(undefined),
  notifyOrderReady: jest.fn().mockResolvedValue(undefined),
  notifyOrderCooking: jest.fn().mockResolvedValue(undefined),
  notifyOrderCancelled: jest.fn().mockResolvedValue(undefined),
  sendSubscribeMessage: jest.fn().mockResolvedValue(undefined),
};
const mockPaymentService = {
  refund: jest
    .fn()
    .mockResolvedValue({ id: 'mock-refund-id', status: 'completed' }),
  queryWechatOrder: jest.fn().mockResolvedValue(null),
};

describe('OrderService', () => {
  let service: OrderService;
  let prisma: PrismaService;

  // Dynamically resolved from seed data
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_ID: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        PrismaService,
        { provide: NotifyService, useValue: mockNotifyService },
        { provide: PaymentService, useValue: mockPaymentService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    prisma = module.get<PrismaService>(PrismaService);

    // Resolve demo tenant/store from seed data
    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    if (!demo)
      throw new Error(
        'Demo tenant not found — run `npx ts-node prisma/seed.ts` first',
      );
    TENANT_ID = demo.id;

    const store = await prisma.store.findFirst({
      where: { tenantId: TENANT_ID },
    });
    if (!store) throw new Error('Demo store not found');
    STORE_ID = store.id;

    // Create test user
    USER_ID = 'test-user-order-spec';
    await prisma.user.upsert({
      where: {
        tenantId_openid: { tenantId: TENANT_ID, openid: 'test_openid_order' },
      },
      create: {
        id: USER_ID,
        tenantId: TENANT_ID,
        openid: 'test_openid_order',
        nickname: 'Test',
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Clean up between tests
  afterEach(async () => {
    await prisma.cartItem.deleteMany({ where: { userId: USER_ID } });
    await prisma.orderItem.deleteMany({
      where: { order: { userId: USER_ID } },
    });
    await prisma.orderTimeline.deleteMany({
      where: { order: { userId: USER_ID } },
    });
    await prisma.paymentRecord.deleteMany({
      where: { order: { userId: USER_ID } },
    });
    await prisma.refundRecord.deleteMany({
      where: { order: { userId: USER_ID } },
    });
    await prisma.order.deleteMany({ where: { userId: USER_ID } });
  });

  // ==================== create() ====================
  describe('create', () => {
    it('should create order from cart items and deduct stock', async () => {
      // Setup: add cart item
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 2 },
        },
      });
      expect(sku).toBeDefined();
      const initialStock = sku!.availableStock;

      const cartItem = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 2,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const order = await service.create(USER_ID, TENANT_ID, {
        cartItemIds: [cartItem.id],
      });

      expect(order).toBeDefined();
      expect(order.status).toBe('pending');
      expect(order.totalAmount).toBeGreaterThan(0);
      expect(order.orderNo).toMatch(/^\d{18}$/);
      expect(order.items.length).toBe(1);
      expect(order.items[0].quantity).toBe(2);

      // Stock deducted
      const updatedSku = await prisma.sku.findUnique({
        where: { id: sku!.id },
      });
      expect(updatedSku!.availableStock).toBe(initialStock - 2);

      // Cart cleared
      const remaining = await prisma.cartItem.findUnique({
        where: { id: cartItem.id },
      });
      expect(remaining).toBeNull();
    });

    it('should reject if cart items do not belong to user', async () => {
      await expect(
        service.create('other-user', TENANT_ID, {
          cartItemIds: ['non-existent-id'],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject if stock insufficient', async () => {
      const sku = await prisma.sku.findFirst({
        where: { dish: { storeId: STORE_ID }, status: 'active' },
      });
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 99999,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      await expect(
        service.create(USER_ID, TENANT_ID, { cartItemIds: [cartItem.id] }),
      ).rejects.toThrow(ConflictException);
    });

    it('should generate unique order numbers', async () => {
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 3 },
        },
      });
      const c1 = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 1,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const c2 = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 1,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const o1 = await service.create(USER_ID, TENANT_ID, {
        cartItemIds: [c1.id],
      });
      const o2 = await service.create(USER_ID, TENANT_ID, {
        cartItemIds: [c2.id],
      });

      expect(o1.orderNo).not.toBe(o2.orderNo);
    });
  });

  // ==================== state machine ====================
  describe('updateStatus', () => {
    it('should allow valid transition paid → confirmed → cooking → ready → picked', async () => {
      const order = await createPaidOrder();
      let status = order.status;

      const flow = ['confirmed', 'cooking', 'ready', 'picked'];
      for (const next of flow) {
        const updated = await service.updateStatus(order.id, next, 'admin');
        status = (updated as any).status;
        expect(status).toBe(next);
      }
      expect(status).toBe('picked');
    });

    it('should generate pickupNo when transitioning to ready', async () => {
      const order = await createPaidOrder();
      await service.updateStatus(order.id, 'confirmed', 'admin');
      await service.updateStatus(order.id, 'cooking', 'admin');
      const ready = await service.updateStatus(order.id, 'ready', 'admin');

      expect((ready as any).pickupNo).toMatch(/^A\d{3}$/);
    });

    it('should reject invalid transition (paid → ready)', async () => {
      const order = await createPaidOrder();
      // paid → ready is invalid (must go through confirmed → cooking)
      await expect(
        service.updateStatus(order.id, 'ready', 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment version on each status change', async () => {
      const order = await createPaidOrder();
      expect(order.version).toBe(0);

      const r1 = await service.updateStatus(order.id, 'confirmed', 'admin');
      expect((r1 as any).version).toBe(1);

      const r2 = await service.updateStatus(order.id, 'cooking', 'admin');
      expect((r2 as any).version).toBe(2);
    });
  });

  // ==================== cancel() ====================
  describe('cancel', () => {
    it('should cancel pending order and restore stock', async () => {
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 2 },
        },
      });
      const initialStock = sku!.availableStock;
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 1,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const order = await service.create(USER_ID, TENANT_ID, {
        cartItemIds: [cartItem.id],
      });

      await service.cancel(order.id, USER_ID);

      const cancelled = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(cancelled!.status).toBe('cancelled');

      // Stock restored
      const restored = await prisma.sku.findUnique({ where: { id: sku!.id } });
      expect(restored!.availableStock).toBe(initialStock);
    });

    it('should reject cancel if order does not belong to user', async () => {
      const order = await createPaidOrder();
      await expect(service.cancel(order.id, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject cancel if order not pending', async () => {
      const order = await createPaidOrder();
      await expect(service.cancel(order.id, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ==================== reorder() ====================
  describe('reorder', () => {
    it('should re-create cart items from order', async () => {
      const order = await createPaidOrder();

      const cartItems = await service.reorder(order.id, USER_ID);

      expect(cartItems.length).toBeGreaterThan(0);
      const loaded = await prisma.cartItem.findMany({
        where: { userId: USER_ID },
      });
      expect(loaded.length).toBe(cartItems.length);
    });
  });

  // ==================== requestRefund() ====================
  describe('requestRefund', () => {
    it('should create refund record and set status to refunding', async () => {
      const order = await createPaidOrder();

      const refund = await service.requestRefund(
        order.id,
        USER_ID,
        undefined,
        '测试退款',
      );

      expect(refund.status).toBe('pending');
      expect(refund.amount).toBeGreaterThan(0);

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated!.status).toBe('refunding');
    });

    it('should reject refund for non-owner', async () => {
      const order = await createPaidOrder();
      await expect(
        service.requestRefund(order.id, 'other-user', undefined, 'test'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject refund for pending order', async () => {
      const sku = await prisma.sku.findFirst({
        where: {
          dish: { storeId: STORE_ID },
          status: 'active',
          availableStock: { gte: 2 },
        },
      });
      const cartItem = await prisma.cartItem.create({
        data: {
          userId: USER_ID,
          tenantId: TENANT_ID,
          skuId: sku!.id,
          quantity: 1,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const order = await service.create(USER_ID, TENANT_ID, {
        cartItemIds: [cartItem.id],
      });

      await expect(
        service.requestRefund(order.id, USER_ID, undefined, 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce max 2 refund attempts', async () => {
      const order = await createPaidOrder();
      await service.requestRefund(order.id, USER_ID, undefined, '1st');
      // Refund record created but not approved — just testing max attempts
      // Reset order back so we can try again
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'paid' },
      });
      await service.requestRefund(order.id, USER_ID, undefined, '2nd');

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'paid' },
      });
      await expect(
        service.requestRefund(order.id, USER_ID, undefined, '3rd'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== helpers ====================
  async function createPaidOrder() {
    const sku = await prisma.sku.findFirst({
      where: {
        dish: { storeId: STORE_ID },
        status: 'active',
        availableStock: { gte: 2 },
      },
    });
    const cartItem = await prisma.cartItem.create({
      data: {
        userId: USER_ID,
        tenantId: TENANT_ID,
        skuId: sku!.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const order = await service.create(USER_ID, TENANT_ID, {
      cartItemIds: [cartItem.id],
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid' },
    });
    return order;
  }
});
