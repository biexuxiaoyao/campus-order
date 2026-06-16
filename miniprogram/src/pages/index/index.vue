<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { getDishList, type Dish } from '@/api/dishes';
import { useAppStore } from '@/stores/app';
import { useCartStore } from '@/stores/cart';
import DishCard from '@/components/DishCard.vue';
import CartBadge from '@/components/CartBadge.vue';

const appStore = useAppStore();
const cartStore = useCartStore();

// 分类列表
const categories = ref<Array<{ id: string; name: string }>>([]);
const activeCategoryId = ref('');

// 菜品列表
const dishes = ref<Dish[]>([]);
const loading = ref(false);
const page = ref(1);
const hasMore = ref(true);
const keyword = ref('');

// 品牌信息
const storeId = computed(() => appStore.brandConfig.storeId || '');

// 加载分类（从菜品数据中提取，或从服务端获取）
async function loadCategories() {
  // TODO: 可以在服务端添加分类接口后替换
  // 暂时使用模拟的分类数据
  categories.value = [
    { id: '', name: '全部' },
    { id: 'cat1', name: '热销推荐' },
    { id: 'cat2', name: '主食' },
    { id: 'cat3', name: '小食' },
    { id: 'cat4', name: '饮品' },
  ];
  activeCategoryId.value = '';
}

async function loadDishes(reset: boolean = false) {
  if (loading.value) return;
  if (!storeId.value) {
    // 没有 storeId 时延迟加载
    setTimeout(() => loadDishes(reset), 500);
    return;
  }

  if (reset) {
    page.value = 1;
    hasMore.value = true;
  }

  if (!hasMore.value && !reset) return;

  loading.value = true;
  try {
    const params: any = {
      storeId: storeId.value,
      page: page.value,
      pageSize: 20,
    };
    if (activeCategoryId.value) {
      params.categoryId = activeCategoryId.value;
    }
    if (keyword.value) {
      params.keyword = keyword.value;
    }

    const result = await getDishList(params);

    if (reset) {
      dishes.value = result.items;
    } else {
      dishes.value = [...dishes.value, ...result.items];
    }
    hasMore.value = result.hasMore;
    page.value++;
  } catch (e) {
    console.error('[Index] 加载菜品失败', e);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function onCategoryChange(id: string) {
  activeCategoryId.value = id;
  loadDishes(true);
}

function onSearchTap() {
  uni.showModal({
    title: '搜索菜品',
    editable: true,
    placeholderText: '输入菜品名称',
    success: async (res) => {
      if (res.confirm && res.content) {
        keyword.value = res.content;
        loadDishes(true);
      }
    },
  });
}

function onDishClick(id: string) {
  uni.navigateTo({ url: `/pages/dish/dish?id=${id}` });
}

onMounted(async () => {
  await loadCategories();
  await loadDishes(true);
  // 加载购物车数量
  try {
    await cartStore.fetchCart();
  } catch {}
});

onPullDownRefresh(() => {
  loadDishes(true);
});

onReachBottom(() => {
  loadDishes();
});
</script>

<template>
  <view class="page-container">
    <!-- 搜索栏 -->
    <view class="search-bar" @tap="onSearchTap">
      <view class="search-bar__inner">
        <text class="search-bar__icon">&#128269;</text>
        <text class="search-bar__placeholder">搜索菜品</text>
      </view>
    </view>

    <!-- 品牌横幅 -->
    <view v-if="appStore.brandConfig.notice" class="notice-bar">
      <text class="notice-bar__text">{{ appStore.brandConfig.notice }}</text>
    </view>

    <!-- 分类标签 -->
    <scroll-view class="category-scroll" scroll-x :show-scrollbar="false">
      <view
        v-for="cat in categories"
        :key="cat.id"
        class="category-tab"
        :class="{ 'category-tab--active': activeCategoryId === cat.id }"
        @tap="onCategoryChange(cat.id)"
      >
        <text>{{ cat.name }}</text>
      </view>
    </scroll-view>

    <!-- 菜品列表 -->
    <scroll-view
      class="dish-list"
      scroll-y
      @scrolltolower="loadDishes"
    >
      <DishCard
        v-for="dish in dishes"
        :key="dish.id"
        :dish="dish"
        @click="onDishClick"
      />

      <!-- 加载状态 -->
      <view v-if="loading" class="loading-row">
        <text class="loading-text">加载中...</text>
      </view>
      <view v-else-if="!hasMore && dishes.length > 0" class="loading-row">
        <text class="loading-text">— 没有更多了 —</text>
      </view>
      <view v-else-if="!loading && dishes.length === 0" class="empty">
        <image class="empty__img" src="/static/empty.png" mode="aspectFit" />
        <text class="empty__text">暂无菜品</text>
      </view>

      <!-- 底部安全距离 -->
      <view class="dish-list__bottom" />
    </scroll-view>

    <!-- 购物车浮标 -->
    <CartBadge />
  </view>
</template>

<style lang="scss" scoped>
.search-bar {
  padding: $spacing-sm $spacing-base;
  background-color: $bg-primary;

  &__inner {
    display: flex;
    align-items: center;
    background-color: $bg-page;
    border-radius: 40rpx;
    padding: $spacing-sm $spacing-base;
  }

  &__icon {
    font-size: $font-size-lg;
    margin-right: $spacing-xs;
  }

  &__placeholder {
    font-size: $font-size-base;
    color: $text-placeholder;
  }
}

.notice-bar {
  padding: $spacing-sm $spacing-base;
  background-color: #FFF9E6;

  &__text {
    font-size: $font-size-sm;
    color: #B8860B;
  }
}

.category-scroll {
  white-space: nowrap;
  padding: $spacing-sm $spacing-base;
  background-color: $bg-primary;

  .category-tab {
    display: inline-flex;
    padding: $spacing-sm $spacing-base;
    margin-right: $spacing-sm;
    border-radius: 40rpx;
    background-color: $bg-page;
    font-size: $font-size-base;
    color: $text-regular;
    transition: all 0.3s;

    &--active {
      background-color: $primary-light;
      color: $primary-color;
      font-weight: 500;
    }
  }
}

.dish-list {
  padding: 0 $spacing-base;
  min-height: calc(100vh - 200rpx);

  &__bottom {
    height: 140rpx;
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
  justify-content: center;
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
