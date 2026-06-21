<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { getPointsSummary, signIn, getPointsTransactions, exchange } from '@/api/points';
import type { PointsSummary, PointsTransaction } from '@/api/points';

const appStore = useAppStore();

const summary = ref<PointsSummary>({
  balance: 0,
  totalEarned: 0,
  consecutiveSignInDays: 0,
  todaySignedIn: false,
});
const transactions = ref<PointsTransaction[]>([]);
const loading = ref(true);
const signingIn = ref(false);
const exchangingId = ref<string | null>(null);

// 兑换规则 - 从品牌配置获取
const exchangeRules = computed(() =>
  (appStore.brandConfig?.exchangeRules || []) as { id: string; label: string; points: number; type: string }[],
);

async function loadSummary() {
  try {
    summary.value = await getPointsSummary();
  } catch (e) {
    console.error('[Points] 加载摘要失败', e);
  }
}

async function loadTransactions() {
  loading.value = true;
  try {
    const result = await getPointsTransactions({ page: 1, pageSize: 50 });
    transactions.value = result.items || [];
  } catch (e) {
    console.error('[Points] 加载交易记录失败', e);
  } finally {
    loading.value = false;
  }
}

async function onSignIn() {
  if (signingIn.value || summary.value.todaySignedIn) return;
  signingIn.value = true;
  try {
    const result = await signIn();
    summary.value = result;
    uni.showToast({ title: '签到成功', icon: 'success' });
    await loadTransactions();
  } catch (e) {
    console.error('[Points] 签到失败', e);
  } finally {
    signingIn.value = false;
  }
}

async function onExchange(rule: typeof exchangeRules[0]) {
  if (exchangingId.value) return;
  if (summary.value.balance < rule.points) {
    uni.showToast({ title: `积分不足，需要${rule.points}积分`, icon: 'none' });
    return;
  }
  const res = await uni.showModal({
    title: '确认兑换',
    content: `使用 ${rule.points} 积分兑换「${rule.label}」？`,
  });
  if (!res.confirm) return;

  exchangingId.value = rule.id;
  try {
    const result = await exchange(rule.id);
    summary.value.balance = result.afterBalance;
    uni.showToast({ title: '兑换成功', icon: 'success' });
    await loadTransactions();
  } catch (e) {
    console.error('[Points] 兑换失败', e);
  } finally {
    exchangingId.value = null;
  }
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

function getTransactionLabel(type: string): string {
  const map: Record<string, string> = {
    sign_in: '签到',
    exchange: '兑换',
    order_reward: '下单奖励',
    expire: '过期',
  };
  return map[type] || type;
}

onMounted(async () => {
  await Promise.all([loadSummary(), loadTransactions()]);
});
</script>

<template>
  <view class="page-container">
    <!-- 积分余额卡片 -->
    <view class="points-card">
      <text class="points-card__balance">{{ summary.balance }}</text>
      <text class="points-card__label">当前积分</text>
      <text class="points-card__total">累计获得：{{ summary.totalEarned }}</text>
    </view>

    <!-- 签到区域 -->
    <view class="sign-card card">
      <view class="sign-card__header">
        <text class="sign-card__title">每日签到</text>
        <text class="sign-card__days">
          已连续签到 {{ summary.consecutiveSignInDays }} 天
        </text>
      </view>
      <view
        class="sign-card__btn"
        :class="{
          'sign-card__btn--disabled': summary.todaySignedIn || signingIn,
        }"
        @tap="onSignIn"
      >
        <text>{{ summary.todaySignedIn ? '今日已签到' : signingIn ? '签到中...' : '签到领积分' }}</text>
      </view>
    </view>

    <!-- 兑换规则 -->
    <view v-if="exchangeRules.length > 0" class="card">
      <text class="section__title">积分兑换</text>
      <view class="exchange-grid">
        <view
          v-for="rule in exchangeRules"
          :key="rule.id"
          class="exchange-item"
        >
          <text class="exchange-item__points">{{ rule.points }}积分</text>
          <text class="exchange-item__reward">{{ rule.label }}</text>
          <view
            class="exchange-item__btn"
            :class="{ 'exchange-item__btn--disabled': exchangingId === rule.id || summary.balance < rule.points }"
            @tap="onExchange(rule)"
          >
            <text>{{ exchangingId === rule.id ? '兑换中...' : '兑换' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 积分记录 -->
    <view class="card">
      <text class="section__title">积分记录</text>
      <view v-if="transactions.length > 0">
        <view
          v-for="tx in transactions"
          :key="tx.id"
          class="tx-item"
        >
          <view class="tx-item__left">
            <text class="tx-item__type">{{ getTransactionLabel(tx.type) }}</text>
            <text class="tx-item__time">{{ formatTime(tx.createdAt) }}</text>
          </view>
          <text
            class="tx-item__amount"
            :class="{ 'tx-item__amount--positive': tx.amount > 0 }"
          >
            {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }}
          </text>
        </view>
      </view>
      <view v-else class="empty-row">
        <text class="empty-row__text">暂无积分记录</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.points-card {
  background: linear-gradient(135deg, #FF6B35, #FF8C42);
  padding: $spacing-xl $spacing-base;
  text-align: center;
  color: $text-white;

  &__balance {
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

  &__total {
    font-size: $font-size-sm;
    opacity: 0.8;
    margin-top: $spacing-xs;
    display: block;
  }
}

.sign-card {
  display: flex;
  align-items: center;
  justify-content: space-between;

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
    display: block;
  }

  &__days {
    font-size: $font-size-sm;
    color: $warning-color;
    margin-top: 4rpx;
    display: block;
  }

  &__btn {
    padding: $spacing-sm $spacing-lg;
    background-color: $primary-color;
    color: $text-white;
    border-radius: 40rpx;
    font-size: $font-size-base;
    font-weight: 500;

    &--disabled {
      background-color: $bg-dark;
      color: $text-secondary;
    }
  }
}

.section__title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
  display: block;
  margin-bottom: $spacing-base;
}

.exchange-grid {
  display: flex;
  gap: $spacing-sm;
}

.exchange-item {
  flex: 1;
  background-color: $bg-page;
  border-radius: $radius-sm;
  padding: $spacing-base;
  text-align: center;

  &__points {
    font-size: $font-size-xl;
    font-weight: 700;
    color: #FF6B35;
    display: block;
  }

  &__reward {
    font-size: $font-size-sm;
    color: $text-regular;
    margin: $spacing-xs 0;
    display: block;
  }

  &__btn {
    padding: 6rpx $spacing-lg;
    background-color: $primary-color;
    color: $text-white;
    border-radius: 40rpx;
    font-size: $font-size-sm;
    display: inline-block;
    margin-top: $spacing-xs;

    &--disabled {
      background-color: $bg-dark;
      color: $text-secondary;
    }
  }
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

    &--positive {
      color: $primary-color;
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
</style>
