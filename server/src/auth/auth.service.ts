import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WechatService } from './wechat.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private wechat: WechatService,
  ) {}

  /**
   * C端：微信小程序登录
   */
  async wechatLogin(code: string, appId: string) {
    // 1. 通过 code 换取 openid
    const session = await this.wechat.code2Session(code);

    // 2. 查找或创建用户
    const tenant = await this.prisma.tenant.findUnique({ where: { appId } });
    if (!tenant) throw new UnauthorizedException('商家不存在');

    let user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, openid: session.openid },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          openid: session.openid,
        },
      });
    }

    // 3. 签发 JWT
    const token = await this.jwt.signAsync({
      sub: user.id,
      tenantId: tenant.id,
      openid: session.openid,
    });

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, tenantId: tenant.id, openid: session.openid, type: 'refresh' },
      { expiresIn: '7d' },
    );

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
      },
    };
  }

  /**
   * C端：刷新 Token
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      if (payload.type !== 'refresh') throw new Error();

      const token = await this.jwt.signAsync({
        sub: payload.sub,
        tenantId: payload.tenantId,
        openid: payload.openid,
      });

      return { token };
    } catch {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }
  }

  /**
   * B端：管理后台用户名密码登录
   */
  async adminLogin(username: string, password: string, tenantId?: string) {
    const where: any = { username };
    if (tenantId) where.tenantId = tenantId;
    const admin = await this.prisma.adminUser.findFirst({ where });

    if (!admin) throw new UnauthorizedException('用户名或密码错误');

    // 使用查到的实际 tenantId
    const actualTenantId = admin.tenantId;

    // 检查锁定状态
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new UnauthorizedException('账号已锁定，请稍后再试');
    }

    // 验证密码
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(password, admin.passwordHash);

    if (!valid) {
      const attempts = admin.loginAttempts + 1;
      if (attempts >= 5) {
        await this.prisma.adminUser.update({
          where: { id: admin.id },
          data: { loginAttempts: attempts, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
        throw new UnauthorizedException('密码错误次数过多，账号已锁定 15 分钟');
      }
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { loginAttempts: attempts },
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 重置登录尝试
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const token = await this.jwt.signAsync(
      { sub: admin.id, tenantId: actualTenantId, role: admin.role, isAdmin: true },
      { expiresIn: '12h' },
    );

    return { token, user: { id: admin.id, username: admin.username, role: admin.role, tenantId: actualTenantId } };
  }
}
