import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PUBLIC_KEY = 'isPublic';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    if (!request.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_NOT_FOUND',
        message: '租户未识别，请检查 x-app-id 或 x-tenant-id',
      });
    }

    return true;
  }
}
