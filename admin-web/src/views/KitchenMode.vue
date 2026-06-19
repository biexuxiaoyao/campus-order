<template>
  <div class="kitchen-mode">
    <div class="kitchen-header">
      <h1>厨房显示</h1>
      <div class="stats">
        <span>待处理: {{ pendingCount }}</span>
        <span style="margin-left: 20px">制作中: {{ cookingCount }}</span>
        <span style="margin-left: 20px; color: #a0a0b0">刷新 {{ countdown }}s</span>
        <el-button
          :type="audioEnabled ? 'primary' : 'info'"
          size="small"
          style="margin-left: 16px"
          @click="audioEnabled = !audioEnabled"
        >
          {{ audioEnabled ? '🔊' : '🔇' }}
        </el-button>
      </div>
    </div>

    <!-- Pending Orders Grid -->
    <div v-if="pendingOrders.length > 0">
      <h2 style="color: #e94560; margin-bottom: 12px">待处理 ({{ pendingOrders.length }})</h2>
      <div class="kitchen-grid">
        <div
          v-for="order in pendingOrders"
          :key="order.id"
          class="kitchen-card"
          @click="handleStart(order)"
        >
          <div class="order-no">#{{ order.orderNo }}</div>
          <div class="items">
            <div v-for="item in order.items" :key="item.id">
              <strong>{{ item.dishName }}</strong>
              <template v-if="item.specName">({{ item.specName }})</template>
              <span style="color: #e94560"> x{{ item.quantity }}</span>
            </div>
          </div>
          <div v-if="order.remark" style="color: #f0a040; margin-top: 8px; font-size: 14px">
            备注: {{ order.remark }}
          </div>
          <div
            v-if="order.tags?.urgeCount > 0"
            style="
              background: #ff4d4f;
              color: #fff;
              border-radius: 20px;
              padding: 2px 10px;
              font-size: 13px;
              font-weight: 700;
              margin-top: 8px;
              display: inline-block;
            "
          >
            🔔 催单 ×{{ order.tags.urgeCount }}
          </div>
          <div class="time-badge">
            {{ formatElapsed(order.createdAt) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Cooking Orders Grid -->
    <div v-if="cookingOrders.length > 0" style="margin-top: 30px">
      <h2 style="color: #f0a040; margin-bottom: 12px">制作中 ({{ cookingOrders.length }})</h2>
      <div class="kitchen-grid">
        <div
          v-for="order in cookingOrders"
          :key="order.id"
          class="kitchen-card"
          style="border-color: #f0a040"
          @click="handleComplete(order)"
        >
          <div class="order-no">#{{ order.orderNo }}</div>
          <div class="items">
            <div v-for="item in order.items" :key="item.id">
              <strong>{{ item.dishName }}</strong>
              <template v-if="item.specName">({{ item.specName }})</template>
              <span style="color: #e94560"> x{{ item.quantity }}</span>
            </div>
          </div>
          <div class="time-badge" style="background: #f0a040">
            制作中...
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="pendingOrders.length === 0 && cookingOrders.length === 0"
      style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 60vh;
        font-size: 24px;
        color: #606266;
      "
    >
      暂无订单，休息一下
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getOrders, updateOrderStatus } from '@/api/orders'
import { useAppStore } from '@/stores/app'
import { useAudioAlert } from '@/composables/useAudioAlert'

const appStore = useAppStore()
const { playBeep, enabled: audioEnabled } = useAudioAlert()

const pendingOrders = ref<any[]>([])
const cookingOrders = ref<any[]>([])
const countdown = ref(5)
let timer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

const pendingCount = ref(0)
const cookingCount = ref(0)
let prevPendingCount = 0
let prevCookingCount = 0

function formatElapsed(time: string): string {
  if (!time) return ''
  const elapsed = Math.floor((Date.now() - new Date(time).getTime()) / 60000)
  if (elapsed < 1) return '刚刚'
  if (elapsed < 60) return `${elapsed}分钟前`
  return `${Math.floor(elapsed / 60)}小时前`
}

async function fetchOrders() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const res: any = await getOrders({
      startDate: today,
      endDate: today,
      pageSize: 999,
      storeId: appStore.currentStoreId || undefined,
    })
    const allOrders = res?.list || res?.items || []

    // Sort urged orders to the top
    const sortByUrge = (a: any, b: any) => {
      const urgeA = a.tags?.urgeCount || 0
      const urgeB = b.tags?.urgeCount || 0
      if (urgeB !== urgeA) return urgeB - urgeA
      // Fallback: sort by createdAt ascending (oldest first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }

    pendingOrders.value = allOrders
      .filter((o: any) => o.status === 'pending' || o.status === 'confirmed')
      .sort(sortByUrge)
    cookingOrders.value = allOrders
      .filter((o: any) => o.status === 'cooking')
      .sort(sortByUrge)
    pendingCount.value = pendingOrders.value.length
    cookingCount.value = cookingOrders.value.length

    // Play audio alert if new orders appeared
    if (
      pendingCount.value > prevPendingCount ||
      cookingCount.value > prevCookingCount
    ) {
      playBeep()
    }
    prevPendingCount = pendingCount.value
    prevCookingCount = cookingCount.value
  } catch {
    // Show demo data
    pendingOrders.value = []
    cookingOrders.value = []
    pendingCount.value = 0
    cookingCount.value = 0
  }
}

async function handleStart(order: any) {
  try {
    await updateOrderStatus(order.id, 'cooking')
    ElMessage.success('开始制作 ' + order.orderNo)
    fetchOrders()
  } catch {
    // handled by interceptor
  }
}

async function handleComplete(order: any) {
  try {
    await updateOrderStatus(order.id, 'completed')
    ElMessage.success('已完成 ' + order.orderNo)
    fetchOrders()
  } catch {
    // handled by interceptor
  }
}

function startAutoRefresh() {
  timer = setInterval(() => {
    fetchOrders()
    countdown.value = 5
  }, 5000)
  countdownTimer = setInterval(() => {
    countdown.value = countdown.value > 1 ? countdown.value - 1 : 5
  }, 1000)
}

onMounted(() => {
  fetchOrders()
  startAutoRefresh()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
