import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrepaidService } from './prepaid.service';
import { RechargeDto } from './dto/recharge.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Controller('api/prepaid')
@UseGuards(AuthGuard('jwt'))
export class PrepaidController {
  constructor(private prepaid: PrepaidService) {}

  @Get('balance')
  async getBalance(@Req() req: any) {
    return this.prepaid.getBalance(req.user?.userId, req.tenantId);
  }

  @Post('recharge')
  async recharge(@Req() req: any, @Body() dto: RechargeDto) {
    return this.prepaid.recharge(req.user?.userId, req.tenantId, dto);
  }

  /**
   * 确认充值到账（由支付回调触发；开发环境下前端可直接调用以模拟支付成功）
   */
  @Post('recharge/confirm')
  async confirmRecharge(@Body() body: { paymentRecordId: string }) {
    return this.prepaid.confirmRecharge(body.paymentRecordId);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any, @Query() query: QueryTransactionDto) {
    return this.prepaid.getTransactions(req.user?.userId, req.tenantId, query);
  }
}
