<template>
  <div class="page-container">
    <h2 class="page-header">员工管理</h2>

    <!-- Search Bar -->
    <div class="search-bar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索用户名"
        clearable
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon>
        搜索
      </el-button>
      <el-button type="success" @click="openDialog()">
        <el-icon><Plus /></el-icon>
        新增员工
      </el-button>
    </div>

    <!-- Table -->
    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
              {{ roleText(row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
            <el-button type="warning" link size="small" @click="openPasswordDialog(row)">
              重置密码
            </el-button>
            <el-popconfirm
              title="确认删除该员工？"
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
      :title="isEdit ? '编辑员工' : '新增员工'"
      width="450px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="选择角色" style="width: 100%">
            <el-option label="超级管理员" value="admin" />
            <el-option label="店长" value="manager" />
            <el-option label="店员" value="staff" />
            <el-option label="厨师" value="chef" />
          </el-select>
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

    <!-- Reset Password Dialog -->
    <el-dialog
      v-model="passwordVisible"
      title="重置密码"
      width="400px"
    >
      <el-form ref="pwdFormRef" :model="pwdForm" label-width="80px">
        <el-form-item label="新密码" prop="password" :rules="[{ required: true, message: '请输入新密码', trigger: 'blur' }]">
          <el-input
            v-model="pwdForm.password"
            type="password"
            placeholder="请输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="handleResetPassword">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getStaff, createStaff, updateStaff, deleteStaff, resetPassword } from '@/api/staff'
import type { StaffData } from '@/api/staff'
import type { FormInstance, FormRules } from 'element-plus'

const list = ref<StaffData[]>([])
const total = ref(0)
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const passwordVisible = ref(false)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({ password: '' })
const resetStaffId = ref(0)
const resetting = ref(false)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
})

const form = reactive<StaffData>({
  username: '',
  password: '',
  role: 'staff',
  status: 'active',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

function roleText(role: string) {
  const map: Record<string, string> = {
    admin: '超级管理员',
    manager: '店长',
    staff: '店员',
    chef: '厨师',
  }
  return map[role] || role
}

function formatTime(time: string) {
  if (!time) return '--'
  return new Date(time).toLocaleString('zh-CN')
}

function openDialog(row?: StaffData) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id!
    form.username = row.username
    form.password = ''
    form.role = row.role
    form.status = row.status || 'active'
  } else {
    isEdit.value = false
    editingId.value = null
    form.username = ''
    form.password = ''
    form.role = 'staff'
    form.status = 'active'
  }
  dialogVisible.value = true
}

function openPasswordDialog(row: StaffData) {
  resetStaffId.value = row.id!
  pwdForm.password = ''
  passwordVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (isEdit.value && editingId.value) {
      await updateStaff(editingId.value, {
        username: form.username,
        role: form.role,
        status: form.status,
      })
      ElMessage.success('编辑成功')
    } else {
      await createStaff({ ...form })
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
    await deleteStaff(id)
    ElMessage.success('删除成功')
    loadData()
  } catch {
    // handled by interceptor
  }
}

async function handleResetPassword() {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  resetting.value = true
  try {
    await resetPassword(resetStaffId.value, pwdForm.password)
    ElMessage.success('密码重置成功')
    passwordVisible.value = false
  } catch {
    // handled by interceptor
  } finally {
    resetting.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await getStaff({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
    })
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
