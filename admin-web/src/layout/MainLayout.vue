<template>
  <el-container class="layout-container">
    <el-aside :width="sidebarCollapsed ? '64px' : '220px'" class="layout-aside">
      <div class="logo">
        <span v-if="!sidebarCollapsed">{{ appStore.tenantName }}</span>
        <span v-else class="logo-small">餐</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="sidebarCollapsed"
        router
        class="sidebar-menu"
        background-color="#fafafa"
        text-color="#6b7280"
        active-text-color="#ff6b35"
      >
        <el-menu-item
          v-for="item in visibleMenuItems"
          :key="item.route"
          :index="item.route"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon
            class="collapse-btn"
            :size="20"
            @click="appStore.toggleSidebar()"
          >
            <Fold v-if="!sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <span class="tenant-tag">{{ appStore.tenantName }}</span>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              {{ authStore.user?.username || '管理员' }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useModules } from '@/composables/useModules'
import {
  DataAnalysis,
  Food,
  Document,
  UserFilled,
  Monitor,
  Setting,
  User,
  Discount,
  Star,
  Ticket,
  List,
  Shop,
} from '@element-plus/icons-vue'

const route = useRoute()
const authStore = useAuthStore()
const appStore = useAppStore()
const { menuItems, canViewMenuItem } = useModules()

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)

const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/orders/')) return '/orders'
  return path
})

const currentTitle = computed(() => {
  return (route.meta.title as string) || ''
})

// Icon mapping
const iconMap: Record<string, any> = {
  '/dashboard': markRaw(DataAnalysis),
  '/dishes': markRaw(Food),
  '/orders': markRaw(Document),
  '/group-orders': markRaw(UserFilled),
  '/kitchen': markRaw(Monitor),
  '/settings': markRaw(Setting),
  '/staff': markRaw(User),
  '/discounts': markRaw(Discount),
  '/points': markRaw(Star),
  '/coupons': markRaw(Ticket),
  '/audit': markRaw(List),
  '/brand': markRaw(Shop),
}

const userRole = computed(() => authStore.user?.role || 'staff')

const visibleMenuItems = computed(() =>
  menuItems
    .filter((item) => canViewMenuItem(item, userRole.value))
    .map((item) => ({ ...item, icon: iconMap[item.route] })),
)

function handleCommand(command: string) {
  if (command === 'logout') {
    authStore.logout()
  }
}

onMounted(() => {
  if (!authStore.user) {
    authStore.fetchUser()
  }
})
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.layout-aside {
  background: #fafafa;
  border-right: 1px solid #f0f0f0;
  overflow: hidden;
  transition: width 0.3s;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
  border-bottom: 1px solid #f0f0f0;
  overflow: hidden;
  white-space: nowrap;
}

.logo-small {
  font-size: 24px;
}

.sidebar-menu {
  border-right: none !important;
}

.layout-header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn {
  cursor: pointer;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.tenant-tag {
  font-size: 13px;
  color: #909399;
  padding: 4px 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.user-info {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.layout-main {
  background: #f5f5f5;
  padding: 0;
  overflow-y: auto;
}
</style>
