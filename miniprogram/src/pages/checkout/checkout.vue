<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCartStore } from '@/stores/cart';
import { createOrder } from '@/api/orders';
import { prepay } from '@/api/payment';

const cartStore = useCartStore();

const pickupTime = ref('');
const remark = ref('');
const paymentMethod = ref<'wechat' | 'balance'>('wechat');
const submitting = ref(false);

const totalPrice = computed(() => {
  return (cartStore.totalAmount / 100).toFixed(2);
});

// 可选取餐时间
const timeSlots = ref([
  { label: '尽快取餐', value: '' },
  { label: '11:30', value: '11:30' },
  { label: '11:45', value: '11:45' },
  { label: '12:00', value: '12:00' },
  { label: '12:15', value: '12:15' },
  { label: '12:30', value: '12:30' },
  { label: '12:45', value: '12:45' },
]);

onMounted(async () => {
  await cartStore.fetchCart();
  if (cartStore.items.length === 0) {
    uni.showToast({ title: '购物车为空', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 1500);
  }
});

function onSelectTime(time: string) {
  pickupTime.value = pickupTime.value === time ? '' : time;
}

function onSelectPayment(method: 'wechat' | 'balance') {
  paymentMethod.value = method;
}

async function onSubmit() {
  if (submitting.value) return;
  if (cartStore.items.length === 0) {
    uni.showToast({ title: '购物车为空', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    const cartItemIds = cartStore.items.map((item) => item.id);
    const order = await createOrder({
      cartItemIds,
      pickupTime: pickupTime.value || undefined,
      remark: remark.value || undefined,
      paymentMethod: paymentMethod.value,
    });

    // 调用支付预下单（微信/余额统一走 prepay）
    try {
      const payResult = await prepay(order.id, paymentMethod.value);

      if (paymentMethod.value === 'wechat' && payResult.wxJSAPIParams) {
        // 微信支付：解包 JSAPI 参数调起支付
        const jsapi = payResult.wxJSAPIParams;
        uni.requestPayment({
          provider: 'wxpay',
          timeStamp: jsapi.timeStamp,
          nonceStr: jsapi.nonceStr,
          package: jsapi.package,
          signType: jsapi.signType,
          paySign: jsapi.paySign,
          success: () => {
            cartStore.clearCart();
            uni.redirectTo({
              url: `/pages/order-detail/order-detail?id=${order.id}`,
            });
          },
          fail: () => {
            uni.showToast({ title: '支付已取消', icon: 'none' });
            uni.redirectTo({
              url: `/pages/order-detail/order-detail?id=${order.id}`,
            });
          },
        });
      } else {
        // 余额支付（后端已原子扣减余额 + 更新订单状态）
        await cartStore.clearCart();
        uni.redirectTo({
          url: `/pages/order-detail/order-detail?id=${order.id}`,
        });
      }
    } catch (e) {
      // 支付预下单失败，不清空购物车，允许用户重试支付
      console.error('[Checkout] 支付预下单失败', e);
      uni.showToast({ title: '支付失败，请重试', icon: 'none' });
      uni.redirectTo({
        url: `/pages/order-detail/order-detail?id=${order.id}`,
      });
    }
  } catch (e) {
    console.error('[Checkout] 提交订单失败', e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="page-container">
    <!-- 订单商品 -->
    <view class="section card">
      <text class="section__title">订单商品</text>
      <view
        v-for="item in cartStore.items"
        :key="item.id"
        class="order-item"
      >
        <image
          class="order-item__img"
          :src="item.dishImage || '/static/placeholder.png'"
          mode="aspectFill"
        />
        <view class="order-item__info">
          <text class="order-item__name text-ellipsis">{{ item.dishName }}</text>
          <text class="order-item__spec">{{ item.skuSpecs }}</text>
        </view>
        <view class="order-item__right">
          <text class="order-item__price">
            ¥{{ (item.price / 100).toFixed(2) }}
          </text>
          <text class="order-item__qty">×{{ item.quantity }}</text>
        </view>
      </view>
    </view>

    <!-- 取餐时间 -->
    <view class="section card">
      <text class="section__title">取餐时间</text>
      <view class="time-slots">
        <view
          v-for="slot in timeSlots"
          :key="slot.value"
          class="time-slot"
          :class="{ 'time-slot--active': pickupTime === slot.value }"
          @tap="onSelectTime(slot.value)"
        >
          <text>{{ slot.label }}</text>
        </view>
      </view>
    </view>

    <!-- 备注 -->
    <view class="section card">
      <text class="section__title">备注</text>
      <textarea
        v-model="remark"
        class="remark-input"
        placeholder="如有特殊要求请备注（如：多加辣、少盐）"
        maxlength="200"
      />
      <text class="remark-count">{{ remark.length }}/200</text>
    </view>

    <!-- 支付方式 -->
    <view class="section card">
      <text class="section__title">支付方式</text>
      <view class="payment-options">
        <view
          class="payment-option"
          :class="{ 'payment-option--active': paymentMethod === 'wechat' }"
          @tap="onSelectPayment('wechat')"
        >
          <text class="payment-option__icon">&#128179;</text>
          <text>微信支付</text>
          <view v-if="paymentMethod === 'wechat'" class="payment-option__check">✓</view>
        </view>
        <view
          class="payment-option"
          :class="{ 'payment-option--active': paymentMethod === 'balance' }"
          @tap="onSelectPayment('balance')"
        >
          <text class="payment-option__icon">&#128176;</text>
          <text>余额支付</text>
          <view v-if="paymentMethod === 'balance'" class="payment-option__check">✓</view>
        </view>
      </view>
    </view>

    <!-- 底部结算 -->
    <view class="checkout-footer safe-area-bottom">
      <view class="checkout-footer__total">
        <text class="checkout-footer__total-label">合计：</text>
        <text class="checkout-footer__total-price">¥{{ totalPrice }}</text>
      </view>
      <view
        class="checkout-footer__btn"
        :class="{ 'checkout-footer__btn--disabled': submitting }"
        @tap="onSubmit"
      >
        <text>{{ submitting ? '提交中...' : '提交订单' }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.section {
  margin-bottom: $spacing-sm;

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
    display: block;
    margin-bottom: $spacing-base;
  }
}

.order-item {
  display: flex;
  align-items: center;
  padding: $spacing-sm 0;

  & + & {
    border-top: 1rpx solid $border-light;
  }

  &__img {
    width: 96rpx;
    height: 96rpx;
    border-radius: $radius-sm;
    background-color: $bg-dark;
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    margin-left: $spacing-base;
    min-width: 0;
  }

  &__name {
    font-size: $font-size-base;
    color: $text-primary;
  }

  &__spec {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: $spacing-sm;
    flex-shrink: 0;
  }

  &__price {
    font-size: $font-size-base;
    color: $text-primary;
    font-weight: 500;
  }

  &__qty {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

.time-slots {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.time-slot {
  padding: $spacing-sm $spacing-base;
  background-color: $bg-page;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  color: $text-regular;
  border: 1rpx solid transparent;

  &--active {
    background-color: $primary-light;
    border-color: $primary-color;
    color: $primary-color;
  }
}

.remark-input {
  width: 100%;
  min-height: 120rpx;
  font-size: $font-size-base;
  color: $text-primary;
  padding: $spacing-sm;
  background-color: $bg-page;
  border-radius: $radius-sm;
  box-sizing: border-box;
}

.remark-count {
  font-size: $font-size-sm;
  color: $text-secondary;
  text-align: right;
  display: block;
  margin-top: $spacing-xs;
}

.payment-options {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.payment-option {
  display: flex;
  align-items: center;
  padding: $spacing-base;
  border: 1rpx solid $border-color;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  color: $text-primary;
  position: relative;

  &__icon {
    font-size: $font-size-xl;
    margin-right: $spacing-sm;
  }

  &__check {
    position: absolute;
    right: $spacing-base;
    width: 36rpx;
    height: 36rpx;
    background-color: $primary-color;
    border-radius: $radius-round;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $text-white;
    font-size: $font-size-sm;
  }

  &--active {
    border-color: $primary-color;
    background-color: $primary-light;
  }
}

.checkout-footer {
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

    &--disabled {
      opacity: 0.6;
    }
  }
}
</style>
