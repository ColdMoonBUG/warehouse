export type LocationFailureReason = 'permission' | 'service' | 'timeout' | 'unknown'

export interface LocationResult {
  latitude: number
  longitude: number
}

export interface LocationErrorInfo {
  reason: LocationFailureReason
  message: string
}

function normalizeLocationError(error: any): LocationErrorInfo {
  const message = error?.errMsg || error?.message || '定位失败'
  if (/auth deny|authorize no response|permission/i.test(message)) {
    return { reason: 'permission', message: '定位权限被拒绝，请在系统设置中允许定位后重试' }
  }
  if (/timeout/i.test(message)) {
    return { reason: 'timeout', message: '定位超时，请稍后重试' }
  }
  if (/system permission denied|location service|gps|定位服务/i.test(message)) {
    return { reason: 'service', message: '系统定位服务未开启，请先打开定位服务' }
  }
  return { reason: 'unknown', message }
}

export async function requestCurrentLocation(): Promise<LocationResult> {
  try {
    const setting: any = await uni.getSetting()
    const auth = setting?.authSetting?.['scope.userLocation']
    if (auth === false) {
      throw { errMsg: 'auth deny' }
    }
  } catch (error: any) {
    const normalized = normalizeLocationError(error)
    if (normalized.reason === 'permission') {
      throw normalized
    }
  }

  try {
    const loc: any = await uni.getLocation({ type: 'gcj02' })
    if (loc?.latitude && loc?.longitude) {
      return { latitude: loc.latitude, longitude: loc.longitude }
    }
    throw { errMsg: '定位结果为空' }
  } catch (error: any) {
    throw normalizeLocationError(error)
  }
}

export function openLocationSettings() {
  if (typeof uni.openSetting !== 'function') return
  uni.openSetting({})
}
