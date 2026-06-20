<template>
  <div class="page-container">
    <h2 class="page-header">优惠券模板</h2>

    <div class="search-bar">
      <el-button type="primary" @click="openDialog()">
        <el-icon><Plus /></el-icon>
        新增优惠券
      </el-button>
    </div>

    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="优惠券名称" min-width="160" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ typeText(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用门槛" width="120">
          <template #default="{ row }">
            {{ row.threshold > 0 ? '¥' + formatPrice(row.threshold) : '无门槛' }}
          </template>
        </el-table-column>
        <el-table-column label="优惠内容" width="120">
          <template #default="{ row }">
            <span v-if="row.type === 'full_reduce'">减 ¥{{ formatPrice(row.value) }}</span>
            <span v-else-if="row.type === 'discount'">{{ (row.value / 10).toFixed(1) }} 折</span>
            <span v-else>免运费</span>
          </template>
        </el-table-column>
        <el-table-column label="已领/总量" width="120">
          <template #default="{ row }">
            <span style="color: #67c23a">{{ row.usedQty || 0 }}</span>
            /
            <span>{{ row.totalQty || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="100">
          <template #default="{ row }">
            {{ row.validDays || 0 }}天
          </template>
        </el-table-column>
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
              title="确认删除该优惠券？"
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
      :title="isEdit ? '编辑优惠券' : '新增优惠券'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="优惠券名称" prop="name">
          <el-input v-model="form.name" placeholder="如：新用户专享券" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="选择类型" style="width: 100%">
            <el-option label="满减券" value="full_reduce" />
            <el-option label="折扣券" value="discount" />
            <el-option label="免邮券" value="free_shipping" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.type !== 'free_shipping'" label="使用门槛" prop="threshold">
          <el-input-number v-model="form.threshold" :min="0" :precision="2" style="width: 100%" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399">0表示无门槛</span>
        </el-form-item>
        <el-form-item v-if="form.type === 'full_reduce'" label="减免金额" prop="value">
          <el-input-number v-model="form.value" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="form.type === 'discount'" label="折扣力度" prop="value">
          <el-input-number v-model="form.value" :min="1" :max="95" style="width: 100%" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399">
            如85表示8.5折
          </span>
        </el-form-item>
        <el-form-item label="发放总量" prop="totalQty">
          <el-input-number v-model="form.totalQty" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="有效期(天)" prop="validDays">
          <el-input-number v-model="form.validDays" :min="1" style="width: 100%" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399">领取后有效天数</span>
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
  type: 'full_reduce',
  threshold: 0,
  value: 0,
  totalQty: 100,
  validDays: 30,
  status: 'active',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入优惠券名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  totalQty: [{ required: true, message: '请输入发放总量', trigger: 'blur' }],
  validDays: [{ required: true, message: '请输入有效天数', trigger: 'blur' }],
}

function formatPrice(price: number) {
  return (price / 100).toFixed(2)
}

function typeText(type: string) {
  const map: Record<string, string> = {
    full_reduce: '满减券',
    discount: '折扣券',
    free_shipping: '免邮券',
  }
  return map[type] || type
}

function openDialog(row?: any) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id
    form.name = row.name
    form.type = row.type || 'full_reduce'
    form.threshold = row.threshold || 0
    form.value = row.value || 0
    form.totalQty = row.totalQty || 100
    form.validDays = row.validDays || 30
    form.status = row.status || 'active'
  } else {
    isEdit.value = false
    editingId.value = null
    form.name = ''
    form.type = 'full_reduce'
    form.threshold = 0
    form.value = 0
    form.totalQty = 100
    form.validDays = 30
    form.status = 'active'
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (isEdit.value && editingId.value) {
      await http.put(`/merchant/coupon-templates/${editingId.value}`, { ...form })
      ElMessage.success('编辑成功')
    } else {
      await http.post(`/merchant/stores/${appStore.currentStoreId}/coupon-templates`, { ...form })
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
    await http.delete(`/merchant/coupon-templates/${id}`)
    ElMessage.success('删除成功')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await http.get(`/merchant/stores/${appStore.currentStoreId}/coupon-templates`, { params: query })
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
