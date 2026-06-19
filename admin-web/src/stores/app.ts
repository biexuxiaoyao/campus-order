import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStores } from '@/api/stores'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const tenantName = ref(localStorage.getItem('tenantName') || '商家管理后台')
  const tenantId = ref(localStorage.getItem('tenantId') || '')
  const currentStoreId = ref<string>(localStorage.getItem('currentStoreId') || '')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setTenantInfo(name: string, id: string) {
    tenantName.value = name
    tenantId.value = id
    localStorage.setItem('tenantName', name)
    localStorage.setItem('tenantId', id)
  }

  async function fetchStoreId() {
    if (currentStoreId.value) return currentStoreId.value
    try {
      const stores = await getStores()
      if (stores && stores.length > 0) {
        currentStoreId.value = String(stores[0].id)
        localStorage.setItem('currentStoreId', currentStoreId.value)
      }
    } catch {
      // Non-blocking: components fall back to empty string
    }
    return currentStoreId.value
  }

  return { sidebarCollapsed, tenantName, tenantId, currentStoreId, toggleSidebar, setTenantInfo, fetchStoreId }
})
