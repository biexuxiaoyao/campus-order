import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layout/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/Dashboard.vue'),
          meta: { title: '数据面板', icon: 'DataAnalysis' },
        },
        {
          path: 'dishes',
          name: 'DishList',
          component: () => import('@/views/DishList.vue'),
          meta: { title: '菜品管理', icon: 'Food' },
        },
        {
          path: 'orders',
          name: 'OrderList',
          component: () => import('@/views/OrderList.vue'),
          meta: { title: '订单管理', icon: 'Document' },
        },
        {
          path: 'orders/:id',
          name: 'OrderDetail',
          component: () => import('@/views/OrderDetail.vue'),
          meta: { title: '订单详情', hidden: true },
        },
        {
          path: 'group-orders',
          name: 'GroupOrderList',
          component: () => import('@/views/GroupOrderList.vue'),
          meta: { title: '团购订单', icon: 'UserFilled' },
        },
        {
          path: 'kitchen',
          name: 'KitchenMode',
          component: () => import('@/views/KitchenMode.vue'),
          meta: { title: '厨房模式', icon: 'Monitor' },
        },
        {
          path: 'settings',
          name: 'SettingsPage',
          component: () => import('@/views/SettingsPage.vue'),
          meta: { title: '营业设置', icon: 'Setting' },
        },
        {
          path: 'staff',
          name: 'StaffList',
          component: () => import('@/views/StaffList.vue'),
          meta: { title: '员工管理', icon: 'User' },
        },
        {
          path: 'discounts',
          name: 'DiscountList',
          component: () => import('@/views/DiscountList.vue'),
          meta: { title: '优惠规则', icon: 'Discount' },
        },
        {
          path: 'points',
          name: 'PointsConfig',
          component: () => import('@/views/PointsConfig.vue'),
          meta: { title: '积分管理', icon: 'Star' },
        },
        {
          path: 'coupons',
          name: 'CouponList',
          component: () => import('@/views/CouponList.vue'),
          meta: { title: '优惠券', icon: 'Ticket' },
        },
        {
          path: 'audit',
          name: 'AuditLog',
          component: () => import('@/views/AuditLog.vue'),
          meta: { title: '操作日志', icon: 'List' },
        },
        {
          path: 'brand',
          name: 'BrandConfig',
          component: () => import('@/views/BrandConfig.vue'),
          meta: { title: '品牌配置', icon: 'Shop' },
        },
      ],
    },
  ],
})

// Module-to-route mapping for access control
const routeModuleMap: Record<string, string> = {
  '/group-orders': 'group-meal',
  '/discounts': 'discount',
  '/points': 'points',
  '/coupons': 'coupon',
}

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) {
    next()
  } else if (!token) {
    next('/login')
  } else {
    // Module-based access check
    const requiredModule = routeModuleMap[to.path]
    if (requiredModule) {
      try {
        const userStr = localStorage.getItem('user')
        if (userStr) {
          const user = JSON.parse(userStr)
          const modules: string[] = user.modules || []
          if (!modules.includes(requiredModule)) {
            next('/dashboard')
            return
          }
        }
      } catch {
        // If user data isn't available, allow navigation (sidebar will filter)
      }
    }
    next()
  }
})

export default router
