import http from './index'

export interface BusinessSettings {
  openTime: string
  closeTime: string
  paused: boolean
  printerConfig: string
}

export function getSettings(): Promise<BusinessSettings> {
  return http.get('/settings')
}

export function updateSettings(data: Partial<BusinessSettings>) {
  return http.put('/settings', data)
}
