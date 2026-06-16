import { get, post } from './index';

export interface OrderItem {
  id: string;
  dishName: string;
  skuSpecs: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface OrderTimeline {
  status: string;
  time: string;
  remark?: string;
}

export interface Order {
  id: string;
  orderNo: string;
  status: string;
  statusText: string;
  totalAmount: number;     // 单位：分
  discountAmount: number;  // 单位：分
  paidAmount: number;      // 单位：分
  pickupTime?: string;
  remark?: string;
  items: OrderItem[];
  timeline: OrderTimeline[];
  storeName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListResult {
  items: Order[];
  total: number;
  hasMore: boolean;
}

export interface QueryOrderParams {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateOrderParams {
  cartItemIds: string[];
  pickupTime?: string;
  remark?: string;
  paymentMethod?: string;
}

/**
 * 创建订单
 */
export function createOrder(data: CreateOrderParams): Promise<Order> {
  return post<Order>('/api/orders', data);
}

/**
 * 获取订单列表
 */
export function getOrders(params: QueryOrderParams): Promise<OrderListResult> {
  return get<OrderListResult>('/api/orders', params);
}

/**
 * 获取订单详情
 */
export function getOrderDetail(id: string): Promise<Order> {
  return get<Order>(`/api/orders/${id}`);
}

/**
 * 取消订单
 */
export function cancelOrder(id: string): Promise<void> {
  return post<void>(`/api/orders/${id}/cancel`);
}

/**
 * 再来一单
 */
export function reorder(id: string): Promise<Order> {
  return post<Order>(`/api/orders/${id}/reorder`);
}

/**
 * 催单
 */
export function urgeOrder(id: string): Promise<void> {
  return post<void>(`/api/orders/${id}/urge`);
}
