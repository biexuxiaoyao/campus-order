import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

/**
 * 微信支付配置
 *
 * 从环境变量加载微信支付 API v3 所需配置。
 * 未配置时 isConfigured 为 false，service 层据此返回 mock 数据以便开发调试。
 */
@Injectable()
export class WechatPayConfig {
  private readonly logger = new Logger(WechatPayConfig.name);

  /** 商户号 */
  readonly mchId: string;
  /** API v3 密钥（32 字节，用于回调通知解密） */
  readonly apiV3Key: string;
  /** 商户 API 证书序列号 */
  readonly serialNo: string;
  /** 商户私钥内容（PEM 格式） */
  readonly privateKey: string | null;
  /** 微信支付平台证书公钥（PEM 格式） */
  readonly platformCert: string | null;
  /** 是否已配置完整 */
  readonly isConfigured: boolean;

  constructor(private config: ConfigService) {
    this.mchId = this.config.get<string>('WECHAT_PAY_MCH_ID') || process.env['WECHAT_PAY_MCH_ID'] || '';
    this.apiV3Key = this.config.get<string>('WECHAT_PAY_API_V3_KEY') || process.env['WECHAT_PAY_API_V3_KEY'] || '';
    this.serialNo = this.config.get<string>('WECHAT_PAY_SERIAL_NO') || process.env['WECHAT_PAY_SERIAL_NO'] || '';

    const privateKeyPath = this.config.get<string>('WECHAT_PAY_PRIVATE_KEY_PATH') || process.env['WECHAT_PAY_PRIVATE_KEY_PATH'] || '';
    this.privateKey = this.loadFile(privateKeyPath, '商户私钥');

    const platformCertPath = this.config.get<string>('WECHAT_PAY_PLATFORM_CERT_PATH') || process.env['WECHAT_PAY_PLATFORM_CERT_PATH'] || '';
    this.platformCert = this.loadFile(platformCertPath, '平台证书');

    this.isConfigured = !!(
      this.mchId &&
      this.apiV3Key &&
      this.serialNo &&
      this.privateKey &&
      this.platformCert
    );

    if (!this.isConfigured) {
      this.logger.warn(
        '微信支付未完全配置，支付功能将返回 mock 数据。' +
        '请设置 WECHAT_PAY_MCH_ID, WECHAT_PAY_API_V3_KEY, ' +
        'WECHAT_PAY_SERIAL_NO, WECHAT_PAY_PRIVATE_KEY_PATH, WECHAT_PAY_PLATFORM_CERT_PATH',
      );
    }
  }

  private loadFile(path: string, name: string): string | null {
    if (!path) return null;
    try {
      return fs.readFileSync(path, 'utf-8');
    } catch (err) {
      this.logger.warn(`无法读取${name}文件: ${path}`);
      return null;
    }
  }
}
