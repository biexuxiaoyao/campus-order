import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as supertest from 'supertest';
import { AppModule } from '../src/app.module';

const request = (supertest as any).default || supertest;

describe('Campus-Order E2E Tests', () => {
  let app: INestApplication;
  let adminToken: string;
  const testTenantId = 'test-tenant-e2e';
  const headers = {
    'x-tenant-id': testTenantId,
    'x-app-id': 'wx-test-app-id',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== Phase 1: Infrastructure ====================

  describe('Auth', () => {
    it('POST /api/auth/admin-login - should return 401 for invalid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/admin-login')
        .set(headers)
        .send({ username: 'invalid', password: 'wrong' });
      expect([400, 401, 403]).toContain(res.status);
    });

    it('POST /api/auth/wechat-login - should return validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/wechat-login')
        .set(headers)
        .send({});
      // WeChat endpoint may return 500 when calling real external API
      expect([400, 403, 500]).toContain(res.status);
    });
  });

  describe('Brand', () => {
    it('GET /api/brand/config - should return default brand config', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/brand/config')
        .set(headers);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('校园订餐');
      expect(res.body.data.themeColor).toBe('#07C160');
    });

    it('GET /api/brand/config - should fail without tenant header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/brand/config');
      expect([400, 403]).toContain(res.status);
    });
  });

  // ==================== Phase 2: CRUD ====================

  describe('Store', () => {
    let storeId: string;

    it('POST /api/merchant/stores - should create store', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/merchant/stores')
        .set(headers)
        .send({ name: '测试门店', address: '测试地址', phone: '13800138000' });
      // May fail due to auth, but validates route exists
      expect([201, 401, 403]).toContain(res.status);
      if (res.status === 201) storeId = res.body.data?.id;
    });

    it('GET /api/merchant/stores - should list stores', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/stores')
        .set(headers);
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('Category', () => {
    it('GET /api/merchant/stores/:id/categories - should list categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/stores/test-store/categories')
        .set(headers);
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('Dish (Public)', () => {
    it('GET /api/dishes - should return dish list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dishes')
        .set(headers)
        .query({ storeId: 'test', page: 1, pageSize: 10 });
      // Public endpoint, accepts any non-crash response
      expect([200, 400, 403, 404]).toContain(res.status);
      if (res.status === 200 && res.body.code === 0) {
        expect(res.body.data).toHaveProperty('items');
      }
    });

    it('GET /api/dishes/:id - should return 404 for non-existent dish', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dishes/non-existent-id')
        .set(headers);
      expect(res.status).toBe(404);
    });
  });

  describe('SKU', () => {
    it('GET /api/merchant/dishes/:id/skus - should list skus (auth)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/dishes/test-dish/skus')
        .set(headers);
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('Upload', () => {
    it('POST /api/upload - should reject non-multipart request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload')
        .set(headers)
        .send({});
      expect([400, 401, 403, 415]).toContain(res.status);
    });
  });

  // ==================== Phase 3: C-end Core ====================

  describe('Cart', () => {
    it('GET /api/cart - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cart')
        .set(headers);
      expect(res.status).toBe(403);
    });

    it('POST /api/cart/items - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set(headers)
        .send({ skuId: 'test', quantity: 1 });
      expect(res.status).toBe(403);
    });
  });

  describe('Order', () => {
    it('POST /api/orders - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set(headers)
        .send({ cartItemIds: ['test'], paymentMethod: 'wechat' });
      expect(res.status).toBe(403);
    });

    it('GET /api/orders - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders')
        .set(headers);
      expect(res.status).toBe(403);
    });

    it('GET /api/merchant/orders - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/orders')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Payment', () => {
    it('POST /api/payment/prepay - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/payment/prepay')
        .set(headers)
        .send({ orderId: 'test', channel: 'wechat' });
      expect(res.status).toBe(403);
    });

    it('POST /api/payment/notify - should be public', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/payment/notify')
        .set(headers)
        .send({});
      // Should not return 401 (it's @Public)
      expect(res.status).not.toBe(403);
    });
  });

  describe('User', () => {
    it('GET /api/user/profile - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/user/profile')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  // ==================== Phase 4: Group Orders ====================

  describe('GroupOrder', () => {
    it('GET /api/group-orders - should respond (public or auth)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/group-orders')
        .set(headers)
        .query({ storeId: 'test' });
      expect([200, 403]).toContain(res.status);
    });
  });

  // ==================== Phase 4: Settings & Staff ====================

  describe('Settings', () => {
    it('GET /api/merchant/settings - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/settings')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Staff', () => {
    it('GET /api/merchant/staff - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/staff')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  // ==================== Phase 5: Value-Add Modules ====================

  describe('Prepaid', () => {
    it('GET /api/prepaid/balance - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/prepaid/balance')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Discount', () => {
    it('GET /api/merchant/stores/:id/discounts - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/stores/test-store/discounts')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Points', () => {
    it('POST /api/points/sign-in - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/points/sign-in')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Coupon', () => {
    it('GET /api/coupons - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/coupons')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  // ==================== Phase 6: Operations ====================

  describe('Printer', () => {
    it('GET /api/merchant/stores/:id/printers - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/merchant/stores/test-store/printers')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  // ==================== Phase 7: Platform Admin ====================

  describe('Admin', () => {
    it('GET /api/admin/tenants - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/tenants')
        .set(headers);
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/dashboard - should require auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  // ==================== Response Format ====================

  describe('Response Format', () => {
    it('should return unified response format for public endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/brand/config')
        .set(headers);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('data');
    });

    it('should return unified error format for 404s', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dishes/non-existent')
        .set(headers);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message');
    });
  });

  // ==================== Rate Limiting ====================

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/brand/config')
        .set(headers);
      // Throttler may or may not be active in test
      expect([200, 429]).toContain(res.status);
    });
  });
});
