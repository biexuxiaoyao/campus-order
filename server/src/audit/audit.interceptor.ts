import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from './audit.service';

const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * 审计拦截器：拦截所有非 GET 请求，
 * 在请求成功响应后将操作记录写入 AuditLog。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // 只拦截写操作
    const action = METHOD_ACTION_MAP[method];
    if (!action) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.capture(context, action).catch((err) => {
            this.logger.error('审计日志写入失败', err);
          });
        },
        error: () => {
          // 请求失败不记录审计日志
        },
      }),
    );
  }

  private async capture(context: ExecutionContext, action: string) {
    const request = context.switchToHttp().getRequest<Request>();

    // 操作人：JWT 认证后挂载在 request.user 上
    const operatorId = (request as any).user?.userId || 'unknown';

    // 租户：由 TenantMiddleware 挂载在 request.tenantId 上
    const tenantId = (request as any).tenantId || 'unknown';

    // 目标类型：从控制器类名或 URL 路径推断
    const targetType = this.extractTargetType(context, request);

    // 目标 ID：从路由参数中提取
    const targetId = this.extractTargetId(request);

    // 客户端 IP
    const ip = this.extractIp(request);

    await this.audit.log({
      tenantId,
      operatorId,
      action,
      targetType,
      targetId,
      ip,
    });
  }

  /**
   * 从控制器类名推断目标资源类型。
   * 例如 AuthController → auth, BrandController → brand
   */
  private extractTargetType(context: ExecutionContext, request: Request): string {
    const controllerName = context.getClass().name;
    // BrandController → brand, AdminUserController → admin-user
    const fromController = controllerName
      .replace(/Controller$/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');

    // 如果控制器类名是通用名（如 AppController），回退到 URL 路径
    if (fromController === 'app' || !fromController) {
      const path = request.route?.path || request.url?.split('?')[0] || '';
      const segments = path.replace(/^\/api\//, '').split('/');
      return segments[0] || 'unknown';
    }

    return fromController;
  }

  /**
   * 从路由参数中提取目标资源 ID
   */
  private extractTargetId(request: Request): string | undefined {
    const params = (request as any).params;
    if (!params) return undefined;

    // 常见的主键参数名
    const idKeys = ['id', 'userId', 'orderId', 'storeId', 'dishId'];
    for (const key of idKeys) {
      if (params[key]) {
        return params[key];
      }
    }

    // 没有匹配的 id 参数则返回第一个可能是 id 的值
    const values = Object.values(params);
    return values.length > 0 ? String(values[0]) : undefined;
  }

  /**
   * 提取客户端 IP
   */
  private extractIp(request: Request): string | undefined {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ips.trim();
    }
    return request.ip || (request as any).connection?.remoteAddress;
  }
}
