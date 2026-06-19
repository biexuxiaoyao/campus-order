import http from './index'

export interface StoreInfo {
  id: number | string
  name: string
  address?: string
  phone?: string
  status?: string
}

export function getStores(): Promise<StoreInfo[]> {
  return http.get('/merchant/stores')
}
