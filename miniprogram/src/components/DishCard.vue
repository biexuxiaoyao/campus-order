<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  dish: {
    id: string;
    name: string;
    description: string;
    images: string[];
    price: number;
    originPrice?: number;
    estimated: boolean;
    salesCount?: number;
  };
}>();

const emit = defineEmits<{
  (e: 'click', id: string): void;
}>();

const priceText = computed(() => {
  return (props.dish.price / 100).toFixed(2);
});

const originPriceText = computed(() => {
  if (!props.dish.originPrice) return '';
  return (props.dish.originPrice / 100).toFixed(2);
});

function handleClick() {
  emit('click', props.dish.id);
}
</script>

<template>
  <view class="dish-card" @tap="handleClick">
    <image
      class="dish-card__image"
      :src="dish.images[0] || '/static/placeholder.png'"
      mode="aspectFill"
    />
    <view class="dish-card__info">
      <text class="dish-card__name text-ellipsis-2">{{ dish.name }}</text>
      <text v-if="dish.description" class="dish-card__desc text-ellipsis">
        {{ dish.description }}
      </text>
      <view class="dish-card__bottom">
        <view class="dish-card__price-row">
          <text class="dish-card__price-symbol">¥</text>
          <text class="dish-card__price">{{ priceText }}</text>
          <text v-if="dish.originPrice" class="dish-card__origin-price">
            ¥{{ originPriceText }}
          </text>
          <text v-if="dish.estimated" class="dish-card__estimated">预估</text>
        </view>
        <text v-if="dish.salesCount" class="dish-card__sales">
          已售{{ dish.salesCount }}
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.dish-card {
  display: flex;
  padding: $spacing-base;
  background-color: $bg-primary;
  border-radius: $radius-base;
  margin-bottom: $spacing-sm;
  box-shadow: $shadow-sm;

  &__image {
    width: 180rpx;
    height: 180rpx;
    border-radius: $radius-sm;
    flex-shrink: 0;
    background-color: $bg-dark;
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
    line-height: 1.4;
  }

  &__desc {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: $spacing-xs;
  }

  &__bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: $spacing-sm;
  }

  &__price-row {
    display: flex;
    align-items: baseline;
  }

  &__price-symbol {
    font-size: $font-size-xs;
    color: $danger-color;
  }

  &__price {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $danger-color;
  }

  &__origin-price {
    font-size: $font-size-sm;
    color: $text-secondary;
    text-decoration: line-through;
    margin-left: $spacing-xs;
  }

  &__estimated {
    font-size: $font-size-xs;
    color: $warning-color;
    background-color: #FFF3E0;
    border-radius: 4rpx;
    padding: 2rpx 8rpx;
    margin-left: $spacing-xs;
  }

  &__sales {
    font-size: $font-size-xs;
    color: $text-secondary;
  }
}
</style>
