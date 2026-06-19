import { defineStore } from 'pinia';
import { ref } from 'vue';
import { get } from '@/api/index';

export interface BrandConfig {
  name: string;
  logo: string;
  themeColor: string;
  banners: string[];
  hours: string;
  phone: string;
  // Computed/derived fields
  storeId: string;
  appName: string;
  primaryColor: string;
  apiBaseUrl: string;
  contactPhone: string;
  notice: string;
}

export const useAppStore = defineStore('app', () => {
  const brandConfig = ref<BrandConfig>({
    name: '校园点餐',
    logo: '',
    themeColor: '#07C160',
    banners: [],
    hours: '09:00-21:00',
    phone: '',
    storeId: 'demo-store-001',
    appName: '校园点餐',
    primaryColor: '#07C160',
    apiBaseUrl: 'http://localhost:3000',
    contactPhone: '',
    notice: '',
  });

  const isConfigLoaded = ref(false);

  // Module feature flags
  const modules = ref<string[]>([]);

  function setModules(ids: string[]) {
    modules.value = ids;
    uni.setStorageSync('modules', ids);
  }

  function loadModules() {
    const cached = uni.getStorageSync('modules');
    if (cached && Array.isArray(cached)) {
      modules.value = cached;
    }
  }

  function hasModule(id: string): boolean {
    return modules.value.includes(id);
  }

  /**
   * 加载品牌配置 — 映射后端字段到前端字段
   */
  async function fetchBrandConfig(): Promise<void> {
    try {
      const raw = await get<any>('/api/brand/config');
      // 映射后端字段名到前端期望的字段名
      const mapped: BrandConfig = {
        ...brandConfig.value,
        name: raw.name || brandConfig.value.name,
        logo: raw.logo || brandConfig.value.logo,
        themeColor: raw.themeColor || brandConfig.value.themeColor,
        banners: raw.banners || brandConfig.value.banners,
        hours: raw.hours || brandConfig.value.hours,
        phone: raw.phone || brandConfig.value.phone,
        appName: raw.name || brandConfig.value.appName,
        primaryColor: raw.themeColor || brandConfig.value.primaryColor,
        contactPhone: raw.phone || brandConfig.value.contactPhone,
        notice: raw.notice || brandConfig.value.notice,
        storeId: brandConfig.value.storeId,
        apiBaseUrl: brandConfig.value.apiBaseUrl,
      };
      brandConfig.value = mapped;
      isConfigLoaded.value = true;

      uni.setStorageSync('brandConfig', brandConfig.value);

      // 动态设置导航栏标题
      if (mapped.appName) {
        uni.setNavigationBarTitle({ title: mapped.appName });
      }
    } catch (e) {
      console.warn('[App] 获取品牌配置失败', e);
      const cached = uni.getStorageSync('brandConfig');
      if (cached) {
        brandConfig.value = cached;
        isConfigLoaded.value = true;
      }
    }
  }

  return { brandConfig, isConfigLoaded, fetchBrandConfig, modules, setModules, loadModules, hasModule };
});
