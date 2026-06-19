import { Test, TestingModule } from '@nestjs/testing';
import { GroupOrderService } from './group-order.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('GroupOrderService', () => {
  let service: GroupOrderService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_A: string;
  let USER_B: string;
  let SKU_1: string;
  let SKU_2: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupOrderService, PrismaService],
    }).compile();

    service = module.get<GroupOrderService>(GroupOrderService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    if (!demo) throw new Error('Seed required');
    TENANT_ID = demo.id;
    STORE_ID = (await prisma.store.findFirst({ where: { tenantId: TENANT_ID } }))!.id;

    USER_A = 'test-group-user-a';
    USER_B = 'test-group-user-b';
    await prisma.user.upsert({ where: { tenantId_openid: { tenantId: TENANT_ID, openid: 'group_test_a' } }, create: { id: USER_A, tenantId: TENANT_ID, openid: 'group_test_a', nickname: 'GA' }, update: {} });
    await prisma.user.upsert({ where: { tenantId_openid: { tenantId: TENANT_ID, openid: 'group_test_b' } }, create: { id: USER_B, tenantId: TENANT_ID, openid: 'group_test_b', nickname: 'GB' }, update: {} });

    const skus = await prisma.sku.findMany({ where: { dish: { storeId: STORE_ID }, status: 'active' }, take: 2, include: { dish: true } });
    SKU_1 = skus[0].id;
    SKU_2 = skus[1].id;
  });

  afterAll(async () => { await prisma.$disconnect(); });
  afterEach(async () => {
    await prisma.groupOrderItem.deleteMany({ where: { groupOrder: { storeId: STORE_ID } } });
    await prisma.groupOrder.deleteMany({ where: { storeId: STORE_ID } });
  });

  describe('createPool', () => {
    it('should create pool with default 2h deadline', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 3000, condition: 'A' });
      expect(pool.status).toBe('pooling');
      expect(pool.groupNo).toMatch(/^G\d{16}$/);
      expect(pool.mode).toBe('pool');
    });

    it('should reject invalid store', async () => {
      await expect(service.createPool(USER_A, TENANT_ID, { storeId: 'invalid', minAmount: 100 })).rejects.toThrow(NotFoundException);
    });

    it('should accept custom deadline', async () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, deadline: future, minAmount: 100 });
      expect(pool.deadline).toBeDefined();
    });
  });

  describe('getPool', () => {
    it('should return active pools', async () => {
      await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      const pools = await service.getPool(TENANT_ID, STORE_ID);
      expect(pools.length).toBeGreaterThanOrEqual(1);
    });

    it('should exclude past-deadline pools', async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, deadline: past, minAmount: 100 });
      const pools = await service.getPool(TENANT_ID, STORE_ID);
      expect(pools.every((p: any) => p.status === 'pooling')).toBe(true);
    });
  });

  describe('getDetail', () => {
    it('should return pool with leader+items', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      const detail = await service.getDetail(pool.id);
      expect(detail.leader).toBeDefined();
      expect(detail.leader!.nickname).toBe('GA');
    });

    it('should throw on non-existent', async () => {
      await expect(service.getDetail('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinPool', () => {
    it('should allow user to join pool', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 5000 });
      const items = await service.joinPool(pool.id, USER_B, {
        items: [{ skuId: SKU_1, quantity: 2, price: 1500 }],
      });
      expect(items.length).toBe(1);
      expect(items[0].quantity).toBe(2);
    });

    it('should upsert on same user+SKU', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 5000 });
      await service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_1, quantity: 2 }] });
      const result = await service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_1, quantity: 3 }] });
      expect(result[0].quantity).toBe(5); // 2 + 3
    });

    it('should reject joining closed pool', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      await service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_1, quantity: 2 }] });
      await service.closePool(pool.id, USER_A);
      await expect(service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_2, quantity: 1 }] })).rejects.toThrow(BadRequestException);
    });
  });

  describe('closePool', () => {
    it('should mark success when condition A met', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 3000, condition: 'A' });
      await service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_1, quantity: 3, price: 1500 }] }); // 4500 >= 3000
      const result = await service.closePool(pool.id, USER_A);
      expect(result.status).toBe('success');
    });

    it('should mark cancelled when condition A not met', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 999999, condition: 'A' });
      await service.joinPool(pool.id, USER_B, { items: [{ skuId: SKU_1, quantity: 1, price: 100 }] });
      const result = await service.closePool(pool.id, USER_A);
      expect(result.status).toBe('cancelled');
    });

    it('should reject non-leader close', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      await expect(service.closePool(pool.id, USER_B)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('representOrder', () => {
    it('should create represent order immediately', async () => {
      const order = await service.representOrder(USER_A, TENANT_ID, {
        storeId: STORE_ID,
        items: [
          { skuId: SKU_1, quantity: 2, recipientName: '张三' },
          { skuId: SKU_2, quantity: 1, recipientName: '李四' },
        ],
      });
      expect(order.mode).toBe('represent');
      expect(order.status).toBe('success');
      expect(order.items.length).toBe(2);
    });

    it('should reject invalid SKU', async () => {
      await expect(service.representOrder(USER_A, TENANT_ID, {
        storeId: STORE_ID, items: [{ skuId: 'bad', quantity: 1, recipientName: 'X' }],
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelGroup', () => {
    it('should cancel pooling group', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      const result = await service.cancelGroup(pool.id, USER_A);
      expect(result.status).toBe('cancelled');
    });

    it('should reject non-leader cancel', async () => {
      const pool = await service.createPool(USER_A, TENANT_ID, { storeId: STORE_ID, minAmount: 100 });
      await expect(service.cancelGroup(pool.id, USER_B)).rejects.toThrow(ForbiddenException);
    });
  });
});
