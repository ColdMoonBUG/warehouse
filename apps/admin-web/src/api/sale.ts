import { saleDb, genId, now } from '@/mock/storage'
import type { SaleDoc } from '@/types'

export function getSales() {
  return Promise.resolve(saleDb.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

export function saveSale(doc: SaleDoc) {
  const list = saleDb.list()
  const idx = list.findIndex(d => d.id === doc.id)
  if (idx >= 0) list[idx] = doc
  else list.push(doc)
  saleDb.save(list)
  return Promise.resolve(doc)
}

export function postSale(id: string) {
  const list = saleDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'draft') return Promise.reject(new Error('单据状态异常'))
  doc.status = 'posted'
  saleDb.save(list)
  return Promise.resolve()
}

export function voidSale(id: string) {
  const list = saleDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'posted') return Promise.reject(new Error('只能作废已过账单据'))
  doc.status = 'voided'
  saleDb.save(list)
  return Promise.resolve()
}

// 按门店统计最近N天销售总件数
export function getStoreSaleQty(days = 30): Record<string, number> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const docs = saleDb.list().filter(d => d.status === 'posted' && d.date >= cutoff.slice(0, 10))
  const result: Record<string, number> = {}
  for (const doc of docs) {
    const total = doc.lines.reduce((s, l) => s + l.qty, 0)
    result[doc.storeId] = (result[doc.storeId] || 0) + total
  }
  return result
}
