<template>
  <div class="tenant-detail">
    <div class="page-header">
      <el-button @click="$router.back()" :icon="ArrowLeft" text>返回商家列表</el-button>
      <h2 class="page-title" v-if="tenant">{{ tenant.name }}</h2>
    </div>

    <el-tabs v-model="activeTab" type="border-card" v-loading="loading">
      <!-- Tab 1: 基本信息 -->
      <el-tab-pane label="基本信息" name="info">
        <el-descriptions :column="2" border v-if="tenant">
          <el-descriptions-item label="商家ID">{{ tenant.id }}</el-descriptions-item>
          <el-descriptions-item label="AppID">
            <el-tag size="small" type="info">{{ tenant.appId }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="商家名称">{{ tenant.name }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTag(tenant.status)">{{ statusLabel(tenant.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="License">
            <span v-if="tenant.licenseKey" style="font-family:monospace;font-size:12px">{{ tenant.licenseKey }}</span>
            <el-tag v-else size="small" type="danger">未签发</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="到期时间">{{ tenant.expireAt ? new Date(tenant.expireAt).toLocaleDateString('zh-CN') : '永久' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ new Date(tenant.createdAt).toLocaleString('zh-CN') }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ new Date(tenant.updatedAt).toLocaleString('zh-CN') }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <!-- Tab 2: 编辑信息 -->
      <el-tab-pane label="编辑信息" name="edit">
        <el-form :model="editForm" label-width="100px" style="max-width:500px" v-if="tenant">
          <el-form-item label="商家名称">
            <el-input v-model="editForm.name" placeholder="商家名称" />
          </el-form-item>
          <el-form-item label="到期时间">
            <el-date-picker v-model="editForm.expireAt" type="date" placeholder="选择到期日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="editForm.status" style="width:100%">
              <el-option label="运营中" value="active" />
              <el-option label="已过期" value="expired" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveEdit" :loading="editLoading">保存修改</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Tab 3: 审核 -->
      <el-tab-pane label="审核" name="review">
        <el-alert :title="tenant?.status === 'active' ? '该商家已审核通过' : '该商家待审核'" :type="tenant?.status === 'active' ? 'success' : 'warning'" show-icon style="margin-bottom:20px" />

        <!-- 审核材料 -->
        <el-descriptions title="入驻审核材料" :column="2" border style="margin-bottom:20px">
          <el-descriptions-item v-for="doc in documents" :key="doc.key" :label="doc.label">
            <template v-if="doc.url">
              <el-link :href="doc.url" target="_blank" type="primary">查看</el-link>
              <el-button link type="danger" size="small" @click="removeDoc(doc.key)" style="margin-left:8px">删除</el-button>
            </template>
            <template v-else>
              <el-upload
                :action="uploadUrl"
                :headers="uploadHeaders"
                :on-success="(res: any) => onDocUpload(doc.key, res)"
                :show-file-list="false"
                accept="image/*"
              >
                <el-button size="small" text type="primary">
                  <el-icon><Upload /></el-icon> 上传
                </el-button>
              </el-upload>
            </template>
          </el-descriptions-item>
        </el-descriptions>

        <div style="display:flex;gap:12px">
          <el-button type="success" @click="handleReview(true)" :loading="reviewLoading" :disabled="tenant?.status === 'active'">
            <el-icon><Select /></el-icon> 审核通过
          </el-button>
          <el-button type="danger" @click="showReject = true" :loading="reviewLoading" :disabled="tenant?.status === 'expired'">
            <el-icon><CloseBold /></el-icon> 驳回
          </el-button>
        </div>
        <!-- Reject reason dialog -->
        <el-dialog v-model="showReject" title="驳回理由" width="420px" append-to-body>
          <el-input v-model="rejectReason" type="textarea" :rows="3" placeholder="请填写驳回理由，将通知商家" />
          <template #footer>
            <el-button @click="showReject = false">取消</el-button>
            <el-button type="danger" @click="handleReview(false)" :loading="reviewLoading">确认驳回</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <!-- Tab 4: 模块管理 -->
      <el-tab-pane label="模块管理" name="modules">
        <el-table :data="moduleTable" stripe>
          <el-table-column label="模块" min-width="140">
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <br><small style="color:var(--p-muted)">{{ row.description || row.moduleId }}</small>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.active ? 'success' : row.assigned ? 'warning' : 'info'">
                {{ row.active ? '已激活' : row.assigned ? '已过期' : '未开通' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="SaaS年费" width="100">
            <template #default="{ row }">¥{{ (row.priceYearly || 0).toLocaleString() }}/年</template>
          </el-table-column>
          <el-table-column label="源码价格" width="100">
            <template #default="{ row }">¥{{ ((row.priceSourceCode || 0) / 100).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="到期" width="110">
            <template #default="{ row }">{{ row.expireAt ? new Date(row.expireAt).toLocaleDateString('zh-CN') : '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-switch
                v-if="row.moduleId !== 'base'"
                :model-value="row.active"
                :loading="row.saving"
                @change="(val: boolean) => toggleModule(row, val)"
                active-text="开"
                inactive-text="关"
              />
              <el-tag v-else size="small" type="info">必选</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Tab 4.5: 购买记录 -->
      <el-tab-pane label="购买记录" name="purchases">
        <el-table :data="purchases" stripe v-loading="purchaseLoading" empty-text="暂无购买记录">
          <el-table-column label="模块" width="140">
            <template #default="{ row }">{{ row.moduleId }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.action === 'purchase' ? 'success' : row.action === 'renew' ? '' : 'danger'">{{ row.action }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120">
            <template #default="{ row }">¥{{ (row.amount / 100).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Tab 5: License -->
      <el-tab-pane label="License" name="license">
        <el-descriptions :column="1" border style="margin-bottom:20px" v-if="tenant">
          <el-descriptions-item label="当前License">
            <span v-if="tenant.licenseKey" style="font-family:monospace">{{ tenant.licenseKey }}</span>
            <el-tag v-else type="danger" size="small">未签发</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ tenant.status }}</el-descriptions-item>
        </el-descriptions>
        <div style="display:flex;gap:12px">
          <el-button type="primary" @click="handleLicense('issue')" :loading="licenseLoading">签发 License</el-button>
          <el-button type="danger" @click="handleLicense('revoke')" :loading="licenseLoading" :disabled="!tenant?.licenseKey">吊销 License</el-button>
        </div>
        <el-alert type="warning" title="吊销 License 后，B端将立即无法登录" :closable="false" style="margin-top:16px" v-if="tenant?.licenseKey" />
      </el-tab-pane>

      <!-- Tab 6: 源码交付 -->
      <el-tab-pane label="源码交付" name="source">
        <!-- 上次交付 -->
        <el-descriptions v-if="lastDelivery" title="上次交付" :column="2" border style="margin-bottom:16px">
          <el-descriptions-item label="版本">{{ lastDelivery.version }}</el-descriptions-item>
          <el-descriptions-item label="价格">¥{{ (lastDelivery.price / 100).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="模块数">{{ lastDelivery.moduleSnapshot?.length || 0 }}个</el-descriptions-item>
          <el-descriptions-item label="时间">{{ new Date(lastDelivery.deliveredAt || lastDelivery.createdAt).toLocaleString('zh-CN') }}</el-descriptions-item>
        </el-descriptions>

        <!-- 询价 -->
        <el-card shadow="never" style="margin-bottom:16px">
          <template #header><span style="font-weight:600">交付询价</span></template>
          <el-button type="primary" @click="fetchQuote" :loading="quoteLoading" :disabled="!tenant?.licenseKey">
            <el-icon><Search /></el-icon> 计算增量交付费用
          </el-button>
        </el-card>

        <!-- 报价结果 -->
        <el-card v-if="quote" shadow="never" style="margin-bottom:16px;border-color:var(--p-accent)">
          <template #header><span style="font-weight:600;color:var(--p-accent)">报价明细</span></template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="新增模块">{{ quote.newModules?.join(', ') || '(无)' }}</el-descriptions-item>
            <el-descriptions-item label="基础升级费">¥{{ (quote.breakdown.baseUpgradeFee / 100).toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="新模块费">
              <span v-for="m in quote.breakdown.newModuleFees" :key="m.moduleId" style="display:block;font-size:12px">
                {{ m.moduleId }}: ¥{{ (m.price / 100).toFixed(2) }}
              </span>
              <span v-if="!quote.breakdown.newModuleFees?.length" style="color:var(--p-muted)">无</span>
            </el-descriptions-item>
            <el-descriptions-item label="应付">
              <strong style="color:var(--p-accent);font-size:16px">¥{{ (quote.breakdown.finalPrice / 100).toFixed(2) }}</strong>
            </el-descriptions-item>
          </el-descriptions>
          <div style="margin-top:12px">
            <el-button type="primary" @click="handleExecuteDelivery" :loading="deliveryLoading" :disabled="!quote.newModules?.length">
              确认交付 (¥{{ (quote.breakdown.finalPrice / 100).toFixed(2) }})
            </el-button>
          </div>
        </el-card>

        <!-- 交付历史 -->
        <el-table :data="deliveries" stripe v-loading="deliveryHistoryLoading" empty-text="暂无交付记录">
          <el-table-column prop="version" label="版本" width="140" />
          <el-table-column label="模块" min-width="200">
            <template #default="{ row }">{{ (row.moduleSnapshot || []).join(', ') }}</template>
          </el-table-column>
          <el-table-column label="价格" width="120">
            <template #default="{ row }">¥{{ ((row.price || 0) / 100).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'completed' ? 'success' : 'warning'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Tab 7: 危险操作 -->
      <el-tab-pane label="危险操作" name="danger">
        <el-alert type="error" title="以下操作不可逆，请谨慎操作" :closable="false" show-icon style="margin-bottom:20px" />
        <el-card shadow="never" style="border:1px solid var(--el-color-danger-light-5)">
          <template #header><span style="color:var(--el-color-danger);font-weight:700">删除商家</span></template>
          <p style="color:var(--p-muted);font-size:13px;margin-bottom:12px">删除后该商家的所有数据（菜品、订单、用户等）将无法访问。此操作不可撤销。</p>
          <el-input v-model="deleteConfirm" placeholder="请输入商家名称以确认删除" style="max-width:360px;margin-bottom:12px" />
          <br>
          <el-button type="danger" @click="handleDelete" :loading="deleteLoading" :disabled="deleteConfirm !== tenant?.name">
            <el-icon><Delete /></el-icon> 确认删除此商家
          </el-button>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Select, CloseBold, Delete, Upload, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getTenantDetail, updateTenant, reviewTenant, assignModules, updateLicense, deleteTenant, updateTenantDocuments, getModulePurchases, getSourceQuote, executeSourceDelivery, getSourceDeliveries } from '@/api/admin'

const route = useRoute()
const router = useRouter()
const tenantId = route.params.id as string

const loading = ref(false)
const activeTab = ref('info')
const tenant = ref<any>(null)
const reviewLoading = ref(false)
const showReject = ref(false)
const rejectReason = ref('')
const licenseLoading = ref(false)
const editLoading = ref(false)
const deleteLoading = ref(false)
const tenantModules = ref<any[]>([])
const deleteConfirm = ref('')

// Documents
const documents = ref([
  { key: 'bizLicense', label: '营业执照', url: '' },
  { key: 'foodPermit', label: '食品经营许可证', url: '' },
  { key: 'idCard', label: '法人身份证', url: '' },
  { key: 'storePhoto', label: '门店照片', url: '' },
])
const uploadUrl = '/api/upload'
const uploadHeaders = computed(() => ({
  Authorization: 'Bearer ' + localStorage.getItem('p_token'),
  'x-tenant-id': tenantId,
}))

async function onDocUpload(key: string, res: any) {
  const doc = documents.value.find(d => d.key === key)
  if (doc && res?.urls?.length) {
    doc.url = res.urls[0]
    // Persist to backend
    const payload: any = {}
    payload[key === 'bizLicense' ? 'bizLicenseUrl' : key === 'foodPermit' ? 'foodPermitUrl' : key === 'idCard' ? 'idCardUrl' : 'storePhotoUrl'] = doc.url
    try { await updateTenantDocuments(tenantId, payload) } catch { /* non-critical */ }
  }
  ElMessage.success('上传成功')
}

function removeDoc(key: string) {
  const doc = documents.value.find(d => d.key === key)
  if (doc) doc.url = ''
}

const editForm = ref({ name: '', status: 'active', expireAt: '' })

const MODULE_LIST = [
  { moduleId: 'base', name: '基础模块', description: '品牌配置+点餐+支付+订单', priceYearly: 1999, priceSourceCode: 800000 },
  { moduleId: 'group-meal', name: '团体订餐', description: '团购订单功能', priceYearly: 1500, priceSourceCode: 1180000 },
  { moduleId: 'discount', name: '折扣引擎', description: '满减/打折/赠品', priceYearly: 1200, priceSourceCode: 500000 },
  { moduleId: 'coupon', name: '优惠券', description: '模板+发放+核销', priceYearly: 1200, priceSourceCode: 500000 },
  { moduleId: 'points', name: '积分系统', description: '签到+消费积分+兑换', priceYearly: 1200, priceSourceCode: 400000 },
  { moduleId: 'prepaid', name: '预充值', description: '储值卡购买使用', priceYearly: 1000, priceSourceCode: 600000 },
  { moduleId: 'printer', name: '小票打印', description: '易联云/飞鹅/商米', priceYearly: 800, priceSourceCode: 300000 },
  { moduleId: 'push-notify', name: '消息推送', description: '微信订阅消息', priceYearly: 1000, priceSourceCode: 200000 },
  { moduleId: 'advanced-stats', name: '高级报表', description: '品类分析/时段分析', priceYearly: 1500, priceSourceCode: 500000 },
]

// Module table combining all modules with tenant assignment status
const moduleTable = computed(() => {
  const assignedMap = new Map(tenantModules.value.map((m: any) => [m.moduleId, m]))
  return MODULE_LIST.map((mod) => {
    const assigned = assignedMap.get(mod.moduleId)
    return {
      ...mod,
      assigned: !!assigned,
      active: assigned?.status === 'active',
      expireAt: assigned?.expireAt || null,
      saving: false,
    }
  })
})

function statusTag(s: string) { return s === 'active' ? 'success' : s === 'expired' ? 'danger' : 'warning' }
function statusLabel(s: string) { return s === 'active' ? '运营中' : s === 'expired' ? '已过期' : s }

async function fetchTenant() {
  loading.value = true
  try {
    const res: any = await getTenantDetail(tenantId)
    tenant.value = res.data || res
    tenantModules.value = tenant.value.modules || []
    editForm.value = { name: tenant.value.name, status: tenant.value.status, expireAt: tenant.value.expireAt || '' }
    // Load existing document URLs
    const t = tenant.value
    documents.value[0].url = t.bizLicenseUrl || ''
    documents.value[1].url = t.foodPermitUrl || ''
    documents.value[2].url = t.idCardUrl || ''
    documents.value[3].url = t.storePhotoUrl || ''
  } catch { ElMessage.error('加载商家详情失败') }
  finally { loading.value = false }
}

async function saveEdit() {
  editLoading.value = true
  try {
    await updateTenant(tenantId, {
      name: editForm.value.name,
      status: editForm.value.status,
      expireAt: editForm.value.expireAt || undefined,
    })
    ElMessage.success('信息已更新')
    fetchTenant()
  } catch { ElMessage.error('保存失败') }
  finally { editLoading.value = false }
}

async function handleReview(approved: boolean) {
  if (!approved) {
    // For reject: check reason, then proceed
    showReject.value = false
    if (!rejectReason.value.trim()) {
      ElMessage.warning('请填写驳回理由')
      showReject.value = true
      return
    }
    try { await ElMessageBox.confirm('确认驳回该商家？', '审核确认', { type: 'warning' }) } catch { return }
  } else {
    try { await ElMessageBox.confirm('确认审核通过该商家？', '审核确认', { type: 'warning' }) } catch { return }
  }
  reviewLoading.value = true
  try {
    await reviewTenant(tenantId, approved, rejectReason.value || undefined)
    ElMessage.success(approved ? '审核通过' : '已驳回')
    rejectReason.value = ''
    fetchTenant()
  } catch { ElMessage.error('操作失败') }
  finally { reviewLoading.value = false }
}

async function toggleModule(row: any, enable: boolean) {
  row.saving = true
  try {
    const currentIds = tenantModules.value
      .filter((m: any) => m.status === 'active')
      .map((m: any) => m.moduleId)
    const newIds = enable
      ? [...currentIds, row.moduleId]
      : currentIds.filter((id: string) => id !== row.moduleId)
    // Always include base
    if (!newIds.includes('base')) newIds.unshift('base')
    await assignModules(tenantId, [...new Set(newIds)])
    // Refresh
    const res: any = await getTenantDetail(tenantId)
    tenantModules.value = (res.data || res).modules || []
    ElMessage.success(enable ? `${row.name} 已开通` : `${row.name} 已关闭`)
  } catch { ElMessage.error('操作失败') }
  finally { row.saving = false }
}

async function handleLicense(action: 'issue' | 'revoke') {
  const msg = action === 'revoke' ? '吊销后B端将立即无法登录，确认？' : '确认签发新License？'
  try { await ElMessageBox.confirm(msg, 'License操作', { type: 'warning' }) } catch { return }
  licenseLoading.value = true
  try {
    await updateLicense(tenantId, action)
    ElMessage.success(action === 'issue' ? 'License已签发' : 'License已吊销')
    fetchTenant()
  } catch { ElMessage.error('操作失败') }
  finally { licenseLoading.value = false }
}

const purchaseLoading = ref(false)
const purchases = ref<any[]>([])

async function fetchPurchases() {
  purchaseLoading.value = true
  try {
    const res: any = await getModulePurchases(tenantId)
    purchases.value = (res.data || res) || []
  } catch { purchases.value = [] }
  finally { purchaseLoading.value = false }
}

// Source Delivery
const quoteLoading = ref(false)
const deliveryLoading = ref(false)
const deliveryHistoryLoading = ref(false)
const quote = ref<any>(null)
const deliveries = ref<any[]>([])
const lastDelivery = ref<any>(null)

async function fetchQuote() {
  quoteLoading.value = true
  try {
    const res: any = await getSourceQuote(tenantId)
    quote.value = (res.data || res)
    lastDelivery.value = quote.value.lastDelivery
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '询价失败')
  } finally { quoteLoading.value = false }
}

async function handleExecuteDelivery() {
  try {
    await ElMessageBox.confirm(
      `确认以 ¥${(quote.value.breakdown.finalPrice / 100).toFixed(2)} 执行源码交付？`,
      '确认交付', { type: 'warning' }
    )
  } catch { return }
  deliveryLoading.value = true
  try {
    await executeSourceDelivery(tenantId)
    ElMessage.success('交付已创建')
    quote.value = null
    fetchDeliveries()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '交付失败')
  } finally { deliveryLoading.value = false }
}

async function fetchDeliveries() {
  deliveryHistoryLoading.value = true
  try {
    const res: any = await getSourceDeliveries(tenantId)
    deliveries.value = (res.data || res) || []
    if (deliveries.value.length) lastDelivery.value = deliveries.value[0]
  } catch { deliveries.value = [] }
  finally { deliveryHistoryLoading.value = false }
}

// Load purchases when tab changes
watch(activeTab, (tab) => {
  if (tab === 'purchases') fetchPurchases()
  if (tab === 'source') fetchDeliveries()
})

async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      `确定要删除商家「${tenant.value.name}」吗？此操作不可撤销！`,
      '最终确认',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch { return }
  deleteLoading.value = true
  try {
    await deleteTenant(tenantId)
    ElMessage.success('商家已删除')
    router.replace('/tenants')
  } catch { ElMessage.error('删除失败') }
  finally { deleteLoading.value = false }
}

onMounted(fetchTenant)
watch(() => route.params.id, (id) => { if (id) fetchTenant() })
</script>

<style scoped>
.page-header { display:flex; align-items:center; gap:16px; margin-bottom:20px }
.page-title { font-size:20px; font-weight:700; color:var(--p-fg); margin:0 }
.module-active { border-color: var(--p-accent); background: #f0f6ff }
</style>
