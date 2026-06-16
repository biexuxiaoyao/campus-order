import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
})

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const tenantId = localStorage.getItem('tenantId')
    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId
    }
    return config
  },
  (error) => Promise.reject(error),
)

http.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code !== 0) {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res.data
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('tenantId')
        router.push('/login')
        ElMessage.error('登录已过期，请重新登录')
      } else if (status === 403) {
        ElMessage.error('没有操作权限')
      } else if (status === 500) {
        ElMessage.error('服务器错误')
      } else {
        ElMessage.error(error.response.data?.message || '请求失败')
      }
    } else {
      ElMessage.error('网络错误，请检查网络连接')
    }
    return Promise.reject(error)
  },
)

export default http
