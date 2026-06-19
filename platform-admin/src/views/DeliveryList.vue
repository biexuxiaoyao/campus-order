<template>
  <div class="delivery-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">交付管理</h2>
        <p class="page-sub">源码版本交付记录</p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 新建交付
      </el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="flatList" v-loading="loading" stripe>
        <el-table-column prop="id" label="交付ID" width="200" show-overflow-tooltip />
        <el-table-column label="商家" min-width="140">
          <template #default="{ row }">{{ row.tenantName }}</template>
        </el-table-column>
        <el-table-column label="版本" width="100">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="水印ID" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <code style="font-size:11px">{{ row.watermarkId }}</code>
          </template>
        </el-table-column>
        <el-table-column label="交付时间" width="170">
          <template #default="{ row }">
            {{ row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '-' }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !flatList.length" description="暂无交付记录" />
    </el-card>

    <!-- Create Dialog -->
    <el-dialog v-model="showCreate" title="新建交付" width="500px" @closed="resetForm">
      <el-form label-width="100px">
        <el-form-item label="目标商家" required>
          <el-select v-model="form.tenantId" placeholder="选择商家" filterable style="width:100%" :loading="tenantLoading">
            <el-option v-for="t in tenantList" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本号" required>
          <el-input v-model="form.version" placeholder="如 v1.2.0" />
        </el-form-item>
        <el-form-item label="包含模块">
          <el-checkbox-group v-model="form.modules">
            <el-checkbox v-for="m in MODULES" :key="m" :label="m" :value="m">{{ m }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="submitting">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getVersions, createDelivery, getTenants } from '@/api/admin'

const MODULES = ['base', 'group-meal', 'discount', 'coupon', 'points', 'prepaid', 'printer', 'push-notify']

interface DeliveryItem {
  id: string
  tenantName: string
  version: string
  watermarkId: string
  createdAt: string
}

const loading = ref(false)
const tenantLoading = ref(false)
const versions = ref<any[]>([])
const tenantList = ref<any[]>([])
const showCreate = ref(false)
const submitting = ref(false)
const form = reactive({ tenantId: '', version: 'v1.0', modules: [...MODULES] })

// Flatten grouped backend response to table rows
const flatList = computed<DeliveryItem[]>(() => {
  const rows: DeliveryItem[] = []
  for (const group of versions.value) {
    for (const d of (group.deliveries || [])) {
      rows.push({
        id: d.id,
        tenantName: d.tenant?.name || d.tenantId || '-',
        version: d.version || group.version,
        watermarkId: d.watermarkId,
        createdAt: d.createdAt,
      })
    }
  }
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

async function fetchVersions() {
  loading.value = true
  try {
    const res: any = await getVersions()
    const data = res.data || res
    versions.value = Array.isArray(data) ? data : []
  } catch {
    versions.value = []
  } finally {
    loading.value = false
  }
}

async function loadTenants() {
  tenantLoading.value = true
  try {
    const res: any = await getTenants({ pageSize: 200 })
    const data = res.data || res
    tenantList.value = data.items || data.list || data || []
  } catch { tenantList.value = [] }
  finally { tenantLoading.value = false }
}

function openCreate() {
  showCreate.value = true
  if (!tenantList.value.length) loadTenants()
}

function generateWatermarkId(tenantId: string, version: string) {
  const ts = Date.now().toString(36)
  const tid = tenantId.substring(0, 8)
  return `wm-${tid}-${version}-${ts}`
}

async function handleCreate() {
  if (!form.tenantId || !form.version) {
    ElMessage.warning('请填写必填项')
    return
  }
  submitting.value = true
  try {
    // Build modules object from selected array
    const modulesObj: Record<string, unknown> = {}
    for (const m of form.modules) {
      modulesObj[m] = true
    }
    await createDelivery({
      tenantId: form.tenantId,
      version: form.version,
      modules: modulesObj,
      watermarkId: generateWatermarkId(form.tenantId, form.version),
    })
    ElMessage.success('交付记录已创建')
    showCreate.value = false
    fetchVersions()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.tenantId = ''
  form.version = 'v1.0'
  form.modules = [...MODULES]
}

onMounted(fetchVersions)
</script>

<style scoped>
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px }
.page-title { font-size:20px; font-weight:700; color:var(--p-fg); margin:0 0 4px }
.page-sub { font-size:13px; color:var(--p-muted); margin:0 }
</style>
