import { Test, TestingModule } from '@nestjs/testing';
import { PointsService } from './points.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('PointsService', () => {
  let service: PointsService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  const USER_ID = `puser_${Date.now()}`;
  const OPENID = `popen_${Date.now()}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PointsService, PrismaService],
    }).compile();
    service = module.get<PointsService>(PointsService);
    prisma = module.get<PrismaService>(PrismaService);
    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    TENANT_ID = demo!.id;
    await prisma.user.create({ data: { id: USER_ID, tenantId: TENANT_ID, openid: OPENID, nickname: 'P' } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  describe('getSummary', () => {
    it('should return zero for new user and auto-create account', async () => {
      const s = await service.getSummary(USER_ID, TENANT_ID);
      expect(s.balance).toBe(0);
      expect(s.totalEarned).toBe(0);
      const account = await prisma.pointsAccount.findUnique({ where: { userId: USER_ID } });
      expect(account).toBeDefined();
    });
  });

  describe('signIn', () => {
    it('should earn points on sign-in', async () => {
      const r = await service.signIn(USER_ID, TENANT_ID);
      expect(r.earned).toBeGreaterThanOrEqual(10);
      expect(r.consecutiveDays).toBe(1);
    });

    it('should reject duplicate same-day sign-in', async () => {
      await expect(service.signIn(USER_ID, TENANT_ID)).rejects.toThrow(ConflictException);
    });
  });

  describe('getTransactions', () => {
    it('should list sign-in transaction', async () => {
      const result = await service.getTransactions(USER_ID, TENANT_ID, { page: 1, pageSize: 20 });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });
});
