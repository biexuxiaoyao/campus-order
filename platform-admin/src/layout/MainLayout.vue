<template>
  <el-container style="height:100vh">
    <el-aside width="240px" style="background:var(--p-sidebar);display:flex;flex-direction:column">
      <!-- Brand -->
      <div style="padding:20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;background:rgba(255,255,255,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px">🏛️</div>
        <div>
          <div style="color:#fff;font-size:15px;font-weight:700">campus-order</div>
          <div style="color:rgba(255,255,255,0.35);font-size:10px;text-transform:uppercase;letter-spacing:0.06em">Platform Admin</div>
        </div>
      </div>
      <!-- Nav -->
      <el-menu :default-active="activeMenu" router style="flex:1;border-right:none;padding:12px"
        background-color="transparent" text-color="rgba(255,255,255,0.55)" active-text-color="#fff">
        <el-menu-item index="/dashboard" style="border-radius:8px;margin-bottom:2px">
          <el-icon><DataAnalysis /></el-icon><span>平台大盘</span>
        </el-menu-item>
        <el-menu-item index="/tenants" style="border-radius:8px;margin-bottom:2px">
          <el-icon><Shop /></el-icon><span>商家管理</span>
        </el-menu-item>
        <el-menu-item index="/audit" style="border-radius:8px;margin-bottom:2px">
          <el-icon><List /></el-icon><span>操作日志</span>
        </el-menu-item>
        <el-menu-item index="/deliveries" style="border-radius:8px;margin-bottom:2px">
          <el-icon><Box /></el-icon><span>交付管理</span>
        </el-menu-item>
        <el-menu-item index="/correct" style="border-radius:8px;margin-bottom:2px">
          <el-icon><Tools /></el-icon><span>数据修正</span>
        </el-menu-item>
      </el-menu>
      <!-- Footer -->
      <div style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;background:var(--p-accent);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700">A</div>
        <div>
          <div style="color:rgba(255,255,255,0.7);font-size:13px">超级管理员</div>
          <div style="color:rgba(255,255,255,0.3);font-size:11px">Super Admin</div>
        </div>
      </div>
    </el-aside>
    <el-container>
      <el-header height="56px" style="background:#fff;border-bottom:1px solid var(--p-border);display:flex;align-items:center;justify-content:space-between;padding:0 24px">
        <span style="font-size:13px;color:var(--p-muted)">首页 / <strong style="color:var(--p-fg)">{{ $route.meta.title }}</strong></span>
        <span style="font-size:13px;color:var(--p-muted)">{{ new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}) }}</span>
        <el-button text style="color:var(--p-muted)" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon> 退出
        </el-button>
      </el-header>
      <el-main style="background:var(--p-bg);padding:24px">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)

async function handleLogout() {
  try { await ElMessageBox.confirm('确认退出登录？', '退出', { type: 'warning' }) } catch { return }
  localStorage.removeItem('p_token')
  localStorage.removeItem('p_tenantId')
  localStorage.removeItem('p_user')
  router.replace('/login')
}
</script>
