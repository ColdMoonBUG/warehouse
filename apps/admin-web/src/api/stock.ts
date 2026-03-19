import { stockDb, ledgerDb, inboundDb, transferDb, warehouseDb, genId, now } from '@/mock/storage'
import type { InboundDoc, TransferDoc } from '@/types'

export function getWarehouses() {
  warehouseDb.ensureMain()
  warehouseDb.syncVehicles()
  return Promise.resolve(warehouseDb.list())
}

export function getStock(warehouseId?: string) {
  const all = stockDb.list()
  return Promise.resolve(warehouseId ? all.filter(s => s.warehouseId === warehouseId) : all)
}

// --- Inbound ---
export function getInbounds() {
  return Promise.resolve(inboundDb.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

export function saveInbound(doc: InboundDoc) {
  const list = inboundDb.list()
  const idx = list.findIndex(d => d.id === doc.id)
  if (idx >= 0) list[idx] = doc
  else list.push(doc)
  inboundDb.save(list)
  return Promise.resolve(doc)
}

export function postInbound(id: string) {
  const list = inboundDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'draft') return Promise.reject(new Error('单据状态异常'))
  doc.status = 'posted'
  for (const line of doc.lines) {
    stockDb.adjust('main', line.productId, line.qty)
    ledgerDb.add({ id: genId(), bizType: 'inbound', docId: id, warehouseId: 'main', productId: line.productId, qty: line.qty, createdAt: now() })
  }
  inboundDb.save(list)
  return Promise.resolve()
}

export function voidInbound(id: string) {
  const list = inboundDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'posted') return Promise.reject(new Error('只能作废已过账单据'))
  doc.status = 'voided'
  for (const line of doc.lines) {
    stockDb.adjust('main', line.productId, -line.qty)
    ledgerDb.add({ id: genId(), bizType: 'inbound', docId: id, warehouseId: 'main', productId: line.productId, qty: -line.qty, createdAt: now() })
  }
  inboundDb.save(list)
  return Promise.resolve()
}

// --- Transfer ---
export function getTransfers() {
  return Promise.resolve(transferDb.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

export function saveTransfer(doc: TransferDoc) {
  const list = transferDb.list()
  const idx = list.findIndex(d => d.id === doc.id)
  if (idx >= 0) list[idx] = doc
  else list.push(doc)
  transferDb.save(list)
  return Promise.resolve(doc)
}

export function postTransfer(id: string) {
  const list = transferDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'draft') return Promise.reject(new Error('单据状态异常'))
  for (const line of doc.lines) {
    const s = stockDb.get(doc.fromWarehouseId, line.productId)
    if (!s || s.qty < line.qty) return Promise.reject(new Error(`库存不足：${line.productId} 当前库存 ${s?.qty ?? 0}，需要 ${line.qty}`))
  }
  doc.status = 'posted'
  for (const line of doc.lines) {
    stockDb.adjust(doc.fromWarehouseId, line.productId, -line.qty)
    stockDb.adjust(doc.toWarehouseId, line.productId, line.qty)
    ledgerDb.add({ id: genId(), bizType: 'transfer', docId: id, warehouseId: doc.fromWarehouseId, productId: line.productId, qty: -line.qty, createdAt: now() })
    ledgerDb.add({ id: genId(), bizType: 'transfer', docId: id, warehouseId: doc.toWarehouseId, productId: line.productId, qty: line.qty, createdAt: now() })
  }
  transferDb.save(list)
  return Promise.resolve()
}

export function voidTransfer(id: string) {
  const list = transferDb.list()
  const doc = list.find(d => d.id === id)
  if (!doc || doc.status !== 'posted') return Promise.reject(new Error('只能作废已过账单据'))
  doc.status = 'voided'
  for (const line of doc.lines) {
    stockDb.adjust(doc.fromWarehouseId, line.productId, line.qty)
    stockDb.adjust(doc.toWarehouseId, line.productId, -line.qty)
    ledgerDb.add({ id: genId(), bizType: 'transfer', docId: id, warehouseId: doc.fromWarehouseId, productId: line.productId, qty: line.qty, createdAt: now() })
    ledgerDb.add({ id: genId(), bizType: 'transfer', docId: id, warehouseId: doc.toWarehouseId, productId: line.productId, qty: -line.qty, createdAt: now() })
  }
  transferDb.save(list)
  return Promise.resolve()
}
