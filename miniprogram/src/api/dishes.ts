import { get } from './index';

export interface SkuSpec {
  id: string;
  name: string;
  value: string;
}

export interface Sku {
  id: string;
  dishId: string;
  specs: SkuSpec[];
  price: number;       // 单位：分
  stock: number;
  image?: string;
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  images: string[];
  categoryId: string;
  categoryName?: string;
  price: number;        // 最低价或基础价，单位：分
  originPrice?: number;
  skus: Sku[];
  estimated: boolean;   // 是否预估
  salesCount?: number;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface DishListResult {
  items: Dish[];
  total: number;
  hasMore: boolean;
}

export interface QueryDishParams {
  storeId: string;
  categoryId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 获取菜品列表（C端）
 */
export function getDishList(params: QueryDishParams): Promise<DishListResult> {
  return get<DishListResult>('/api/dishes', params);
}

/**
 * 获取菜品详情（C端）
 */
export function getDishDetail(id: string): Promise<Dish> {
  return get<Dish>(`/api/dishes/${id}`);
}
