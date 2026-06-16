<template>
  <div class="page-container">
    <h2 class="page-header">团购订单</h2>

    <!-- Search Bar -->
    <div class="search-bar">
      <el-input
        v-model="query.keyword"
        placeholder="团购号/团长"
        clearable
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select
        v-model="query.status"
        placeholder="状态"
        clearable
        @change="loadData"
      >
        <el-option label="全部" value="" />
        <el-option label="进行中" value="active" />
        <el-option label="已成团" value="success" />
        <el-option label="已失败" value="failed" />
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
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon>
        搜索
      </el-button>
    </div>

    <!-- Table -->
    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="groupNo" label="团购号" width="180" />
        <el-table-column prop="leader" label="团长" width="120" />
        <el-table-column label="商品数" width="90">
          <template #default="{ row }">
            {{ row.itemCount || row.items?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="总金额" width="110">
          <template #default="{ row }">
            <span style="color: #e6a23c; font-weight: 600">¥{{ formatPrice(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="statusTagType(row.status)"
              size="small"
            >
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">
              查看详情
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              type="danger"
              link
              size="small"
              @click="handleCancel(row)"
            >
              取消
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

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" title="团购详情" width="600px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="团购号">{{ detail.groupNo }}</el-descriptions-item>
        <el-descriptions-item label="团长">{{ detail.leader }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(detail.status)" size="small">
            {{ statusText(detail.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="总金额">
          ¥{{ formatPrice(detail.totalAmount) }}
        </el-descriptions-item>
      </el-descriptions>
      <el-divider />
      <h4 style="margin-bottom: 12px">参团成员</h4>
      <el-table :data="detail.members || []" size="small" stripe>
        <el-table-column prop="username" label="成员" />
        <el-table-column label="商品" min-width="150">
          <template #default="{ row: member }">
            <div v-for="item in (member.items || [])" :key="item.id">
              {{ item.dishName }} x{{ item.quantity }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="90">
          <template #default="{ row: member }">
            ¥{{ formatPrice(member.amount) }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api'

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<string[]>([])
const detailVisible = ref(false)
const detail = reactive<any>({
  groupNo: '',
  leader: '',
  status: '',
  totalAmount: 0,
  members: [],
})

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

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, string> = {
    active: 'warning',
    success: 'success',
    failed: 'info',
  }
  return (map[status] || 'info') as '' | 'success' | 'warning' | 'info' | 'danger'
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    active: '进行中',
    success: '已成团',
    failed: '已取消',
  }
  return map[status] || status
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

function viewDetail(row: any) {
  Object.assign(detail, {
    groupNo: row.groupNo,
    leader: row.leader,
    status: row.status,
    totalAmount: row.totalAmount,
    members: row.members || [],
  })
  detailVisible.value = true
}

async function handleCancel(row: any) {
  try {
    await http.put(`/group-orders/${row.id}/cancel`)
    ElMessage.success('已取消')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await http.get('/group-orders', { params: query })
    list.value = res?.list || res?.items || []
    total.value = res?.total || res?.count || 0
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
