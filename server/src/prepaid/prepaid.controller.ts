import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Req,
} from '@nestjs/common';
import { PrepaidService } from './prepaid.service';
import { RechargeDto } from './dto/recharge.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Controller('api/prepaid')
export class PrepaidController {
  constructor(private prepaid: PrepaidService) {}

  @Get('balance')
  async getBalance(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.prepaid.getBalance(req.user.userId, tenantId);
  }

  @Post('recharge')
  async recharge(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: RechargeDto,
  ) {
    return this.prepaid.recharge(req.user.userId, tenantId, dto);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Query() query: QueryTransactionDto,
  ) {
    return this.prepaid.getTransactions(req.user.userId, tenantId, query);
  }
}
