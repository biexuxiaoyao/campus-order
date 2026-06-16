<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { getOrders, type Order } from '@/api/orders';
import OrderStatusTag from '@/components/OrderStatusTag.vue';

const tabs = [
  { label: '全部', value: '' },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '制作中', value: 'cooking' },
  { label: '待取餐', value: 'ready' },
  { label: '已完成', value: 'completed' },
];

const activeTab = ref('');
const orders = ref<Order[]>([]);
const loading = ref(false);
const page = ref(1);
const hasMore = ref(true);

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

async function loadOrders(reset: boolean = false) {
  if (loading.value) return;
  if (reset) {
    page.value = 1;
    hasMore.value = true;
  }
  if (!hasMore.value && !reset) return;

  loading.value = true;
  try {
    const result = await getOrders({
      status: activeTab.value || undefined,
      page: page.value,
      pageSize: 20,
    });
    if (reset) {
      orders.value = result.items;
    } else {
      orders.value = [...orders.value, ...result.items];
    }
    hasMore.value = result.hasMore;
    page.value++;
  } catch (e) {
    console.error('[Orders] 加载订单失败', e);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function onTabChange(value: string) {
  activeTab.value = value;
  loadOrders(true);
}

function onOrderClick(id: string) {
  uni.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
}

onMounted(() => {
  loadOrders(true);
});

onPullDownRefresh(() => {
  loadOrders(true);
});

onReachBottom(() => {
  loadOrders();
});
</script>

<template>
  <view class="page-container">
    <!-- Tab 筛选 -->
    <scroll-view class="tab-scroll" scroll-x :show-scrollbar="false">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === tab.value }"
        @tap="onTabChange(tab.value)"
      >
        <text>{{ tab.label }}</text>
      </view>
    </scroll-view>

    <!-- 订单列表 -->
    <view class="order-list">
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-card card"
        @tap="onOrderClick(order.id)"
      >
        <view class="order-card__header">
          <text class="order-card__store">{{ order.storeName }}</text>
          <OrderStatusTag :status="order.status" />
        </view>

        <view
          v-for="item in order.items"
          :key="item.id"
          class="order-card__item"
        >
          <image
            class="order-card__item-img"
            :src="item.image || '/static/placeholder.png'"
            mode="aspectFill"
          />
          <view class="order-card__item-info">
            <text class="order-card__item-name text-ellipsis">
              {{ item.dishName }}
            </text>
            <text class="order-card__item-spec">{{ item.skuSpecs }}</text>
          </view>
          <view class="order-card__item-right">
            <text class="order-card__item-price">
              ¥{{ formatPrice(item.price) }}
            </text>
            <text class="order-card__item-qty">×{{ item.quantity }}</text>
          </view>
        </view>

        <view class="order-card__footer">
          <text class="order-card__time">{{ formatTime(order.createdAt) }}</text>
          <view class="order-card__total">
            <text class="order-card__total-label">共{{ order.items.length }}件 合计：</text>
            <text class="order-card__total-price">
              ¥{{ formatPrice(order.paidAmount || order.totalAmount) }}
            </text>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view v-if="loading" class="loading-row">
        <text class="loading-text">加载中...</text>
      </view>
      <view v-else-if="!hasMore && orders.length > 0" class="loading-row">
        <text class="loading-text">— 没有更多了 —</text>
      </view>
      <view v-else-if="!loading && orders.length === 0" class="empty">
        <image class="empty__img" src="/static/empty-order.png" mode="aspectFit" />
        <text class="empty__text">暂无订单</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.tab-scroll {
  white-space: nowrap;
  padding: $spacing-sm $spacing-base;
  background-color: $bg-primary;
  border-bottom: 1rpx solid $border-light;
  position: sticky;
  top: 0;
  z-index: 10;

  .tab-item {
    display: inline-flex;
    padding: $spacing-sm $spacing-base;
    margin-right: $spacing-base;
    font-size: $font-size-base;
    color: $text-regular;
    border-radius: 4rpx;
    transition: all 0.3s;

    &--active {
      color: $primary-color;
      font-weight: 600;
      border-bottom: 4rpx solid $primary-color;
    }
  }
}

.order-card {
  margin-bottom: $spacing-sm;
  padding: $spacing-base;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }

  &__store {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-sm 0;
    border-top: 1rpx solid $border-light;
  }

  &__item-img {
    width: 88rpx;
    height: 88rpx;
    border-radius: $radius-sm;
    background-color: $bg-dark;
    flex-shrink: 0;
  }

  &__item-info {
    flex: 1;
    margin-left: $spacing-base;
    min-width: 0;
  }

  &__item-name {
    font-size: $font-size-base;
    color: $text-primary;
  }

  &__item-spec {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__item-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: $spacing-sm;
  }

  &__item-price {
    font-size: $font-size-sm;
    color: $text-primary;
  }

  &__item-qty {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: $spacing-sm;
    padding-top: $spacing-sm;
    border-top: 1rpx solid $border-light;
  }

  &__time {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  &__total-label {
    font-size: $font-size-sm;
    color: $text-regular;
  }

  &__total-price {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
  }
}

.loading-row {
  display: flex;
  justify-content: center;
  padding: $spacing-base;
}

.loading-text {
  font-size: $font-size-sm;
  color: $text-secondary;
}

.empty {
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
}
</style>
