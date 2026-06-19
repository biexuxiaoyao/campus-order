import http from './index'

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResult {
  token: string
  user: UserInfo
}

export interface UserInfo {
  id: number
  username: string
  role: string
  tenantId: string
  modules?: string[]
}

export function login(params: LoginParams): Promise<LoginResult> {
  return http.post('/auth/admin-login', params)
}

export function getUserInfo(): Promise<UserInfo> {
  return http.get('/auth/admin-profile')
}

export function logout(): Promise<void> {
  return http.post('/auth/admin-logout')
}
