import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { PrepaidService } from '../prepaid/prepaid.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { WechatPayConfig } from './wechat-pay.config';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NotifyService } from '../notify/notify.service';
import { WechatPayClient } from './wechat-pay.client';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let prepaidService: PrepaidService;
  let orderService: OrderService;
  let prisma: PrismaService;

  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_ID: string;

  const mockHttpService = {
    request: jest
      .fn()
      .mockReturnValue(of({ data: { prepay_id: 'test_prepay_id' } })),
  };

  const mockWechatConfig = {
    isConfigured: false,
    mchId: '',
    apiV3Key: '',
    serialNo: '',
    privateKey: null,
    platformCert: null,
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('wx8ebfaf4a045bf7c3'),
  };

  const mockNotifyService = {
    notifyOrderPaid: jest.fn().mockResolvedValue(undefined),
    sendSubscribeMessage: jest.fn().mockResolvedValue(undefined),
  };

  const mockWechatPayClient = {
    getAppId: jest.fn().mockReturnValue(''),
    generateNonceStr: jest.fn().mockReturnValue('mocknoncestr'),
    signMessage: jest.fn().mockReturnValue('mock-sig'),
    generateWechatSign: jest.fn().mockReturnValue('mock-pay-sign'),
    callWechatApi: jest.fn().mockResolvedValue({ prepay_id: 'test_prepay_id' }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        PrepaidService,
        OrderService,
        PrismaService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: WechatPayConfig, useValue: mockWechatConfig },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: NotifyService, useValue: mockNotifyService },
        { provide: WechatPayClient, useValue: mockWechatPayClient },
      ],
    }).compile();

    paymentService = module.get<PaymentService>(PaymentService);
    prepaidService = module.get<PrepaidService>(PrepaidService);
    orderService = module.get<OrderService>(OrderService);
    prisma = module.get<PrismaService>(PrismaService);

    // Resolve demo tenant from seed data
    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    if (!demo)
      throw new Error(
        'Demo tenant not found — run npx ts-node prisma/seed.ts first',
      );
    TENANT_ID = demo.id;

    const store = await prisma.store.findFirst({
      where: { tenantId: TENANT_ID },
    });
    if (!store) throw new Error('Demo store not found');
    STORE_ID = store.id;

    // Create test user
    USER_ID = 'test-user-payment-spec';
    await prisma.user.upsert({
      where: {
        tenantId_openid: { tenantId: TENANT_ID, openid: 'test_openid_payment' },
      },
      create: {
        id: USER_ID,
        tenantId: TENANT_ID,
        openid: 'test_openid_payment',
        nickname: 'PayTest',
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
    await prisma.paymentRecord.deleteMany({ where: { orderId: null } }); // recharge payments too
    await prisma.refundRecord.deleteMany({
      where: { order: { userId: USER_ID } },
    });
    await prisma.prepaidTransaction.deleteMany({
      where: { account: { userId: USER_ID } },
    });
    await prisma.prepaidAccount.deleteMany({ where: { userId: USER_ID } });
    await prisma.order.deleteMany({ where: { userId: USER_ID } });
  });

  // Helper: create a pending order
  async function createPendingOrder() {
    const sku = await prisma.sku.findFirst({
      where: {
        dish: { storeId: STORE_ID },
        status: 'active',
        availableStock: { gte: 2 },
      },
    });
    if (!sku) throw new Error('No available SKU found');
    const cartItem = await prisma.cartItem.create({
      data: {
        userId: USER_ID,
        tenantId: TENANT_ID,
        skuId: sku.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const order = await orderService.create(USER_ID, TENANT_ID, {
      cartItemIds: [cartItem.id],
    });
    return order;
  }

  // ===================== prepay with balance =====================

  describe('prepay (balance)', () => {
    it('should deduct balance and mark order as paid', async () => {
      // 1. Top up prepaid account
      const rechargeResult = await prepaidService.recharge(USER_ID, TENANT_ID, {
        amount: 100,
        type: 'personal',
      });
      await prepaidService.confirmRecharge(rechargeResult.paymentRecordId);

      const balanceBefore = await prepaidService.getBalance(USER_ID, TENANT_ID);

      // 2. Create a pending order
      const order = await createPendingOrder();

      // 3. Pay with balance
      const result = await paymentService.prepay(
        USER_ID,
        'test_openid_payment',
        order.id,
        'balance',
        '',
      );

      expect(result.channel).toBe('balance');
      expect(result.paymentId).toBeDefined();

      // 4. Verify order status = paid
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updatedOrder!.status).toBe('paid');
      expect(updatedOrder!.paymentMethod).toBe('balance');

      // 5. Verify PaymentRecord created with success
      const payment = await prisma.paymentRecord.findFirst({
        where: { orderId: order.id },
      });
      expect(payment).toBeDefined();
      expect(payment!.channel).toBe('balance');
      expect(payment!.status).toBe('success');
      expect(payment!.amount).toBe(order.totalAmount);

      // 6. Verify balance decreased
      const balanceAfter = await prepaidService.getBalance(USER_ID, TENANT_ID);
      expect(balanceAfter.personalBalance).toBe(
        balanceBefore.personalBalance - order.totalAmount,
      );

      // 7. Verify OrderTimeline has 'paid' entry
      const timeline = await prisma.orderTimeline.findFirst({
        where: { orderId: order.id, status: 'paid' },
      });
      expect(timeline).toBeDefined();
    });

    it('should reject balance payment when insufficient funds', async () => {
      // Ensure balance is 0
      const order = await createPendingOrder();

      await expect(
        paymentService.prepay(
          USER_ID,
          'test_openid_payment',
          order.id,
          'balance',
          '',
        ),
      ).rejects.toThrow(BadRequestException);

      // Order should still be pending
      const unchangedOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(unchangedOrder!.status).toBe('pending');
    });

    it('should be idempotent — calling balance payment twice for same order is safe', async () => {
      // 1. Top up
      const rechargeResult = await prepaidService.recharge(USER_ID, TENANT_ID, {
        amount: 100,
        type: 'personal',
      });
      await prepaidService.confirmRecharge(rechargeResult.paymentRecordId);

      // 2. Create and pay order
      const order = await createPendingOrder();
      await paymentService.prepay(
        USER_ID,
        'test_openid_payment',
        order.id,
        'balance',
        '',
      );

      const balanceAfterFirst = await prepaidService.getBalance(
        USER_ID,
        TENANT_ID,
      );

      // 3. Try to pay again (idempotency)
      // This should succeed (not throw) but not double-deduct
      const result = await paymentService.prepay(
        USER_ID,
        'test_openid_payment',
        order.id,
        'balance',
        '',
      );
      expect(result.channel).toBe('balance');

      const balanceAfterSecond = await prepaidService.getBalance(
        USER_ID,
        TENANT_ID,
      );
      expect(balanceAfterSecond.personalBalance).toBe(
        balanceAfterFirst.personalBalance,
      );
    });
  });

  // ===================== prepay with wechat (unconfigured) =====================

  describe('prepay (wechat, unconfigured)', () => {
    it('should create pending payment record with mock params', async () => {
      const order = await createPendingOrder();

      const result = await paymentService.prepay(
        USER_ID,
        'test_openid_payment',
        order.id,
        'wechat',
        'http://localhost:3000/api/payment/notify',
      );

      expect(result.channel).toBe('wechat');
      expect(result.paymentId).toBeDefined();
      expect(result.wxJSAPIParams).toBeDefined();
      expect(result.wxJSAPIParams!.paySign).toBe('MOCK_SIGN_DEV_ONLY');

      // PaymentRecord should be pending
      const payment = await prisma.paymentRecord.findUnique({
        where: { id: result.paymentId },
      });
      expect(payment).toBeDefined();
      expect(payment!.status).toBe('pending');

      // Order should still be pending (not paid yet)
      const order2 = await prisma.order.findUnique({ where: { id: order.id } });
      expect(order2!.status).toBe('pending');
    });
  });

  // ===================== handleNotify =====================

  describe('handleNotify', () => {
    it('should reject callback when wechat is not configured', async () => {
      await expect(
        paymentService.handleNotify({} as any, 'sig', 'serial', '123', 'nonce'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
