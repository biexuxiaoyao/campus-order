<template>
  <div class="page-container">
    <h2 class="page-header">菜品管理</h2>

    <!-- Search Bar -->
    <div class="search-bar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索菜品名称"
        clearable
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select
        v-model="query.category"
        placeholder="选择分类"
        clearable
        @change="loadData"
      >
        <el-option label="全部" value="" />
        <el-option
          v-for="cat in categories"
          :key="cat.id"
          :label="cat.name"
          :value="cat.id"
        />
      </el-select>
      <el-select
        v-model="query.status"
        placeholder="状态"
        clearable
        @change="loadData"
        style="width: 120px"
      >
        <el-option label="全部" value="" />
        <el-option label="上架" value="on" />
        <el-option label="下架" value="off" />
      </el-select>
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon>
        搜索
      </el-button>
      <el-button type="success" @click="openDialog()">
        <el-icon><Plus /></el-icon>
        新增菜品
      </el-button>
    </div>

    <!-- Table -->
    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.image || '/favicon.svg'"
              style="width: 60px; height: 60px; border-radius: 6px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column label="价格" width="140">
          <template #default="{ row }">
            <span class="price-current">¥{{ formatPrice(row.price) }}</span>
            <span v-if="row.originalPrice" class="price-original">¥{{ formatPrice(row.originalPrice) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="140">
          <template #default="{ row }">
            <el-tag
              v-for="spec in (row.specs || [])"
              :key="spec.id || spec.name"
              size="small"
              style="margin-right: 4px; margin-bottom: 2px"
            >
              {{ spec.name }} ¥{{ formatPrice(spec.price) }}
            </el-tag>
            <span v-if="!row.specs || row.specs.length === 0" style="color: #c0c4cc">--</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'on' ? 'success' : 'info'">
              {{ row.status === 'on' ? '上架' : '下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
            <el-button
              :type="row.status === 'on' ? 'warning' : 'success'"
              link
              size="small"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'on' ? '下架' : '上架' }}
            </el-button>
            <el-popconfirm
              title="确认删除该菜品？"
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
      :title="isEdit ? '编辑菜品' : '新增菜品'"
      width="600px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="菜品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入菜品名称" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="form.category" placeholder="选择分类" style="width: 100%">
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="图片链接" prop="image">
          <el-input v-model="form.image" placeholder="请输入图片URL" />
        </el-form-item>
        <el-form-item label="原价" prop="originalPrice">
          <el-input-number v-model="form.originalPrice" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="售价" prop="price">
          <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="菜品描述" />
        </el-form-item>
        <el-form-item label="规格">
          <div style="width: 100%">
            <div
              v-for="(spec, idx) in form.specs"
              :key="idx"
              style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center"
            >
              <el-input v-model="spec.name" placeholder="规格名" style="flex: 1" />
              <el-input-number v-model="spec.price" :min="0" :precision="2" placeholder="价格" style="width: 120px" />
              <el-button type="danger" :icon="Delete" circle size="small" @click="removeSpec(idx)" />
            </div>
            <el-button type="primary" link @click="addSpec">+ 添加规格</el-button>
          </div>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-switch
            v-model="form.status"
            active-value="on"
            inactive-value="off"
            active-text="上架"
            inactive-text="下架"
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
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { getDishes, createDish, updateDish, deleteDish, getCategories } from '@/api/dishes'
import { useAppStore } from '@/stores/app'
import type { DishData, DishSpec } from '@/api/dishes'
import type { FormInstance, FormRules } from 'element-plus'

const appStore = useAppStore()
const list = ref<DishData[]>([])
const categories = ref<{ id: string; name: string }[]>([])
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
  keyword: '',
  category: '',
  status: '',
})

const form = reactive<DishData>({
  name: '',
  image: '',
  category: '',
  price: 0,
  originalPrice: 0,
  description: '',
  status: 'on',
  specs: [],
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入菜品名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  price: [{ required: true, message: '请输入售价', trigger: 'blur' }],
}

function formatPrice(price: number) {
  return (price / 100).toFixed(2)
}

function addSpec() {
  form.specs!.push({ name: '', price: 0 })
}

function removeSpec(idx: number) {
  form.specs!.splice(idx, 1)
}

function openDialog(row?: DishData) {
  if (row) {
    isEdit.value = true
    editingId.value = row.id!
    form.name = row.name
    form.image = row.image
    form.category = row.category
    form.price = row.price
    form.originalPrice = row.originalPrice || 0
    form.description = row.description || ''
    form.status = row.status
    form.specs = row.specs ? [...row.specs] : []
  } else {
    isEdit.value = false
    editingId.value = null
    form.name = ''
    form.image = ''
    form.category = ''
    form.price = 0
    form.originalPrice = 0
    form.description = ''
    form.status = 'on'
    form.specs = []
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (isEdit.value && editingId.value) {
      await updateDish(editingId.value, { ...form })
      ElMessage.success('编辑成功')
    } else {
      await createDish(appStore.currentStoreId || '1', { ...form })
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await deleteDish(id)
    ElMessage.success('删除成功')
    loadData()
  } catch {
    // error handled by interceptor
  }
}

async function toggleStatus(row: DishData) {
  const newStatus = row.status === 'on' ? 'off' : 'on'
  try {
    await updateDish(row.id!, { status: newStatus } as DishData)
    ElMessage.success(newStatus === 'on' ? '已上架' : '已下架')
    loadData()
  } catch {
    // error handled by interceptor
  }
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await getDishes({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
      category: query.category || undefined,
      status: query.status || undefined,
      storeId: appStore.currentStoreId || undefined,
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

async function loadCategories() {
  try {
    const res: any = await getCategories()
    categories.value = res || []
  } catch {
    categories.value = []
  }
}

onMounted(() => {
  loadData()
  loadCategories()
})
</script>

<style scoped>
.price-current {
  color: #e6a23c;
  font-weight: 600;
  font-size: 15px;
}

.price-original {
  color: #c0c4cc;
  text-decoration: line-through;
  font-size: 13px;
  margin-left: 6px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
