import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { PrepaidService } from '../prepaid/prepaid.service';
import { NotifyService } from '../notify/notify.service';
import { WechatPayConfig } from './wechat-pay.config';
import { WechatPayClient } from './wechat-pay.client';
import {
  WechatPrepayRequest,
  WechatPrepayResponse,
  WxJSAPIParams,
  WechatNotifyBody,
  WechatTransaction,
  WechatRefundRequest,
  WechatRefundResponse,
} from './wechat-pay.types';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly wechatPayBaseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
    private wechatConfig: WechatPayConfig,
    private wechatPay: WechatPayClient,
    private config: ConfigService,
    private notify: NotifyService,
    private prepaidService: PrepaidService,
  ) {}

  // ========================= 预支付下单 =========================

  /**
   * 创建预支付订单
   *
   * @param userId  当前用户 ID
   * @param openid  当前用户的微信 openid
   * @param orderId 订单 ID
   * @param channel 支付渠道 (wechat / balance)
   * @param notifyUrl 微信回调地址
   */
  async prepay(
    userId: string,
    openid: string,
    orderId: string,
    channel: string,
    notifyUrl: string,
  ): Promise<{
    wxJSAPIParams?: WxJSAPIParams;
    paymentId: string;
    channel: string;
  }> {
    // 1. 查询订单
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    if (order.userId !== userId) {
      throw new BadRequestException('订单不属于当前用户');
    }
    if (channel === 'balance' && order.status === 'paid') {
      const existingPayment = await this.prisma.paymentRecord.findFirst({
        where: { orderId, channel: 'balance', status: 'success' },
        orderBy: { createdAt: 'desc' },
      });

      if (existingPayment) {
        return {
          paymentId: existingPayment.id,
          channel: 'balance',
        };
      }
    }
    if (order.status !== 'pending') {
      throw new BadRequestException(
        '订单状态不允许支付，当前状态：' + order.status,
      );
    }

    // 2. 余额支付：在一个事务内原子扣减余额、创建支付记录、更新订单状态
    if (channel === 'balance') {
      const result = await this.prisma.$transaction(async (tx) => {
        // 原子扣减余额（含幂等检查）
        const { transactionId } = await this.prepaidService.consumeWithTx(
          tx,
          userId,
          order.tenantId,
          'personal',
          order.totalAmount,
          orderId,
        );

        // 创建支付记录（即时成功）
        const paymentRecord = await tx.paymentRecord.create({
          data: {
            orderId,
            amount: order.totalAmount,
            channel: 'balance',
            status: 'success',
          },
        });

        // 更新订单状态
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'paid',
            paymentMethod: 'balance',
          },
        });

        // 添加订单时间线
        await tx.orderTimeline.create({
          data: { orderId, status: 'paid' },
        });

        return {
          paymentId: paymentRecord.id,
          transactionId,
        };
      });

      this.logger.log(
        `余额支付成功：订单 ${order.orderNo}，金额 ${order.totalAmount} 分`,
      );

      // Fire-and-forget: notify user
      this.notify
        .notifyOrderPaid(order.userId, order.tenantId, {
          orderNo: order.orderNo,
          totalAmount: order.totalAmount,
          store: { name: '校园订餐' },
        })
        .catch((err) =>
          this.logger.error(
            `[Notify] 余额支付通知发送失败: ${(err as Error).message}`,
          ),
        );

      return {
        paymentId: result.paymentId,
        channel: 'balance',
      };
    }

    // 3. 微信支付未配置时，返回 mock 数据用于开发调试
    //    注意：mock 模式下回调通知会被拒绝（防止 mock 支付滥用）
    //    开发环境可通过 POST /api/prepaid/recharge/confirm 模拟支付确认
    if (!this.wechatConfig.isConfigured && channel === 'wechat') {
      this.logger.warn('微信支付未配置，返回 mock 预支付数据');
      const paymentRecord = await this.prisma.paymentRecord.create({
        data: {
          orderId,
          amount: order.totalAmount,
          channel: 'wechat',
          status: 'pending',
        },
      });
      return {
        wxJSAPIParams: {
          appId: this.getAppId(),
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: this.generateNonceStr(),
          package: 'prepay_id=mock_prepay_' + Date.now(),
          signType: 'RSA',
          paySign: 'MOCK_SIGN_DEV_ONLY',
        },
        paymentId: paymentRecord.id,
        channel,
      };
    }

    // 4. 构建微信支付 JSAPI 下单请求
    const prepayRequest: WechatPrepayRequest = {
      appid: this.getAppId(),
      mchid: this.wechatConfig.mchId,
      description: `订单 ${order.orderNo}`,
      out_trade_no: order.orderNo,
      notify_url: notifyUrl,
      amount: {
        total: order.totalAmount,
        currency: 'CNY',
      },
      payer: {
        openid,
      },
    };

    // 5. 调用微信支付 API
    const prepayResponse = await this.callWechatApi<WechatPrepayResponse>(
      'POST',
      '/v3/pay/transactions/jsapi',
      prepayRequest,
    );

    // 6. 创建支付记录
    const paymentRecord = await this.prisma.paymentRecord.create({
      data: {
        orderId,
        amount: order.totalAmount,
        channel: 'wechat',
        status: 'pending',
      },
    });

    // 7. 生成 JSAPI 调起支付参数
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = this.generateNonceStr();
    const pkg = `prepay_id=${prepayResponse.prepay_id}`;

    const paySign = this.generateWechatSign({
      appId: this.getAppId(),
      timeStamp,
      nonceStr,
      package: pkg,
    });

    if (!paySign) {
      throw new BadRequestException('生成支付签名失败：私钥未配置');
    }

    return {
      wxJSAPIParams: {
        appId: this.getAppId(),
        timeStamp,
        nonceStr,
        package: pkg,
        signType: 'RSA',
        paySign,
      },
      paymentId: paymentRecord.id,
      channel,
    };
  }

  // ========================= 回调通知处理 =========================

  /**
   * 处理微信支付回调通知
   *
   * 安全策略：
   *   - 微信支付未配置时拒绝所有回调（防止 mock 支付滥用）
   *   - 幂等处理：如果已处理过，直接返回 true
   *   - 区分订单支付和充值支付（通过 out_trade_no 前缀）
   */
  async handleNotify(
    body: WechatNotifyBody,
    signature: string,
    serial: string,
    timestamp: string,
    nonce: string,
  ): Promise<boolean> {
    // 1. 微信支付未配置时，拒绝所有回调
    if (!this.wechatConfig.isConfigured) {
      throw new BadRequestException(
        '微信支付未配置，无法处理支付回调。开发环境请使用 /api/prepaid/recharge/confirm 确认充值。',
      );
    }

    // 2. 验签
    const bodyStr = JSON.stringify(body);
    const valid = this.verifySignature(
      bodyStr,
      signature,
      serial,
      timestamp,
      nonce,
    );
    if (!valid) {
      throw new BadRequestException('微信支付回调签名验证失败');
    }

    // 3. 解密 resource
    const transaction = this.decryptNotifyResource(body.resource);

    // 4. 充值支付回调（out_trade_no 以 RECHARGE_ 开头）
    if (transaction.out_trade_no.startsWith('RECHARGE_')) {
      const paymentRecordId = transaction.out_trade_no.replace('RECHARGE_', '');

      // 幂等检查
      const existingPayment = await this.prisma.paymentRecord.findUnique({
        where: { id: paymentRecordId },
      });
      if (!existingPayment) {
        this.logger.error(`充值支付记录不存在：${paymentRecordId}`);
        throw new NotFoundException('充值支付记录不存在');
      }
      if (existingPayment.status === 'success') {
        this.logger.log(`充值支付通知幂等：${paymentRecordId} 已处理`);
        return true;
      }

      // 确认充值到账
      await this.prepaidService.confirmRecharge(paymentRecordId);

      this.logger.log(
        `充值支付成功：paymentRecordId=${paymentRecordId}，金额 ${existingPayment.amount} 分`,
      );
      return true;
    }

    // 5. 订单支付回调（out_trade_no 为订单号）
    // 幂等检查
    const existing = await this.prisma.paymentRecord.findFirst({
      where: {
        order: { orderNo: transaction.out_trade_no },
        status: 'success',
      },
    });

    if (existing) {
      this.logger.log(`支付通知幂等：订单 ${transaction.out_trade_no} 已处理`);
      return true;
    }

    // 查找订单
    const order = await this.prisma.order.findUnique({
      where: { orderNo: transaction.out_trade_no },
    });

    if (!order) {
      this.logger.error(`回调订单不存在：${transaction.out_trade_no}`);
      throw new NotFoundException(`订单 ${transaction.out_trade_no} 不存在`);
    }

    // 更新 PaymentRecord 和 Order（在事务中）
    await this.prisma.$transaction(async (tx) => {
      // 更新支付记录
      await tx.paymentRecord.updateMany({
        where: {
          orderId: order.id,
          status: 'pending',
        },
        data: {
          status: 'success',
          transactionId: transaction.transaction_id,
        },
      });

      // 更新订单状态
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          paymentMethod: 'wechat',
        },
      });

      // 添加订单时间线
      await tx.orderTimeline.create({
        data: {
          orderId: order.id,
          status: 'paid',
        },
      });
    });

    this.logger.log(
      `支付成功：订单 ${transaction.out_trade_no}，交易号 ${transaction.transaction_id}`,
    );

    // Fire-and-forget: notify user of payment success
    this.notify
      .notifyOrderPaid(order.userId, order.tenantId, {
        orderNo: order.orderNo,
        totalAmount: order.totalAmount,
        store: { name: '校园订餐' },
      })
      .catch((err) =>
        this.logger.error(
          `[Notify] 支付成功通知发送失败: ${(err as Error).message}`,
        ),
      );

    return true;
  }

  // ========================= 查询支付状态 =========================

  async queryPayment(orderId: string) {
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      return null;
    }

    return payment;
  }

  /**
   * 主动查询微信支付订单状态（用于支付补偿/超时核验）
   * GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid={mchid}
   */
  async queryWechatOrder(outTradeNo: string): Promise<{
    tradeState: string;
    transactionId?: string;
    amount?: number;
  } | null> {
    if (!this.wechatConfig.isConfigured) {
      this.logger.warn('微信支付未配置，跳过主动查单');
      return null;
    }

    try {
      const path = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${this.wechatConfig.mchId}`;
      const result = await this.callWechatApi<WechatTransaction>(
        'GET',
        path,
        null,
      );
      return {
        tradeState: result.trade_state,
        transactionId: result.transaction_id,
        amount: result.amount?.total,
      };
    } catch (err) {
      const message =
        (err as any)?.response?.data?.message || (err as Error).message;
      this.logger.error(
        `[queryWechatOrder] 查询微信订单 ${outTradeNo} 失败: ${message}`,
      );
      return null;
    }
  }

  // ========================= 退款 =========================

  async refund(orderId: string, amount?: number, reason?: string) {
    // 1. 查找支付记录
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { orderId, status: 'success' },
    });

    if (!payment) {
      throw new NotFoundException('未找到已支付的支付记录');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const refundAmount = amount ?? payment.amount;

    if (refundAmount > payment.amount) {
      throw new BadRequestException('退款金额不能超过支付金额');
    }

    // 查找是否已有 pending/approved 退款记录（来自商家审批流程），有则复用
    const existingRefund = await this.prisma.refundRecord.findFirst({
      where: { orderId, status: { in: ['pending', 'approved'] } },
      orderBy: { createdAt: 'desc' },
    });

    const upsertRefundRecord = async (status: string) => {
      if (existingRefund) {
        return this.prisma.refundRecord.update({
          where: { id: existingRefund.id },
          data: {
            status,
            paymentId: payment.id,
            amount: refundAmount,
            reason: reason ?? existingRefund.reason,
          },
        });
      }
      return this.prisma.refundRecord.create({
        data: {
          orderId,
          paymentId: payment.id,
          amount: refundAmount,
          reason: reason ?? null,
          status,
        },
      });
    };

    // 余额支付退款：直接退还至用户余额账户
    if (payment.channel === 'balance') {
      await this.prepaidService.refund(
        order.userId,
        order.tenantId,
        refundAmount,
        reason,
        order.orderNo, // 幂等键
      );

      // Atomically write refund record + order status + timeline
      return this.prisma.$transaction(async (tx) => {
        const refundRecord = existingRefund
          ? await tx.refundRecord.update({
              where: { id: existingRefund.id },
              data: {
                status: 'completed',
                paymentId: payment.id,
                amount: refundAmount,
                reason: reason ?? existingRefund.reason,
              },
            })
          : await tx.refundRecord.create({
              data: {
                orderId,
                paymentId: payment.id,
                amount: refundAmount,
                reason: reason ?? null,
                status: 'completed',
              },
            });

        await tx.order.update({
          where: { id: orderId },
          data: { status: 'refunded' },
        });

        await tx.orderTimeline.create({
          data: { orderId, status: 'refunded' },
        });

        return refundRecord;
      });
    }

    // 微信支付退款
    const outRefundNo = `${order.orderNo}_refund_${Date.now()}`;

    // 未配置时 mock
    if (!this.wechatConfig.isConfigured) {
      this.logger.warn('微信支付未配置，返回 mock 退款数据');
      return upsertRefundRecord('completed');
    }

    // 构建退款请求
    const refundRequest: WechatRefundRequest = {
      out_trade_no: order.orderNo,
      out_refund_no: outRefundNo,
      reason: reason,
      amount: {
        refund: refundAmount,
        total: payment.amount,
        currency: 'CNY',
      },
    };

    // 调用微信退款 API
    await this.callWechatApi<WechatRefundResponse>(
      'POST',
      `/v3/refund/domestic/refunds`,
      refundRequest,
    );

    // Atomically write refund record + order status + timeline
    return this.prisma.$transaction(async (tx) => {
      const refundRecord = existingRefund
        ? await tx.refundRecord.update({
            where: { id: existingRefund.id },
            data: {
              status: 'pending',
              paymentId: payment.id,
              amount: refundAmount,
              reason: reason ?? existingRefund.reason,
            },
          })
        : await tx.refundRecord.create({
            data: {
              orderId,
              paymentId: payment.id,
              amount: refundAmount,
              reason: reason ?? null,
              status: 'pending',
            },
          });

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'refunded' },
      });

      await tx.orderTimeline.create({
        data: { orderId, status: 'refunded' },
      });

      return refundRecord;
    });
  }

  // ========================= 签名与加密工具 =========================

  /**
   * 验证回调签名
   */
  verifySignature(
    body: string,
    signature: string,
    _serial: string,
    timestamp: string,
    nonce: string,
  ): boolean {
    if (!this.wechatConfig.platformCert) {
      this.logger.warn('平台证书未配置，签名验证返回 true（开发模式）');
      return true;
    }

    const signedString = `${timestamp}\n${nonce}\n${body}\n`;

    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signedString);
      return verify.verify(this.wechatConfig.platformCert, signature, 'base64');
    } catch (err) {
      this.logger.error('签名验证异常', (err as Error).message);
      return false;
    }
  }

  /**
   * 生成 JSAPI 调起支付签名
   */
  generateWechatSign(params: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
  }): string | null {
    if (!this.wechatConfig.privateKey) {
      return null;
    }

    const signString = `${params.appId}\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`;

    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signString);
      return sign.sign(this.wechatConfig.privateKey, 'base64');
    } catch (err) {
      this.logger.error('生成支付签名失败', (err as Error).message);
      return null;
    }
  }

  // ========================= 私有辅助方法 =========================

  /**
   * 调用微信支付 API v3
   */
  private async callWechatApi<T>(
    method: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.wechatPayBaseUrl}${path}`;
    const bodyStr = body == null ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = this.generateNonceStr();

    const signMessage = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;
    const signature = this.signMessage(signMessage);

    if (!signature) {
      throw new BadRequestException('微信支付签名失败：私钥未配置');
    }

    const authHeader =
      `WECHATPAY2-SHA256-RSA2048 ` +
      `mchid="${this.wechatConfig.mchId}",` +
      `nonce_str="${nonceStr}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${this.wechatConfig.serialNo}",` +
      `signature="${signature}"`;

    try {
      const response = await firstValueFrom(
        this.http.request<T>({
          method,
          url,
          data: bodyStr,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: authHeader,
            'User-Agent': 'CampusOrder/1.0',
          },
        }),
      );
      return response.data;
    } catch (err: any) {
      const message =
        err.response?.data?.message || err.message || '微信支付 API 调用失败';
      this.logger.error(`微信支付 API 调用失败: ${method} ${path}`, message);
      throw new BadRequestException(message);
    }
  }

  /**
   * 使用商户私钥对消息签名
   */
  private signMessage(message: string): string | null {
    if (!this.wechatConfig.privateKey) return null;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    return sign.sign(this.wechatConfig.privateKey, 'base64');
  }

  /**
   * 解密回调通知中的加密资源
   */
  private decryptNotifyResource(resource: {
    ciphertext: string;
    associated_data: string;
    nonce: string;
    algorithm: string;
  }): WechatTransaction {
    if (resource.algorithm !== 'AEAD_AES_256_GCM') {
      throw new BadRequestException(`不支持的加密算法：${resource.algorithm}`);
    }

    if (!this.wechatConfig.apiV3Key) {
      throw new BadRequestException('APIv3 密钥未配置，无法解密回调数据');
    }

    try {
      const ciphertext = Buffer.from(resource.ciphertext, 'base64');
      const authTag = ciphertext.subarray(ciphertext.length - 16);
      const encrypted = ciphertext.subarray(0, ciphertext.length - 16);

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.wechatConfig.apiV3Key, 'utf-8'),
        Buffer.from(resource.nonce, 'utf-8'),
      );

      decipher.setAuthTag(authTag);
      decipher.setAAD(Buffer.from(resource.associated_data, 'utf-8'));

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString('utf-8'));
    } catch (err) {
      this.logger.error('回调数据解密失败', (err as Error).message);
      throw new BadRequestException('回调数据解密失败');
    }
  }

  /**
   * 生成随机 nonce 字符串
   */
  private generateNonceStr(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /**
   * 获取小程序 AppId
   */
  private getAppId(): string {
    return (
      this.config.get<string>('WECHAT_APP_ID') ||
      process.env['WECHAT_APP_ID'] ||
      ''
    );
  }
}
