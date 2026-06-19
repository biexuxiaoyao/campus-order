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
          meta: { title: '平台大盘', icon: 'DataAnalysis' },
        },
        {
          path: 'tenants',
          name: 'TenantList',
          component: () => import('@/views/TenantList.vue'),
          meta: { title: '商家管理', icon: 'Shop' },
        },
        {
          path: 'tenants/:id',
          name: 'TenantDetail',
          component: () => import('@/views/TenantDetail.vue'),
          meta: { title: '商家详情', hidden: true },
        },
        {
          path: 'audit',
          name: 'AuditLog',
          component: () => import('@/views/AuditLog.vue'),
          meta: { title: '操作日志', icon: 'List' },
        },
        {
          path: 'deliveries',
          name: 'DeliveryList',
          component: () => import('@/views/DeliveryList.vue'),
          meta: { title: '交付管理', icon: 'Box' },
        },
        {
          path: 'correct',
          name: 'DataCorrect',
          component: () => import('@/views/DataCorrect.vue'),
          meta: { title: '数据修正', icon: 'Tools' },
        },
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('p_token')
  if (to.meta.public) next()
  else if (!token) next('/login')
  else next()
})

export default router
