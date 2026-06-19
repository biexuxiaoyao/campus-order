import http from './index'

export interface BusinessSettings {
  openTime: string
  closeTime: string
  paused: boolean
  printerConfig: string
  printerSN?: string
  printerKey?: string
}

export function getSettings(): Promise<BusinessSettings> {
  return http.get('/merchant/settings')
}

export function updateSettings(data: Partial<BusinessSettings>) {
  return http.put('/merchant/settings', data)
}
