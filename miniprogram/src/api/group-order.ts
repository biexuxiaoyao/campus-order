import { get, post, put } from './index';

export interface GroupParticipant {
  id: string;
  nickname: string;
  avatar: string;
  items: {
    dishName: string;
    skuSpecs: string;
    price: number;
    quantity: number;
  }[];
  totalAmount: number;
}

export interface GroupOrder {
  id: string;
  storeId: string;
  storeName: string;
  leaderId: string;
  leaderName: string;
  leaderAvatar: string;
  status: 'active' | 'closed' | 'ordered';
  condition: string;         // 拼单条件描述
  minAmount: number;         // 最低金额（分）
  totalAmount: number;       // 当前总金额（分）
  participantCount: number;
  maxParticipants: number;
  deadline: string;          // 截止时间
  participants: GroupParticipant[];
  createdAt: string;
}

export interface GroupOrderListResult {
  pools: GroupOrder[];
}

export interface CreateGroupOrderParams {
  storeId: string;
  condition?: string;
  minAmount?: number;
  maxParticipants?: number;
  deadline?: string;
  cartItemIds?: string[];
}

export interface JoinGroupParams {
  cartItemIds: string[];
}

/**
 * 获取拼单池列表
 */
export function getGroupOrders(storeId: string): Promise<GroupOrderListResult> {
  return get<GroupOrderListResult>('/api/group-orders', { storeId });
}

/**
 * 获取拼单详情
 */
export function getGroupOrderDetail(id: string): Promise<GroupOrder> {
  return get<GroupOrder>(`/api/group-orders/${id}`);
}

/**
 * 发起拼单
 */
export function createGroupOrder(data: CreateGroupOrderParams): Promise<GroupOrder> {
  return post<GroupOrder>('/api/group-orders', data);
}

/**
 * 加入拼单
 */
export function joinGroupOrder(id: string, data: JoinGroupParams): Promise<GroupOrder> {
  return post<GroupOrder>(`/api/group-orders/${id}/join`, data);
}

/**
 * 关闭拼单（仅发起人）
 */
export function closeGroupOrder(id: string): Promise<void> {
  return put<void>(`/api/group-orders/${id}/close`);
}
