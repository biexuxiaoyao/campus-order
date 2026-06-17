import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Headers,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { PrepayDto } from './dto/prepay.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class PaymentController {
  private readonly baseUrl: string;

  constructor(private payment: PaymentService) {
    this.baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  }

  /**
   * 预支付下单
   *
   * 返回小程序调起支付所需的 JSAPI 参数。
   */
  @Post('api/payment/prepay')
  async prepay(
    @Req() req: Request,
    @Body() dto: PrepayDto,
  ) {
    const user = req.user as any;
    const userId = user?.userId;
    const openid = user?.openid;

    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }
    if (!openid && dto.channel === 'wechat') {
      throw new BadRequestException('未获取到微信 openid，请重新登录');
    }

    // 构建回调地址（使用配置的基础 URL，避免 Host 头注入）
    const notifyUrl = `${this.baseUrl}/api/payment/notify`;

    return this.payment.prepay(
      userId,
      openid || '',
      dto.orderId,
      dto.channel,
      notifyUrl,
    );
  }

  /**
   * 微信支付回调通知
   *
   * 由微信支付服务器调用，无需登录认证。
   */
  @Public()
  @Post('api/payment/notify')
  async notify(
    @Req() req: Request,
    @Body() body: any,
    @Headers('wechatpay-signature') signature: string,
    @Headers('wechatpay-serial') serial: string,
    @Headers('wechatpay-timestamp') timestamp: string,
    @Headers('wechatpay-nonce') nonce: string,
  ) {
    await this.payment.handleNotify(
      body,
      signature || '',
      serial || '',
      timestamp || '',
      nonce || '',
    );
    // 微信支付要求返回 200 且 body 为 {"code":"SUCCESS","message":"成功"}
    return { code: 'SUCCESS', message: '成功' };
  }

  /**
   * 查询支付状态
   */
  @Get('api/payment/query/:orderId')
  async query(
    @Param('orderId') orderId: string,
  ) {
    return this.payment.queryPayment(orderId);
  }

  /**
   * 退款
   *
   * 商家端路由。
   */
  @Post('api/payment/refund/:orderId')
  async refund(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    if (!(req.user as any)?.isAdmin) {
      throw new ForbiddenException('仅管理员可操作退款');
    }
    return this.payment.refund(orderId, body.amount, body.reason);
  }
}
