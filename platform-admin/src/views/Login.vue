<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">campus-order 平台管理</h1>
      <p class="login-subtitle">Portal Admin</p>

      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" placeholder="密码" type="password" size="large" show-password :prefix-icon="Lock" />
        </el-form-item>
        <el-form-item style="margin-top:16px">
          <el-button type="primary" size="large" :loading="loading" @click="handleLogin" style="width:100%;background:#4a90d9;border-color:#4a90d9">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { login } from '@/api/admin'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const res: any = await login(form.username, form.password)
    localStorage.setItem('p_token', res?.data?.token || '')
    localStorage.setItem('p_tenantId', res?.data?.user?.tenantId || '')
    localStorage.setItem('p_user', JSON.stringify(res?.data?.user || {}))
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '登录失败，请检查用户名和密码')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
}

.login-card {
  width: 420px;
  padding: 48px 40px 36px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a2e;
  text-align: center;
  margin: 0 0 4px;
}

.login-subtitle {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  margin: 0 0 32px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
</style>
