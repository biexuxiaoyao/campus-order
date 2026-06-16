/**
 * uni-app 网络请求封装
 *
 * 用法：
 *   import { get, post } from '@/api';
 *   const res = await get<Dish[]>('/api/dishes', { storeId: 'xxx' });
 *   // res.code === 0 时返回 res.data
 */

// 生产环境通过品牌配置获取 base URL，开发环境使用本地代理
const DEV_BASE_URL = 'http://localhost:3000';

function getBaseUrl(): string {
  if (process.env.NODE_ENV === 'development') {
    return DEV_BASE_URL;
  }
  // 生产环境从品牌配置读取
  const brandConfig = uni.getStorageSync('brandConfig');
  return brandConfig?.apiBaseUrl || DEV_BASE_URL;
}

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  header?: Record<string, string>;
  showLoading?: boolean;
  loadingText?: string;
}

/**
 * 核心请求方法
 */
function request<T = any>(options: RequestOptions): Promise<T> {
  const {
    url,
    method = 'GET',
    data,
    header = {},
    showLoading = false,
    loadingText = '加载中...',
  } = options;

  if (showLoading) {
    uni.showLoading({ title: loadingText, mask: true });
  }

  // 读取 token
  const token = uni.getStorageSync('token');
  const appId = uni.getStorageSync('appId');
  const tenantId = uni.getStorageSync('tenantId');

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...header,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (appId) {
    headers['x-app-id'] = appId;
  }
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  const baseUrl = getBaseUrl();

  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: headers,
      success: (res) => {
        if (showLoading) {
          uni.hideLoading();
        }

        const statusCode = res.statusCode;

        // HTTP 层面的错误
        if (statusCode === 401) {
          uni.removeStorageSync('token');
          uni.showToast({ title: '登录已过期，请重新进入', icon: 'none' });
          reject(new Error('Unauthorized'));
          return;
        }

        if (statusCode === 403) {
          uni.showToast({ title: '没有权限执行此操作', icon: 'none' });
          reject(new Error('Forbidden'));
          return;
        }

        if (statusCode >= 500) {
          uni.showToast({ title: '服务器繁忙，请稍后再试', icon: 'none' });
          reject(new Error('Server Error'));
          return;
        }

        const body = res.data as ApiResponse<T>;

        // 业务层面的错误
        if (body.code && body.code !== 0) {
          const msg = body.message || '请求失败';
          uni.showToast({ title: msg, icon: 'none' });
          reject(new Error(msg));
          return;
        }

        // 成功 — 返回 data 字段
        resolve(body.data !== undefined ? body.data : body);
      },
      fail: (err) => {
        if (showLoading) {
          uni.hideLoading();
        }
        uni.showToast({ title: '网络连接失败，请检查网络', icon: 'none' });
        reject(err);
      },
    });
  });
}

// ========== 便捷方法 ==========

export function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  // 将 params 拼接到 URL
  let fullUrl = url;
  if (params) {
    const query = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (query) {
      fullUrl += `?${query}`;
    }
  }
  return request<T>({ url: fullUrl, method: 'GET' });
}

export function post<T = any>(url: string, data?: any): Promise<T> {
  return request<T>({ url, method: 'POST', data });
}

export function put<T = any>(url: string, data?: any): Promise<T> {
  return request<T>({ url, method: 'PUT', data });
}

export function del<T = any>(url: string): Promise<T> {
  return request<T>({ url, method: 'DELETE' });
}

export default { get, post, put, del };
