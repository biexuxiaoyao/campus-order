import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { WechatPayConfig } from './wechat-pay.config';
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
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly wechatPayBaseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
    private wechatConfig: WechatPayConfig,
    private config: ConfigService,
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
  ): Promise<{ wxJSAPIParams?: WxJSAPIParams; paymentId: string; channel: string }> {
    // 1. 查询订单
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    if (order.userId !== userId) {
      throw new BadRequestException('订单不属于当前用户');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException('订单状态不允许支付，当前状态：' + order.status);
    }

    // 2. 如果微信支付未配置，返回 mock 数据用于开发调试
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

    // 3. 余额支付直接处理
    if (channel === 'balance') {
      // TODO: 在预充值模块完成后对接余额扣减
      throw new BadRequestException('余额支付暂未开放');
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
   * 幂等处理：如果已处理过（PaymentRecord 已为 success），直接返回 true。
   */
  async handleNotify(
    body: WechatNotifyBody,
    signature: string,
    serial: string,
    timestamp: string,
    nonce: string,
  ): Promise<boolean> {
    // 1. 验签 — 如果配置不可用，开发环境跳过验签
    if (this.wechatConfig.isConfigured) {
      const bodyStr = JSON.stringify(body);
      const valid = this.verifySignature(bodyStr, signature, serial, timestamp, nonce);
      if (!valid) {
        throw new BadRequestException('微信支付回调签名验证失败');
      }
    } else {
      this.logger.warn('微信支付未配置，跳过回调签名验证');
    }

    // 2. 解密 resource
    const transaction = this.decryptNotifyResource(body.resource);

    // 3. 查找支付记录（幂等性检查）
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

    // 4. 查找订单
    const order = await this.prisma.order.findUnique({
      where: { orderNo: transaction.out_trade_no },
    });

    if (!order) {
      this.logger.error(`回调订单不存在：${transaction.out_trade_no}`);
      throw new NotFoundException(`订单 ${transaction.out_trade_no} 不存在`);
    }

    // 5. 更新 PaymentRecord 和 Order
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

    this.logger.log(`支付成功：订单 ${transaction.out_trade_no}，交易号 ${transaction.transaction_id}`);
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

  // ========================= 退款 =========================

  async refund(
    orderId: string,
    amount?: number,
    reason?: string,
  ) {
    // 1. 查找支付记录
    const payment = await this.prisma.paymentRecord.findFirst({
      where: { orderId, status: 'success' },
    });

    if (!payment) {
      throw new NotFoundException('未找到已支付的支付记录');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const refundAmount = amount ?? payment.amount;

    if (refundAmount > payment.amount) {
      throw new BadRequestException('退款金额不能超过支付金额');
    }

    const outRefundNo = `${order.orderNo}_refund_${Date.now()}`;

    // 2. 未配置时 mock
    if (!this.wechatConfig.isConfigured) {
      this.logger.warn('微信支付未配置，返回 mock 退款数据');
      const refundRecord = await this.prisma.refundRecord.create({
        data: {
          orderId,
          paymentId: payment.id,
          amount: refundAmount,
          reason: reason ?? null,
          status: 'completed',
        },
      });
      return refundRecord;
    }

    // 3. 构建退款请求
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

    // 4. 调用微信退款 API（需要 mTLS 证书，这里使用基础签名认证）
    const refundResponse = await this.callWechatApi<WechatRefundResponse>(
      'POST',
      `/v3/refund/domestic/refunds`,
      refundRequest,
    );

    // 5. 创建退款记录
    const refundRecord = await this.prisma.refundRecord.create({
      data: {
        orderId,
        paymentId: payment.id,
        amount: refundAmount,
        reason: reason ?? null,
        status: 'pending',
      },
    });

    // 6. 更新订单状态
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'refunded' },
    });

    // 7. 添加时间线
    await this.prisma.orderTimeline.create({
      data: {
        orderId,
        status: 'refunded',
      },
    });

    return refundRecord;
  }

  // ========================= 签名与加密工具 =========================

  /**
   * 验证回调签名
   *
   * 微信支付 API v3 回调签名算法：
   *   signedString = TIMESTAMP\nNONCE\nBODY\n
   *   使用平台证书公钥对 signedString 进行 RSA-SHA256 验签
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
   *
   * 签名串：appId\ntimeStamp\nnonceStr\npackage\n
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
    const bodyStr = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = this.generateNonceStr();

    // 构建签名串
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
      const message = err.response?.data?.message || err.message || '微信支付 API 调用失败';
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
   *
   * AEAD_AES_256_GCM 解密：
   *   ciphertext = base64_decode(resource.ciphertext)
   *   associated_data = resource.associated_data
   *   nonce = resource.nonce
   *   key = APIv3密钥
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
    return uuidv4().replace(/-/g, '');
  }

  /**
   * 获取小程序 AppId
   */
  private getAppId(): string {
    return this.config.get<string>('WECHAT_APP_ID') || process.env['WECHAT_APP_ID'] || '';
  }
}
