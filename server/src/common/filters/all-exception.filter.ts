import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * 统一错误响应格式
 */
export interface ErrorResponse {
  code: string;
  message: string;
  data: null;
}

/**
 * Prisma 已知错误码映射
 */
const PRISMA_ERROR_MAP: Record<string, { httpStatus: number; code: string; message: string }> = {
  P2002: { httpStatus: 409, code: 'DATA_CONFLICT', message: '数据冲突，唯一字段重复' },
  P2025: { httpStatus: 404, code: 'RECORD_NOT_FOUND', message: '记录未找到' },
  P2003: { httpStatus: 400, code: 'FOREIGN_KEY_FAILED', message: '外键约束失败' },
  P2014: { httpStatus: 400, code: 'RELATION_VIOLATION', message: '关联关系违规' },
};

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: ErrorResponse = {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
      data: null,
    };

    // 1. HttpException（含 NestJS 内置异常）
    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        errorResponse = {
          code: `HTTP_${httpStatus}`,
          message: res,
          data: null,
        };
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        // 如果已经是我们的格式（如 TenantGuard 抛出的），直接沿用
        if (body.code && body.message) {
          errorResponse = {
            code: body.code,
            message: body.message,
            data: null,
          };
        } else {
          errorResponse = {
            code: `HTTP_${httpStatus}`,
            message: (body as any).message || body.error || exception.message,
            data: null,
          };
        }
      }
    }
    // 2. Prisma 已知错误
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapping = PRISMA_ERROR_MAP[exception.code];
      if (mapping) {
        httpStatus = mapping.httpStatus;
        errorResponse = {
          code: mapping.code,
          message: mapping.message,
          data: null,
        };
      } else {
        this.logger.error(
          `Prisma 未映射错误 [${exception.code}]: ${exception.message}`,
          exception.stack,
        );
      }
    }
    // 3. Prisma 校验错误
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      httpStatus = HttpStatus.BAD_REQUEST;
      errorResponse = {
        code: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        data: null,
      };
    }
    // 4. 未知错误
    else {
      if (exception instanceof Error) {
        this.logger.error(
          `未捕获异常: ${exception.message}`,
          exception.stack,
          `${request.method} ${request.url}`,
        );
      } else {
        this.logger.error(
          `未捕获异常（非 Error 类型）`,
          String(exception),
          `${request.method} ${request.url}`,
        );
      }
    }

    response.status(httpStatus).json(errorResponse);
  }
}
