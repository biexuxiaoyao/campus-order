import { get, post } from './index';

export interface PrepaidBalance {
  personalBalance: number;    // 个人余额（分）
  companyBalance: number;     // 企业余额（分）
  totalBalance: number;
}

export interface PrepaidTransaction {
  id: string;
  type: 'recharge' | 'refund' | 'consume';
  amount: number;             // 单位：分
  balanceType: 'personal' | 'company';
  afterBalance: number;
  remark: string;
  createdAt: string;
}

export interface PrepaidTransactionListResult {
  items: PrepaidTransaction[];
  total: number;
  hasMore: boolean;
}

export interface QueryTransactionParams {
  page?: number;
  pageSize?: number;
}

/**
 * 获取预充值余额
 */
export function getBalance(): Promise<PrepaidBalance> {
  return get<PrepaidBalance>('/api/prepaid/balance');
}

/**
 * 预充值
 */
export function recharge(amount: number, type: 'personal' | 'company' = 'personal'): Promise<PrepaidBalance> {
  return post<PrepaidBalance>('/api/prepaid/recharge', { amount, type });
}

/**
 * 获取交易记录
 */
export function getTransactions(params?: QueryTransactionParams): Promise<PrepaidTransactionListResult> {
  return get<PrepaidTransactionListResult>('/api/prepaid/transactions', params);
}
