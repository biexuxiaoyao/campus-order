<template>
  <div class="page-container">
    <h2 class="page-header">品牌配置</h2>

    <el-card>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        style="max-width: 650px"
        v-loading="loading"
      >
        <el-divider content-position="left">基本信息</el-divider>
        <el-form-item label="店铺名称" prop="storeName">
          <el-input v-model="form.storeName" placeholder="请输入店铺名称" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="联系电话" />
        </el-form-item>
        <el-form-item label="店铺公告">
          <el-input
            v-model="form.announcement"
            type="textarea"
            :rows="3"
            placeholder="营业公告，显示在小程序首页"
          />
        </el-form-item>

        <el-divider content-position="left">视觉配置</el-divider>
        <el-form-item label="Logo">
          <div style="display: flex; align-items: center; gap: 16px">
            <el-image
              :src="form.logo || '/favicon.svg'"
              style="width: 80px; height: 80px; border-radius: 8px; border: 1px solid #ebeef5"
              fit="cover"
            />
            <div>
              <el-input v-model="form.logo" placeholder="Logo图片URL" style="width: 280px" />
              <div style="font-size: 12px; color: #909399; margin-top: 4px">推荐尺寸 200x200 像素</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="主题颜色">
          <el-color-picker v-model="form.themeColor" show-alpha />
          <span style="margin-left: 8px; font-size: 13px; color: #606266">{{ form.themeColor }}</span>
          <div style="margin-top: 8px">
            <div
              :style="{
                width: '100px',
                height: '36px',
                background: form.themeColor,
                borderRadius: '6px',
                display: 'inline-block',
              }"
            />
          </div>
        </el-form-item>

        <el-divider content-position="left">首页轮播图</el-divider>
        <el-form-item label="轮播图">
          <div style="width: 100%">
            <div
              v-for="(banner, idx) in form.banners"
              :key="idx"
              style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center"
            >
              <el-image
                :src="banner || '/favicon.svg'"
                style="width: 60px; height: 60px; border-radius: 4px; border: 1px solid #ebeef5"
                fit="cover"
              />
              <el-input v-model="form.banners[idx]" placeholder="图片URL" style="flex: 1" />
              <el-button type="danger" :icon="Delete" circle size="small" @click="removeBanner(idx)" />
            </div>
            <el-button type="primary" link @click="addBanner">+ 添加轮播图</el-button>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">
            保存配置
          </el-button>
          <el-button @click="loadConfig">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import http from '@/api'
import type { FormInstance, FormRules } from 'element-plus'

const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)

const form = reactive({
  storeName: '',
  logo: '',
  themeColor: '#07C160',
  phone: '',
  announcement: '',
  banners: [] as string[],
})

const rules: FormRules = {
  storeName: [{ required: true, message: '请输入店铺名称', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' },
  ],
}

function addBanner() {
  form.banners.push('')
}

function removeBanner(idx: number) {
  form.banners.splice(idx, 1)
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await http.put('/brand', { ...form })
    ElMessage.success('品牌配置保存成功')
  } catch {
    // handled by interceptor
  } finally {
    saving.value = false
  }
}

async function loadConfig() {
  loading.value = true
  try {
    const res: any = await http.get('/brand')
    if (res) {
      form.storeName = res.storeName || ''
      form.logo = res.logo || ''
      form.themeColor = res.themeColor || '#07C160'
      form.phone = res.phone || ''
      form.announcement = res.announcement || ''
      form.banners = res.banners || []
    }
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>
