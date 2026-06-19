import http from './index'

export interface StaffData {
  id?: number
  username: string
  password?: string
  role: string
  status?: 'active' | 'inactive'
}

export interface StaffQuery {
  page?: number
  pageSize?: number
  keyword?: string
}

export function getStaff(params?: StaffQuery) {
  return http.get('/merchant/staff', { params })
}

export function createStaff(data: StaffData) {
  return http.post('/merchant/staff', data)
}

export function updateStaff(id: number, data: Partial<StaffData>) {
  return http.put(`/merchant/staff/${id}`, data)
}

export function deleteStaff(id: number) {
  return http.delete(`/merchant/staff/${id}`)
}

export function resetPassword(id: number, password: string) {
  return http.post(`/merchant/staff/${id}/reset-password`, { password })
}
