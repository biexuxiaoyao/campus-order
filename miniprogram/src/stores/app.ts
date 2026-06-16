import { defineStore } from 'pinia';
import { ref } from 'vue';
import { get } from '@/api/index';

export interface BrandConfig {
  appName: string;
  logo: string;
  primaryColor: string;
  apiBaseUrl: string;
  storeId: string;
  contactPhone: string;
  notice: string;
}

export const useAppStore = defineStore('app', () => {
  const brandConfig = ref<BrandConfig>({
    appName: '校园点餐',
    logo: '',
    primaryColor: '#07C160',
    apiBaseUrl: 'http://localhost:3000',
    storeId: '',
    contactPhone: '',
    notice: '',
  });

  const isConfigLoaded = ref(false);

  /**
   * 加载品牌配置
   */
  async function fetchBrandConfig(): Promise<void> {
    try {
      const data = await get<BrandConfig>('/api/brand/config');
      brandConfig.value = { ...brandConfig.value, ...data };
      isConfigLoaded.value = true;

      // 缓存到本地
      uni.setStorageSync('brandConfig', brandConfig.value);

      // 动态设置导航栏标题
      if (data.appName) {
        uni.setNavigationBarTitle({ title: data.appName });
      }
    } catch (e) {
      console.warn('[App] 获取品牌配置失败', e);
      // 尝试从缓存读取
      const cached = uni.getStorageSync('brandConfig');
      if (cached) {
        brandConfig.value = cached;
        isConfigLoaded.value = true;
      }
    }
  }

  return {
    brandConfig,
    isConfigLoaded,
    fetchBrandConfig,
  };
});
