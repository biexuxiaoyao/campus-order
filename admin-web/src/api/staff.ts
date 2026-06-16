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
  return http.get('/staff', { params })
}

export function createStaff(data: StaffData) {
  return http.post('/staff', data)
}

export function updateStaff(id: number, data: Partial<StaffData>) {
  return http.put(`/staff/${id}`, data)
}

export function deleteStaff(id: number) {
  return http.delete(`/staff/${id}`)
}

export function resetPassword(id: number, password: string) {
  return http.put(`/staff/${id}/reset-password`, { password })
}
