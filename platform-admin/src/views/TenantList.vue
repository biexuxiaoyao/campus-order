<template>
  <div>
    <!-- Search -->
    <div class="panel" style="margin-bottom:16px">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="商家名称">
          <el-input v-model="searchForm.name" placeholder="搜索名称" clearable style="width:200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="AppID">
          <el-input v-model="searchForm.appId" placeholder="搜索 AppID" clearable style="width:200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width:140px">
            <el-option label="运营中" value="active" />
            <el-option label="已过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Table -->
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:15px;color:var(--p-fg)">商家列表</span>
        <el-button type="primary" @click="openCreate">+ 创建商家</el-button>
      </div>

      <el-table :data="tenants" stripe v-loading="loading">
        <el-table-column prop="name" label="商家名称" min-width="150">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push(`/tenants/${row.id}`)">{{ row.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="appId" label="AppID" width="220" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '运营中' : '已过期' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模块数" width="80" align="center">
          <template #default="{ row }">{{ (row.modules || []).length }}</template>
        </el-table-column>
        <el-table-column label="入驻日期" width="130">
          <template #default="{ row }">{{ row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="$router.push(`/tenants/${row.id}`)">详情</el-button>
            <el-button v-if="row.status === 'active'" type="danger" link size="small" @click="handleDisable(row)">禁用</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <el-pagination
          v-model:current-page="page" v-model:page-size="pageSize"
          :total="total" :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @change="fetchTenants" background
        />
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog v-model="createVisible" title="创建商家" width="500px" destroy-on-close @closed="resetCreateForm">
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="100px">
        <el-form-item label="AppID" prop="appId">
          <el-input v-model="createForm.appId" placeholder="微信小程序 AppID（唯一）" />
        </el-form-item>
        <el-form-item label="商家名称" prop="name">
          <el-input v-model="createForm.name" placeholder="商家名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">确定创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getTenants, createTenant, updateTenant, deleteTenant } from '@/api/admin'

const loading = ref(false)
const creating = ref(false)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const createVisible = ref(false)
const createFormRef = ref<FormInstance>()
const tenants = ref<any[]>([])

const searchForm = reactive({ name: '', appId: '', status: '' })
const createForm = reactive({ appId: '', name: '' })

const createRules: FormRules = {
  appId: [{ required: true, message: '请输入 AppID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入商家名称', trigger: 'blur' }],
}

async function fetchTenants() {
  loading.value = true
  try {
    const res: any = await getTenants({ ...searchForm, page: page.value, pageSize: pageSize.value })
    const data = res.data || res
    tenants.value = data.items || data.list || data || []
    total.value = data.total || tenants.value.length
  } catch {
    tenants.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; fetchTenants() }
function handleReset() { searchForm.name = ''; searchForm.appId = ''; searchForm.status = ''; page.value = 1; fetchTenants() }

function openCreate() { createVisible.value = true }
function resetCreateForm() { createForm.appId = ''; createForm.name = '' }

async function handleCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    await createTenant({ appId: createForm.appId, name: createForm.name })
    ElMessage.success('商家创建成功')
    createVisible.value = false
    fetchTenants()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDisable(row: any) {
  try {
    await ElMessageBox.confirm(`确认禁用「${row.name}」？禁用后B端将无法登录。`, '禁用确认', { type: 'warning' })
  } catch { return }
  try {
    await updateTenant(row.id, { status: 'expired' })
    ElMessage.success('已禁用')
    fetchTenants()
  } catch { ElMessage.error('操作失败') }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？此操作不可撤销。`, '删除确认', { type: 'error' })
  } catch { return }
  try {
    await deleteTenant(row.id)
    ElMessage.success('已删除')
    fetchTenants()
  } catch { ElMessage.error('删除失败') }
}

onMounted(fetchTenants)
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
</style>
