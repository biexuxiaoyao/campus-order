import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/** 易联云 OAuth 响应 */
interface YlTokenResponse {
  error: string;
  error_description: string;
  body?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    machine_code?: string;
  };
}

/** 易联云打印响应 */
interface YlPrintResponse {
  error: string;
  error_description: string;
  body?: {
    id: string;
    origin_id: string;
  };
}

@Injectable()
export class YilianyunService {
  private readonly logger = new Logger(YilianyunService.name);
  private readonly baseUrl = 'https://open-api.10ss.net';

  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.clientId = this.config.get<string>('PRINTER_YL_CLIENT_ID') || '';
    this.clientSecret =
      this.config.get<string>('PRINTER_YL_CLIENT_SECRET') || '';
  }

  /** 是否已配置凭据 */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /** 获取 access_token（带缓存，自动刷新） */
  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = this.makeSign(timestamp);
    const id = uuidv4();

    this.logger.log('[Yilianyun] 获取 access_token...');

    try {
      const response = await firstValueFrom(
        this.http.post<YlTokenResponse>(
          `${this.baseUrl}/oauth/oauth`,
          new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'client_credentials',
            sign,
            scope: 'all',
            timestamp,
            id,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const data = response.data;

      if (data.error !== '0') {
        throw new Error(
          `易联云 OAuth 失败: [${data.error}] ${data.error_description}`,
        );
      }

      this.accessToken = data.body!.access_token;
      // 自有应用模式 token 无过期时间，设一个较大的过期值（30天）
      this.tokenExpiresAt =
        Date.now() + (data.body!.expires_in || 2592000) * 1000;

      this.logger.log('[Yilianyun] access_token 获取成功');
      return this.accessToken;
    } catch (err) {
      this.accessToken = null;
      this.logger.error(
        `[Yilianyun] 获取 access_token 失败: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * 发送文本打印任务
   * @param machineCode 打印机终端号
   * @param content 打印内容（不需要 urlencode，方法内部处理）
   * @param originId 商户订单号（幂等键，32位以内）
   */
  async print(
    machineCode: string,
    content: string,
    originId: string,
  ): Promise<{ id: string; originId: string }> {
    if (!this.isConfigured()) {
      throw new Error('易联云未配置凭据');
    }

    const token = await this.getAccessToken();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = this.makeSign(timestamp);
    const id = uuidv4();
    const encodedContent = encodeURIComponent(content);

    this.logger.log(
      `[Yilianyun] 打印任务 — machine: ${machineCode}, originId: ${originId}`,
    );

    try {
      const response = await firstValueFrom(
        this.http.post<YlPrintResponse>(
          `${this.baseUrl}/print/index`,
          new URLSearchParams({
            client_id: this.clientId,
            access_token: token,
            machine_code: machineCode,
            content: encodedContent,
            origin_id: originId,
            sign,
            id,
            timestamp,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const data = response.data;

      if (data.error !== '0') {
        // token 过期，清除缓存后重试一次
        if (data.error === '18') {
          this.logger.warn('[Yilianyun] access_token 过期，刷新后重试');
          this.accessToken = null;
          this.tokenExpiresAt = 0;
          return this.print(machineCode, content, originId);
        }

        throw new Error(
          `易联云打印失败: [${data.error}] ${data.error_description}`,
        );
      }

      this.logger.log(
        `[Yilianyun] 打印成功 — id: ${data.body!.id}, originId: ${data.body!.origin_id}`,
      );
      return {
        id: data.body!.id,
        originId: data.body!.origin_id,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`[Yilianyun] 打印失败: ${message}`);
      throw err;
    }
  }

  /** 生成 MD5 签名: MD5(client_id + timestamp + client_secret) */
  private makeSign(timestamp: string): string {
    const signStr = this.clientId + timestamp + this.clientSecret;
    return crypto.createHash('md5').update(signStr).digest('hex');
  }
}
