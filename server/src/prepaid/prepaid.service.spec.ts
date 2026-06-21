import { Test, TestingModule } from '@nestjs/testing';
import { PrepaidService } from './prepaid.service';
import { PrismaService } from '../prisma/prisma.service';
import { WechatPayConfig } from '../payment/wechat-pay.config';
import { WechatPayClient } from '../payment/wechat-pay.client';
import { BadRequestException } from '@nestjs/common';

// Mock WechatPayConfig — not configured (returns mock params)
const mockWechatPayConfig = {
  isConfigured: false,
  mchId: '',
  apiV3Key: '',
  serialNo: '',
  privateKey: null,
  platformCert: null,
};

const mockWechatPayClient = {
  getAppId: jest.fn().mockReturnValue(''),
  generateNonceStr: jest.fn().mockReturnValue('mocknoncestr12345678901234567890'),
  signMessage: jest.fn().mockReturnValue('mock-signature'),
  generateWechatSign: jest.fn().mockReturnValue('mock-pay-sign'),
  callWechatApi: jest.fn().mockResolvedValue({ prepay_id: 'mock_prepay_id' }),
};

describe('PrepaidService', () => {
  let service: PrepaidService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  const USER_ID = `prepaid_${Date.now()}`;
  const OPENID = `pp_${Date.now()}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrepaidService,
        PrismaService,
        { provide: WechatPayConfig, useValue: mockWechatPayConfig },
        { provide: WechatPayClient, useValue: mockWechatPayClient },
      ],
    }).compile();
    service = module.get<PrepaidService>(PrepaidService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({
      where: { appId: 'wx8ebfaf4a045bf7c3' },
    });
    TENANT_ID = demo!.id;
    await prisma.user.create({
      data: {
        id: USER_ID,
        tenantId: TENANT_ID,
        openid: OPENID,
        nickname: 'PP',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getBalance', () => {
    it('should return zero balances for new user', async () => {
      const b = await service.getBalance(USER_ID, TENANT_ID);
      expect(b.personalBalance).toBe(0);
      expect(b.companyBalance).toBe(0);
    });

    it('should auto-create accounts', async () => {
      await service.getBalance(USER_ID, TENANT_ID);
      const accounts = await prisma.prepaidAccount.findMany({
        where: { userId: USER_ID },
      });
      expect(accounts.length).toBe(2); // personal + company
    });
  });

  describe('recharge', () => {
    it('should create pending transaction WITHOUT increasing balance', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);

      const r = await service.recharge(USER_ID, TENANT_ID, {
        amount: 100,
        type: 'personal',
      });
      expect(r.transactionId).toBeDefined();
      expect(r.paymentRecordId).toBeDefined();
      expect(r.paymentParams.package).toContain('mock_prepay');

      // 余额不应增加！
      const after = await service.getBalance(USER_ID, TENANT_ID);
      expect(after.personalBalance).toBe(before.personalBalance);

      // PrepaidTransaction 应为 pending 状态
      const txn = await prisma.prepaidTransaction.findUnique({
        where: { id: r.transactionId },
      });
      expect(txn).toBeDefined();
      expect(txn!.status).toBe('pending');
      expect(txn!.balanceAfter).toBe(0); // 余额未变
      expect(txn!.paymentRecordId).toBe(r.paymentRecordId);

      // PaymentRecord 应存在且为 pending
      const payment = await prisma.paymentRecord.findUnique({
        where: { id: r.paymentRecordId },
      });
      expect(payment).toBeDefined();
      expect(payment!.status).toBe('pending');
      expect(payment!.orderId).toBeNull(); // 充值无订单
      expect(payment!.amount).toBe(10000); // 100元 = 10000分
    });
  });

  describe('confirmRecharge', () => {
    it('should increase balance only after confirmRecharge is called', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);

      // 1. 创建充值
      const r = await service.recharge(USER_ID, TENANT_ID, {
        amount: 100,
        type: 'personal',
      });

      // 余额仍未增加
      const afterRecharge = await service.getBalance(USER_ID, TENANT_ID);
      expect(afterRecharge.personalBalance).toBe(before.personalBalance);

      // 2. 确认充值到账
      const confirmed = await service.confirmRecharge(r.paymentRecordId);
      expect(confirmed.idempotent).toBe(false);
      expect(confirmed.balanceAfter).toBe(before.personalBalance + 10000);

      // 余额现在增加了
      const afterConfirm = await service.getBalance(USER_ID, TENANT_ID);
      expect(afterConfirm.personalBalance).toBe(before.personalBalance + 10000);

      // PrepaidTransaction 应变为 completed
      const txn = await prisma.prepaidTransaction.findUnique({
        where: { id: r.transactionId },
      });
      expect(txn!.status).toBe('completed');
      expect(txn!.balanceAfter).toBe(afterConfirm.personalBalance);

      // PaymentRecord 应变为 success
      const payment = await prisma.paymentRecord.findUnique({
        where: { id: r.paymentRecordId },
      });
      expect(payment!.status).toBe('success');
    });

    it('should be idempotent — calling confirmRecharge twice is safe', async () => {
      const r = await service.recharge(USER_ID, TENANT_ID, {
        amount: 50,
        type: 'personal',
      });
      await service.confirmRecharge(r.paymentRecordId);

      // 第二次确认不应抛错，也不应重复增加余额
      const confirmed = await service.confirmRecharge(r.paymentRecordId);
      expect(confirmed.idempotent).toBe(true);

      const b = await service.getBalance(USER_ID, TENANT_ID);
      // 余额只应增加一次（50元 = 5000分），不会翻倍
    });

    it('should reject invalid paymentRecordId', async () => {
      await expect(service.confirmRecharge('nonexistent-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('consume', () => {
    it('should deduct balance atomically', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);
      // Ensure balance: recharge + confirm
      const r = await service.recharge(USER_ID, TENANT_ID, {
        amount: 200,
        type: 'personal',
      });
      await service.confirmRecharge(r.paymentRecordId);

      const result = await service.consume(
        USER_ID,
        TENANT_ID,
        'personal',
        3000,
        `${USER_ID}-order-1`,
      );
      expect(result.balanceAfter).toBe(before.personalBalance + 20000 - 3000);
    });

    it('should reject insufficient balance', async () => {
      await expect(
        service.consume(
          USER_ID,
          TENANT_ID,
          'personal',
          999999,
          `${USER_ID}-order-fail`,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should be idempotent — same orderId does not double-deduct', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);

      await service.consume(
        USER_ID,
        TENANT_ID,
        'personal',
        1000,
        `${USER_ID}-order-idempotent`,
      );
      const afterFirst = await service.getBalance(USER_ID, TENANT_ID);

      // 第二次调用同一 orderId
      const result = await service.consume(
        USER_ID,
        TENANT_ID,
        'personal',
        1000,
        `${USER_ID}-order-idempotent`,
      );
      const afterSecond = await service.getBalance(USER_ID, TENANT_ID);

      // 余额不应重复扣减
      expect(afterSecond.personalBalance).toBe(afterFirst.personalBalance);
      expect(result.balanceAfter).toBe(afterFirst.personalBalance);
    });
  });

  describe('refund', () => {
    it('should increase personal balance on refund', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);
      const r = await service.refund(
        USER_ID,
        TENANT_ID,
        2000,
        '退货退款',
        `${USER_ID}-ref-test-1`,
      );
      expect(r.balanceAfter).toBe(before.personalBalance + 2000);
      expect(r.idempotent).toBe(false);
    });

    it('should be idempotent — same referenceId does not double-refund', async () => {
      const before = await service.getBalance(USER_ID, TENANT_ID);

      await service.refund(
        USER_ID,
        TENANT_ID,
        1000,
        '测试',
        `${USER_ID}-ref-test-2`,
      );
      const afterFirst = await service.getBalance(USER_ID, TENANT_ID);

      // 第二次退款同一 referenceId
      const r = await service.refund(
        USER_ID,
        TENANT_ID,
        1000,
        '测试',
        `${USER_ID}-ref-test-2`,
      );
      const afterSecond = await service.getBalance(USER_ID, TENANT_ID);

      // 余额不应重复增加
      expect(afterSecond.personalBalance).toBe(afterFirst.personalBalance);
      expect(r.idempotent).toBe(true);
    });
  });

  describe('getTransactions', () => {
    it('should list all transactions', async () => {
      const result = await service.getTransactions(USER_ID, TENANT_ID, {
        page: 1,
        pageSize: 50,
      });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by type', async () => {
      const result = await service.getTransactions(USER_ID, TENANT_ID, {
        type: 'purchase',
        page: 1,
        pageSize: 50,
      });
      expect(result.items.every((t: any) => t.type === 'purchase')).toBe(true);
    });
  });
});
