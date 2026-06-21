<template>
  <div class="kitchen-mode">
    <div class="kitchen-header">
      <h1>厨房显示</h1>
      <div class="stats">
        <span>待处理: {{ pendingCount }}</span>
        <span style="margin-left: 20px">制作中: {{ cookingCount }}</span>
        <span style="margin-left: 20px; color: #07c160">待取餐: {{ readyCount }}</span>
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
          @click="handleReady(order)"
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

    <!-- Ready Orders Grid -->
    <div v-if="readyOrders.length > 0" style="margin-top: 30px">
      <h2 style="color: #07c160; margin-bottom: 12px">待取餐 ({{ readyOrders.length }})</h2>
      <div class="kitchen-grid">
        <div
          v-for="order in readyOrders"
          :key="order.id"
          class="kitchen-card"
          style="border-color: #07c160"
          @click="handlePickup(order)"
        >
          <div class="order-no">#{{ order.orderNo }}</div>
          <div class="items">
            <div v-for="item in order.items" :key="item.id">
              <strong>{{ item.dishName }}</strong>
              <template v-if="item.specName">({{ item.specName }})</template>
              <span style="color: #e94560"> x{{ item.quantity }}</span>
            </div>
          </div>
          <div class="time-badge" style="background: #07c160">
            待取餐
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="pendingOrders.length === 0 && cookingOrders.length === 0 && readyOrders.length === 0"
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
import { getKitchenOrders, batchStartCooking, batchMarkReady, batchPickup } from '@/api/orders'
import { useAppStore } from '@/stores/app'
import { useAudioAlert } from '@/composables/useAudioAlert'

const appStore = useAppStore()
const { playBeep, enabled: audioEnabled } = useAudioAlert()

const pendingOrders = ref<any[]>([])
const cookingOrders = ref<any[]>([])
const readyOrders = ref<any[]>([])
const countdown = ref(5)
let timer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

const pendingCount = ref(0)
const cookingCount = ref(0)
const readyCount = ref(0)
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
  try {
    const storeId = appStore.currentStoreId || ''
    const res: any = await getKitchenOrders(storeId)
    const data = res?.data || res || {}

    pendingOrders.value = data.pending || []
    cookingOrders.value = data.cooking || []
    readyOrders.value = data.ready || []
    pendingCount.value = data.pendingCount || 0
    cookingCount.value = data.cookingCount || 0
    readyCount.value = data.readyCount || 0

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
    pendingOrders.value = []
    cookingOrders.value = []
    readyOrders.value = []
    pendingCount.value = 0
    cookingCount.value = 0
    readyCount.value = 0
  }
}

async function handleStart(order: any) {
  try {
    const storeId = appStore.currentStoreId || ''
    await batchStartCooking(storeId, [String(order.id)])
    ElMessage.success('开始制作 ' + order.orderNo)
    fetchOrders()
  } catch {
    // handled by interceptor
  }
}

async function handleReady(order: any) {
  try {
    const storeId = appStore.currentStoreId || ''
    await batchMarkReady(storeId, [String(order.id)])
    ElMessage.success('已出餐 ' + order.orderNo)
    fetchOrders()
  } catch {
    // handled by interceptor
  }
}

async function handlePickup(order: any) {
  try {
    const storeId = appStore.currentStoreId || ''
    await batchPickup(storeId, [String(order.id)])
    ElMessage.success('已取餐 ' + order.orderNo)
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
