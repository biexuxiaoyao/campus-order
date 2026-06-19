import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WechatService } from './wechat.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let jwt: JwtService;
  let prisma: PrismaService;
  let TENANT_ID: string;
  const ADMIN_ID = 'test-auth-admin';
  const ADMIN_PASS = 'TestP@ss1';
  const JWT_SECRET = 'dev-jwt-secret-change-in-production';

  beforeAll(async () => {
    const mockWechat = { code2Session: jest.fn().mockResolvedValue({ openid: 'test_openid', session_key: 'sk' }) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      providers: [
        AuthService, PrismaService,
        { provide: WechatService, useValue: mockWechat },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwt = module.get<JwtService>(JwtService);
    prisma = module.get<PrismaService>(PrismaService);

    const demo = await prisma.tenant.findFirst({ where: { appId: 'wx8ebfaf4a045bf7c3' } });
    TENANT_ID = demo!.id;

    // Create test admin
    const hash = await bcrypt.hash(ADMIN_PASS, 10);
    await prisma.adminUser.upsert({
      where: { tenantId_username: { tenantId: TENANT_ID, username: 'testadmin' } },
      create: { id: ADMIN_ID, tenantId: TENANT_ID, username: 'testadmin', passwordHash: hash, role: 'owner', status: 'active' },
      update: { passwordHash: hash, loginAttempts: 0, lockedUntil: null },
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  describe('adminLogin', () => {
    it('should login with correct credentials', async () => {
      const result = await service.adminLogin('testadmin', ADMIN_PASS, TENANT_ID);
      expect(result.token).toBeDefined();
      expect(result.user.username).toBe('testadmin');
      expect(result.user.role).toBe('owner');

      // Verify token payload
      const payload = await jwt.verifyAsync(result.token);
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.isAdmin).toBe(true);
    });

    it('should reject wrong password', async () => {
      await expect(service.adminLogin('testadmin', 'wrong', TENANT_ID)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject non-existent user', async () => {
      await expect(service.adminLogin('noone', 'pass', TENANT_ID)).rejects.toThrow(UnauthorizedException);
    });

    it('should lock account after 5 failed attempts', async () => {
      const user = `lockme_${Date.now()}`;
      const hash = await bcrypt.hash('pass', 10);
      await prisma.adminUser.create({ data: { id: `id_${user}`, tenantId: TENANT_ID, username: user, passwordHash: hash, role: 'staff', status: 'active' } });

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        try { await service.adminLogin(user, 'wrong', TENANT_ID); } catch {}
      }

      // 6th attempt should mention lock
      await expect(service.adminLogin(user, 'wrong', TENANT_ID)).rejects.toThrow(UnauthorizedException);

      const admin = await prisma.adminUser.findFirst({ where: { username: user } });
      expect(admin!.lockedUntil).toBeDefined();
      expect(admin!.loginAttempts).toBe(5);
    });

    it('should login without tenantId (cross-tenant search)', async () => {
      const result = await service.adminLogin('testadmin', ADMIN_PASS);
      expect(result.token).toBeDefined();
    });
  });

  describe('getAdminProfile', () => {
    it('should return admin profile', async () => {
      const profile = await service.getAdminProfile(ADMIN_ID);
      expect(profile.username).toBe('testadmin');
      expect(profile.role).toBe('owner');
    });

    it('should reject non-existent user', async () => {
      await expect(service.getAdminProfile('non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should issue new access token', async () => {
      const refresh = await jwt.signAsync({ sub: ADMIN_ID, tenantId: TENANT_ID, openid: 'test', type: 'refresh' }, { expiresIn: '7d' });
      const result = await service.refreshToken(refresh);
      expect(result.token).toBeDefined();
      const payload = await jwt.verifyAsync(result.token);
      expect(payload.sub).toBe(ADMIN_ID);
    });

    it('should reject non-refresh token', async () => {
      const access = await jwt.signAsync({ sub: ADMIN_ID, type: 'access' }, { expiresIn: '1h' });
      await expect(service.refreshToken(access)).rejects.toThrow(UnauthorizedException);
    });
  });
});
