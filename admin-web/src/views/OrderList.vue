<template>
  <div class="page-container">
    <h2 class="page-header">订单管理</h2>

    <!-- Search Bar -->
    <div class="search-bar">
      <el-input
        v-model="query.keyword"
        placeholder="订单号/菜品名"
        clearable
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select
        v-model="query.status"
        placeholder="订单状态"
        clearable
        @change="loadData"
      >
        <el-option label="全部" value="" />
        <el-option label="待确认" value="pending" />
        <el-option label="已确认" value="confirmed" />
        <el-option label="制作中" value="cooking" />
        <el-option label="已完成" value="completed" />
        <el-option label="退款中" value="refunding" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="onDateChange"
      />
      <el-button type="primary" @click="loadData()">
        <el-icon><Search /></el-icon>
        搜索
      </el-button>
      <el-button
        :type="audioEnabled ? 'primary' : 'info'"
        @click="audioEnabled = !audioEnabled"
      >
        {{ audioEnabled ? '🔊 新单提醒' : '🔇 已静音' }}
      </el-button>
      <el-button
        v-if="selectedIds.length > 0"
        type="success"
        @click="handleBatchConfirm"
      >
        批量确认 ({{ selectedIds.length }})
      </el-button>
    </div>

    <!-- Table -->
    <el-card>
      <el-table
        :data="list"
        v-loading="loading"
        stripe
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column label="下单商品" min-width="200">
          <template #default="{ row }">
            <div v-for="item in (row.items || []).slice(0, 3)" :key="item.id" class="order-item-row">
              {{ item.dishName }}
              <template v-if="item.specName">({{ item.specName }})</template>
              x{{ item.quantity }}
            </div>
            <span v-if="row.items && row.items.length > 3" style="color: #909399">
              ...等{{ row.items.length }}件商品
            </span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">
            <span style="color: #e6a23c; font-weight: 600">¥{{ formatPrice(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="下单时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              type="primary"
              link
              size="small"
              @click="handleStatus(row.id, 'confirmed')"
            >
              确认
            </el-button>
            <el-button
              v-if="row.status === 'confirmed'"
              type="warning"
              link
              size="small"
              @click="handleStatus(row.id, 'cooking')"
            >
              开始制作
            </el-button>
            <el-button
              v-if="row.status === 'cooking'"
              type="success"
              link
              size="small"
              @click="handleStatus(row.id, 'completed')"
            >
              完成
            </el-button>
            <el-button
              v-if="row.status === 'refunding'"
              type="warning"
              link
              size="small"
              @click="openRefundDialog(row)"
            >
              处理退款
            </el-button>
            <el-button
              v-if="['pending', 'confirmed'].includes(row.status)"
              type="danger"
              link
              size="small"
              @click="handleStatus(row.id, 'cancelled')"
            >
              取消
            </el-button>
            <el-button type="info" link size="small" @click="viewDetail(row.id)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- Refund Dialog -->
    <el-dialog
      v-model="refundVisible"
      title="处理退款申请"
      width="450px"
    >
      <p>确认{{ refundApproved ? '同意' : '拒绝' }}该退款申请？</p>
      <el-input
        v-if="!refundApproved"
        v-model="refundReason"
        type="textarea"
        placeholder="请输入拒绝原因"
        style="margin-top: 12px"
      />
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmRefund(false)">拒绝退款</el-button>
        <el-button type="primary" @click="confirmRefund(true)">同意退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getOrders, updateOrderStatus, batchConfirm, approveRefund } from '@/api/orders'
import { useAppStore } from '@/stores/app'
import { useAudioAlert } from '@/composables/useAudioAlert'

const router = useRouter()
const appStore = useAppStore()
const { playBeep, enabled: audioEnabled } = useAudioAlert()

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const selectedIds = ref<number[]>([])
const dateRange = ref<string[]>([])
const refundVisible = ref(false)
const refundOrderId = ref(0)
const refundApproved = ref(false)
const refundReason = ref('')

let pollTimer: ReturnType<typeof setInterval> | null = null
let prevNewOrderCount = 0

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  startDate: '',
  endDate: '',
})

function formatPrice(price: number) {
  return (price / 100).toFixed(2)
}

function formatTime(time: string) {
  if (!time) return '--'
  return new Date(time).toLocaleString('zh-CN')
}

function statusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, string> = {
    pending: 'warning',
    confirmed: 'info',
    cooking: 'info',
    ready: '',
    delivered: '',
    completed: 'success',
    cancelled: 'info',
    refunding: 'danger',
    refunded: 'info',
  }
  return (map[status] || 'info') as '' | 'success' | 'warning' | 'info' | 'danger'
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    cooking: '制作中',
    ready: '待取餐',
    delivered: '已送达',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款',
  }
  return map[status] || status
}

function onSelectionChange(selection: any[]) {
  selectedIds.value = selection.map((s) => s.id)
}

function onDateChange(val: string[] | null) {
  if (val) {
    query.startDate = val[0]
    query.endDate = val[1]
  } else {
    query.startDate = ''
    query.endDate = ''
  }
  loadData()
}

function viewDetail(id: number) {
  router.push(`/orders/${id}`)
}

async function handleStatus(id: number, status: string) {
  try {
    await updateOrderStatus(id, status)
    ElMessage.success('操作成功')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function handleBatchConfirm() {
  try {
    await batchConfirm(appStore.currentStoreId || null, selectedIds.value)
    ElMessage.success('批量确认成功')
    selectedIds.value = []
    loadData()
  } catch {
    // handled by interceptor
  }
}

function openRefundDialog(row: any) {
  refundOrderId.value = row.id
  refundApproved.value = false
  refundReason.value = ''
  refundVisible.value = true
}

async function confirmRefund(approved: boolean) {
  try {
    await approveRefund(refundOrderId.value, {
      approved,
      reason: approved ? undefined : refundReason.value,
    })
    ElMessage.success(approved ? '已同意退款' : '已拒绝退款')
    refundVisible.value = false
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function loadData(silent = false) {
  if (!silent) loading.value = true
  try {
    const res: any = await getOrders({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      status: query.status || undefined,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined,
      storeId: appStore.currentStoreId || undefined,
    })
    list.value = res?.list || res?.items || []
    total.value = res?.total || res?.count || 0

    // Check for new orders (pending/paid status)
    if (silent) {
      const newCount = list.value.filter(
        (o: any) => o.status === 'pending' || o.status === 'paid',
      ).length
      if (newCount > prevNewOrderCount) {
        playBeep()
      }
      prevNewOrderCount = newCount
    } else {
      prevNewOrderCount = list.value.filter(
        (o: any) => o.status === 'pending' || o.status === 'paid',
      ).length
    }
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function startPolling() {
  pollTimer = setInterval(() => loadData(true), 15000)
}

onMounted(() => {
  loadData()
  startPolling()
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.order-item-row {
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
