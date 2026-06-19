<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { getBalance } from '@/api/prepaid';
import { getPointsSummary } from '@/api/points';

const authStore = useAuthStore();
const appStore = useAppStore();

// 余额和积分摘要
const balanceInfo = ref({ totalBalance: 0 });
const pointsInfo = ref({ balance: 0 });

const allMenuItems = [
  { icon: '&#128220;', label: '我的订单', url: '/pages/orders/orders', module: null, isTab: true },
  { icon: '&#127873;', label: '积分中心', url: '/pages/points/points', module: 'points', isTab: false },
  { icon: '&#127991;', label: '我的优惠券', url: '/pages/coupons/coupons', module: 'coupon', isTab: false },
  { icon: '&#128179;', label: '预充值余额', url: '/pages/prepaid/prepaid', module: 'prepaid', isTab: false },
];

const menuItems = computed(() =>
  allMenuItems.filter((item) => item.module === null || appStore.hasModule(item.module)),
);

function formatPrice(price: number): string {
  return (price / 100).toFixed(2);
}

async function loadSummary() {
  try {
    const [balance, points] = await Promise.all([
      getBalance(),
      getPointsSummary(),
    ]);
    balanceInfo.value = balance;
    pointsInfo.value = points;
  } catch (e) {
    // 静默失败，不影响页面展示
  }
}

function onMenuItemClick(item: (typeof allMenuItems)[number]) {
  if (item.isTab) {
    uni.switchTab({ url: item.url });
  } else {
    uni.navigateTo({ url: item.url });
  }
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确认退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        authStore.logout();
      }
    },
  });
}

onMounted(() => {
  loadSummary();
});
</script>

<template>
  <view class="page-container">
    <!-- 用户信息卡片 -->
    <view class="user-card">
      <view class="user-card__row">
        <image
          class="user-card__avatar"
          :src="authStore.user?.avatar || '/static/default-avatar.png'"
          mode="aspectFill"
        />
        <view class="user-card__info">
          <text class="user-card__name">
            {{ authStore.user?.nickname || '点击登录' }}
          </text>
          <text v-if="authStore.user?.phone" class="user-card__phone">
            {{ authStore.user.phone }}
          </text>
        </view>
        <view class="user-card__arrow">
          <text>&gt;</text>
        </view>
      </view>
    </view>

    <!-- 余额和积分 -->
    <view class="summary-row">
      <view class="summary-card" @tap="() => uni.navigateTo({ url: '/pages/prepaid/prepaid' })">
        <text class="summary-card__value">
          ¥{{ formatPrice(balanceInfo.totalBalance) }}
        </text>
        <text class="summary-card__label">余额</text>
      </view>
      <view class="summary-card" @tap="() => uni.navigateTo({ url: '/pages/points/points' })">
        <text class="summary-card__value">{{ pointsInfo.balance }}</text>
        <text class="summary-card__label">积分</text>
      </view>
    </view>

    <!-- 菜单列表 -->
    <view class="menu-list card">
      <view
        v-for="item in menuItems"
        :key="item.url"
        class="menu-item"
        @tap="onMenuItemClick(item)"
      >
        <view class="menu-item__left">
          <text class="menu-item__icon" v-html="item.icon"></text>
          <text class="menu-item__label">{{ item.label }}</text>
        </view>
        <text class="menu-item__arrow">&gt;</text>
      </view>
    </view>

    <!-- 退出登录 -->
    <view class="logout-btn" @tap="onLogout">
      <text>退出登录</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.user-card {
  background: linear-gradient(135deg, $primary-color, #06D080);
  padding: $spacing-xl $spacing-base;

  &__row {
    display: flex;
    align-items: center;
  }

  &__avatar {
    width: 100rpx;
    height: 100rpx;
    border-radius: $radius-round;
    border: 4rpx solid rgba(255, 255, 255, 0.4);
    background-color: rgba(255, 255, 255, 0.3);
  }

  &__info {
    flex: 1;
    margin-left: $spacing-base;
  }

  &__name {
    font-size: $font-size-xxl;
    font-weight: 600;
    color: $text-white;
    display: block;
  }

  &__phone {
    font-size: $font-size-sm;
    color: rgba(255, 255, 255, 0.8);
    margin-top: $spacing-xs;
    display: block;
  }

  &__arrow {
    font-size: $font-size-xl;
    color: rgba(255, 255, 255, 0.8);
  }
}

.summary-row {
  display: flex;
  padding: $spacing-base;
  gap: $spacing-sm;
}

.summary-card {
  flex: 1;
  background-color: $bg-primary;
  border-radius: $radius-base;
  padding: $spacing-base;
  text-align: center;
  box-shadow: $shadow-sm;

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

.menu-list {
  margin: $spacing-sm $spacing-base;

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-base 0;

    & + & {
      border-top: 1rpx solid $border-light;
    }

    &__left {
      display: flex;
      align-items: center;
    }

    &__icon {
      font-size: $font-size-xl;
      margin-right: $spacing-base;
      width: 40rpx;
      text-align: center;
    }

    &__label {
      font-size: $font-size-base;
      color: $text-primary;
    }

    &__arrow {
      font-size: $font-size-base;
      color: $text-placeholder;
    }
  }
}

.logout-btn {
  margin: $spacing-xl $spacing-base;
  padding: $spacing-sm 0;
  text-align: center;
  background-color: $bg-primary;
  border-radius: $radius-base;
  font-size: $font-size-base;
  color: $danger-color;
  box-shadow: $shadow-sm;
}
</style>
