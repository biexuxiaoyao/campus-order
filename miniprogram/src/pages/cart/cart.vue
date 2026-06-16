<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { useCartStore } from '@/stores/cart';
import type { CartItem } from '@/api/cart';

const cartStore = useCartStore();

onShow(async () => {
  await cartStore.fetchCart();
});

function onCheckout() {
  if (cartStore.items.length === 0) {
    uni.showToast({ title: '购物车为空', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: '/pages/checkout/checkout' });
}

function formatPrice(price: number): string {
  return (price / 100).toFixed(2);
}

function onItemClick(item: CartItem) {
  uni.navigateTo({ url: `/pages/dish/dish?id=${item.dishId}` });
}
</script>

<template>
  <view class="page-container">
    <!-- 购物车列表 -->
    <view v-if="cartStore.items.length > 0" class="cart-list">
      <view
        v-for="item in cartStore.items"
        :key="item.id"
        class="cart-item card"
      >
        <view class="cart-item__main" @tap="onItemClick(item)">
          <image
            class="cart-item__image"
            :src="item.dishImage || '/static/placeholder.png'"
            mode="aspectFill"
          />
          <view class="cart-item__info">
            <text class="cart-item__name text-ellipsis">{{ item.dishName }}</text>
            <text class="cart-item__spec">{{ item.skuSpecs }}</text>
            <view class="cart-item__price-row">
              <text class="cart-item__price">¥{{ formatPrice(item.price) }}</text>
            </view>
          </view>
        </view>
        <view class="cart-item__actions">
          <view class="qty-stepper">
            <view
              class="qty-stepper__btn"
              @tap="cartStore.updateItem(item.id, item.quantity - 1)"
            >
              <text>-</text>
            </view>
            <text class="qty-stepper__value">{{ item.quantity }}</text>
            <view
              class="qty-stepper__btn qty-stepper__btn--plus"
              @tap="cartStore.updateItem(item.id, item.quantity + 1)"
            >
              <text>+</text>
            </view>
          </view>
          <text
            class="cart-item__delete"
            @tap="() => cartStore.removeItem(item.id)"
          >
            删除
          </text>
        </view>
      </view>
    </view>

    <!-- 空购物车 -->
    <view v-else class="empty-cart">
      <image class="empty-cart__img" src="/static/empty-cart.png" mode="aspectFit" />
      <text class="empty-cart__text">购物车是空的</text>
      <view class="empty-cart__btn" @tap="() => uni.switchTab({ url: '/pages/index/index' })">
        <text>去逛逛</text>
      </view>
    </view>

    <!-- 底部结算栏 -->
    <view v-if="cartStore.items.length > 0" class="cart-footer safe-area-bottom">
      <view class="cart-footer__total">
        <text class="cart-footer__total-label">合计：</text>
        <text class="cart-footer__total-price">
          ¥{{ formatPrice(cartStore.totalAmount) }}
        </text>
      </view>
      <view class="cart-footer__btn" @tap="onCheckout">
        <text>去结算 ({{ cartStore.itemCount }})</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.cart-list {
  padding: $spacing-base;
  padding-bottom: 140rpx;
}

.cart-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: $spacing-base;
  margin: 0;
  margin-bottom: $spacing-sm;

  &__main {
    display: flex;
    flex: 1;
  }

  &__image {
    width: 140rpx;
    height: 140rpx;
    border-radius: $radius-sm;
    background-color: $bg-dark;
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    margin-left: $spacing-base;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
  }

  &__name {
    font-size: $font-size-lg;
    font-weight: 500;
    color: $text-primary;
  }

  &__spec {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  &__price-row {
    display: flex;
    align-items: baseline;
  }

  &__price {
    font-size: $font-size-lg;
    font-weight: 700;
    color: $danger-color;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: space-between;
    margin-left: $spacing-sm;
    height: 140rpx;
  }

  &__delete {
    font-size: $font-size-sm;
    color: $text-secondary;
    padding: 4rpx 0;
  }
}

.qty-stepper {
  display: flex;
  align-items: center;

  &__btn {
    width: 48rpx;
    height: 48rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1rpx solid $border-color;
    border-radius: $radius-round;

    text {
      font-size: $font-size-xl;
      color: $text-regular;
    }

    &--plus {
      background-color: $primary-color;
      border-color: $primary-color;

      text {
        color: $text-white;
      }
    }
  }

  &__value {
    font-size: $font-size-base;
    font-weight: 500;
    color: $text-primary;
    min-width: 60rpx;
    text-align: center;
  }
}

.empty-cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;

  &__img {
    width: 240rpx;
    height: 240rpx;
  }

  &__text {
    font-size: $font-size-base;
    color: $text-secondary;
    margin-top: $spacing-base;
  }

  &__btn {
    margin-top: $spacing-lg;
    padding: $spacing-sm $spacing-xl;
    background-color: $primary-color;
    color: $text-white;
    border-radius: 40rpx;
    font-size: $font-size-base;
  }
}

.cart-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-base;
  background-color: $bg-primary;
  border-top: 1rpx solid $border-light;
  z-index: 100;

  &__total-label {
    font-size: $font-size-base;
    color: $text-regular;
  }

  &__total-price {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $danger-color;
  }

  &__btn {
    background-color: $primary-color;
    color: $text-white;
    padding: $spacing-sm $spacing-xl;
    border-radius: 40rpx;
    font-size: $font-size-base;
    font-weight: 500;
  }
}
</style>
