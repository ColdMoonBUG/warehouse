import { getStock } from '@/api'
import type { StockItem } from '@/types'

export type StockQtyMap = Record<string, number>

export function createStockQtyMap(list: StockItem[]): StockQtyMap {
  return list.reduce<StockQtyMap>((acc, item) => {
    acc[item.productId] = Number(item.qty || 0)
    return acc
  }, {})
}

export function getStockQty(map: StockQtyMap, productId?: string): number {
  if (!productId) return 0
  return Number(map[productId] || 0)
}

export async function loadStockMaps(targets: Array<{ key: string; warehouseId?: string }>): Promise<Record<string, StockQtyMap>> {
  const ids = [...new Set(targets.map(target => target.warehouseId).filter(Boolean) as string[])]
  const sourceEntries = await Promise.all(ids.map(async warehouseId => {
    const stockList = await getStock(warehouseId)
    return [warehouseId, createStockQtyMap(stockList)] as const
  }))
  const sourceMap = new Map(sourceEntries)
  return targets.reduce<Record<string, StockQtyMap>>((acc, target) => {
    acc[target.key] = target.warehouseId ? (sourceMap.get(target.warehouseId) || {}) : {}
    return acc
  }, {})
}
