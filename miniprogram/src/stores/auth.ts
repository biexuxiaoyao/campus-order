import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { wechatLogin, refreshToken as refreshTokenApi } from '@/api/auth';

export interface UserInfo {
  id: string;
  nickname: string;
  avatar: string;
  phone: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null);
  const token = ref<string>('');
  const refreshTokenVal = ref<string>('');
  const isLoggedIn = computed(() => !!token.value);

  /**
   * 微信登录
   */
  async function login(): Promise<void> {
    return new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: async (loginRes) => {
          try {
            const code = loginRes.code;
            const data = await wechatLogin(code);

            // 保存到 storage
            token.value = data.token;
            refreshTokenVal.value = data.refreshToken;
            user.value = data.user;

            uni.setStorageSync('token', data.token);
            uni.setStorageSync('refreshToken', data.refreshToken);
            uni.setStorageSync('userInfo', data.user);
            uni.setStorageSync('appId', data.appId);
            uni.setStorageSync('tenantId', data.tenantId);

            resolve();
          } catch (e) {
            reject(e);
          }
        },
        fail: (err) => {
          console.error('[Auth] wx.login 失败', err);
          reject(err);
        },
      });
    });
  }

  /**
   * 检查登录状态
   */
  async function checkLogin(): Promise<boolean> {
    try {
      // 尝试从 storage 恢复
      const savedToken = uni.getStorageSync('token');
      const savedUser = uni.getStorageSync('userInfo');

      if (!savedToken) {
        return false;
      }

      token.value = savedToken;

      if (savedUser) {
        user.value = savedUser;
      }

      // 尝试刷新 token 来验证有效性
      const savedRefreshToken = uni.getStorageSync('refreshToken');
      if (savedRefreshToken) {
        try {
          const data = await refreshTokenApi(savedRefreshToken);
          token.value = data.token;
          uni.setStorageSync('token', data.token);
          return true;
        } catch {
          // refresh 失败，可能 token 已过期，尝试重新登录
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 退出登录
   */
  function logout() {
    token.value = '';
    refreshTokenVal.value = '';
    user.value = null;

    uni.removeStorageSync('token');
    uni.removeStorageSync('refreshToken');
    uni.removeStorageSync('userInfo');

    // 跳转到首页
    uni.switchTab({ url: '/pages/index/index' });
  }

  return {
    user,
    token,
    refreshTokenVal,
    isLoggedIn,
    login,
    checkLogin,
    logout,
  };
});
