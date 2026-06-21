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

// ========== Kitchen endpoints ==========

export function getKitchenOrders(storeId: string) {
  return http.get('/merchant/kitchen/orders', { params: { storeId } })
}

export function batchStartCooking(storeId: string, orderIds: string[]) {
  return http.post('/merchant/kitchen/batch-start', { storeId, orderIds })
}

export function batchMarkReady(storeId: string, orderIds: string[]) {
  return http.post('/merchant/kitchen/batch-ready', { storeId, orderIds })
}

export function batchPickup(storeId: string, orderIds: string[]) {
  return http.post('/merchant/kitchen/batch-pickup', { storeId, orderIds })
}

// ========== Dashboard & Reconciliation ==========

export function getDashboard(storeId: string) {
  return http.get('/merchant/dashboard', { params: { storeId } })
}

export function getReconciliation(storeId: string, date: string) {
  return http.get('/merchant/reconciliation', { params: { storeId, date } })
}
