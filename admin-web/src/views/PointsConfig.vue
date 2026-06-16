<template>
  <div class="page-container">
    <h2 class="page-header">积分管理</h2>

    <!-- Points Rule -->
    <el-card class="mb-20">
      <template #header>
        <span>积分规则</span>
      </template>
      <el-form :model="ruleForm" label-width="140px" style="max-width: 500px">
        <el-form-item label="积分开关">
          <el-switch v-model="ruleForm.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item label="消费返积分比例">
          <el-input v-model="ruleForm.earnRate" style="width: 200px">
            <template #append>积分/元</template>
          </el-input>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            消费1元可获得多少积分
          </div>
        </el-form-item>
        <el-form-item label="积分抵扣比例">
          <el-input v-model="ruleForm.redeemRate" style="width: 200px">
            <template #append>分 = 1元</template>
          </el-input>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            多少积分可以抵扣1元
          </div>
        </el-form-item>
        <el-form-item label="最高抵扣比例">
          <el-input-number v-model="ruleForm.maxRedeemPercent" :min="0" :max="100" style="width: 200px" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399">%</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="ruleSaving" @click="saveRule">保存规则</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Exchange Products -->
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>积分兑换商品</span>
          <el-button type="primary" size="small" @click="openProductDialog()">
            <el-icon><Plus /></el-icon>
            新增商品
          </el-button>
        </div>
      </template>
      <el-table :data="products" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="商品名称" min-width="160" />
        <el-table-column label="图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.image || '/favicon.svg'"
              style="width: 50px; height: 50px; border-radius: 4px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column prop="pointsRequired" label="所需积分" width="120" />
        <el-table-column prop="stock" label="库存" width="100" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openProductDialog(row)">编辑</el-button>
            <el-popconfirm
              title="确认删除该商品？"
              @confirm="deleteProduct(row.id)"
            >
              <template #reference>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Product Dialog -->
    <el-dialog
      v-model="productVisible"
      :title="productIsEdit ? '编辑兑换商品' : '新增兑换商品'"
      width="450px"
      destroy-on-close
    >
      <el-form ref="productFormRef" :model="productForm" label-width="100px">
        <el-form-item label="商品名称" prop="name" :rules="[{ required: true, message: '请输入名称' }]">
          <el-input v-model="productForm.name" placeholder="请输入商品名称" />
        </el-form-item>
        <el-form-item label="图片链接" prop="image">
          <el-input v-model="productForm.image" placeholder="请输入图片URL" />
        </el-form-item>
        <el-form-item label="所需积分" prop="pointsRequired" :rules="[{ required: true, message: '请输入积分' }]">
          <el-input-number v-model="productForm.pointsRequired" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="库存" prop="stock">
          <el-input-number v-model="productForm.stock" :min="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="productVisible = false">取消</el-button>
        <el-button type="primary" :loading="productSaving" @click="saveProduct">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/api'
import type { FormInstance } from 'element-plus'

const ruleSaving = ref(false)

const ruleForm = reactive({
  enabled: true,
  earnRate: 1,
  redeemRate: 100,
  maxRedeemPercent: 30,
})

const products = ref<any[]>([])
const productVisible = ref(false)
const productIsEdit = ref(false)
const productEditingId = ref<number | null>(null)
const productSaving = ref(false)
const productFormRef = ref<FormInstance>()

const productForm = reactive({
  name: '',
  image: '',
  pointsRequired: 0,
  stock: 0,
})

async function saveRule() {
  ruleSaving.value = true
  try {
    await http.put('/points/rules', { ...ruleForm })
    ElMessage.success('积分规则保存成功')
  } catch {
    // handled by interceptor
  } finally {
    ruleSaving.value = false
  }
}

function openProductDialog(row?: any) {
  if (row) {
    productIsEdit.value = true
    productEditingId.value = row.id
    productForm.name = row.name
    productForm.image = row.image || ''
    productForm.pointsRequired = row.pointsRequired
    productForm.stock = row.stock || 0
  } else {
    productIsEdit.value = false
    productEditingId.value = null
    productForm.name = ''
    productForm.image = ''
    productForm.pointsRequired = 0
    productForm.stock = 0
  }
  productVisible.value = true
}

async function saveProduct() {
  const valid = await productFormRef.value?.validate().catch(() => false)
  if (!valid) return
  productSaving.value = true
  try {
    if (productIsEdit.value && productEditingId.value) {
      await http.put(`/points/products/${productEditingId.value}`, { ...productForm })
      ElMessage.success('编辑成功')
    } else {
      await http.post('/points/products', { ...productForm })
      ElMessage.success('创建成功')
    }
    productVisible.value = false
    loadProducts()
  } catch {
    // handled by interceptor
  } finally {
    productSaving.value = false
  }
}

async function deleteProduct(id: number) {
  try {
    await http.delete(`/points/products/${id}`)
    ElMessage.success('删除成功')
    loadProducts()
  } catch {
    // handled by interceptor
  }
}

async function loadProducts() {
  try {
    const res: any = await http.get('/points/products')
    products.value = res?.list || res?.items || []
  } catch {
    products.value = []
  }
}

async function loadRules() {
  try {
    const res: any = await http.get('/points/rules')
    if (res) {
      ruleForm.enabled = res.enabled ?? true
      ruleForm.earnRate = res.earnRate ?? 1
      ruleForm.redeemRate = res.redeemRate ?? 100
      ruleForm.maxRedeemPercent = res.maxRedeemPercent ?? 30
    }
  } catch {
    // keep defaults
  }
}

onMounted(() => {
  loadRules()
  loadProducts()
})
</script>

<style scoped>
.mb-20 {
  margin-bottom: 20px;
}
</style>
