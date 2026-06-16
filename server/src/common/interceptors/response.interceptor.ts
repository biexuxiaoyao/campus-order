import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 统一成功响应格式
 */
export interface SuccessResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

/**
 * 被排除的路径（不会被包装为统一格式）
 * 例如：/health、/metrics 等
 */
const EXCLUDED_PATHS: (string | RegExp)[] = [];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // 跳过被排除的路径
    if (this.shouldSkip(request.url)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        const response: SuccessResponse = {
          code: 0,
          message: 'success',
          data,
        };

        // 分页响应特殊处理
        if (this.isPaginatedResponse(data)) {
          response.data = {
            items: (data as any).items,
            total: (data as any).total,
            hasMore: (data as any).hasMore,
          };
        }

        return response;
      }),
    );
  }

  private shouldSkip(url: string): boolean {
    return EXCLUDED_PATHS.some((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern.test(url);
      }
      return url.includes(pattern);
    });
  }

  private isPaginatedResponse(data: any): boolean {
    if (data === null || data === undefined || typeof data !== 'object') {
      return false;
    }
    return (
      Array.isArray(data.items) &&
      typeof data.total === 'number' &&
      typeof data.hasMore === 'boolean'
    );
  }
}
