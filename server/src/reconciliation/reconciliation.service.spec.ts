import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { WechatPayConfig } from '../payment/wechat-pay.config';
import { WechatPayClient } from '../payment/wechat-pay.client';

const mockWechatConfig = {
  isConfigured: false,
  mchId: '',
  apiV3Key: '',
  serialNo: '',
  privateKey: null,
  platformCert: null,
};
const mockWechatPayClient = {
  getAppId: jest.fn().mockReturnValue(''),
  generateNonceStr: jest.fn().mockReturnValue(''),
  signMessage: jest.fn().mockReturnValue(''),
  generateWechatSign: jest.fn().mockReturnValue(''),
  callWechatApi: jest.fn().mockResolvedValue(null),
};

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_ID: string;
  let SKU_ID: string;

  const PREFIX = `rec-${Date.now()}-`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        PrismaService,
        { provide: WechatPayConfig, useValue: mockWechatConfig },
        { provide: WechatPayClient, useValue: mockWechatPayClient },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
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

    USER_ID = `test-rec-user-${Date.now()}`;
    await prisma.user.upsert({
      where: {
        tenantId_openid: {
          tenantId: TENANT_ID,
          openid: `rec_test_${Date.now()}`,
        },
      },
      create: {
        id: USER_ID,
        tenantId: TENANT_ID,
        openid: `rec_test_${Date.now()}`,
        nickname: 'RecTest',
      },
      update: {},
    });

    // Create test orders with payments
    const orderIds = [];
    for (let i = 0; i < 3; i++) {
      const orderId = `${PREFIX}o-${i}`;
      orderIds.push(orderId);

      await prisma.order.create({
        data: {
          id: orderId,
          orderNo: `${PREFIX}ON${i}`,
          tenantId: TENANT_ID,
          storeId: STORE_ID,
          userId: USER_ID,
          type: 'normal',
          status: i === 0 ? 'pending' : 'paid',
          totalAmount: 1000 + i * 500,
          version: 0,
          items: {
            create: {
              skuId: SKU_ID,
              dishName: `Dish ${i}`,
              specName: '默认',
              price: 1000 + i * 500,
              quantity: i + 1,
            },
          },
          payments: {
            create: {
              amount: 1000 + i * 500,
              channel: 'wechat',
              status: i === 0 ? 'pending' : 'success',
              transactionId:
                i === 0 ? null : `txn_${PREFIX}${i}`,
            },
          },
          timeline: {
            create: { status: i === 0 ? 'pending' : 'paid' },
          },
        },
      });
    }
  });

  afterAll(async () => {
    const orderIds = [];
    for (let i = 0; i < 3; i++) {
      orderIds.push(`${PREFIX}o-${i}`);
    }
    await prisma.orderTimeline.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
    await prisma.paymentRecord.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
    await prisma.refundRecord.deleteMany({
      where: { order: { id: { in: orderIds } } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.$disconnect();
  });

  describe('getDashboard', () => {
    it('should return today metrics', async () => {
      const result = await service.getDashboard(STORE_ID, TENANT_ID);

      expect(result).toHaveProperty('todayRevenue');
      expect(result).toHaveProperty('todayOrders');
      expect(result).toHaveProperty('avgOrderValue');
      expect(result).toHaveProperty('todayRefund');
      expect(result).toHaveProperty('pendingOrders');
      expect(result).toHaveProperty('topDishes');

      // 3 orders, 2 paid (total 2500 fen), 1 pending
      expect(result.todayRevenue).toBeGreaterThanOrEqual(1500);
      expect(result.todayOrders).toBeGreaterThanOrEqual(2);
      expect(result.pendingOrders).toBeGreaterThanOrEqual(1);
      expect(result.avgOrderValue).toBeGreaterThan(0);
      expect(Array.isArray(result.topDishes)).toBe(true);
    });
  });

  describe('getReconciliation', () => {
    it('should return daily reconciliation', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = await service.getReconciliation(
        STORE_ID,
        TENANT_ID,
        today,
      );

      expect(result).toHaveProperty('date', today);
      expect(result).toHaveProperty('systemTotal');
      expect(result).toHaveProperty('wechatTotal');
      expect(result).toHaveProperty('difference');
      expect(result).toHaveProperty('details');
      expect(Array.isArray(result.details)).toBe(true);

      // 2 successful payments
      expect(result.systemTotal).toBeGreaterThanOrEqual(1500);
      // Only payments with transactionId should count as wechat
      // (in test, 2 have transactionId)
      expect(result.detailCount).toBeGreaterThanOrEqual(1);
    });

    it('should reject invalid date', async () => {
      const result = await service.getReconciliation(
        STORE_ID,
        TENANT_ID,
        'invalid',
      );
      expect(result).toHaveProperty('error');
    });
  });
});
