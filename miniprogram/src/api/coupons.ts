import { get, post } from './index';

export interface CouponTemplate {
  id: string;
  name: string;
  description: string;
  type: 'discount' | 'fixed';
  value: number;            // 折扣率(百分比) 或 固定金额(分)
  minAmount: number;        // 最低使用金额（分）
  validDays: number;
  isClaimable: boolean;
}

export interface Coupon {
  id: string;
  templateId: string;
  name: string;
  description: string;
  type: 'discount' | 'fixed';
  value: number;
  minAmount: number;
  status: 'available' | 'used' | 'expired';
  usedAt?: string;
  expiredAt: string;
  createdAt: string;
}

export interface CouponListResult {
  items: Coupon[];
  total: number;
  hasMore: boolean;
}

/**
 * 获取可领取的优惠券模板
 */
export function getAvailableCoupons(storeId: string): Promise<CouponTemplate[]> {
  return get<CouponTemplate[]>(`/api/coupons/claimable`, { storeId });
}

/**
 * 领取优惠券
 */
export function claimCoupon(templateId: string): Promise<Coupon> {
  return post<Coupon>(`/api/coupons/${templateId}/claim`);
}

/**
 * 获取我的优惠券列表
 */
export function getMyCoupons(params?: { status?: string; page?: number; pageSize?: number }): Promise<CouponListResult> {
  return get<CouponListResult>('/api/coupons', params);
}
