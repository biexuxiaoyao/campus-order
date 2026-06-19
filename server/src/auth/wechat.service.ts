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

    if (data.errcode) {
      throw new Error(`微信登录失败: ${data.errmsg} (code: ${data.errcode})`);
    }

    return {
      openid: data.openid,
      session_key: data.session_key,
      unionid: data.unionid,
    };
  }
}
