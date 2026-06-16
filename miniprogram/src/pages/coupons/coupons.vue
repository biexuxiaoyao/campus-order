<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getMyCoupons, getAvailableCoupons, claimCoupon } from '@/api/coupons';
import type { Coupon, CouponTemplate } from '@/api/coupons';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();

const tabs = [
  { label: '可使用', value: 'available' },
  { label: '已使用', value: 'used' },
  { label: '已过期', value: 'expired' },
];

const activeTab = ref('available');
const coupons = ref<Coupon[]>([]);
const availableTemplates = ref<CouponTemplate[]>([]);
const loading = ref(true);

function formatPrice(price: number): string {
  return (price / 100).toFixed(2);
}

function formatExpiredAt(time: string): string {
  if (!time) return '';
  const d = new Date(time);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${month}月${day}日到期`;
}

function getCouponTag(coupon: Coupon): string {
  if (coupon.type === 'discount') {
    return `${coupon.value / 10}折`;
  }
  return `¥${formatPrice(coupon.value)}`;
}

function getConditionText(coupon: Coupon): string {
  if (coupon.minAmount > 0) {
    return `满¥${formatPrice(coupon.minAmount)}可用`;
  }
  return '无门槛';
}

async function loadCoupons() {
  loading.value = true;
  try {
    const result = await getMyCoupons({ status: activeTab.value });
    coupons.value = result.items || [];
  } catch (e) {
    console.error('[Coupons] 加载优惠券失败', e);
  } finally {
    loading.value = false;
  }
}

async function loadAvailableTemplates() {
  const storeId = appStore.brandConfig.storeId;
  if (!storeId) return;

  try {
    availableTemplates.value = await getAvailableCoupons(storeId);
  } catch (e) {
    console.error('[Coupons] 加载可领券失败', e);
  }
}

function onTabChange(value: string) {
  activeTab.value = value;
  loadCoupons();
}

async function onClaimCoupon(templateId: string) {
  try {
    await claimCoupon(templateId);
    uni.showToast({ title: '领取成功', icon: 'success' });
    loadAvailableTemplates();
    loadCoupons();
  } catch (e) {
    console.error('[Coupons] 领取失败', e);
  }
}

onMounted(() => {
  loadCoupons();
  loadAvailableTemplates();
});
</script>

<template>
  <view class="page-container">
    <!-- 可领券区域 -->
    <view v-if="availableTemplates.length > 0" class="card">
      <text class="section__title">可领取优惠券</text>
      <scroll-view scroll-x :show-scrollbar="false">
        <view class="template-list">
          <view
            v-for="tpl in availableTemplates"
            :key="tpl.id"
            class="template-card"
          >
            <view class="template-card__value">
              <text v-if="tpl.type === 'discount'" class="template-card__num">
                {{ tpl.value / 10 }}
              </text>
              <text v-else class="template-card__num">
                {{ formatPrice(tpl.value) }}
              </text>
              <text class="template-card__unit">
                {{ tpl.type === 'discount' ? '折' : '元' }}
              </text>
            </view>
            <text class="template-card__name">{{ tpl.name }}</text>
            <view class="template-card__btn" @tap="onClaimCoupon(tpl.id)">
              <text>领取</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- Tab -->
    <view class="tab-row">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === tab.value }"
        @tap="onTabChange(tab.value)"
      >
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <!-- 优惠券列表 -->
    <view v-if="coupons.length > 0" class="coupon-list">
      <view
        v-for="coupon in coupons"
        :key="coupon.id"
        class="coupon-card"
        :class="{ 'coupon-card--inactive': coupon.status !== 'available' }"
      >
        <view class="coupon-card__left">
          <view class="coupon-card__value">
            <text class="coupon-card__tag">{{ getCouponTag(coupon) }}</text>
          </view>
        </view>
        <view class="coupon-card__right">
          <text class="coupon-card__name">{{ coupon.name }}</text>
          <text class="coupon-card__condition">{{ getConditionText(coupon) }}</text>
          <text class="coupon-card__expire">
            {{ formatExpiredAt(coupon.expiredAt) }}
          </text>
        </view>
        <view v-if="coupon.status === 'used'" class="coupon-card__used-mark">
          <text>已使用</text>
        </view>
      </view>
    </view>

    <view v-else-if="!loading" class="empty">
      <image class="empty__img" src="/static/empty-coupon.png" mode="aspectFit" />
      <text class="empty__text">暂无优惠券</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.section__title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
  display: block;
  margin-bottom: $spacing-base;
}

.template-list {
  white-space: nowrap;
  display: flex;
  gap: $spacing-sm;
}

.template-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #FFF5F5, #FFEBEE);
  border-radius: $radius-base;
  padding: $spacing-base;
  width: 220rpx;
  flex-shrink: 0;

  &__value {
    display: flex;
    align-items: baseline;
  }

  &__num {
    font-size: 48rpx;
    font-weight: 700;
    color: $danger-color;
  }

  &__unit {
    font-size: $font-size-lg;
    color: $danger-color;
    font-weight: 600;
  }

  &__name {
    font-size: $font-size-sm;
    color: $text-regular;
    margin: $spacing-xs 0;
  }

  &__btn {
    padding: 4rpx 24rpx;
    background-color: $danger-color;
    border-radius: 40rpx;
    color: $text-white;
    font-size: $font-size-sm;
  }
}

.tab-row {
  display: flex;
  padding: $spacing-sm $spacing-base;
  background-color: $bg-primary;
  border-bottom: 1rpx solid $border-light;

  .tab-item {
    flex: 1;
    text-align: center;
    padding: $spacing-sm 0;
    font-size: $font-size-base;
    color: $text-regular;
    position: relative;

    &--active {
      color: $primary-color;
      font-weight: 600;

      &::after {
        content: '';
        position: absolute;
        bottom: -$spacing-sm;
        left: 50%;
        transform: translateX(-50%);
        width: 40rpx;
        height: 4rpx;
        background-color: $primary-color;
        border-radius: 2rpx;
      }
    }
  }
}

.coupon-list {
  padding: $spacing-base;
  padding-bottom: 40rpx;
}

.coupon-card {
  display: flex;
  margin-bottom: $spacing-sm;
  border-radius: $radius-base;
  overflow: hidden;
  position: relative;
  box-shadow: $shadow-sm;

  &--inactive {
    opacity: 0.6;
    filter: grayscale(0.3);
  }

  &__left {
    width: 180rpx;
    background: linear-gradient(135deg, #FF6B35, $danger-color);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-base;
    flex-shrink: 0;
  }

  &__tag {
    font-size: $font-size-xxl;
    font-weight: 700;
    color: $text-white;
  }

  &__right {
    flex: 1;
    background-color: $bg-primary;
    padding: $spacing-base;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  &__name {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
    display: block;
  }

  &__condition {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-top: 4rpx;
    display: block;
  }

  &__expire {
    font-size: $font-size-xs;
    color: $text-placeholder;
    margin-top: 4rpx;
    display: block;
  }

  &__used-mark {
    position: absolute;
    right: $spacing-base;
    bottom: $spacing-base;
    background-color: $text-secondary;
    border-radius: 4rpx;
    padding: 2rpx 12rpx;
    font-size: $font-size-xs;
    color: $text-white;
  }
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
