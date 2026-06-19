import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CartService', () => {
  let service: CartService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  let STORE_ID: string;
  let USER_ID: string;
  let SKU_ID: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CartService, PrismaService],
    }).compile();

    service = module.get<CartService>(CartService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    if (!demo) throw new Error('Seed data required');
    TENANT_ID = demo.id;
    STORE_ID = (await prisma.store.findFirst({ where: { tenantId: TENANT_ID } }))!.id;
    USER_ID = 'test-cart-user';
    await prisma.user.upsert({ where: { tenantId_openid: { tenantId: TENANT_ID, openid: 'cart_test' } }, create: { id: USER_ID, tenantId: TENANT_ID, openid: 'cart_test', nickname: 'Cart' }, update: {} });

    // Pick an active SKU with stock
    const sku = await prisma.sku.findFirst({ where: { dish: { storeId: STORE_ID }, status: 'active', availableStock: { gte: 5 } } });
    if (!sku) throw new Error('No suitable SKU found');
    SKU_ID = sku.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });
  afterEach(async () => { await prisma.cartItem.deleteMany({ where: { userId: USER_ID } }); });

  describe('addItem', () => {
    it('should add item to empty cart', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      expect(item.quantity).toBe(2);
      expect(item.skuId).toBe(SKU_ID);
    });

    it('should upsert (add quantity) for same SKU', async () => {
      const i1 = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      const i2 = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 3 });
      expect(i2.quantity).toBe(5); // upsert: 2 + 3
      expect(i2.id).toBe(i1.id);  // same record
    });

    it('should default quantity to 1', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID });
      expect(item.quantity).toBe(1);
    });

    it('should reject non-existent SKU', async () => {
      await expect(service.addItem(USER_ID, TENANT_ID, { skuId: 'non-existent' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCart', () => {
    it('should return empty cart', async () => {
      const cart = await service.getCart(USER_ID, TENANT_ID);
      expect(cart.items.length).toBe(0);
      expect(cart.totalAmount).toBe(0);
    });

    it('should return items with subtotals', async () => {
      await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 3 });
      const cart = await service.getCart(USER_ID, TENANT_ID);
      expect(cart.items.length).toBe(1);
      expect(cart.items[0].subtotal).toBeGreaterThan(0);
      expect(cart.totalAmount).toBe(cart.items[0].subtotal);
    });

    it('should exclude expired items', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 1 });
      // Manually expire it
      await prisma.cartItem.update({ where: { id: item.id }, data: { expiresAt: new Date('2020-01-01') } });
      const cart = await service.getCart(USER_ID, TENANT_ID);
      expect(cart.items.length).toBe(0);
    });
  });

  describe('updateItem', () => {
    it('should update quantity', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      const updated = await service.updateItem(USER_ID, item.id, { quantity: 5 });
      expect(updated.quantity).toBe(5);
    });

    it('should delete when quantity <= 0', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      await service.updateItem(USER_ID, item.id, { quantity: 0 });
      const cart = await service.getCart(USER_ID, TENANT_ID);
      expect(cart.items.length).toBe(0);
    });

    it('should reject non-owner update', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID });
      await expect(service.updateItem('other-user', item.id, { quantity: 3 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('should remove single item', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      await service.removeItem(USER_ID, item.id);
      const cart = await service.getCart(USER_ID, TENANT_ID);
      expect(cart.items.length).toBe(0);
    });
  });

  describe('clearCart', () => {
    it('should delete all items', async () => {
      // Use two different SKUs (same SKU upserts, not creates)
      const sku2 = await prisma.sku.findFirst({ where: { dish: { storeId: STORE_ID }, status: 'active', availableStock: { gte: 5 }, id: { not: SKU_ID } } });
      if (sku2) {
        await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 1 });
        await service.addItem(USER_ID, TENANT_ID, { skuId: sku2.id, quantity: 1 });
        const result = await service.clearCart(USER_ID);
        expect(result.deleted).toBe(2);
      }
    });
  });

  describe('validateCart', () => {
    it('should validate and return enriched items', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 2 });
      const validated = await service.validateCart(USER_ID, TENANT_ID, [item.id]);
      expect(validated.length).toBe(1);
      expect(validated[0].dishName).toBeDefined();
      expect(validated[0].price).toBeGreaterThan(0);
    });

    it('should reject empty itemIds', async () => {
      await expect(service.validateCart(USER_ID, TENANT_ID, [])).rejects.toThrow(BadRequestException);
    });

    it('should reject non-owner items', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID });
      await expect(service.validateCart('other-user', TENANT_ID, [item.id])).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired items', async () => {
      const item = await service.addItem(USER_ID, TENANT_ID, { skuId: SKU_ID, quantity: 1 });
      await prisma.cartItem.update({ where: { id: item.id }, data: { expiresAt: new Date('2020-01-01') } });
      const result = await service.cleanupExpired();
      expect(result.deleted).toBeGreaterThanOrEqual(1);
    });
  });
});
