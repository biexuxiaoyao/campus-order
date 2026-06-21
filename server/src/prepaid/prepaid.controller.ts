import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrepaidService } from './prepaid.service';
import { RechargeDto } from './dto/recharge.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { WechatPayConfig } from '../payment/wechat-pay.config';

@Controller('api/prepaid')
@UseGuards(AuthGuard('jwt'))
export class PrepaidController {
  constructor(
    private readonly prepaid: PrepaidService,
    private readonly wechatConfig: WechatPayConfig,
  ) {}

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
   *
   * 生产环境（微信已配置）下拒绝直接调用 — 充值确认仅由支付回调触发。
   */
  @Post('recharge/confirm')
  async confirmRecharge(@Body() body: { paymentRecordId: string }) {
    if (this.wechatConfig.isConfigured) {
      throw new BadRequestException(
        '生产环境不支持手动确认充值，请通过微信支付完成充值',
      );
    }
    return this.prepaid.confirmRecharge(body.paymentRecordId);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any, @Query() query: QueryTransactionDto) {
    return this.prepaid.getTransactions(req.user?.userId, req.tenantId, query);
  }
}
