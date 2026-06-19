<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import { useCartStore } from '@/stores/cart';
import CartBadge from '@/components/CartBadge.vue';

const appStore = useAppStore();
const cartStore = useCartStore();

// 瓷片区功能入口（根据模块动态生成）
interface EntryItem {
  label: string;
  icon: string;
  url: string;
  isTab?: boolean;
  module: string | null;
}

const entryItems = computed<EntryItem[]>(() => {
  const items: EntryItem[] = [
    { label: '浏览菜单', icon: '📋', url: '/pages/menu/menu', isTab: true, module: null },
    { label: '我的订单', icon: '📦', url: '/pages/orders/orders', isTab: true, module: null },
  ];

  if (appStore.hasModule('group-meal')) {
    items.push({ label: '发起拼单', icon: '👥', url: '/pages/group/group', module: 'group-meal' });
  }

  if (appStore.hasModule('points')) {
    items.push({ label: '积分中心', icon: '🎁', url: '/pages/points/points', module: 'points' });
  }

  if (appStore.hasModule('coupon')) {
    items.push({ label: '优惠券', icon: '🎫', url: '/pages/coupons/coupons', module: 'coupon' });
  }

  if (appStore.hasModule('prepaid')) {
    items.push({ label: '预充值', icon: '💳', url: '/pages/prepaid/prepaid', module: 'prepaid' });
  }

  return items;
});

function onEntryTap(item: EntryItem) {
  if (item.isTab) {
    uni.switchTab({ url: item.url });
  } else {
    uni.navigateTo({ url: item.url });
  }
}

onMounted(async () => {
  // 加载购物车数量
  try {
    await cartStore.fetchCart();
  } catch {}
});
</script>

<template>
  <view class="page-container">
    <!-- 通知栏 -->
    <view v-if="appStore.brandConfig.notice" class="notice-bar">
      <text class="notice-bar__text">{{ appStore.brandConfig.notice }}</text>
    </view>

    <!-- 品牌信息区 -->
    <view class="brand-area">
      <image
        v-if="appStore.brandConfig.logo"
        class="brand-area__logo"
        :src="appStore.brandConfig.logo"
        mode="aspectFit"
      />
      <text class="brand-area__name">{{ appStore.brandConfig.appName }}</text>
      <text v-if="appStore.brandConfig.hours" class="brand-area__hours">
        营业时间：{{ appStore.brandConfig.hours }}
      </text>
    </view>

    <!-- 瓷片区功能入口 -->
    <view class="entry-grid">
      <view
        v-for="item in entryItems"
        :key="item.url"
        class="entry-card"
        @tap="onEntryTap(item)"
      >
        <text class="entry-card__icon">{{ item.icon }}</text>
        <text class="entry-card__label">{{ item.label }}</text>
      </view>
    </view>

    <!-- 联系我们 -->
    <view v-if="appStore.brandConfig.phone" class="contact-card">
      <text class="contact-card__label">联系电话</text>
      <text class="contact-card__phone">{{ appStore.brandConfig.phone }}</text>
    </view>

    <!-- 购物车浮标 -->
    <CartBadge />
  </view>
</template>

<style lang="scss" scoped>
.notice-bar {
  padding: $spacing-sm $spacing-base;
  background-color: #FFF9E6;

  &__text {
    font-size: $font-size-sm;
    color: #B8860B;
  }
}

.brand-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx $spacing-base $spacing-xl;
  background: linear-gradient(135deg, $primary-color, #0BDD90);

  &__logo {
    width: 120rpx;
    height: 120rpx;
    border-radius: $radius-round;
    background-color: rgba(255, 255, 255, 0.3);
    margin-bottom: $spacing-base;
  }

  &__name {
    font-size: $font-size-xxl;
    font-weight: 700;
    color: $text-white;
  }

  &__hours {
    font-size: $font-size-sm;
    color: rgba(255, 255, 255, 0.8);
    margin-top: $spacing-xs;
  }
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $spacing-sm;
  padding: $spacing-base;
  margin-top: -40rpx;
}

.entry-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: $bg-primary;
  border-radius: $radius-base;
  padding: $spacing-lg $spacing-sm;
  box-shadow: $shadow-sm;
  transition: all 0.2s;

  &:active {
    transform: scale(0.96);
    background-color: $bg-page;
  }

  &__icon {
    font-size: 48rpx;
    margin-bottom: $spacing-sm;
  }

  &__label {
    font-size: $font-size-sm;
    color: $text-regular;
    font-weight: 500;
  }
}

.contact-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: $spacing-sm $spacing-base;
  padding: $spacing-base;
  background-color: $bg-primary;
  border-radius: $radius-base;
  box-shadow: $shadow-sm;

  &__label {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }

  &__phone {
    font-size: $font-size-xl;
    color: $primary-color;
    font-weight: 600;
  }
}
</style>
