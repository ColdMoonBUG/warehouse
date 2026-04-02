// Mock数据存储 - 与admin-web完全一致，共享localStorage

import type {
  Supplier, Product, Store,
  Warehouse, StockItem, LedgerEntry,
  InboundDoc, TransferDoc, SaleDoc, Account
} from '@/types'

const KEYS = {
  supplier: 'wh_supplier',
  product: 'wh_product',
  store: 'wh_store',
  warehouse: 'wh_warehouse',
  stock: 'wh_stock',
  ledger: 'wh_ledger',
  inbound: 'wh_inbound',
  transfer: 'wh_transfer',
  sale: 'wh_sale',
  account: 'wh_account',
}

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function now(): string {
  return new Date().toISOString()
}

// --- Supplier ---
export const supplierDb = {
  list: () => load<Supplier>(KEYS.supplier),
  save: (data: Supplier[]) => save(KEYS.supplier, data),
}

// --- Product ---
export const productDb = {
  list: () => load<Product>(KEYS.product),
  save: (data: Product[]) => save(KEYS.product, data),
}

// --- Store ---
export const storeDb = {
  list: () => load<Store>(KEYS.store),
  save: (data: Store[]) => save(KEYS.store, data),
}

// --- Warehouse ---
export const warehouseDb = {
  list: () => load<Warehouse>(KEYS.warehouse),
  save: (data: Warehouse[]) => save(KEYS.warehouse, data),
  ensureMain: () => {
    const list = load<Warehouse>(KEYS.warehouse)
    if (!list.find(w => w.type === 'main')) {
      list.unshift({ id: 'main', name: '主仓库', type: 'main' })
    }
    if (!list.find(w => w.type === 'return')) {
      list.push({ id: 'return', name: '退货仓库', type: 'return' })
    }
    save(KEYS.warehouse, list)
    return load<Warehouse>(KEYS.warehouse)
  },
  syncVehicles: () => {
    const accounts = load<Account>(KEYS.account).filter(account => account.role === 'salesperson')
    const warehouses = warehouseDb.ensureMain()
    let changed = false
    for (const account of accounts) {
      const salespersonId = account.salespersonId || account.id
      if (!salespersonId) continue
      const warehouseId = `veh_${salespersonId}`
      const nextWarehouse: Warehouse = {
        id: warehouseId,
        name: `${account.displayName}(车库)`,
        type: 'vehicle',
        salespersonId,
      }
      const index = warehouses.findIndex(w => w.id === warehouseId || w.salespersonId === salespersonId)
      if (index >= 0) {
        const current = warehouses[index]
        if (current.id !== nextWarehouse.id || current.name !== nextWarehouse.name || current.type !== nextWarehouse.type || current.salespersonId !== nextWarehouse.salespersonId) {
          warehouses[index] = { ...current, ...nextWarehouse }
          changed = true
        }
      } else {
        warehouses.push(nextWarehouse)
        changed = true
      }
    }
    if (changed) save(KEYS.warehouse, warehouses)
    return load<Warehouse>(KEYS.warehouse)
  }
}

// --- Stock ---
export const stockDb = {
  list: () => load<StockItem>(KEYS.stock),
  get: (warehouseId: string, productId: string) => {
    const list = load<StockItem>(KEYS.stock)
    return list.find(s => s.warehouseId === warehouseId && s.productId === productId)
  },
  adjust: (warehouseId: string, productId: string, delta: number) => {
    const list = load<StockItem>(KEYS.stock)
    const idx = list.findIndex(s => s.warehouseId === warehouseId && s.productId === productId)
    if (idx >= 0) {
      list[idx].qty += delta
      list[idx].updatedAt = new Date().toISOString()
    } else {
      list.push({ warehouseId, productId, qty: delta, updatedAt: new Date().toISOString() })
    }
    save(KEYS.stock, list)
  }
}

// --- Ledger ---
export const ledgerDb = {
  list: () => load<LedgerEntry>(KEYS.ledger),
  add: (entry: LedgerEntry) => {
    const list = load<LedgerEntry>(KEYS.ledger)
    list.push(entry)
    save(KEYS.ledger, list)
  }
}

// --- InboundDoc ---
export const inboundDb = {
  list: () => load<InboundDoc>(KEYS.inbound),
  save: (data: InboundDoc[]) => save(KEYS.inbound, data),
}

// --- TransferDoc ---
export const transferDb = {
  list: () => load<TransferDoc>(KEYS.transfer),
  save: (data: TransferDoc[]) => save(KEYS.transfer, data),
}

// --- Account ---
export const accountDb = {
  list: () => load<Account>(KEYS.account),
  save: (data: Account[]) => save(KEYS.account, data),
}

// --- SaleDoc ---
export const saleDb = {
  list: () => load<SaleDoc>(KEYS.sale),
  save: (data: SaleDoc[]) => save(KEYS.sale, data),
}

export function resetAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}
