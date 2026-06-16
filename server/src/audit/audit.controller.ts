import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller('api/merchant')
export class AuditController {
  constructor(private audit: AuditService) {}

  /**
   * 商家查询审计日志（分页 + 筛选）
   * GET /api/merchant/audit-logs?page=1&pageSize=20&action=update&startDate=2025-01-01
   */
  @Get('audit-logs')
  async query(
    @Headers('x-tenant-id') tenantId: string,
    @Query() dto: QueryAuditLogDto,
  ) {
    return this.audit.query(tenantId, dto);
  }
}
