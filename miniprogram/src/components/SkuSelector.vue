<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Sku } from '@/api/dishes';

const props = defineProps<{
  visible: boolean;
  dishName: string;
  dishImage: string;
  skus: Sku[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', skuId: string, quantity: number): void;
}>();

// 将 SKU 列表解析为规格组
interface SpecGroup {
  name: string;
  values: string[];
}

const specGroups = computed<SpecGroup[]>(() => {
  if (!props.skus.length) return [];
  const map = new Map<string, Set<string>>();
  for (const sku of props.skus) {
    for (const spec of sku.specs) {
      if (!map.has(spec.name)) {
        map.set(spec.name, new Set());
      }
      map.get(spec.name)!.add(spec.value);
    }
  }
  return Array.from(map.entries()).map(([name, values]) => ({
    name,
    values: Array.from(values),
  }));
});

// 当前选中的规格值
const selectedSpecs = ref<Record<string, string>>({});

// 初始化选中第一个值
watch(
  () => specGroups.value,
  (groups) => {
    const specs: Record<string, string> = {};
    for (const g of groups) {
      specs[g.name] = g.values[0];
    }
    selectedSpecs.value = specs;
  },
  { immediate: true }
);

// 当前匹配的 SKU
const currentSku = computed<Sku | null>(() => {
  if (!props.skus.length) return null;
  const selected = selectedSpecs.value;
  return (
    props.skus.find((sku) => {
      return sku.specs.every(
        (s) => selected[s.name] === s.value
      );
    }) || props.skus[0]
  );
});

const quantity = ref(1);
const priceText = computed(() => {
  if (!currentSku.value) return '0.00';
  return (currentSku.value.price / 100).toFixed(2);
});

function selectSpec(name: string, value: string) {
  selectedSpecs.value = { ...selectedSpecs.value, [name]: value };
  quantity.value = 1;
}

function decreaseQty() {
  if (quantity.value > 1) {
    quantity.value--;
  }
}

function increaseQty() {
  if (currentSku.value && quantity.value < currentSku.value.stock) {
    quantity.value++;
  } else if (!currentSku.value) {
    quantity.value++;
  }
}

function handleConfirm() {
  if (!currentSku.value) return;
  emit('confirm', currentSku.value.id, quantity.value);
  quantity.value = 1;
}

function handleClose() {
  emit('close');
}

function stopPropagation() {
  // 阻止冒泡，避免点击内容区域关闭弹窗
}
</script>

<template>
  <view v-if="visible" class="sku-overlay" @tap="handleClose">
    <view class="sku-panel" @tap.stop="stopPropagation">
      <!-- 顶部商品信息 -->
      <view class="sku-header">
        <image
          class="sku-header__image"
          :src="dishImage || '/static/placeholder.png'"
          mode="aspectFill"
        />
        <view class="sku-header__info">
          <text class="sku-header__name text-ellipsis">{{ dishName }}</text>
          <text class="sku-header__price">¥{{ priceText }}</text>
          <text v-if="currentSku" class="sku-header__stock">
            库存：{{ currentSku.stock }}
          </text>
        </view>
        <view class="sku-header__close" @tap="handleClose">
          <text>×</text>
        </view>
      </view>

      <!-- 规格选择 -->
      <scroll-view class="sku-body" scroll-y>
        <view
          v-for="group in specGroups"
          :key="group.name"
          class="sku-group"
        >
          <text class="sku-group__name">{{ group.name }}</text>
          <view class="sku-group__values">
            <view
              v-for="value in group.values"
              :key="value"
              class="sku-tag"
              :class="{ 'sku-tag--active': selectedSpecs[group.name] === value }"
              @tap="selectSpec(group.name, value)"
            >
              <text>{{ value }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 底部操作栏 -->
      <view class="sku-footer">
        <view class="sku-footer__qty">
          <view class="qty-btn" @tap="decreaseQty">
            <text class="qty-btn__text">-</text>
          </view>
          <text class="qty-value">{{ quantity }}</text>
          <view class="qty-btn qty-btn--plus" @tap="increaseQty">
            <text class="qty-btn__text">+</text>
          </view>
        </view>
        <view class="sku-footer__confirm" @tap="handleConfirm">
          <text>加入购物车</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.sku-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sku-panel {
  width: 100%;
  max-height: 80vh;
  background-color: $bg-primary;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
}

.sku-header {
  display: flex;
  padding: $spacing-base;
  border-bottom: 1rpx solid $border-light;
  position: relative;

  &__image {
    width: 160rpx;
    height: 160rpx;
    border-radius: $radius-sm;
    background-color: $bg-dark;
    flex-shrink: 0;
    margin-top: -40rpx;
  }

  &__info {
    margin-left: $spacing-base;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  &__name {
    font-size: $font-size-lg;
    font-weight: 500;
    color: $text-primary;
  }

  &__price {
    font-size: $font-size-xl;
    font-weight: 700;
    color: $danger-color;
    margin-top: $spacing-xs;
  }

  &__stock {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__close {
    position: absolute;
    top: $spacing-base;
    right: $spacing-base;
    width: 48rpx;
    height: 48rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: $text-secondary;
  }
}

.sku-body {
  flex: 1;
  padding: $spacing-base;
  max-height: 400rpx;
}

.sku-group {
  margin-bottom: $spacing-lg;

  &__name {
    font-size: $font-size-base;
    font-weight: 500;
    color: $text-primary;
    display: block;
    margin-bottom: $spacing-sm;
  }

  &__values {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
  }
}

.sku-tag {
  padding: $spacing-sm $spacing-base;
  background-color: $bg-page;
  border-radius: $radius-sm;
  border: 1rpx solid $border-color;
  font-size: $font-size-base;
  color: $text-regular;

  &--active {
    background-color: $primary-light;
    border-color: $primary-color;
    color: $primary-color;
  }
}

.sku-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-base;
  border-top: 1rpx solid $border-light;
  padding-bottom: calc($spacing-base + env(safe-area-inset-bottom));

  &__qty {
    display: flex;
    align-items: center;
  }

  &__confirm {
    background-color: $primary-color;
    color: $text-white;
    border-radius: $radius-base;
    padding: $spacing-sm $spacing-xl;
    font-size: $font-size-base;
    font-weight: 500;
  }
}

.qty-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid $border-color;
  border-radius: $radius-round;

  &__text {
    font-size: $font-size-xl;
    color: $text-regular;
  }

  &--plus {
    background-color: $primary-color;
    border-color: $primary-color;

    .qty-btn__text {
      color: $text-white;
    }
  }
}

.qty-value {
  font-size: $font-size-lg;
  font-weight: 500;
  color: $text-primary;
  margin: 0 $spacing-base;
  min-width: 60rpx;
  text-align: center;
}
</style>
