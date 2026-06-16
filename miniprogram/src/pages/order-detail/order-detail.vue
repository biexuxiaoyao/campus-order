<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getOrderDetail, cancelOrder, reorder, urgeOrder } from '@/api/orders';
import type { Order } from '@/api/orders';
import OrderStatusTag from '@/components/OrderStatusTag.vue';

const order = ref<Order | null>(null);
const loading = ref(true);
const orderId = ref('');

onLoad((options: any) => {
  orderId.value = options?.id || '';
  if (orderId.value) {
    loadOrder();
  }
});

async function loadOrder() {
  loading.value = true;
  try {
    order.value = await getOrderDetail(orderId.value);
  } catch (e) {
    console.error('[OrderDetail] 加载失败', e);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

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
  return `${month}月${day}日 ${hours}:${mins}`;
}

async function onCancelOrder() {
  const res = await uni.showModal({
    title: '提示',
    content: '确认取消该订单吗？',
  });
  if (res.confirm) {
    try {
      await cancelOrder(orderId.value);
      uni.showToast({ title: '订单已取消', icon: 'success' });
      loadOrder();
    } catch (e) {
      console.error('[OrderDetail] 取消失败', e);
    }
  }
}

async function onReorder() {
  try {
    await reorder(orderId.value);
    uni.showToast({ title: '已重新下单，请在购物车中查看', icon: 'success' });
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/cart/cart' });
    }, 1000);
  } catch (e) {
    console.error('[OrderDetail] 再来一单失败', e);
  }
}

async function onUrge() {
  try {
    await urgeOrder(orderId.value);
    uni.showToast({ title: '已催单', icon: 'success' });
  } catch (e) {
    console.error('[OrderDetail] 催单失败', e);
  }
}
</script>

<template>
  <view v-if="loading" class="page-container flex-center">
    <text class="loading-text">加载中...</text>
  </view>

  <view v-else-if="order" class="page-container">
    <!-- 状态卡片 -->
    <view class="status-card">
      <view class="status-card__icon">
        <text v-if="order.status === 'pending'">&#9200;</text>
        <text v-else-if="order.status === 'cooking'">&#127859;</text>
        <text v-else-if="order.status === 'ready'">&#129534;</text>
        <text v-else>&#10003;</text>
      </view>
      <text class="status-card__text">{{ order.statusText }}</text>
      <text v-if="order.pickupTime" class="status-card__pickup">
        取餐时间：{{ order.pickupTime }}
      </text>
    </view>

    <!-- 订单信息 -->
    <view class="card">
      <view class="info-row">
        <text class="info-row__label">订单编号</text>
        <text class="info-row__value">{{ order.orderNo }}</text>
      </view>
      <view class="info-row">
        <text class="info-row__label">下单时间</text>
        <text class="info-row__value">{{ formatTime(order.createdAt) }}</text>
      </view>
      <view v-if="order.pickupTime" class="info-row">
        <text class="info-row__label">取餐时间</text>
        <text class="info-row__value">{{ order.pickupTime }}</text>
      </view>
      <view class="info-row">
        <text class="info-row__label">门店</text>
        <text class="info-row__value">{{ order.storeName }}</text>
      </view>
      <view v-if="order.remark" class="info-row">
        <text class="info-row__label">备注</text>
        <text class="info-row__value">{{ order.remark }}</text>
      </view>
    </view>

    <!-- 订单商品 -->
    <view class="card">
      <text class="section__title">订单商品</text>
      <view
        v-for="item in order.items"
        :key="item.id"
        class="item-row"
      >
        <image
          class="item-row__img"
          :src="item.image || '/static/placeholder.png'"
          mode="aspectFill"
        />
        <view class="item-row__info">
          <text class="item-row__name text-ellipsis">{{ item.dishName }}</text>
          <text class="item-row__spec">{{ item.skuSpecs }}</text>
        </view>
        <view class="item-row__right">
          <text class="item-row__price">¥{{ formatPrice(item.price) }}</text>
          <text class="item-row__qty">×{{ item.quantity }}</text>
        </view>
      </view>
    </view>

    <!-- 金额明细 -->
    <view class="card">
      <text class="section__title">金额明细</text>
      <view class="info-row">
        <text class="info-row__label">商品总额</text>
        <text class="info-row__value">¥{{ formatPrice(order.totalAmount) }}</text>
      </view>
      <view v-if="order.discountAmount" class="info-row">
        <text class="info-row__label">优惠</text>
        <text class="info-row__value info-row__value--discount">
          -¥{{ formatPrice(order.discountAmount) }}
        </text>
      </view>
      <view class="info-row info-row--total">
        <text class="info-row__label">实付金额</text>
        <text class="info-row__value info-row__value--total">
          ¥{{ formatPrice(order.paidAmount || order.totalAmount) }}
        </text>
      </view>
    </view>

    <!-- 订单时间线 -->
    <view v-if="order.timeline && order.timeline.length" class="card">
      <text class="section__title">订单进度</text>
      <view class="timeline">
        <view
          v-for="(event, idx) in order.timeline"
          :key="idx"
          class="timeline__item"
          :class="{ 'timeline__item--last': idx === order.timeline.length - 1 }"
        >
          <view class="timeline__dot" />
          <view class="timeline__content">
            <text class="timeline__status">{{ event.status }}</text>
            <text class="timeline__time">{{ formatTime(event.time) }}</text>
            <text v-if="event.remark" class="timeline__remark">{{ event.remark }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作 -->
    <view class="action-bar safe-area-bottom">
      <view
        v-if="order.status === 'pending'"
        class="action-bar__btn action-bar__btn--danger"
        @tap="onCancelOrder"
      >
        <text>取消订单</text>
      </view>
      <view
        v-if="order.status === 'cooking' || order.status === 'confirmed'"
        class="action-bar__btn action-bar__btn--default"
        @tap="onUrge"
      >
        <text>催单</text>
      </view>
      <view
        v-if="order.status === 'completed' || order.status === 'cancelled'"
        class="action-bar__btn action-bar__btn--primary"
        @tap="onReorder"
      >
        <text>再来一单</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.loading-text {
  font-size: $font-size-base;
  color: $text-secondary;
}

.status-card {
  background: linear-gradient(135deg, $primary-color, #06D080);
  padding: $spacing-xl $spacing-base;
  text-align: center;
  color: $text-white;

  &__icon {
    font-size: 72rpx;
    margin-bottom: $spacing-sm;
  }

  &__text {
    font-size: $font-size-xl;
    font-weight: 600;
    display: block;
  }

  &__pickup {
    font-size: $font-size-base;
    opacity: 0.9;
    margin-top: $spacing-sm;
    display: block;
  }
}

.section__title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
  display: block;
  margin-bottom: $spacing-base;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-sm 0;

  & + & {
    border-top: 1rpx solid $border-light;
  }

  &__label {
    font-size: $font-size-base;
    color: $text-regular;
  }

  &__value {
    font-size: $font-size-base;
    color: $text-primary;

    &--discount {
      color: $danger-color;
    }

    &--total {
      font-size: $font-size-lg;
      font-weight: 600;
      color: $danger-color;
    }
  }

  &--total {
    border-top: 1rpx solid $border-light;
  }
}

.item-row {
  display: flex;
  align-items: center;
  padding: $spacing-sm 0;

  & + & {
    border-top: 1rpx solid $border-light;
  }

  &__img {
    width: 88rpx;
    height: 88rpx;
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
  }

  &__price {
    font-size: $font-size-sm;
    color: $text-primary;
  }

  &__qty {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

.timeline {
  padding-left: $spacing-lg;

  &__item {
    position: relative;
    padding-left: $spacing-lg;
    padding-bottom: $spacing-lg;

    &::before {
      content: '';
      position: absolute;
      left: 7rpx;
      top: 12rpx;
      bottom: 0;
      width: 2rpx;
      background-color: $border-color;
    }

    &--last::before {
      display: none;
    }
  }

  &__dot {
    position: absolute;
    left: 0;
    top: 4rpx;
    width: 16rpx;
    height: 16rpx;
    background-color: $primary-color;
    border-radius: $radius-round;
  }

  &__content {
    display: flex;
    flex-direction: column;
  }

  &__status {
    font-size: $font-size-base;
    color: $text-primary;
    font-weight: 500;
  }

  &__time {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__remark {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
  }
}

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-sm;
  padding: $spacing-base;
  background-color: $bg-primary;
  border-top: 1rpx solid $border-light;
  z-index: 100;

  &__btn {
    padding: $spacing-sm $spacing-xl;
    border-radius: 40rpx;
    font-size: $font-size-base;
    font-weight: 500;

    &--primary {
      background-color: $primary-color;
      color: $text-white;
    }

    &--danger {
      background-color: $bg-page;
      color: $danger-color;
      border: 1rpx solid $danger-color;
    }

    &--default {
      background-color: $bg-page;
      color: $warning-color;
      border: 1rpx solid $warning-color;
    }
  }
}
</style>
