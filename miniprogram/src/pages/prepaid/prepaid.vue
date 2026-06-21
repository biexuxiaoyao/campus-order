<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { getBalance, recharge, getTransactions } from '@/api/prepaid';
import type { PrepaidBalance, PrepaidTransaction } from '@/api/prepaid';

const appStore = useAppStore();

const balance = ref<PrepaidBalance>({
  personalBalance: 0,
  companyBalance: 0,
  totalBalance: 0,
});
const transactions = ref<PrepaidTransaction[]>([]);
const loading = ref(true);

const showRechargeModal = ref(false);
const rechargeAmount = ref('');
const rechargeType = ref<'personal' | 'company'>('personal');
const recharging = ref(false);

const rechargeOptions = computed(() => appStore.brandConfig?.rechargeOptions || [50, 100, 200, 500]);

function formatPrice(price: number): string {
  return (price / 100).toFixed(2);
}

function formatTime(time: string): string {
  if (!time) return '';
  const d = new Date(time);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${mins}`;
}

function getTransactionLabel(tx: PrepaidTransaction): string {
  const map: Record<string, string> = {
    recharge: '充值',
    refund: '退款',
    consume: '消费',
  };
  return map[tx.type] || tx.type;
}

function getAmountClass(tx: PrepaidTransaction): string {
  if (tx.type === 'recharge') return 'amount--positive';
  if (tx.type === 'consume') return 'amount--negative';
  return '';
}

async function loadBalance() {
  try {
    balance.value = await getBalance();
  } catch (e) {
    console.error('[Prepaid] 加载余额失败', e);
  }
}

async function loadTransactions() {
  loading.value = true;
  try {
    const result = await getTransactions({ page: 1, pageSize: 50 });
    transactions.value = result.items || [];
  } catch (e) {
    console.error('[Prepaid] 加载交易记录失败', e);
  } finally {
    loading.value = false;
  }
}

function onOpenRecharge() {
  rechargeAmount.value = '';
  rechargeType.value = 'personal';
  showRechargeModal.value = true;
}

function onSelectAmount(amount: number) {
  rechargeAmount.value = String(amount);
}

async function onSubmitRecharge() {
  const amount = Number(rechargeAmount.value);
  if (!amount || amount <= 0) {
    uni.showToast({ title: '请输入充值金额', icon: 'none' });
    return;
  }

  recharging.value = true;
  try {
    await recharge(amount, rechargeType.value);
    uni.showToast({ title: '充值成功', icon: 'success' });
    showRechargeModal.value = false;
    await loadBalance();
    await loadTransactions();
  } catch (e) {
    console.error('[Prepaid] 充值失败', e);
  } finally {
    recharging.value = false;
  }
}

onMounted(() => {
  loadBalance();
  loadTransactions();
});
</script>

<template>
  <view class="page-container">
    <!-- 余额卡片 -->
    <view class="balance-card">
      <text class="balance-card__total">¥{{ formatPrice(balance.totalBalance) }}</text>
      <text class="balance-card__label">总余额</text>
    </view>

    <!-- 子余额 -->
    <view class="sub-balance">
      <view class="sub-balance__item card">
        <text class="sub-balance__value">¥{{ formatPrice(balance.personalBalance) }}</text>
        <text class="sub-balance__label">个人余额</text>
      </view>
      <view class="sub-balance__item card">
        <text class="sub-balance__value">¥{{ formatPrice(balance.companyBalance) }}</text>
        <text class="sub-balance__label">企业余额</text>
      </view>
    </view>

    <!-- 充值按钮 -->
    <view class="action-row">
      <view class="recharge-btn" @tap="onOpenRecharge">
        <text>充值</text>
      </view>
    </view>

    <!-- 交易记录 -->
    <view class="card">
      <text class="section__title">交易记录</text>
      <view v-if="transactions.length > 0">
        <view
          v-for="tx in transactions"
          :key="tx.id"
          class="tx-item"
        >
          <view class="tx-item__left">
            <text class="tx-item__type">{{ getTransactionLabel(tx) }}</text>
            <text class="tx-item__time">{{ formatTime(tx.createdAt) }}</text>
          </view>
          <text
            class="tx-item__amount"
            :class="getAmountClass(tx)"
          >
            {{ tx.type === 'recharge' ? '+' : tx.type === 'consume' ? '-' : '' }}
            ¥{{ formatPrice(tx.amount) }}
          </text>
        </view>
      </view>
      <view v-else class="empty-row">
        <text class="empty-row__text">暂无交易记录</text>
      </view>
    </view>

    <!-- 充值弹窗 -->
    <view v-if="showRechargeModal" class="modal-overlay" @tap="showRechargeModal = false">
      <view class="modal-panel" @tap.stop="">
        <text class="modal__title">充值</text>

        <!-- 充值类型 -->
        <view class="modal__type">
          <view
            class="modal__type-item"
            :class="{ 'modal__type-item--active': rechargeType === 'personal' }"
            @tap="rechargeType = 'personal'"
          >
            <text>个人充值</text>
          </view>
          <view
            class="modal__type-item"
            :class="{ 'modal__type-item--active': rechargeType === 'company' }"
            @tap="rechargeType = 'company'"
          >
            <text>企业充值</text>
          </view>
        </view>

        <!-- 金额输入 -->
        <view class="modal__amount">
          <text class="modal__amount-symbol">¥</text>
          <input
            v-model="rechargeAmount"
            class="modal__amount-input"
            type="digit"
            placeholder="请输入充值金额"
            focus
          />
        </view>

        <!-- 快捷金额 -->
        <view class="modal__quick">
          <view
            v-for="opt in rechargeOptions"
            :key="opt"
            class="modal__quick-item"
            :class="{ 'modal__quick-item--active': rechargeAmount === String(opt) }"
            @tap="onSelectAmount(opt)"
          >
            <text>¥{{ opt }}</text>
          </view>
        </view>

        <!-- 确认按钮 -->
        <view
          class="modal__btn"
          :class="{ 'modal__btn--disabled': recharging }"
          @tap="onSubmitRecharge"
        >
          <text>{{ recharging ? '充值中...' : '确认充值' }}</text>
        </view>

        <!-- 取消 -->
        <view class="modal__cancel" @tap="showRechargeModal = false">
          <text>取消</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.balance-card {
  background: linear-gradient(135deg, #1565C0, #1976D2);
  padding: $spacing-xl $spacing-base;
  text-align: center;
  color: $text-white;

  &__total {
    font-size: 72rpx;
    font-weight: 700;
    display: block;
  }

  &__label {
    font-size: $font-size-base;
    opacity: 0.9;
    margin-top: $spacing-xs;
    display: block;
  }
}

.sub-balance {
  display: flex;
  gap: $spacing-sm;
  padding: $spacing-base;
  margin-top: -24rpx;
  position: relative;
  z-index: 1;

  &__item {
    flex: 1;
    text-align: center;
    margin: 0;
  }

  &__value {
    font-size: $font-size-xxl;
    font-weight: 700;
    color: $primary-color;
    display: block;
  }

  &__label {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: $spacing-xs;
    display: block;
  }
}

.action-row {
  display: flex;
  justify-content: center;
  padding: $spacing-base;
}

.recharge-btn {
  padding: $spacing-sm $spacing-xl;
  background-color: $primary-color;
  color: $text-white;
  border-radius: 40rpx;
  font-size: $font-size-lg;
  font-weight: 500;
  min-width: 300rpx;
  text-align: center;
}

.section__title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
  display: block;
  margin-bottom: $spacing-base;
}

.tx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-sm 0;

  & + & {
    border-top: 1rpx solid $border-light;
  }

  &__type {
    font-size: $font-size-base;
    color: $text-primary;
    display: block;
  }

  &__time {
    font-size: $font-size-sm;
    color: $text-secondary;
    display: block;
    margin-top: 4rpx;
  }

  &__amount {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-regular;

    &.amount--positive {
      color: $primary-color;
    }

    &.amount--negative {
      color: $text-primary;
    }
  }
}

.empty-row {
  text-align: center;
  padding: $spacing-xl 0;

  &__text {
    font-size: $font-size-base;
    color: $text-secondary;
  }
}

// 充值弹窗
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.modal-panel {
  width: 100%;
  background-color: $bg-primary;
  border-radius: $radius-lg $radius-lg 0 0;
  padding: $spacing-xl $spacing-base;
  padding-bottom: calc($spacing-xl + env(safe-area-inset-bottom));
}

.modal__title {
  font-size: $font-size-xl;
  font-weight: 600;
  color: $text-primary;
  display: block;
  text-align: center;
  margin-bottom: $spacing-lg;
}

.modal__type {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-lg;

  &-item {
    flex: 1;
    text-align: center;
    padding: $spacing-base;
    border-radius: $radius-sm;
    background-color: $bg-page;
    font-size: $font-size-base;
    color: $text-regular;

    &--active {
      background-color: $primary-light;
      color: $primary-color;
      border: 1rpx solid $primary-color;
    }
  }
}

.modal__amount {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-base 0;
  border-bottom: 2rpx solid $border-color;
  margin-bottom: $spacing-lg;

  &-symbol {
    font-size: $font-size-xxl;
    font-weight: 600;
    color: $text-primary;
    margin-right: $spacing-xs;
  }

  &-input {
    font-size: 48rpx;
    font-weight: 700;
    color: $text-primary;
    width: 300rpx;
    text-align: center;
  }
}

.modal__quick {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-xl;

  &-item {
    flex: 1;
    text-align: center;
    padding: $spacing-base;
    border-radius: $radius-sm;
    background-color: $bg-page;
    font-size: $font-size-base;
    color: $text-regular;

    &--active {
      background-color: $primary-light;
      color: $primary-color;
    }
  }
}

.modal__btn {
  background-color: $primary-color;
  color: $text-white;
  text-align: center;
  padding: $spacing-base;
  border-radius: $radius-base;
  font-size: $font-size-lg;
  font-weight: 500;
  margin-bottom: $spacing-base;

  &--disabled {
    opacity: 0.6;
  }
}

.modal__cancel {
  text-align: center;
  padding: $spacing-sm 0;

  text {
    font-size: $font-size-base;
    color: $text-secondary;
  }
}
</style>
