import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WechatSession {
  openid: string;
  session_key: string;
  unionid?: string;
}

@Injectable()
export class WechatService {
  private readonly appId: string;
  private readonly appSecret: string;

  constructor(private config: ConfigService) {
    this.appId = this.config.get<string>('WECHAT_APP_ID')!;
    this.appSecret = this.config.get<string>('WECHAT_APP_SECRET')!;
  }

  /**
   * 通过 wx.login 返回的 code 换取 openid 和 session_key
   */
  async code2Session(code: string): Promise<WechatSession> {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${this.appId}&secret=${this.appSecret}&js_code=${code}&grant_type=authorization_code`;

    const response = await fetch(url);
    const data = await response.json();

    if ((data as any).errcode) {
      throw new Error(`微信登录失败: ${(data as any).errmsg} (code: ${(data as any).errcode})`);
    }

    return {
      openid: (data as any).openid,
      session_key: (data as any).session_key,
      unionid: (data as any).unionid,
    };
  }
}
