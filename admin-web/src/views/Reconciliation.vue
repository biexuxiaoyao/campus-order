<template>
  <div class="page-container">
    <h2 class="page-header">日对账</h2>

    <div style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center">
      <el-date-picker
        v-model="date"
        type="date"
        placeholder="选择日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        @change="loadData"
      />
      <el-button type="primary" @click="loadData">查询</el-button>
    </div>

    <el-row v-if="data" :gutter="20">
      <el-col :span="8">
        <el-card>
          <template #header>系统收款</template>
          <div style="font-size: 28px; font-weight: 700">¥{{ formatMoney(data.systemTotal) }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>微信收款</template>
          <div style="font-size: 28px; font-weight: 700">¥{{ formatMoney(data.wechatTotal) }}</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>差额</template>
          <div :style="{ fontSize: '28px', fontWeight: 700, color: data.matched ? '#07c160' : '#e94560' }">
            ¥{{ formatMoney(data.difference) }}
            <el-tag v-if="data.matched" type="success" size="small">匹配</el-tag>
            <el-tag v-else type="danger" size="small">不匹配</el-tag>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="data" style="margin-top: 20px">
      <template #header>明细 ({{ data.detailCount }} 笔)</template>
      <el-table :data="data.details" stripe>
        <el-table-column prop="orderNo" label="订单号" width="200" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">¥{{ formatMoney(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="transactionId" label="微信交易号" min-width="220">
          <template #default="{ row }">{{ row.transactionId || '—' }}</template>
        </el-table-column>
        <el-table-column prop="time" label="时间" width="180">
          <template #default="{ row }">{{ new Date(row.time).toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-empty v-if="!data && !loading" description="选择日期查询对账数据" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getReconciliation } from '@/api/orders'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const date = ref(new Date().toISOString().slice(0, 10))
const data = ref<any>(null)
const loading = ref(false)

function formatMoney(val: number | null | undefined): string {
  if (val == null) return '0.00'
  return (val / 100).toFixed(2)
}

async function loadData() {
  loading.value = true
  try {
    const storeId = appStore.currentStoreId || ''
    const res: any = await getReconciliation(storeId, date.value)
    data.value = (res as any) || null
  } catch {
    ElMessage.error('查询对账数据失败')
  } finally {
    loading.value = false
  }
}
</script>
