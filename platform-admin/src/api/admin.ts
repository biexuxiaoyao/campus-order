import axios from 'axios'

const api = axios.create({ baseURL: '/api/admin' })

// 请求拦截器：添加 token + tenant header
api.interceptors.request.use(config => {
  const token = localStorage.getItem('p_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenantId = localStorage.getItem('p_tenantId')
  if (tenantId) config.headers['x-tenant-id'] = tenantId
  return config
})

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('p_token')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  }
)

export function login(username: string, password: string) {
  return api.post('/login', { username, password })
}

export function getDashboard() {
  return api.get('/dashboard')
}

export function getTenants(params: any) {
  return api.get('/tenants', { params })
}

export function createTenant(data: any) {
  return api.post('/tenants', data)
}

export function getTenantDetail(id: string) {
  return api.get(`/tenants/${id}`)
}

export function updateTenant(id: string, data: any) {
  return api.put(`/tenants/${id}`, data)
}

export function reviewTenant(id: string, approved: boolean, reason?: string) {
  return api.post(`/tenants/${id}/review`, { approved, reason })
}

export function assignModules(id: string, moduleIds: string[]) {
  return api.put(`/tenants/${id}/modules`, { moduleIds })
}

export function updateLicense(id: string, action: 'issue' | 'revoke') {
  return api.put(`/tenants/${id}/license`, { action })
}

export function deleteTenant(id: string) {
  return api.delete(`/tenants/${id}`)
}

export function getVersions() {
  return api.get('/versions')
}

export function createDelivery(data: any) {
  return api.post('/versions', data)
}

export function updateTenantDocuments(id: string, data: any) {
  return api.put(`/tenants/${id}/documents`, data)
}

export function getModulePurchases(id: string) {
  return api.get(`/tenants/${id}/purchases`)
}

export function getSourceQuote(id: string) {
  return api.post(`/tenants/${id}/source-quote`)
}

export function executeSourceDelivery(id: string) {
  return api.post(`/tenants/${id}/source-delivery`)
}

export function getSourceDeliveries(id: string) {
  return api.get(`/tenants/${id}/source-deliveries`)
}

// Audit logs use a different base (not /api/admin)
const auditApi = axios.create({ baseURL: '/api/merchant' })
auditApi.interceptors.request.use(config => {
  const token = localStorage.getItem('p_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const tenantId = localStorage.getItem('p_tenantId')
  if (tenantId) config.headers['x-tenant-id'] = tenantId
  return config
})

export function getAuditLogs(params: any) {
  return auditApi.get('/audit-logs', { params })
}
