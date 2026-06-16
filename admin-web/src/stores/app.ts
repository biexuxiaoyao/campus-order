import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const tenantName = ref(localStorage.getItem('tenantName') || '商家管理后台')
  const tenantId = ref(localStorage.getItem('tenantId') || '')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setTenantInfo(name: string, id: string) {
    tenantName.value = name
    tenantId.value = id
    localStorage.setItem('tenantName', name)
    localStorage.setItem('tenantId', id)
  }

  return { sidebarCollapsed, tenantName, tenantId, toggleSidebar, setTenantInfo }
})
