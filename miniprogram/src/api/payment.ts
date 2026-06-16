import { get, post } from './index';

export interface PrepayResult {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

export interface PaymentQueryResult {
  orderId: string;
  status: string;
  paidAmount: number;
}

/**
 * 微信支付预下单
 */
export function prepay(orderId: string): Promise<PrepayResult> {
  return post<PrepayResult>('/api/payment/prepay', { orderId });
}

/**
 * 查询支付状态
 */
export function queryPayment(orderId: string): Promise<PaymentQueryResult> {
  return get<PaymentQueryResult>(`/api/payment/query/${orderId}`);
}
