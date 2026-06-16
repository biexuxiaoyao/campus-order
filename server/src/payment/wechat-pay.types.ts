/**
 * WeChat Pay API v3 TypeScript Type Definitions
 *
 * 微信支付 API v3 的请求/响应类型定义
 */

// ========== JSAPI 下单 ==========

/** JSAPI 下单请求 */
export interface WechatPrepayRequest {
  appid: string;
  mchid: string;
  description: string;
  out_trade_no: string;
  notify_url: string;
  amount: {
    total: number;       // 单位：分
    currency?: string;   // 默认 CNY
  };
  payer: {
    openid: string;
  };
  attach?: string;
  time_expire?: string;  // RFC3339
  goods_tag?: string;
  settle_info?: {
    profit_sharing?: boolean;
  };
}

/** JSAPI 下单响应 */
export interface WechatPrepayResponse {
  prepay_id: string;
}

// ========== JSAPI 调起支付参数 ==========

/** 小程序调起支付所需参数 */
export interface WxJSAPIParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;       // "prepay_id=xxx"
  signType: string;      // "RSA"
  paySign: string;
}

// ========== 回调通知 ==========

/** 回调通知请求体 */
export interface WechatNotifyBody {
  id: string;
  create_time: string;
  resource_type: string; // "encrypt-resource"
  event_type: string;    // "TRANSACTION.SUCCESS"
  summary: string;
  resource: WechatNotifyResource;
}

/** 回调通知加密资源 */
export interface WechatNotifyResource {
  original_type: string;
  algorithm: string;            // "AEAD_AES_256_GCM"
  ciphertext: string;
  associated_data: string;
  nonce: string;
}

/** 解密后的交易订单 */
export interface WechatTransaction {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;          // SUCCESS, REFUND, NOTPAY, CLOSED, REVOKED, USERPAYING, PAYERROR
  trade_state_desc: string;
  bank_type: string;
  attach: string;
  success_time: string;         // RFC3339
  payer: {
    openid: string;
  };
  amount: {
    total: number;
    payer_total: number;
    currency: string;
    payer_currency: string;
  };
}

// ========== 退款 ==========

/** 退款请求 */
export interface WechatRefundRequest {
  out_trade_no?: string;
  transaction_id?: string;
  out_refund_no: string;
  reason?: string;
  amount: {
    refund: number;
    total: number;
    currency?: string;
  };
}

/** 退款响应 */
export interface WechatRefundResponse {
  refund_id: string;
  out_refund_no: string;
  transaction_id: string;
  out_trade_no: string;
  channel: string;
  status: string;               // SUCCESS, CLOSED, PROCESSING, ABNORMAL
  amount: {
    total: number;
    refund: number;
    payer_total: number;
    payer_refund: number;
  };
  create_time: string;
}

// ========== 签名相关 ==========

/** 用于生成 JSAPI paySign 的参数 */
export interface WechatSignParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
}
