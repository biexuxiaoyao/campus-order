import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { WechatPayConfig } from './wechat-pay.config';

/**
 * Shared WeChat Pay API v3 client.
 * Used by both PaymentService and PrepaidService to avoid code duplication.
 */
@Injectable()
export class WechatPayClient {
  private readonly logger = new Logger(WechatPayClient.name);
  private readonly baseUrl = 'https://api.mch.weixin.qq.com';

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly wechatConfig: WechatPayConfig,
  ) {}

  /** 生成随机 nonce 字符串 */
  generateNonceStr(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /** 获取小程序 AppId */
  getAppId(): string {
    return (
      this.config.get<string>('WECHAT_APP_ID') ||
      process.env['WECHAT_APP_ID'] ||
      ''
    );
  }

  /** RSA-SHA256 签名 */
  signMessage(message: string): string | null {
    if (!this.wechatConfig.privateKey) return null;
    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      return sign.sign(this.wechatConfig.privateKey, 'base64');
    } catch (err) {
      this.logger.error('微信支付签名失败', (err as Error).message);
      return null;
    }
  }

  /** 生成 JSAPI 调起支付签名 */
  generateWechatSign(params: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
  }): string | null {
    if (!this.wechatConfig.privateKey) return null;
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

  /** 调用微信支付 API v3 */
  async callWechatApi<T>(
    method: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
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
      const status = err?.response?.status;
      const errData = err?.response?.data;
      this.logger.error(
        `微信 API 调用失败: ${method} ${path} status=${status}`,
        JSON.stringify(errData),
      );
      throw new BadRequestException(
        `微信支付请求失败${status ? ` (${status})` : ''}`,
      );
    }
  }
}
