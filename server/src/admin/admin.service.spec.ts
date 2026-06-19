import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: PrismaService;
  let DEMO_TENANT_ID: string;
  const TEST_APP_ID = `wx_admin_test_${Date.now()}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, PrismaService],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    if (!demo) throw new Error('Seed required');
    DEMO_TENANT_ID = demo.id;
  });

  afterAll(async () => {
    // Cleanup test tenants (cascade delete related records first)
    const testTenants = await prisma.tenant.findMany({ where: { appId: { startsWith: 'wx_admin_test_' } }, select: { id: true } });
    const ids = testTenants.map((t) => t.id);
    if (ids.length > 0) {
      await prisma.tenantModule.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.brandConfig.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.adminUser.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  describe('createTenant', () => {
    it('should create tenant with auto-generated admin + BrandConfig + base module', async () => {
      const appId = `${TEST_APP_ID}_full`;
      const t = await service.createTenant({ appId, name: '完整测试餐厅' });

      expect(t.appId).toBe(appId);
      expect(t.status).toBe('active');
      expect(t.licenseKey).toBeDefined();

      // Admin account auto-created
      const admin = await prisma.adminUser.findFirst({ where: { tenantId: t.id, username: 'admin' } });
      expect(admin).toBeDefined();
      expect(admin!.role).toBe('owner');

      // BrandConfig auto-created
      const brand = await prisma.brandConfig.findUnique({ where: { tenantId: t.id } });
      expect(brand).toBeDefined();
      expect((brand!.config as any).name).toBe('完整测试餐厅');

      // Base module assigned
      const modules = await prisma.tenantModule.findMany({ where: { tenantId: t.id } });
      expect(modules.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject duplicate appId', async () => {
      const appId = `${TEST_APP_ID}_dup`;
      await service.createTenant({ appId, name: 'First' });
      await expect(service.createTenant({ appId, name: 'Second' })).rejects.toThrow(ConflictException);
    });
  });

  describe('getTenant', () => {
    it('should return tenant with modules + stores + brandConfig', async () => {
      const t = await service.getTenant(DEMO_TENANT_ID);
      expect(t.id).toBe(DEMO_TENANT_ID);
      expect(t.stores.length).toBeGreaterThan(0);
      expect(t.brandConfig).toBeDefined();
    });

    it('should throw for non-existent tenant', async () => {
      await expect(service.getTenant('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listTenants', () => {
    it('should return paginated list', async () => {
      const result = await service.listTenants({ page: 1, pageSize: 10 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should filter by keyword', async () => {
      const result = await service.listTenants({ keyword: 'Demo', page: 1, pageSize: 10 });
      expect(result.items.every((i: any) => i.name.includes('Demo') || i.appId.includes('Demo'))).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await service.listTenants({ status: 'active', page: 1, pageSize: 10 });
      expect(result.items.every((i: any) => i.status === 'active')).toBe(true);
    });
  });

  describe('updateTenant', () => {
    it('should update name and status', async () => {
      const appId = `${TEST_APP_ID}_update`;
      const t = await service.createTenant({ appId, name: 'Original' });
      const updated = await service.updateTenant(t.id, { name: 'Updated', status: 'expired' });
      expect(updated.name).toBe('Updated');
      expect(updated.status).toBe('expired');
    });
  });

  describe('reviewTenant', () => {
    it('should approve tenant', async () => {
      const appId = `${TEST_APP_ID}_review`;
      const t = await service.createTenant({ appId, name: '审核测试' });
      const approved = await service.reviewTenant(t.id, { approved: true }, 'admin-1');
      expect(approved.status).toBe('active');
    });
  });

  describe('assignModules', () => {
    it('should assign modules to tenant', async () => {
      const appId = `${TEST_APP_ID}_mod`;
      const t = await service.createTenant({ appId, name: '模块测试' });

      const result = await service.assignModules(t.id, { moduleIds: ['base', 'coupon', 'points'] });
      expect(result.length).toBe(3);
    });

    it('should reject non-existent modules', async () => {
      const appId = `${TEST_APP_ID}_badmod`;
      const t = await service.createTenant({ appId, name: 'BadModule' });
      await expect(
        service.assignModules(t.id, { moduleIds: ['base', 'does-not-exist'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateLicense', () => {
    it('should issue license and set active', async () => {
      const appId = `${TEST_APP_ID}_lic`;
      const t = await service.createTenant({ appId, name: 'License测试' });

      const issued = await service.updateLicense(t.id, { action: 'issue' });
      expect(issued.status).toBe('active');
      expect(issued.licenseKey).toBeDefined();
    });

    it('should revoke license and set expired', async () => {
      const appId = `${TEST_APP_ID}_lic2`;
      const t = await service.createTenant({ appId, name: 'License2' });

      const revoked = await service.updateLicense(t.id, { action: 'revoke' });
      expect(revoked.status).toBe('expired');
      expect(revoked.licenseKey).toBeNull();
    });

    it('should restore active on re-issue after revoke', async () => {
      const appId = `${TEST_APP_ID}_lic3`;
      const t = await service.createTenant({ appId, name: 'License3' });
      await service.updateLicense(t.id, { action: 'revoke' });
      const reissued = await service.updateLicense(t.id, { action: 'issue' });
      expect(reissued.status).toBe('active');
      expect(reissued.licenseKey).toBeDefined();
    });
  });

  describe('deleteTenant', () => {
    it('should soft-delete tenant', async () => {
      const appId = `${TEST_APP_ID}_del`;
      const t = await service.createTenant({ appId, name: 'DeleteMe' });
      const deleted = await service.deleteTenant(t.id);
      expect(deleted.status).toBe('deleted');
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard stats', async () => {
      const dash = await service.getDashboard();
      expect(dash.tenants.active).toBeGreaterThanOrEqual(1);
      expect(dash.tenants).toHaveProperty('expired');
      expect(dash.tenants).toHaveProperty('deleted');
    });
  });
});
