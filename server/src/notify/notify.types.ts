/**
 * 订阅消息场景类型
 */
export type NotifyScenario =
  | 'order_paid'
  | 'order_cooking'
  | 'order_ready'
  | 'order_picked'
  | 'order_cancelled'
  | 'refund_approved'
  | 'group_success'
  | 'group_failed'
  | 'coupon_expiring'
  | 'urge_reply';

/**
 * 微信订阅消息数据结构
 * 参考: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-message-management/subscribe-message/sendMessage.html
 */
export interface SubscribeMessageData {
  /** 接收者 openid */
  touser: string;
  /** 消息模板 ID */
  template_id: string;
  /** 点击消息跳转的小程序页面（可选） */
  page?: string;
  /** 模板内容，key 格式如 "thing1.DATA", "number2.DATA" */
  data: Record<string, { value: string }>;
  /** 跳转小程序类型，默认打开小程序 */
  miniprogram_state?: 'developer' | 'trial' | 'formal';
  /** 语言，默认 zh_CN */
  lang?: string;
}

/**
 * 微信 access_token 响应
 */
export interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * 微信订阅消息发送响应
 */
export interface SubscribeMessageResponse {
  errcode: number;
  errmsg: string;
}
