import { post } from './index';

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    nickname: string;
    avatar: string;
    phone: string;
  };
  appId: string;
  tenantId: string;
  modules?: string[];
}

/**
 * 微信登录
 */
export function wechatLogin(code: string): Promise<LoginResponse> {
  return post<LoginResponse>('/api/auth/wechat-login', { code });
}

/**
 * 刷新 Token
 */
export function refreshToken(refreshToken: string): Promise<{ token: string }> {
  return post<{ token: string }>('/api/auth/refresh', { refreshToken });
}
