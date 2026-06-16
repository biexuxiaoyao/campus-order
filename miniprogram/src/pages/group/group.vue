<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { getGroupOrders, type GroupOrder } from '@/api/group-order';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();
const pools = ref<GroupOrder[]>([]);
const loading = ref(true);

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
  uni.showToast({ title: '请在菜品详情页选择菜品后发起拼单', icon: 'none' });
  // TODO: 跳转发起拼单页面
}

onMounted(() => {
  loadPools();
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
</style>
