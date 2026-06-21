import { Controller, Get, Query, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReconciliationService } from './reconciliation.service';

@Controller('api/merchant')
@UseGuards(AuthGuard('jwt'))
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  /** GET /api/merchant/dashboard — Today's key metrics */
  @Get('dashboard')
  async getDashboard(
    @Headers('x-tenant-id') tenantId: string,
    @Query('storeId') storeId: string,
  ) {
    if (!storeId) {
      return { error: '缺少门店ID' };
    }
    return this.svc.getDashboard(storeId, tenantId);
  }

  /** GET /api/merchant/reconciliation?date=YYYY-MM-DD — Daily reconciliation */
  @Get('reconciliation')
  async getReconciliation(
    @Headers('x-tenant-id') tenantId: string,
    @Query('storeId') storeId: string,
    @Query('date') date: string,
  ) {
    if (!storeId) {
      return { error: '缺少门店ID' };
    }
    if (!date) {
      return { error: '缺少日期参数 (YYYY-MM-DD)' };
    }
    return this.svc.getReconciliation(storeId, tenantId, date);
  }
}
