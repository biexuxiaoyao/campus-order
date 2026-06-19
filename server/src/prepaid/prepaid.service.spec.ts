import { Test, TestingModule } from '@nestjs/testing';
import { PrepaidService } from './prepaid.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('PrepaidService', () => {
  let service: PrepaidService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  const USER_ID = `prepaid_${Date.now()}`;
  const OPENID = `pp_${Date.now()}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrepaidService, PrismaService],
    }).compile();
    service = module.get<PrepaidService>(PrepaidService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    TENANT_ID = demo!.id;
    await prisma.user.create({ data: { id: USER_ID, tenantId: TENANT_ID, openid: OPENID, nickname: 'PP' } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  describe('getBalance', () => {
    it('should return zero balances for new user', async () => {
      const b = await service.getBalance(USER_ID, TENANT_ID);
      expect(b.personalBalance).toBe(0);
      expect(b.companyBalance).toBe(0);
    });

    it('should auto-create accounts', async () => {
      await service.getBalance(USER_ID, TENANT_ID);
      const accounts = await prisma.prepaidAccount.findMany({ where: { userId: USER_ID } });
      expect(accounts.length).toBe(2); // personal + company
    });
  });

  describe('recharge', () => {
    it('should increase balance and return payment params', async () => {
      const r = await service.recharge(USER_ID, TENANT_ID, { amount: 100, type: 'personal' });
      expect(r.transactionId).toBeDefined();
      expect(r.paymentParams.package).toContain('mock_prepay');

      const b = await service.getBalance(USER_ID, TENANT_ID);
      expect(b.personalBalance).toBe(10000); // 100 * 100分
    });

    it('should add to existing balance', async () => {
      await service.recharge(USER_ID, TENANT_ID, { amount: 50, type: 'personal' });
      const b = await service.getBalance(USER_ID, TENANT_ID);
      expect(b.personalBalance).toBe(15000); // 10000 + 5000
    });
  });

  describe('consume', () => {
    it('should deduct balance atomically', async () => {
      const r = await service.consume(USER_ID, TENANT_ID, 'personal', 3000, 'order-1');
      expect(r.balanceAfter).toBe(12000); // 15000 - 3000
    });

    it('should reject insufficient balance', async () => {
      await expect(
        service.consume(USER_ID, TENANT_ID, 'personal', 999999, 'order-fail'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refund', () => {
    it('should increase personal balance on refund', async () => {
      const r = await service.refund(USER_ID, TENANT_ID, 2000, '退货退款');
      expect(r.balanceAfter).toBe(14000); // 12000 + 2000
    });
  });

  describe('getTransactions', () => {
    it('should list all transactions', async () => {
      const result = await service.getTransactions(USER_ID, TENANT_ID, { page: 1, pageSize: 50 });
      expect(result.items.length).toBeGreaterThanOrEqual(3); // purchase + consume + refund
    });

    it('should filter by type', async () => {
      const result = await service.getTransactions(USER_ID, TENANT_ID, { type: 'purchase', page: 1, pageSize: 50 });
      expect(result.items.every((t: any) => t.type === 'purchase')).toBe(true);
    });
  });
});
