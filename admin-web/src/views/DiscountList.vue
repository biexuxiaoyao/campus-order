<template>
  <div class="page-container">
    <h2 class="page-header">优惠规则</h2>

    <div class="search-bar">
      <el-button type="primary" @click="openDialog()">
        <el-icon><Plus /></el-icon>
        新增规则
      </el-button>
    </div>

    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="规则名称" width="180" />
        <el-table-column label="条件" min-width="200">
          <template #default="{ row }">
            <div class="rule-text">{{ formatConditions(row.conditions) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="优惠" min-width="180">
          <template #default="{ row }">
            <div class="rule-text">{{ formatActions(row.actions) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" align="center" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm
              title="确认删除该规则？"
              @confirm="handleDelete(row.id)"
            >
              <template #reference>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-popconfirm>
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

    <!-- Add/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑规则' : '新增规则'"
      width="600px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="form.name" placeholder="满100减10" />
        </el-form-item>
        <el-form-item label="优先级" prop="priority">
          <el-input-number v-model="form.priority" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="条件配置">
          <el-input
            v-model="form.conditionsStr"
            type="textarea"
            :rows="4"
            placeholder='{"type":"amount","minAmount":10000} 或 {"type":"quantity","minQuantity":3}'
          />
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            条件类型: amount(满金额), quantity(满数量), firstOrder(首单), specificTime(特定时段)
          </div>
        </el-form-item>
        <el-form-item label="优惠配置">
          <el-input
            v-model="form.actionsStr"
            type="textarea"
            :rows="4"
            placeholder='{"type":"reduce","amount":1000} 或 {"type":"discount","rate":0.8}'
          />
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            优惠类型: reduce(满减), discount(折扣), freeShipping(免配送费), gift(赠品)
          </div>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch
            v-model="form.status"
            active-value="active"
            inactive-value="inactive"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api'
import { useAppStore } from '@/stores/app'
import type { FormInstance, FormRules } from 'element-plus'

const appStore = useAppStore()

const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()

const query = reactive({
  page: 1,
  pageSize: 10,
})

const form = reactive({
  name: '',
  priority: 0,
  conditionsStr: '',
  actionsStr: '',
  status: 'active' as string,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  priority: [{ required: true, message: '请输入优先级', trigger: 'blur' }],
}

function formatConditions(conditions: any): string {
  if (!conditions) return '--'
  try {
    const c = typeof conditions === 'string' ? JSON.parse(conditions) : conditions
    if (c.type === 'amount') return `满 ¥${((c.minAmount || 0) / 100).toFixed(2)}`
    if (c.type === 'quantity') return `满 ${c.minQuantity} 件`
    if (c.type === 'firstOrder') return '首单用户'
    if (c.type === 'specificTime') return `时段 ${c.startTime}-${c.endTime}`
    return JSON.stringify(c)
  } catch {
    return String(conditions)
  }
}

function formatActions(actions: any): string {
  if (!actions) return '--'
  try {
    const a = typeof actions === 'string' ? JSON.parse(actions) : actions
    if (a.type === 'reduce') return `减 ¥${((a.amount || 0) / 100).toFixed(2)}`
    if (a.type === 'discount') return `${((a.rate || 1) * 10).toFixed(1)} 折`
    if (a.type === 'freeShipping') return '免配送费'
    if (a.type === 'gift') return `赠送 ${a.giftName || ''}`
    return JSON.stringify(a)
  } catch {
    return String(actions)
  }
}

function openDialog(row?: any) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id
    form.name = row.name
    form.priority = row.priority || 0
    form.conditionsStr = typeof row.conditions === 'string' ? row.conditions : JSON.stringify(row.conditions || {})
    form.actionsStr = typeof row.actions === 'string' ? row.actions : JSON.stringify(row.actions || {})
    form.status = row.status || 'active'
  } else {
    isEdit.value = false
    editingId.value = null
    form.name = ''
    form.priority = 0
    form.conditionsStr = ''
    form.actionsStr = ''
    form.status = 'active'
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    let conditions = {}
    let actions = {}
    try { conditions = JSON.parse(form.conditionsStr || '{}') } catch { /* ignore */ }
    try { actions = JSON.parse(form.actionsStr || '{}') } catch { /* ignore */ }

    const data = {
      name: form.name,
      priority: form.priority,
      conditions: JSON.stringify(conditions),
      actions: JSON.stringify(actions),
      status: form.status,
    }

    if (isEdit.value && editingId.value) {
      await http.put(`/merchant/discounts/${editingId.value}`, data)
      ElMessage.success('编辑成功')
    } else {
      await http.post(`/merchant/stores/${appStore.currentStoreId}/discounts`, data)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch {
    // handled by interceptor
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await http.delete(`/merchant/discounts/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await http.get(`/merchant/stores/${appStore.currentStoreId}/discounts`, { params: query })
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
.rule-text {
  font-size: 13px;
  color: #606266;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
