<template>
  <div class="page-container">
    <h2 class="page-header">数据面板</h2>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stats-card">
        <span class="label">今日营业额</span>
        <span class="value">¥{{ formatMoney(stats.todayRevenue) }}</span>
        <span class="sub">较昨日 {{ stats.revenueChange >= 0 ? '+' : '' }}{{ stats.revenueChange }}%</span>
      </div>
      <div class="stats-card">
        <span class="label">今日订单数</span>
        <span class="value">{{ stats.todayOrders }}</span>
        <span class="sub">较昨日 {{ stats.orderChange >= 0 ? '+' : '' }}{{ stats.orderChange }}%</span>
      </div>
      <div class="stats-card">
        <span class="label">待处理订单</span>
        <span class="value" :style="{ color: stats.pendingOrders > 0 ? '#e6a23c' : '#303133' }">{{ stats.pendingOrders }}</span>
        <span class="sub">含{{ stats.pendingRefunds }}笔退款申请</span>
      </div>
      <div class="stats-card">
        <span class="label">本周营业额</span>
        <span class="value">¥{{ formatMoney(stats.weekRevenue) }}</span>
        <span class="sub">共 {{ stats.weekOrders }} 笔订单</span>
      </div>
    </div>

    <!-- Charts Row -->
    <el-row :gutter="20">
      <el-col :span="14">
        <el-card>
          <template #header>
            <span>近7天销售趋势</span>
          </template>
          <div class="chart-container">
            <div class="bar-chart">
              <div
                v-for="(item, idx) in chartData.dailySales"
                :key="idx"
                class="bar-col"
              >
                <div class="bar-label">{{ formatMoney(item.amount) }}</div>
                <div
                  class="bar-fill"
                  :style="{ height: barHeight(item.amount, chartData.maxAmount) + '%' }"
                />
                <div class="bar-date">{{ item.date }}</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>
            <span>热销菜品 TOP5</span>
          </template>
          <div class="top-list">
            <div
              v-for="(item, idx) in stats.topDishes"
              :key="idx"
              class="top-item"
            >
              <span class="rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
              <span class="dish-name">{{ item.name }}</span>
              <span class="dish-count">{{ item.count }}单</span>
            </div>
            <el-empty v-if="!stats.topDishes || stats.topDishes.length === 0" description="暂无数据" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { getOrders, getDashboard } from '@/api/orders'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const stats = reactive({
  todayRevenue: 0,
  todayOrders: 0,
  avgOrderValue: 0,
  todayRefund: 0,
  pendingOrders: 0,
  pendingRefunds: 0,
  weekRevenue: 0,
  weekOrders: 0,
  revenueChange: 0,
  orderChange: 0,
  topDishes: [] as { name: string; count: number }[],
})

const chartData = reactive({
  dailySales: [] as { date: string; amount: number }[],
  maxAmount: 0,
})

function formatMoney(val: number): string {
  return (val / 100).toFixed(2)
}

function barHeight(amount: number, max: number): number {
  if (max === 0) return 0
  return Math.round((amount / max) * 100)
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function getPastWeekDates(): { label: string; dateStr: string }[] {
  const result: { label: string; dateStr: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayOfWeek = d.getDay()
    result.push({ label: DAY_LABELS[dayOfWeek], dateStr })
  }
  return result
}

async function loadData() {
  try {
    const storeId = appStore.currentStoreId || ''

    // All dashboard data from server (today + week + yesterday + topDishes)
    const dash: any = await getDashboard(storeId)
    const data = dash?.data || dash || {}
    stats.todayRevenue = data.todayRevenue || 0
    stats.todayOrders = data.todayOrders || 0
    stats.avgOrderValue = data.avgOrderValue || 0
    stats.todayRefund = data.todayRefund || 0
    stats.pendingOrders = data.pendingOrders || 0
    stats.weekRevenue = data.weekRevenue || 0
    stats.weekOrders = data.weekOrders || 0
    stats.revenueChange = data.revenueChange || 0
    stats.orderChange = data.orderChange || 0
    stats.topDishes = (data.topDishes || []).map((d: any) => ({
      name: d.name,
      count: d.quantity || 0,
    }))

    // 7-day chart still uses per-day queries (or can be extended later)
    const weekDays = getPastWeekDates()
    const dailyAmounts: { date: string; amount: number }[] = []
    for (const day of weekDays) {
      const dayRes: any = await getOrders({ startDate: day.dateStr, endDate: day.dateStr, pageSize: 999, storeId })
      const dayOrders = dayRes?.list || dayRes?.items || []
      const dayTotal = dayOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
      dailyAmounts.push({ date: day.label, amount: dayTotal })
    }
    chartData.dailySales = dailyAmounts
    chartData.maxAmount = Math.max(...dailyAmounts.map((d) => d.amount), 1)
  } catch {
    chartData.dailySales = []
    chartData.maxAmount = 0
    stats.topDishes = []
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.chart-container {
  height: 280px;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 100%;
  padding: 0 20px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  height: 100%;
  justify-content: flex-end;
}

.bar-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.bar-fill {
  width: 40px;
  background: linear-gradient(180deg, #07C160, #39d47c);
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.5s ease;
}

.bar-date {
  font-size: 12px;
  color: #606266;
  margin-top: 8px;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border-radius: 6px;
}

.rank {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: #909399;
}

.rank-1 {
  background: #f56c6c;
}

.rank-2 {
  background: #e6a23c;
}

.rank-3 {
  background: #67c23a;
}

.dish-name {
  flex: 1;
  font-size: 14px;
  color: #303133;
}

.dish-count {
  font-size: 13px;
  color: #909399;
}
</style>
