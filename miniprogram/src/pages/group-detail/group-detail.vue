<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getGroupOrderDetail, joinGroupOrder, closeGroupOrder } from '@/api/group-order';
import type { GroupOrder } from '@/api/group-order';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const group = ref<GroupOrder | null>(null);
const loading = ref(true);
const groupId = ref('');

onLoad((options: any) => {
  groupId.value = options?.id || '';
  if (groupId.value) {
    loadGroup();
  }
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
  if (hours > 0) return `${hours}小时${mins}分钟后截止`;
  return `${mins}分钟后截止`;
}

async function loadGroup() {
  loading.value = true;
  try {
    group.value = await getGroupOrderDetail(groupId.value);
  } catch (e) {
    console.error('[GroupDetail] 加载失败', e);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function isLeader(): boolean {
  return group.value?.leaderId === authStore.user?.id;
}

async function onJoin() {
  // 跳转到菜品列表选择菜品
  uni.navigateTo({ url: '/pages/index/index' });
  uni.showToast({ title: '请选择菜品后返回拼单详情加入', icon: 'none' });
  // TODO: 实际流程：选择菜品 → 确认 SKU → 调用 joinGroupOrder
}

async function onClosePool() {
  const res = await uni.showModal({
    title: '提示',
    content: '确认关闭该拼单吗？关闭后其他人将无法加入',
  });
  if (res.confirm) {
    try {
      await closeGroupOrder(groupId.value);
      uni.showToast({ title: '拼单已关闭', icon: 'success' });
      loadGroup();
    } catch (e) {
      console.error('[GroupDetail] 关闭失败', e);
    }
  }
}
</script>

<template>
  <view v-if="loading" class="page-container flex-center">
    <text class="loading-text">加载中...</text>
  </view>

  <view v-else-if="group" class="page-container">
    <!-- 拼单头部 -->
    <view class="group-header">
      <text class="group-header__title">拼单详情</text>
      <text class="group-header__deadline">{{ formatDeadline(group.deadline) }}</text>
    </view>

    <!-- 拼单信息 -->
    <view class="card">
      <view class="info-row">
        <text class="info-row__label">发起人</text>
        <view class="info-row__value flex">
          <image
            class="avatar-small"
            :src="group.leaderAvatar || '/static/default-avatar.png'"
            mode="aspectFill"
          />
          <text>{{ group.leaderName }}</text>
        </view>
      </view>
      <view class="info-row">
        <text class="info-row__label">拼单条件</text>
        <text class="info-row__value">{{ group.condition || '满减拼单' }}</text>
      </view>
      <view class="info-row">
        <text class="info-row__label">最低金额</text>
        <text class="info-row__value">¥{{ formatPrice(group.minAmount) }}</text>
      </view>
      <view class="info-row">
        <text class="info-row__label">当前金额</text>
        <text class="info-row__value info-row__value--highlight">
          ¥{{ formatPrice(group.totalAmount) }}
        </text>
      </view>
      <view class="info-row">
        <text class="info-row__label">参与人数</text>
        <text class="info-row__value">
          {{ group.participantCount }}{{ group.maxParticipants ? `/${group.maxParticipants}` : '' }}
        </text>
      </view>
    </view>

    <!-- 参与人列表 -->
    <view class="card">
      <text class="section__title">参与人 ({{ group.participantCount }})</text>
      <view
        v-for="p in group.participants"
        :key="p.id"
        class="participant"
      >
        <view class="participant__header">
          <image
            class="participant__avatar"
            :src="p.avatar || '/static/default-avatar.png'"
            mode="aspectFill"
          />
          <text class="participant__name">{{ p.nickname }}</text>
          <text
            v-if="p.id === group.leaderId"
            class="participant__tag"
          >发起人</text>
        </view>
        <view
          v-for="item in p.items"
          :key="item.dishName"
          class="participant__item"
        >
          <text class="participant__item-name text-ellipsis">
            {{ item.dishName }}
          </text>
          <text class="participant__item-spec">{{ item.skuSpecs }}</text>
          <view class="participant__item-right">
            <text>¥{{ formatPrice(item.price) }} ×{{ item.quantity }}</text>
          </view>
        </view>
        <view class="participant__total">
          <text>小计：¥{{ formatPrice(p.totalAmount) }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作 -->
    <view v-if="group.status === 'active'" class="action-bar safe-area-bottom">
      <view
        v-if="isLeader()"
        class="action-bar__btn action-bar__btn--danger"
        @tap="onClosePool"
      >
        <text>关闭拼单</text>
      </view>
      <view
        v-if="!isLeader()"
        class="action-bar__btn action-bar__btn--primary"
        @tap="onJoin"
      >
        <text>加入拼单</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.loading-text {
  font-size: $font-size-base;
  color: $text-secondary;
}

.group-header {
  background: linear-gradient(135deg, $primary-color, #06D080);
  padding: $spacing-xl $spacing-base;
  text-align: center;
  color: $text-white;

  &__title {
    font-size: $font-size-xxl;
    font-weight: 600;
    display: block;
  }

  &__deadline {
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

    &--highlight {
      color: $primary-color;
      font-weight: 600;
    }
  }
}

.avatar-small {
  width: 40rpx;
  height: 40rpx;
  border-radius: $radius-round;
  margin-right: $spacing-xs;
  background-color: $bg-dark;
}

.participant {
  padding: $spacing-base 0;

  & + & {
    border-top: 1rpx solid $border-light;
  }

  &__header {
    display: flex;
    align-items: center;
    margin-bottom: $spacing-sm;
  }

  &__avatar {
    width: 48rpx;
    height: 48rpx;
    border-radius: $radius-round;
    background-color: $bg-dark;
  }

  &__name {
    font-size: $font-size-base;
    font-weight: 500;
    color: $text-primary;
    margin-left: $spacing-sm;
  }

  &__tag {
    font-size: $font-size-xs;
    color: $primary-color;
    background-color: $primary-light;
    padding: 2rpx 8rpx;
    border-radius: 4rpx;
    margin-left: $spacing-xs;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-xs 0;
    padding-left: 64rpx;
  }

  &__item-name {
    flex: 1;
    font-size: $font-size-sm;
    color: $text-primary;
  }

  &__item-spec {
    font-size: $font-size-xs;
    color: $text-secondary;
    margin: 0 $spacing-sm;
  }

  &__item-right {
    font-size: $font-size-sm;
    color: $text-regular;
    white-space: nowrap;
  }

  &__total {
    text-align: right;
    padding-top: $spacing-xs;
    padding-left: 64rpx;

    text {
      font-size: $font-size-sm;
      color: $text-regular;
    }
  }
}

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: $spacing-sm;
  padding: $spacing-base;
  background-color: $bg-primary;
  border-top: 1rpx solid $border-light;
  z-index: 100;

  &__btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-sm 0;
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
  }
}
</style>
