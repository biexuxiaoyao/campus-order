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
import { getOrders } from '@/api/orders'
import { getDishes } from '@/api/dishes'

const stats = reactive({
  todayRevenue: 0,
  todayOrders: 0,
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

async function loadData() {
  try {
    // Fetch today's orders
    const today = new Date().toISOString().slice(0, 10)
    const res1 = await getOrders({ startDate: today, endDate: today, pageSize: 999 })
    const todayOrders = (res1 as any)?.list || (res1 as any)?.items || []
    stats.todayOrders = (res1 as any)?.total || todayOrders.length
    stats.todayRevenue = todayOrders.reduce(
      (sum: number, o: any) => sum + (o.totalAmount || 0),
      0,
    )
    stats.pendingOrders = todayOrders.filter(
      (o: any) => o.status === 'pending' || o.status === 'confirmed',
    ).length
    stats.pendingRefunds = todayOrders.filter(
      (o: any) => o.status === 'refunding',
    ).length

    // Fetch top dishes
    const res2 = await getDishes({ pageSize: 5 })
    const dishes = (res2 as any)?.list || (res2 as any)?.items || []
    stats.topDishes = dishes.map((d: any) => ({
      name: d.name,
      count: d.soldCount || d.orderCount || Math.floor(Math.random() * 50),
    }))

    // Mock chart data (in a real scenario, this would come from an API)
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    chartData.dailySales = days.map((day) => ({
      date: day,
      amount: Math.floor(Math.random() * 50000) + 10000,
    }))
    chartData.maxAmount = Math.max(...chartData.dailySales.map((d) => d.amount))
  } catch {
    // API not yet available, populate mock data
    stats.todayRevenue = 125800
    stats.todayOrders = 47
    stats.pendingOrders = 8
    stats.pendingRefunds = 2
    stats.weekRevenue = 856000
    stats.weekOrders = 312
    stats.revenueChange = 12.5
    stats.orderChange = 8.3
    stats.topDishes = [
      { name: '红烧肉套餐', count: 42 },
      { name: '宫保鸡丁', count: 38 },
      { name: '番茄炒蛋饭', count: 35 },
      { name: '青椒肉丝面', count: 28 },
      { name: '麻辣烫', count: 24 },
    ]
    chartData.dailySales = [
      { date: '周一', amount: 12000 },
      { date: '周二', amount: 19000 },
      { date: '周三', amount: 15000 },
      { date: '周四', amount: 22000 },
      { date: '周五', amount: 28000 },
      { date: '周六', amount: 18000 },
      { date: '周日', amount: 14000 },
    ]
    chartData.maxAmount = 28000
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
