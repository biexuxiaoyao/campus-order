<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getDishDetail, type Dish } from '@/api/dishes';
import { useCartStore } from '@/stores/cart';
import SkuSelector from '@/components/SkuSelector.vue';

const cartStore = useCartStore();

const dish = ref<Dish | null>(null);
const loading = ref(true);
const currentImageIndex = ref(0);
const showSkuSelector = ref(false);

onLoad((options: any) => {
  const id = options?.id;
  if (id) {
    loadDishDetail(id);
  }
});

async function loadDishDetail(id: string) {
  loading.value = true;
  try {
    dish.value = await getDishDetail(id);
  } catch (e) {
    console.error('[Dish] 加载菜品详情失败', e);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function onImageChange(e: any) {
  currentImageIndex.value = e.detail.current;
}

function onAddToCart() {
  showSkuSelector.value = true;
}

async function onSkuConfirm(skuId: string, quantity: number) {
  showSkuSelector.value = false;
  await cartStore.addItem(skuId, quantity);
}

function onBuyNow() {
  showSkuSelector.value = true;
  // TODO: 立即购买流程（选SKU后直接跳转 checkout）
}

const priceText = computed(() => {
  if (!dish.value) return '0';
  return (dish.value.price / 100).toFixed(2);
});
</script>

<template>
  <view class="page-container">
    <!-- 图片轮播 -->
    <swiper
      v-if="dish && dish.images.length"
      class="dish-swiper"
      :indicator-dots="dish.images.length > 1"
      indicator-color="rgba(255,255,255,0.5)"
      indicator-active-color="#07C160"
      autoplay
      circular
      @change="onImageChange"
    >
      <swiper-item v-for="(img, idx) in dish.images" :key="idx">
        <image class="dish-swiper__img" :src="img" mode="aspectFill" />
      </swiper-item>
    </swiper>
    <view v-else class="dish-swiper--empty">
      <image class="dish-swiper__img" src="/static/placeholder.png" mode="aspectFill" />
    </view>

    <view v-if="dish" class="dish-info card">
      <!-- 名称和价格 -->
      <view class="dish-info__header">
        <text class="dish-info__name">{{ dish.name }}</text>
        <view class="dish-info__price-row">
          <text class="dish-info__price-symbol">¥</text>
          <text class="dish-info__price">{{ priceText }}</text>
          <text v-if="dish.originPrice" class="dish-info__origin-price">
            ¥{{ (dish.originPrice / 100).toFixed(2) }}
          </text>
          <text v-if="dish.estimated" class="dish-info__estimated">预估</text>
        </view>
      </view>

      <!-- 月售 -->
      <view v-if="dish.salesCount" class="dish-info__sales">
        <text>月售 {{ dish.salesCount }}</text>
      </view>

      <!-- 描述 -->
      <view v-if="dish.description" class="dish-info__desc">
        <text>{{ dish.description }}</text>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view v-if="dish" class="bottom-bar safe-area-bottom">
      <view class="bottom-bar__cart" @tap="() => uni.navigateTo({ url: '/pages/cart/cart' })">
        <image class="bottom-bar__cart-icon" src="/static/icon-cart.png" mode="aspectFit" />
        <text v-if="cartStore.itemCount" class="bottom-bar__cart-badge">
          {{ cartStore.itemCount > 99 ? '99+' : cartStore.itemCount }}
        </text>
      </view>
      <view class="bottom-bar__actions">
        <view class="bottom-bar__btn bottom-bar__btn--cart" @tap="onAddToCart">
          <text>加入购物车</text>
        </view>
        <view class="bottom-bar__btn bottom-bar__btn--buy" @tap="onBuyNow">
          <text>立即购买</text>
        </view>
      </view>
    </view>

    <!-- SKU 选择器 -->
    <SkuSelector
      :visible="showSkuSelector"
      :dish-name="dish?.name || ''"
      :dish-image="dish?.images[0] || ''"
      :skus="dish?.skus || []"
      @close="showSkuSelector = false"
      @confirm="onSkuConfirm"
    />
  </view>
</template>

<style lang="scss" scoped>
.dish-swiper {
  width: 100vw;
  height: 600rpx;
  background-color: $bg-dark;

  &__img {
    width: 100%;
    height: 100%;
  }

  &--empty {
    width: 100vw;
    height: 400rpx;
    background-color: $bg-dark;

    .dish-swiper__img {
      width: 100%;
      height: 100%;
    }
  }
}

.dish-info {
  margin-top: -24rpx;
  position: relative;
  z-index: 1;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  &__name {
    font-size: $font-size-xxl;
    font-weight: 600;
    color: $text-primary;
    flex: 1;
    margin-right: $spacing-base;
  }

  &__price-row {
    display: flex;
    align-items: baseline;
    flex-shrink: 0;
  }

  &__price-symbol {
    font-size: $font-size-sm;
    color: $danger-color;
  }

  &__price {
    font-size: $font-size-xxl;
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
    margin-top: $spacing-sm;

    text {
      font-size: $font-size-sm;
      color: $text-secondary;
    }
  }

  &__desc {
    margin-top: $spacing-base;

    text {
      font-size: $font-size-base;
      color: $text-regular;
      line-height: 1.6;
    }
  }
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: $spacing-sm $spacing-base;
  background-color: $bg-primary;
  border-top: 1rpx solid $border-light;
  z-index: 100;

  &__cart {
    position: relative;
    width: 72rpx;
    height: 72rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-base;
  }

  &__cart-icon {
    width: 48rpx;
    height: 48rpx;
  }

  &__cart-badge {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 32rpx;
    height: 32rpx;
    background-color: $danger-color;
    border-radius: 16rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18rpx;
    color: $text-white;
  }

  &__actions {
    flex: 1;
    display: flex;
    gap: $spacing-sm;
  }

  &__btn {
    flex: 1;
    height: 76rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 38rpx;
    font-size: $font-size-lg;
    font-weight: 500;

    &--cart {
      background-color: #FFF0E0;
      color: #FF9800;
    }

    &--buy {
      background-color: $primary-color;
      color: $text-white;
    }
  }
}
</style>
