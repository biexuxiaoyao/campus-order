import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

declare module 'express' {
  interface Request {
    tenantId?: string;
    tenantName?: string;
    isAdmin?: boolean;
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // B端管理后台：通过 x-tenant-id header 传递
    const tenantId = req.headers['x-tenant-id'] as string;

    // C端小程序：通过 x-app-id header 传递
    const appId = req.headers['x-app-id'] as string;

    try {
      if (tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
        });
        if (tenant && tenant.status === 'active') {
          // 验证已认证管理员用户的 tenantId 与请求的 tenantId 一致
          const adminUser = (req as any).user;
          if (adminUser && adminUser.tenantId !== tenantId) {
            throw new ForbiddenException('无权访问该租户');
          }
          req.tenantId = tenant.id;
          req.tenantName = tenant.name;
        }
      } else if (appId) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { appId },
        });
        if (tenant && tenant.status === 'active') {
          req.tenantId = tenant.id;
          req.tenantName = tenant.name;
        }
      }
    } catch {
      // 如果数据库不可用，继续但不设置 tenant
    }

    next();
  }
}
