import { get, post } from './index';

/** 后端返回的 JSAPI 调起参数 */
export interface WxJSAPIParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

/** 后端 /api/payment/prepay 返回结构 */
export interface PrepayResult {
  wxJSAPIParams?: WxJSAPIParams;
  paymentId: string;
  channel: string;
}

export interface PaymentQueryResult {
  orderId: string;
  status: string;
  paidAmount: number;
}

/**
 * 支付预下单（微信/余额）
 * @param orderId 订单 ID
 * @param channel 支付渠道，默认 wechat
 */
export function prepay(orderId: string, channel: 'wechat' | 'balance' = 'wechat'): Promise<PrepayResult> {
  return post<PrepayResult>('/api/payment/prepay', { orderId, channel });
}

/**
 * 查询支付状态
 */
export function queryPayment(orderId: string): Promise<PaymentQueryResult> {
  return get<PaymentQueryResult>(`/api/payment/query/${orderId}`);
}
