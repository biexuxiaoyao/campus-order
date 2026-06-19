import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  const user = ref<any>(null)
  const token = ref(localStorage.getItem('p_token') || '')

  const isLoggedIn = computed(() => !!token.value)
  const userName = computed(() => user.value?.name || '超级管理员')

  function setAuth(t: string, u: any) {
    token.value = t
    user.value = u
    localStorage.setItem('p_token', t)
    if (u) localStorage.setItem('p_user', JSON.stringify(u))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('p_token')
    localStorage.removeItem('p_user')
  }

  // Restore user from localStorage
  const savedUser = localStorage.getItem('p_user')
  if (savedUser) {
    try { user.value = JSON.parse(savedUser) } catch { /* ignore */ }
  }

  return { user, token, isLoggedIn, userName, setAuth, logout }
})
