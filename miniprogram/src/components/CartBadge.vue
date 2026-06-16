<script setup lang="ts">
import { computed } from 'vue';
import { useCartStore } from '@/stores/cart';

const cartStore = useCartStore();

const totalText = computed(() => {
  return (cartStore.totalAmount / 100).toFixed(2);
});

const showBadge = computed(() => cartStore.itemCount > 0);

function goToCart() {
  uni.switchTab({
    url: '/pages/index/index',
    fail: () => {
      uni.navigateTo({ url: '/pages/cart/cart' });
    },
  });
  // 直接跳转到 cart 页面
  uni.navigateTo({ url: '/pages/cart/cart' });
}
</script>

<template>
  <view v-if="showBadge" class="cart-badge" @tap="goToCart">
    <view class="cart-badge__inner">
      <image class="cart-badge__icon" src="/static/icon-cart.png" mode="aspectFit" />
      <view class="cart-badge__count">
        <text>{{ cartStore.itemCount > 99 ? '99+' : cartStore.itemCount }}</text>
      </view>
    </view>
    <text class="cart-badge__price">¥{{ totalText }}</text>
  </view>
</template>

<style lang="scss" scoped>
.cart-badge {
  position: fixed;
  right: $spacing-base;
  bottom: 160rpx;
  background-color: $primary-color;
  border-radius: 60rpx;
  display: flex;
  align-items: center;
  padding: $spacing-sm $spacing-base;
  box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.3);
  z-index: 100;
  transition: all 0.3s;

  &:active {
    transform: scale(0.95);
  }

  &__inner {
    position: relative;
    width: 56rpx;
    height: 56rpx;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__icon {
    width: 44rpx;
    height: 44rpx;
  }

  &__count {
    position: absolute;
    top: -4rpx;
    right: -8rpx;
    min-width: 32rpx;
    height: 32rpx;
    background-color: $danger-color;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2rpx solid $text-white;

    text {
      font-size: 18rpx;
      color: $text-white;
      line-height: 1;
    }
  }

  &__price {
    font-size: $font-size-base;
    color: $text-white;
    font-weight: 600;
    margin-left: $spacing-sm;
  }
}
</style>
