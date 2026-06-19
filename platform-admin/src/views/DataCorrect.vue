<template>
  <div class="data-correct">
    <h2 class="page-title">数据修正</h2>
    <p class="page-sub">管理员专用数据修正工具 — 用于修复异常数据，操作记录会写入审计日志</p>

    <el-card shadow="never" style="max-width:640px">
      <el-alert type="warning" title="此操作会直接修改数据库记录，请确认数据无误后再执行" :closable="false" show-icon style="margin-bottom:24px" />

      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="目标类型" prop="targetType">
          <el-select v-model="form.targetType" placeholder="选择要修正的数据类型" style="width:100%">
            <el-option label="订单 (Order)" value="order" />
            <el-option label="团购订单 (GroupOrder)" value="group-order" />
            <el-option label="菜品 (Dish)" value="dish" />
            <el-option label="用户 (User)" value="user" />
            <el-option label="商家 (Tenant)" value="tenant" />
          </el-select>
        </el-form-item>

        <el-form-item label="目标ID" prop="targetId">
          <el-input v-model="form.targetId" placeholder="输入要修正的记录ID" />
        </el-form-item>

        <el-form-item label="修正字段" prop="correctionsJson">
          <el-input
            v-model="form.correctionsJson"
            type="textarea"
            :rows="4"
            placeholder='JSON格式，如: {"status": "completed", "totalAmount": 2800}'
          />
          <small style="color:var(--p-muted)">金额单位为「分」。格式错误将无法提交。</small>
        </el-form-item>

        <el-form-item label="修正原因" prop="reason">
          <el-input v-model="form.reason" placeholder="说明为什么要修正此数据" />
        </el-form-item>

        <el-form-item label="管理员密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="输入您的登录密码以确认操作" show-password />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">
            <el-icon><Check /></el-icon> 执行修正
          </el-button>
          <el-button @click="resetForm">重置表单</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import axios from 'axios'

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  targetType: '',
  targetId: '',
  correctionsJson: '',
  reason: '',
  password: '',
})

const rules: FormRules = {
  targetType: [{ required: true, message: '请选择目标类型', trigger: 'change' }],
  targetId: [{ required: true, message: '请输入目标ID', trigger: 'blur' }],
  correctionsJson: [
    { required: true, message: '请输入修正字段', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try { JSON.parse(value); callback() }
        catch { callback(new Error('JSON格式无效')) }
      },
      trigger: 'blur',
    },
  ],
  reason: [{ required: true, message: '请输入修正原因', trigger: 'blur' }],
  password: [{ required: true, message: '请输入管理员密码', trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const token = localStorage.getItem('p_token')
    const corrections = JSON.parse(form.correctionsJson)
    await axios.post('/api/admin/orders/correct', {
      targetType: form.targetType,
      targetId: form.targetId,
      corrections,
      reason: form.reason,
      password: form.password,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ElMessage.success('数据修正成功')
    resetForm()
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '修正失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.targetType = ''
  form.targetId = ''
  form.correctionsJson = ''
  form.reason = ''
  form.password = ''
  formRef.value?.resetFields()
}
</script>

<style scoped>
.page-title { font-size:20px; font-weight:700; color:var(--p-fg); margin:0 0 4px }
.page-sub { font-size:13px; color:var(--p-muted); margin:0 0 20px }
</style>
