import http from './index'

export interface OrderQuery {
  page?: number
  pageSize?: number
  status?: string
  startDate?: string
  endDate?: string
  keyword?: string
}

export interface RefundApproval {
  approved: boolean
  reason?: string
}

export function getOrders(params: OrderQuery) {
  return http.get('/orders', { params })
}

export function getOrder(id: number) {
  return http.get(`/orders/${id}`)
}

export function updateOrderStatus(id: number, status: string) {
  return http.put(`/orders/${id}/status`, { status })
}

export function approveRefund(id: number, data: RefundApproval) {
  return http.post(`/orders/${id}/refund`, data)
}

export function batchConfirm(ids: number[]) {
  return http.put('/orders/batch-confirm', { ids })
}
