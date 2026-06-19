import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export interface MenuItem {
  route: string
  label: string
  module: string | null // null = base module (always present)
  roles?: string[]
}

export function useModules() {
  const authStore = useAuthStore()
  const modules = computed(() => authStore.user?.modules || [])
  const hasModule = (id: string) => modules.value.includes(id)

  const menuItems: MenuItem[] = [
    { route: '/dashboard', label: '数据面板', module: null },
    { route: '/dishes', label: '菜品管理', module: null, roles: ['admin', 'owner', 'manager'] },
    { route: '/orders', label: '订单管理', module: null, roles: ['admin', 'owner', 'manager', 'staff'] },
    { route: '/group-orders', label: '团购订单', module: 'group-meal', roles: ['admin', 'owner', 'manager', 'staff'] },
    { route: '/kitchen', label: '厨房模式', module: null },
    { route: '/settings', label: '营业设置', module: null, roles: ['admin', 'owner'] },
    { route: '/staff', label: '员工管理', module: null, roles: ['admin', 'owner'] },
    { route: '/discounts', label: '优惠规则', module: 'discount', roles: ['admin', 'owner', 'manager'] },
    { route: '/points', label: '积分管理', module: 'points', roles: ['admin', 'owner', 'manager'] },
    { route: '/coupons', label: '优惠券', module: 'coupon', roles: ['admin', 'owner', 'manager'] },
    { route: '/audit', label: '操作日志', module: null, roles: ['admin', 'owner', 'manager'] },
    { route: '/brand', label: '品牌配置', module: null, roles: ['admin', 'owner'] },
  ]

  function canViewMenuItem(item: MenuItem, userRole: string): boolean {
    // Module check: null means base module, no module restriction
    if (item.module !== null && !modules.value.includes(item.module)) {
      return false
    }
    // Role check
    if (item.roles && !item.roles.includes(userRole)) {
      return false
    }
    return true
  }

  return { modules, hasModule, menuItems, canViewMenuItem }
}
