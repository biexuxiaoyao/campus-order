import http from './index'

export interface DishSpec {
  id?: number
  name: string
  price: number
}

export interface DishData {
  id?: number
  name: string
  image: string
  category: string
  description?: string
  price: number
  originalPrice?: number
  status: 'on' | 'off'
  specs?: DishSpec[]
}

export interface DishQuery {
  page?: number
  pageSize?: number
  keyword?: string
  category?: string
  status?: string
  storeId?: string
}

export function getDishes(params: DishQuery) {
  return http.get('/merchant/dishes', { params })
}

export function getDish(id: number) {
  return http.get(`/merchant/dishes/${id}`)
}

export function createDish(storeId: string, data: DishData) {
  return http.post(`/merchant/stores/${storeId}/dishes`, data)
}

export function updateDish(id: number, data: DishData) {
  return http.put(`/merchant/dishes/${id}`, data)
}

export function deleteDish(id: number) {
  return http.delete(`/merchant/dishes/${id}`)
}

export function batchStatus(ids: number[], status: string) {
  return http.post('/merchant/dishes/batch-status', { ids, status })
}

export function getCategories() {
  return http.get('/dishes/categories')
}
