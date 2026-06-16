import { get, post, put, del } from './index';

export interface CartItem {
  id: string;
  dishId: string;
  dishName: string;
  dishImage: string;
  skuId: string;
  skuSpecs: string;
  price: number;       // 单位：分
  quantity: number;
  stock: number;
}

export interface Cart {
  items: CartItem[];
  totalAmount: number;
}

/**
 * 获取购物车
 */
export function getCart(): Promise<Cart> {
  return get<Cart>('/api/cart');
}

/**
 * 添加商品到购物车
 */
export function addCartItem(skuId: string, quantity: number = 1): Promise<CartItem> {
  return post<CartItem>('/api/cart/items', { skuId, quantity });
}

/**
 * 修改购物车项数量
 */
export function updateCartItem(id: string, quantity: number): Promise<CartItem> {
  return put<CartItem>(`/api/cart/items/${id}`, { quantity });
}

/**
 * 删除购物车项
 */
export function removeCartItem(id: string): Promise<void> {
  return del<void>(`/api/cart/items/${id}`);
}

/**
 * 清空购物车
 */
export function clearCart(): Promise<void> {
  return del<void>('/api/cart');
}
