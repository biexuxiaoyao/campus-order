<template>
  <div class="audit-page">
    <h2 class="page-title">操作日志</h2>
    <p class="page-sub">平台所有管理操作的审计记录</p>

    <!-- Filters -->
    <el-card shadow="never" style="margin-bottom:16px">
      <el-form :inline="true" :model="filters">
        <el-form-item label="操作类型">
          <el-select v-model="filters.action" placeholder="全部" clearable style="width:160px">
            <el-option label="创建" value="create" />
            <el-option label="更新" value="update" />
            <el-option label="删除" value="delete" />
            <el-option label="审核" value="review" />
            <el-option label="登录" value="login" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作对象">
          <el-select v-model="filters.targetType" placeholder="全部" clearable style="width:160px">
            <el-option label="商家" value="tenant" />
            <el-option label="模块" value="module" />
            <el-option label="License" value="license" />
            <el-option label="用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width:260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchLogs">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <el-card shadow="never">
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="action" label="操作" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="actionTag(row.action)">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="targetType" label="对象类型" width="100" />
        <el-table-column prop="targetId" label="对象ID" width="120" show-overflow-tooltip />
        <el-table-column label="操作人" width="100">
          <template #default="{ row }">
            {{ row.operatorId || row.userId || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="color:var(--p-muted);font-size:12px">{{ row.detail || row.meta || JSON.stringify(row.data || '') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString('zh-CN') }}
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top:16px;display:flex;justify-content:flex-end">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchLogs"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { getAuditLogs } from '@/api/admin'

const loading = ref(false)
const logs = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const dateRange = ref<string[]>([])
const filters = ref({ action: '', targetType: '' })

function actionTag(a: string) {
  const map: Record<string, string> = { create: 'success', update: '', delete: 'danger', review: 'warning', login: 'info' }
  return map[a] || ''
}

async function fetchLogs() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filters.value.action) params.action = filters.value.action
    if (filters.value.targetType) params.targetType = filters.value.targetType
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const res: any = await getAuditLogs(params)
    const data = res.data || res
    logs.value = data.items || data || []
    total.value = data.total || logs.value.length
  } catch {
    // 接口可能返回空，静默处理
    logs.value = []
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = { action: '', targetType: '' }
  dateRange.value = []
  page.value = 1
  fetchLogs()
}

onMounted(fetchLogs)
</script>

<style scoped>
.page-title { font-size:20px; font-weight:700; color:var(--p-fg); margin-bottom:4px }
.page-sub { font-size:13px; color:var(--p-muted); margin-bottom:16px }
</style>
