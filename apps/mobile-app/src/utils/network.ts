/**
 * 网络连通性检测
 * 通过 ping 后端健康接口判断服务器是否可达
 */
import { BASE_URL } from './config'
import { ref } from 'vue'

// 全局网络状态
export const serverReachable = ref<boolean | null>(null) // null=未知, true=可达, false=不可达
let _checkTimer: ReturnType<typeof setInterval> | null = null

/** 单次检测，返回是否可达 */
export async function checkServerReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.request({
      url: `${BASE_URL}/api/product/list?page=1&limit=1`,
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        const ok = res.statusCode >= 200 && res.statusCode < 500
        serverReachable.value = ok
        resolve(ok)
      },
      fail: () => {
        serverReachable.value = false
        resolve(false)
      },
    })
  })
}

/** 启动周期检测（每15秒一次），App.vue onLaunch 调用 */
export function startNetworkMonitor() {
  if (_checkTimer) return
  checkServerReachable()
  _checkTimer = setInterval(checkServerReachable, 15000)
}

/** 停止检测 */
export function stopNetworkMonitor() {
  if (_checkTimer) {
    clearInterval(_checkTimer)
    _checkTimer = null
  }
}

/**
 * 操作前网络检查：不可达时弹提示，返回 false 阻止操作
 * 用法：if (!(await guardNetwork())) return
 */
export async function guardNetwork(actionName = '操作'): Promise<boolean> {
  // 先用缓存状态快速判断
  if (serverReachable.value === false) {
    // 再确认一次，避免误判
    const ok = await checkServerReachable()
    if (!ok) {
      uni.showModal({
        title: '网络不可用',
        content: `无法连接服务器，${actionName}失败。\n请检查网络后重试。`,
        showCancel: false,
        confirmText: '知道了',
      })
      return false
    }
  }
  return true
}
