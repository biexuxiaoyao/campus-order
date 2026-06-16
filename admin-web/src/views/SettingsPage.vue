<template>
  <div class="page-container">
    <h2 class="page-header">营业设置</h2>

    <el-card>
      <el-form
        ref="formRef"
        :model="form"
        label-width="120px"
        style="max-width: 600px"
        v-loading="loading"
      >
        <el-divider content-position="left">营业时间</el-divider>
        <el-form-item label="开始时间">
          <el-time-picker
            v-model="form.openTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="选择开始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-time-picker
            v-model="form.closeTime"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="选择结束时间"
            style="width: 100%"
          />
        </el-form-item>

        <el-divider content-position="left">营业状态</el-divider>
        <el-form-item label="暂停营业">
          <el-switch v-model="form.paused" active-text="是" inactive-text="否" />
          <span style="margin-left: 8px; font-size: 12px; color: #909399">
            开启后用户将无法下单
          </span>
        </el-form-item>

        <el-divider content-position="left">打印机配置</el-divider>
        <el-form-item label="打印机类型">
          <el-select v-model="form.printerConfig" placeholder="选择打印机" style="width: 100%">
            <el-option label="无" value="none" />
            <el-option label="飞鹅打印机" value="feie" />
            <el-option label="易联云打印机" value="yilianyun" />
            <el-option label="USB本地打印" value="usb" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.printerConfig === 'feie'" label="打印机编号">
          <el-input v-model="form.printerSN" placeholder="请输入打印机SN编码" />
        </el-form-item>
        <el-form-item v-if="form.printerConfig === 'feie'" label="打印机密钥">
          <el-input v-model="form.printerKey" placeholder="请输入打印机密钥" type="password" show-password />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">
            保存设置
          </el-button>
          <el-button @click="loadSettings">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSettings, updateSettings } from '@/api/settings'

const loading = ref(false)
const saving = ref(false)
const formRef = ref()

const form = reactive({
  openTime: '08:00',
  closeTime: '22:00',
  paused: false,
  printerConfig: 'none',
  printerSN: '',
  printerKey: '',
})

async function loadSettings() {
  loading.value = true
  try {
    const res: any = await getSettings()
    if (res) {
      form.openTime = res.openTime || '08:00'
      form.closeTime = res.closeTime || '22:00'
      form.paused = res.paused ?? false
      form.printerConfig = res.printerConfig || 'none'
      form.printerSN = res.printerSN || ''
      form.printerKey = res.printerKey || ''
    }
  } catch {
    // keep defaults
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await updateSettings({
      openTime: form.openTime,
      closeTime: form.closeTime,
      paused: form.paused,
      printerConfig: form.printerConfig,
    })
    ElMessage.success('保存成功')
  } catch {
    // handled by interceptor
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>
