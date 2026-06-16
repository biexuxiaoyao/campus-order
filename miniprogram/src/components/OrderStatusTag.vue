<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: string;
}>();

interface StatusConfig {
  text: string;
  color: string;
  bg: string;
}

const statusMap: Record<string, StatusConfig> = {
  pending: { text: '待支付', color: '#999999', bg: '#F5F5F5' },
  paid: { text: '已支付', color: '#1976D2', bg: '#E3F2FD' },
  confirmed: { text: '已确认', color: '#F57C00', bg: '#FFF3E0' },
  cooking: { text: '烹饪中', color: '#FF9800', bg: '#FFF8E1' },
  ready: { text: '已出餐', color: '#07C160', bg: '#E8F8EF' },
  picked: { text: '已取餐', color: '#4CAF50', bg: '#E8F5E9' },
  completed: { text: '已完成', color: '#4CAF50', bg: '#E8F5E9' },
  cancelled: { text: '已取消', color: '#F44336', bg: '#FFEBEE' },
  refunding: { text: '退款中', color: '#FF9800', bg: '#FFF3E0' },
  refunded: { text: '已退款', color: '#999999', bg: '#F5F5F5' },
};

const config = computed<StatusConfig>(() => {
  return statusMap[props.status] || { text: props.status, color: '#999', bg: '#F5F5F5' };
});
</script>

<template>
  <view
    class="status-tag"
    :style="{ color: config.color, backgroundColor: config.bg }"
  >
    <text>{{ config.text }}</text>
  </view>
</template>

<style lang="scss" scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4rpx 16rpx;
  border-radius: 6rpx;
  font-size: $font-size-sm;

  text {
    color: inherit;
  }
}
</style>
