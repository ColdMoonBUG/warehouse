import { getStock } from '@/api'
import type { StockItem } from '@/types'

type StockCallback = (stockList: StockItem[]) => void

interface Subscription {
  warehouseId: string
  callback: StockCallback
}

const POLL_INTERVAL = 15000 // 15秒

class StockPoller {
  private subscriptions: Subscription[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private lastDataMap = new Map<string, string>() // warehouseId -> JSON hash

  /** 订阅指定仓库的库存变化，返回取消订阅函数 */
  subscribe(warehouseId: string, callback: StockCallback): () => void {
    const sub: Subscription = { warehouseId, callback }
    this.subscriptions.push(sub)

    // 立即拉取一次
    this.fetchAndNotify(warehouseId)

    // 如果是第一个订阅，启动轮询
    if (this.subscriptions.length === 1) {
      this.startPolling()
    }

    return () => {
      this.subscriptions = this.subscriptions.filter(s => s !== sub)
      if (this.subscriptions.length === 0) {
        this.stopPolling()
      }
    }
  }

  private startPolling() {
    this.stopPolling()
    this.timer = setInterval(() => this.pollAll(), POLL_INTERVAL)
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async pollAll() {
    // 收集所有需要轮询的仓库 ID
    const warehouseIds = new Set<string>()
    for (const sub of this.subscriptions) {
      warehouseIds.add(sub.warehouseId)
    }
    // 并发拉取
    const promises = Array.from(warehouseIds).map(id => this.fetchAndNotify(id))
    await Promise.allSettled(promises)
  }

  private async fetchAndNotify(warehouseId: string) {
    try {
      const stockList = await getStock(warehouseId)
      // 简单比较是否有变化
      const hash = JSON.stringify(stockList.map(s => `${s.productId}:${s.qty}`).sort())
      const lastHash = this.lastDataMap.get(warehouseId)
      if (hash === lastHash) return // 无变化，不通知
      this.lastDataMap.set(warehouseId, hash)

      // 通知该仓库的所有订阅者
      for (const sub of this.subscriptions) {
        if (sub.warehouseId === warehouseId) {
          try {
            sub.callback(stockList)
          } catch { /* ignore callback errors */ }
        }
      }
    } catch {
      // 网络错误静默忽略，下次轮询重试
    }
  }
}

export const stockPoller = new StockPoller()
