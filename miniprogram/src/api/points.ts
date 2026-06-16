import { get, post } from './index';

export interface PointsSummary {
  balance: number;
  totalEarned: number;
  consecutiveSignInDays: number;
  todaySignedIn: boolean;
}

export interface PointsTransaction {
  id: string;
  type: 'sign_in' | 'exchange' | 'order_reward' | 'expire';
  amount: number;
  afterBalance: number;
  remark: string;
  createdAt: string;
}

export interface PointsTransactionListResult {
  items: PointsTransaction[];
  total: number;
  hasMore: boolean;
}

/**
 * 获取积分摘要
 */
export function getPointsSummary(): Promise<PointsSummary> {
  return get<PointsSummary>('/api/points/summary');
}

/**
 * 签到
 */
export function signIn(): Promise<PointsSummary> {
  return post<PointsSummary>('/api/points/sign-in');
}

/**
 * 获取积分交易记录
 */
export function getPointsTransactions(params?: { page?: number; pageSize?: number }): Promise<PointsTransactionListResult> {
  return get<PointsTransactionListResult>('/api/points/transactions', params);
}

/**
 * 积分兑换
 */
export function exchange(exchangeRuleId: string): Promise<{ afterBalance: number }> {
  return post<{ afterBalance: number }>('/api/points/exchange', { exchangeRuleId });
}
