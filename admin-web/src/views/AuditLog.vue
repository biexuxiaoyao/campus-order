<template>
  <div class="page-container">
    <h2 class="page-header">操作日志</h2>

    <!-- Filter Bar -->
    <div class="search-bar">
      <el-input
        v-model="query.operator"
        placeholder="操作人"
        clearable
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select
        v-model="query.action"
        placeholder="操作类型"
        clearable
        @change="loadData"
      >
        <el-option label="全部" value="" />
        <el-option label="登录" value="login" />
        <el-option label="创建" value="create" />
        <el-option label="更新" value="update" />
        <el-option label="删除" value="delete" />
        <el-option label="导出" value="export" />
        <el-option label="其他" value="other" />
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
        <el-table-column label="时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="120" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-tag
              :type="actionTagType(row.action)"
              size="small"
            >
              {{ actionText(row.action) }}
            </el-tag>
            <span style="margin-left: 4px; font-size: 13px; color: #606266">
              {{ row.target }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="target" label="操作对象" min-width="180">
          <template #default="{ row }">
            {{ row.target || '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP地址" width="140" />
        <el-table-column label="详情" width="80">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">
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
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" title="操作详情" width="600px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detail.operator }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">
          <el-tag :type="actionTagType(detail.action)" size="small">
            {{ actionText(detail.action) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作对象">{{ detail.target || '--' }}</el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ detail.ip || '--' }}</el-descriptions-item>
        <el-descriptions-item label="User-Agent">{{ detail.userAgent || '--' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider />
      <h4>变更内容</h4>
      <pre class="diff-preview">{{ formatDiff(detail.diff) }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import http from '@/api'

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<string[]>([])
const detailVisible = ref(false)
const detail = reactive<any>({
  createdAt: '',
  operator: '',
  action: '',
  target: '',
  ip: '',
  userAgent: '',
  diff: '',
})

const query = reactive({
  page: 1,
  pageSize: 10,
  operator: '',
  action: '',
  startDate: '',
  endDate: '',
})

function formatTime(time: string) {
  if (!time) return '--'
  return new Date(time).toLocaleString('zh-CN')
}

function actionText(action: string) {
  const map: Record<string, string> = {
    login: '登录',
    create: '创建',
    update: '更新',
    delete: '删除',
    export: '导出',
    other: '其他',
  }
  return map[action] || action
}

function actionTagType(action: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, string> = {
    login: 'info',
    create: 'success',
    update: 'warning',
    delete: 'danger',
    export: 'info',
    other: '',
  }
  return (map[action] || '') as '' | 'success' | 'warning' | 'info' | 'danger'
}

function formatDiff(diff: string) {
  if (!diff) return '无变更记录'
  try {
    const obj = typeof diff === 'string' ? JSON.parse(diff) : diff
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(diff)
  }
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
    createdAt: row.createdAt,
    operator: row.operator,
    action: row.action,
    target: row.target,
    ip: row.ip,
    userAgent: row.userAgent || '--',
    diff: row.diff || '',
  })
  detailVisible.value = true
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await http.get('/merchant/audit-logs', { params: query })
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

.diff-preview {
  background: #f5f7fa;
  padding: 16px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 300px;
}
</style>
