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
  // Subscribe message template IDs from WeChat
  subscribeTemplates: string[];
  // Miniprogram configuration from brand
  rechargeOptions: number[];
  timeSlots: string[];
  exchangeRules: { id: string; label: string; points: number; type: string }[];
}

/** Collect WeChat subscribe template IDs from raw brand config */
function collectTemplateIds(raw: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('notifyTemplate') && typeof value === 'string' && value) {
      ids.push(value);
    }
  }
  return ids;
}

export const useAppStore = defineStore('app', () => {
  const brandConfig = ref<BrandConfig>({
    name: '',
    logo: '',
    themeColor: '#07C160',
    banners: [],
    hours: '',
    phone: '',
    storeId: '',
    appName: '',
    primaryColor: '#07C160',
    apiBaseUrl: '',
    contactPhone: '',
    notice: '',
    subscribeTemplates: [],
    rechargeOptions: [50, 100, 200, 500],
    timeSlots: ['尽快取餐'],
    exchangeRules: [],
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
        storeId: raw.storeId || brandConfig.value.storeId,
        apiBaseUrl: raw.apiBaseUrl || brandConfig.value.apiBaseUrl,
        subscribeTemplates: collectTemplateIds(raw),
        rechargeOptions: raw.rechargeOptions || brandConfig.value.rechargeOptions,
        timeSlots: raw.timeSlots || brandConfig.value.timeSlots,
        exchangeRules: raw.exchangeRules || brandConfig.value.exchangeRules,
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
