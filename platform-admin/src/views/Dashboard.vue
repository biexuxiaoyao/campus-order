<template>
  <div>
    <el-row :gutter="16" style="margin-bottom:20px">
      <el-col :span="6" v-for="card in stats" :key="card.label">
        <div class="stat-card">
          <div class="stat-icon" :style="{ color: card.color, background: card.bg }">
            <el-icon :size="24"><component :is="card.icon" /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-label">{{ card.label }}</div>
            <div class="stat-value">{{ card.value }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="panel">
      <div class="panel-header">
        <span style="font-weight:600;font-size:15px;color:var(--p-fg)">营收 TOP10 商家</span>
        <el-button text type="primary" @click="fetchDashboard" :loading="loading">刷新</el-button>
      </div>
      <el-table :data="topTenants" stripe style="width:100%" v-loading="loading">
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="name" label="商家名称" min-width="160" />
        <el-table-column prop="appId" label="AppID" width="200" />
        <el-table-column label="营收" width="140" sortable>
          <template #default="{ row }">¥{{ Math.round((row.revenue || 0) / 100).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="订单数" width="100" sortable>
          <template #default="{ row }">{{ (row.orderCount || row.totalOrders || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '运营中' : '已过期' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !topTenants.length" description="暂无数据" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Shop, Promotion, List, Coin } from '@element-plus/icons-vue'
import { getDashboard } from '@/api/admin'

const loading = ref(false)

const stats = ref([
  { label: '入驻商家总数', value: '--', icon: Shop, color: '#4a90d9', bg: '#e0edf8' },
  { label: '活跃商家数', value: '--', icon: Promotion, color: '#10b981', bg: '#d1fae5' },
  { label: '今日订单数', value: '--', icon: List, color: '#f59e0b', bg: '#fef3c7' },
  { label: '今日 GMV', value: '--', icon: Coin, color: '#8b5cf6', bg: '#ede9fe' },
])

const topTenants = ref<any[]>([])

async function fetchDashboard() {
  loading.value = true
  try {
    const res: any = await getDashboard()
    const data = res.data || res
    if (data) {
      const tenants = data.tenants || data
      stats.value[0].value = (tenants.total ?? data.totalTenants ?? '--').toLocaleString()
      stats.value[1].value = (tenants.active ?? data.activeTenants ?? '--').toLocaleString()
      stats.value[2].value = (data.todayOrders ?? '--').toLocaleString()
      const rev = data.todayRevenue ?? 0
      stats.value[3].value = '¥' + (typeof rev === 'number' ? Math.round(rev / 100).toLocaleString() : rev)
      topTenants.value = data.topTenants || []
    }
  } catch {
    // 静默失败，显示 "--"
  } finally {
    loading.value = false
  }
}

onMounted(fetchDashboard)
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.stat-icon {
  width: 48px; height: 48px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.stat-label { font-size: 13px; color: var(--p-muted); margin-bottom: 4px }
.stat-value { font-size: 22px; font-weight: 700; color: var(--p-fg) }
.panel {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid var(--p-border);
}
</style>
