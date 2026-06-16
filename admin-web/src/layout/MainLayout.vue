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
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#07C160"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据面板</span>
        </el-menu-item>
        <el-menu-item index="/dishes">
          <el-icon><Food /></el-icon>
          <span>菜品管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Document /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/group-orders">
          <el-icon><UserFilled /></el-icon>
          <span>团购订单</span>
        </el-menu-item>
        <el-menu-item index="/kitchen">
          <el-icon><Monitor /></el-icon>
          <span>厨房模式</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>营业设置</span>
        </el-menu-item>
        <el-menu-item index="/staff">
          <el-icon><User /></el-icon>
          <span>员工管理</span>
        </el-menu-item>
        <el-menu-item index="/discounts">
          <el-icon><Discount /></el-icon>
          <span>优惠规则</span>
        </el-menu-item>
        <el-menu-item index="/points">
          <el-icon><Star /></el-icon>
          <span>积分管理</span>
        </el-menu-item>
        <el-menu-item index="/coupons">
          <el-icon><Ticket /></el-icon>
          <span>优惠券</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><List /></el-icon>
          <span>操作日志</span>
        </el-menu-item>
        <el-menu-item index="/brand">
          <el-icon><Shop /></el-icon>
          <span>品牌配置</span>
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
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const authStore = useAuthStore()
const appStore = useAppStore()

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)

const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/orders/')) return '/orders'
  return path
})

const currentTitle = computed(() => {
  return (route.meta.title as string) || ''
})

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
  background-color: #304156;
  overflow: hidden;
  transition: width 0.3s;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
  background: #f0f2f5;
  padding: 0;
  overflow-y: auto;
}
</style>
