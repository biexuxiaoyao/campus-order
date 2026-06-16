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
}

export function getDishes(params: DishQuery) {
  return http.get('/dishes', { params })
}

export function getDish(id: number) {
  return http.get(`/dishes/${id}`)
}

export function createDish(data: DishData) {
  return http.post('/dishes', data)
}

export function updateDish(id: number, data: DishData) {
  return http.put(`/dishes/${id}`, data)
}

export function deleteDish(id: number) {
  return http.delete(`/dishes/${id}`)
}

export function batchStatus(ids: number[], status: string) {
  return http.put('/dishes/batch-status', { ids, status })
}

export function getCategories() {
  return http.get('/dishes/categories')
}
