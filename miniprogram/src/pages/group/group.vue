<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { getGroupOrders, createGroupOrder, type GroupOrder } from '@/api/group-order';
import { useAppStore } from '@/stores/app';
import { useCartStore } from '@/stores/cart';

const appStore = useAppStore();
const cartStore = useCartStore();
const pools = ref<GroupOrder[]>([]);
const loading = ref(true);
const creating = ref(false);

// 发起拼单弹窗数据
const showCreateDialog = ref(false);
const poolForm = ref({
  condition: 'A',
  minAmount: 0,
  deadlineHours: 0.5, // 默认30分钟
});

function formatPrice(price: number): string {
  return (price / 100).toFixed(2);
}

function formatDeadline(time: string): string {
  if (!time) return '';
  const now = Date.now();
  const deadline = new Date(time).getTime();
  const diff = deadline - now;

  if (diff <= 0) return '已截止';

  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  if (hours > 0) {
    return `${hours}小时${mins}分钟后截止`;
  }
  return `${mins}分钟后截止`;
}

async function loadPools() {
  const storeId = appStore.brandConfig.storeId;
  if (!storeId) {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const result = await getGroupOrders(storeId);
    pools.value = result.pools || [];
  } catch (e) {
    console.error('[Group] 加载拼单列表失败', e);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function onPoolClick(id: string) {
  uni.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` });
}

function onCreatePool() {
  // 需要先选择菜品
  if (cartStore.itemCount === 0) {
    uni.showToast({ title: '请先在首页选择菜品加入购物车', icon: 'none' });
    setTimeout(() => {
      uni.switchTab({ url: '/pages/index/index' });
    }, 1500);
    return;
  }
  poolForm.value = { condition: 'A', minAmount: 0, deadlineHours: 0.5 };
  showCreateDialog.value = true;
}

async function handleCreatePool() {
  const storeId = appStore.brandConfig.storeId;
  if (!storeId) {
    uni.showToast({ title: '店铺信息未加载', icon: 'none' });
    return;
  }

  creating.value = true;
  try {
    const deadline = new Date(
      Date.now() + poolForm.value.deadlineHours * 3600000
    ).toISOString();
    const cartItemIds = cartStore.items.map((i) => i.id);

    await createGroupOrder({
      storeId,
      condition: poolForm.value.condition,
      minAmount: Math.round(poolForm.value.minAmount * 100), // 元转分
      deadline,
      cartItemIds,
    });

    uni.showToast({ title: '拼单发起成功', icon: 'success' });
    showCreateDialog.value = false;
    // 清空购物车（已用于拼单）
    await cartStore.clearCart();
    loadPools();
  } catch (e) {
    console.error('[Group] 发起拼单失败', e);
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  loadPools();
  cartStore.fetchCart();
});

onPullDownRefresh(() => {
  loadPools();
});
</script>

<template>
  <view class="page-container">
    <!-- 顶部操作按钮 -->
    <view class="group-header">
      <view class="group-header__btn" @tap="onCreatePool">
        <text class="group-header__btn-icon">+</text>
        <text>发起拼单</text>
      </view>
    </view>

    <!-- 拼单池列表 -->
    <view v-if="pools.length > 0" class="pool-list">
      <view
        v-for="pool in pools"
        :key="pool.id"
        class="pool-card card"
        @tap="onPoolClick(pool.id)"
      >
        <view class="pool-card__header">
          <view class="pool-card__leader">
            <image
              class="pool-card__avatar"
              :src="pool.leaderAvatar || '/static/default-avatar.png'"
              mode="aspectFill"
            />
            <text class="pool-card__leader-name">{{ pool.leaderName }}</text>
            <text class="pool-card__leader-tag">发起人</text>
          </view>
          <view class="pool-card__status" :class="{ 'pool-card__status--active': pool.status === 'active' }">
            <text>{{ pool.status === 'active' ? '拼单中' : '已结束' }}</text>
          </view>
        </view>

        <view class="pool-card__body">
          <view class="pool-card__info">
            <text class="pool-card__label">拼单条件</text>
            <text class="pool-card__value">{{ pool.condition || '满减拼单' }}</text>
          </view>
          <view class="pool-card__info">
            <text class="pool-card__label">最低金额</text>
            <text class="pool-card__value">¥{{ formatPrice(pool.minAmount) }}</text>
          </view>
        </view>

        <view class="pool-card__footer">
          <view class="pool-card__participants">
            <text class="pool-card__count">{{ pool.participantCount }}人参与</text>
            <text class="pool-card__amount">
              已拼 ¥{{ formatPrice(pool.totalAmount) }}
            </text>
          </view>
          <view class="pool-card__deadline">
            <text>{{ formatDeadline(pool.deadline) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else-if="!loading" class="empty">
      <image class="empty__img" src="/static/empty-group.png" mode="aspectFit" />
      <text class="empty__text">暂无活跃拼单</text>
      <view class="empty__btn" @tap="onCreatePool">
        <text>发起拼单</text>
      </view>
    </view>

    <view v-else class="loading-row">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 发起拼单弹窗 -->
    <view v-if="showCreateDialog" class="dialog-mask" @tap="showCreateDialog = false">
      <view class="dialog" @tap.stop>
        <view class="dialog__title">发起拼单</view>

        <!-- 购物车商品预览 -->
        <view class="dialog__cart">
          <text class="dialog__label">已选商品 ({{ cartStore.itemCount }}件)</text>
          <view
            v-for="item in cartStore.items"
            :key="item.id"
            class="dialog__cart-item"
          >
            <text class="text-ellipsis" style="flex:1">{{ item.dishName }}</text>
            <text style="color:#999;margin:0 8rpx">{{ item.skuSpecs }}</text>
            <text>×{{ item.quantity }}</text>
          </view>
          <text class="dialog__cart-total">
            合计: ¥{{ formatPrice(cartStore.totalAmount) }}
          </text>
        </view>

        <!-- 拼单设置 -->
        <view class="dialog__form">
          <view class="dialog__form-item">
            <text class="dialog__label">截止时间</text>
            <view class="dialog__deadline-options">
              <view
                v-for="h in [0.5, 1, 2, 4]"
                :key="h"
                class="dialog__deadline-btn"
                :class="{ active: poolForm.deadlineHours === h }"
                @tap="poolForm.deadlineHours = h"
              >
                {{ h < 1 ? '30分钟' : h + '小时' }}
              </view>
            </view>
          </view>

          <view class="dialog__form-item">
            <text class="dialog__label">拼单模式</text>
            <view class="dialog__mode-options">
              <view
                class="dialog__mode-btn"
                :class="{ active: poolForm.condition === 'A' }"
                @tap="poolForm.condition = 'A'"
              >
                <text style="font-weight:500">模式A</text>
                <text style="font-size:20rpx;color:#999">金额达标即成立</text>
              </view>
              <view
                class="dialog__mode-btn"
                :class="{ active: poolForm.condition === 'B' }"
                @tap="poolForm.condition = 'B'"
              >
                <text style="font-weight:500">模式B</text>
                <text style="font-size:20rpx;color:#999">全员支付才成立</text>
              </view>
            </view>
          </view>

          <view class="dialog__form-item">
            <text class="dialog__label">最低起订金额 (元)</text>
            <input
              v-model.number="poolForm.minAmount"
              class="dialog__input"
              type="digit"
              placeholder="0 表示不限制"
            />
          </view>
        </view>

        <!-- 按钮 -->
        <view class="dialog__actions">
          <view class="dialog__btn dialog__btn--cancel" @tap="showCreateDialog = false">
            <text>取消</text>
          </view>
          <view
            class="dialog__btn dialog__btn--confirm"
            :class="{ disabled: creating }"
            @tap="handleCreatePool"
          >
            <text>{{ creating ? '创建中...' : '确认发起' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.group-header {
  padding: $spacing-base;
  background-color: $bg-primary;
  display: flex;
  justify-content: flex-end;

  &__btn {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-lg;
    background-color: $primary-color;
    color: $text-white;
    border-radius: 40rpx;
    font-size: $font-size-base;
    font-weight: 500;

    &-icon {
      font-size: $font-size-xl;
      margin-right: $spacing-xs;
    }
  }
}

.pool-card {
  margin-bottom: $spacing-sm;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-base;
  }

  &__leader {
    display: flex;
    align-items: center;
  }

  &__avatar {
    width: 56rpx;
    height: 56rpx;
    border-radius: $radius-round;
    background-color: $bg-dark;
  }

  &__leader-name {
    font-size: $font-size-base;
    font-weight: 500;
    color: $text-primary;
    margin-left: $spacing-sm;
  }

  &__leader-tag {
    font-size: $font-size-xs;
    color: $primary-color;
    background-color: $primary-light;
    padding: 2rpx 8rpx;
    border-radius: 4rpx;
    margin-left: $spacing-xs;
  }

  &__status {
    padding: 4rpx 16rpx;
    border-radius: 4rpx;
    background-color: $bg-page;
    font-size: $font-size-sm;
    color: $text-secondary;

    &--active {
      background-color: $primary-light;
      color: $primary-color;
    }
  }

  &__body {
    display: flex;
    gap: $spacing-xl;
    margin-bottom: $spacing-base;
    padding: $spacing-sm;
    background-color: $bg-page;
    border-radius: $radius-sm;
  }

  &__label {
    font-size: $font-size-sm;
    color: $text-secondary;
    display: block;
  }

  &__value {
    font-size: $font-size-base;
    color: $text-primary;
    font-weight: 500;
    margin-top: 4rpx;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__count {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  &__amount {
    font-size: $font-size-base;
    color: $primary-color;
    font-weight: 600;
    margin-left: $spacing-sm;
  }

  &__deadline {
    font-size: $font-size-sm;
    color: $warning-color;
  }
}

.loading-row {
  display: flex;
  justify-content: center;
  padding: $spacing-base;
}

.loading-text {
  font-size: $font-size-base;
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

  &__btn {
    margin-top: $spacing-lg;
    padding: $spacing-sm $spacing-xl;
    background-color: $primary-color;
    color: $text-white;
    border-radius: 40rpx;
    font-size: $font-size-base;
  }
}

// 弹窗样式
.dialog-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.dialog {
  width: 100%;
  max-height: 80vh;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: $spacing-xl $spacing-base $spacing-base;
  overflow-y: auto;

  &__title {
    font-size: 36rpx;
    font-weight: 600;
    text-align: center;
    margin-bottom: $spacing-base;
  }

  &__label {
    font-size: $font-size-sm;
    color: $text-secondary;
    display: block;
    margin-bottom: $spacing-sm;
  }

  &__cart {
    background: $bg-page;
    border-radius: $radius-sm;
    padding: $spacing-base;
    margin-bottom: $spacing-base;

    &-item {
      display: flex;
      align-items: center;
      font-size: $font-size-sm;
      color: $text-primary;
      padding: 4rpx 0;
    }

    &-total {
      font-size: $font-size-base;
      color: $primary-color;
      font-weight: 600;
      text-align: right;
      margin-top: $spacing-sm;
      padding-top: $spacing-sm;
      border-top: 1rpx solid $border-light;
    }
  }

  &__form {
    margin-bottom: $spacing-base;

    &-item {
      margin-bottom: $spacing-base;
    }
  }

  &__deadline-options, &__mode-options {
    display: flex;
    gap: $spacing-sm;
  }

  &__deadline-btn {
    flex: 1;
    text-align: center;
    padding: $spacing-sm;
    border: 1rpx solid $border-light;
    border-radius: $radius-sm;
    font-size: $font-size-sm;
    color: $text-regular;

    &.active {
      border-color: $primary-color;
      color: $primary-color;
      background: $primary-light;
    }
  }

  &__mode-btn {
    flex: 1;
    text-align: center;
    padding: $spacing-base $spacing-sm;
    border: 1rpx solid $border-light;
    border-radius: $radius-sm;

    &.active {
      border-color: $primary-color;
      background: $primary-light;
    }
  }

  &__input {
    width: 100%;
    height: 72rpx;
    border: 1rpx solid $border-light;
    border-radius: $radius-sm;
    padding: 0 $spacing-base;
    font-size: $font-size-base;
    box-sizing: border-box;
  }

  &__actions {
    display: flex;
    gap: $spacing-base;
    margin-top: $spacing-base;
  }

  &__btn {
    flex: 1;
    text-align: center;
    padding: $spacing-base;
    border-radius: 40rpx;
    font-size: $font-size-base;
    font-weight: 500;

    &--cancel {
      background: $bg-page;
      color: $text-regular;
    }

    &--confirm {
      background: $primary-color;
      color: #fff;

      &.disabled {
        opacity: 0.6;
      }
    }
  }
}
</style>
