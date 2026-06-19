import http from './index'

export interface OrderQuery {
  page?: number
  pageSize?: number
  status?: string
  startDate?: string
  endDate?: string
  keyword?: string
  storeId?: string
}

export interface RefundApproval {
  approved: boolean
  reason?: string
}

export function getOrders(params: OrderQuery) {
  return http.get('/merchant/orders', { params })
}

export function getOrder(id: number) {
  return http.get(`/merchant/orders/${id}`)
}

export function updateOrderStatus(id: number, status: string) {
  return http.put(`/merchant/orders/${id}/status`, { status })
}

export function approveRefund(id: number, data: RefundApproval) {
  return http.post(`/merchant/orders/${id}/refund/approve`, data)
}

export function batchConfirm(storeId: string | null, orderIds: (string | number)[]) {
  return http.post('/merchant/orders/batch-confirm', { storeId, orderIds: orderIds.map(String) })
}
