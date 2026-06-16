import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface AuditLogParams {
  tenantId: string;
  operatorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  detail?: any;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * 写入一条审计日志
   */
  async log(params: AuditLogParams) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        operatorId: params.operatorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detail: params.detail,
        ip: params.ip,
      },
    });
  }

  /**
   * 分页查询审计日志
   */
  async query(tenantId: string, dto: QueryAuditLogDto) {
    const { operatorId, action, targetType, startDate, endDate, page, pageSize } = dto;

    const where: any = { tenantId };

    if (operatorId) {
      where.operatorId = operatorId;
    }

    if (action) {
      where.action = action;
    }

    if (targetType) {
      where.targetType = targetType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // 如果只传了日期（如 "2025-01-31"），补上当天结束时间
        // 如果已包含时间（如 "2025-01-31T12:00:00Z"），直接使用
        const end = endDate.includes('T')
          ? new Date(endDate)
          : new Date(endDate + 'T23:59:59.999Z');
        where.createdAt.lte = end;
      }
    }

    const [list, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }
}
