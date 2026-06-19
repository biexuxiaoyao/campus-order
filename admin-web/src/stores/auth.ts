import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, getUserInfo, type LoginParams, type UserInfo } from '@/api/auth'
import router from '@/router'
import { ElMessage } from 'element-plus'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '')
  const user = ref<UserInfo | null>(null)

  async function login(params: LoginParams) {
    try {
      const result = await loginApi(params)
      token.value = result.token
      user.value = result.user
      localStorage.setItem('token', result.token)
      localStorage.setItem('user', JSON.stringify(result.user))
      if (result.user.tenantId) {
        localStorage.setItem('tenantId', result.user.tenantId)
      }
      ElMessage.success('登录成功')
      router.push('/dashboard')
    } catch {
      // error handled by interceptor
    }
  }

  async function fetchUser() {
    try {
      const info = await getUserInfo()
      user.value = info
      localStorage.setItem('user', JSON.stringify(info))
    } catch {
      logout()
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('tenantId')
    router.push('/login')
  }

  return { token, user, login, fetchUser, logout }
})
