<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

const authStore = useAuthStore();
const appStore = useAppStore();

onLaunch(async () => {
  console.log('[App] onLaunch');

  // 加载品牌配置
  try {
    await appStore.fetchBrandConfig();
  } catch (e) {
    console.warn('[App] 品牌配置加载失败，使用默认配置');
  }

  // 检查登录状态
  const token = uni.getStorageSync('token');
  if (token) {
    try {
      await authStore.checkLogin();
    } catch (e) {
      console.warn('[App] Token 失效，需要重新登录');
      uni.removeStorageSync('token');
    }
  } else {
    // 自动登录
    try {
      await authStore.login();
    } catch (e) {
      console.warn('[App] 自动登录失败');
    }
  }
});

onShow(() => {
  console.log('[App] onShow');
});

onHide(() => {
  console.log('[App] onHide');
});
</script>

<style lang="scss">
@import '@/uni.scss';

/* 全局重置 */
page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
  font-size: $font-size-base;
  color: $text-primary;
  background-color: $bg-page;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* 隐藏 scroll-view 的滚动条（微信小程序） */
::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
}
</style>
