<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

const authStore = useAuthStore();
const appStore = useAppStore();

onLaunch(async () => {
  console.log('[App] onLaunch');

  // 确保 appId 已存储（品牌配置请求需要 x-app-id header）
  if (!uni.getStorageSync('appId')) {
    // 从微信获取小程序 AppID（getAccountInfoSync 在所有微信环境中可用）
    const accountInfo = uni.getAccountInfoSync?.();
    const appId = accountInfo?.miniProgram?.appId || '';
    if (!appId) {
      console.error('[App] 无法获取 AppID，请确保在微信小程序环境中运行');
    }
    uni.setStorageSync('appId', appId);
    console.log('[App] AppID:', appId || '(未获取到)');
  }

  // 加载品牌配置
  try {
    await appStore.fetchBrandConfig();
  } catch (e) {
    console.warn('[App] 品牌配置加载失败，使用默认配置');
  }

  // 加载模块信息
  appStore.loadModules();

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
    // 自动登录 — 放到下一个事件循环，不阻塞 onLaunch
    setTimeout(async () => {
      try {
        await authStore.login();
      } catch (e) {
        console.warn('[App] 自动登录失败（可忽略，不影响浏览）');
      }
    }, 100);
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
