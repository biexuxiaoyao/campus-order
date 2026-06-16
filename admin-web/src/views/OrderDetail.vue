<template>
  <div class="page-container">
    <div class="detail-header">
      <el-button @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2>订单详情 #{{ order.orderNo }}</h2>
    </div>

    <el-row :gutter="20">
      <el-col :span="16">
        <!-- Order Info -->
        <el-card class="mb-20">
          <template #header>
            <span>订单信息</span>
            <el-tag
              :type="statusType(order.status)"
              style="margin-left: 12px"
            >
              {{ statusText(order.status) }}
            </el-tag>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="订单编号">{{ order.orderNo }}</el-descriptions-item>
            <el-descriptions-item label="下单时间">{{ formatTime(order.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="订单金额">
              <span style="color: #e6a23c; font-weight: 600">¥{{ formatPrice(order.totalAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="备注">{{ order.remark || '无' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- Items -->
        <el-card class="mb-20">
          <template #header>
            <span>商品明细</span>
          </template>
          <el-table :data="order.items || []" stripe>
            <el-table-column prop="dishName" label="商品名称" min-width="160" />
            <el-table-column prop="specName" label="规格" width="120">
              <template #default="{ row }">
                {{ row.specName || '--' }}
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column label="单价" width="100">
              <template #default="{ row }">
                ¥{{ formatPrice(row.price) }}
              </template>
            </el-table-column>
            <el-table-column label="小计" width="100">
              <template #default="{ row }">
                <span style="color: #e6a23c">¥{{ formatPrice(row.price * row.quantity) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- Timeline -->
        <el-card>
          <template #header>
            <span>订单动态</span>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="(log, idx) in order.timeline"
              :key="idx"
              :timestamp="log.time"
              :color="idx === 0 ? '#07C160' : undefined"
            >
              {{ log.content }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
      <el-col :span="8">
        <!-- Payment Info -->
        <el-card class="mb-20">
          <template #header>
            <span>支付信息</span>
          </template>
          <el-descriptions :column="1">
            <el-descriptions-item label="支付方式">微信支付</el-descriptions-item>
            <el-descriptions-item label="支付状态">
              <el-tag type="success">已支付</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="支付金额">
              ¥{{ formatPrice(order.totalAmount) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- Refund Info -->
        <el-card v-if="order.refundInfo">
          <template #header>
            <span>退款信息</span>
          </template>
          <el-descriptions :column="1">
            <el-descriptions-item label="退款原因">{{ order.refundInfo.reason }}</el-descriptions-item>
            <el-descriptions-item label="退款金额">¥{{ formatPrice(order.refundInfo.amount) }}</el-descriptions-item>
            <el-descriptions-item label="退款状态">
              <el-tag
                :type="order.refundInfo.status === 'approved' ? 'success' : 'warning'"
              >
                {{ order.refundInfo.status === 'approved' ? '已退款' : '处理中' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <!-- Actions -->
        <el-card>
          <template #header>
            <span>操作</span>
          </template>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <el-button
              v-if="order.status === 'pending'"
              type="primary"
              @click="updateStatus('confirmed')"
            >
              确认订单
            </el-button>
            <el-button
              v-if="order.status === 'confirmed'"
              type="warning"
              @click="updateStatus('cooking')"
            >
              开始制作
            </el-button>
            <el-button
              v-if="order.status === 'cooking'"
              type="success"
              @click="updateStatus('completed')"
            >
              完成订单
            </el-button>
            <el-button
              v-if="['pending', 'confirmed'].includes(order.status)"
              type="danger"
              @click="updateStatus('cancelled')"
            >
              取消订单
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getOrder, updateOrderStatus } from '@/api/orders'

const route = useRoute()
const id = Number(route.params.id)

const order = reactive<any>({
  id: 0,
  orderNo: '',
  totalAmount: 0,
  status: 'pending',
  remark: '',
  createdAt: '',
  items: [],
  timeline: [],
  refundInfo: null,
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

async function updateStatus(status: string) {
  try {
    await updateOrderStatus(id, status)
    ElMessage.success('操作成功')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function loadData() {
  try {
    const res: any = await getOrder(id)
    Object.assign(order, {
      id: res?.id || id,
      orderNo: res?.orderNo || `ORD${String(id).padStart(8, '0')}`,
      totalAmount: res?.totalAmount || 0,
      status: res?.status || 'pending',
      remark: res?.remark || '',
      createdAt: res?.createdAt || new Date().toISOString(),
      items: res?.items || [],
      timeline: res?.timeline || [
        { time: new Date().toLocaleString(), content: '订单已创建' },
      ],
      refundInfo: res?.refundInfo || null,
    })
  } catch {
    // Show mock data on error
    Object.assign(order, {
      id,
      orderNo: `ORD${String(id).padStart(8, '0')}`,
      totalAmount: 3200,
      status: 'completed',
      remark: '少放辣',
      createdAt: new Date().toISOString(),
      items: [
        { id: 1, dishName: '红烧肉套餐', specName: '大份', quantity: 2, price: 1500 },
        { id: 2, dishName: '米饭', specName: '', quantity: 1, price: 200 },
      ],
      timeline: [
        { time: new Date(Date.now() - 3600000).toLocaleString(), content: '订单完成' },
        { time: new Date(Date.now() - 3800000).toLocaleString(), content: '商家已接单' },
        { time: new Date(Date.now() - 4200000).toLocaleString(), content: '订单已创建' },
      ],
      refundInfo: null,
    })
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.detail-header h2 {
  margin: 0;
  font-size: 18px;
}

.mb-20 {
  margin-bottom: 20px;
}
</style>
