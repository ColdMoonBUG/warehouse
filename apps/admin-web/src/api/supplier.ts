import { supplierDb, genId, now } from '@/mock/storage'
import type { Supplier } from '@/types'

export function getSuppliers() {
  return Promise.resolve(supplierDb.list())
}

export function saveSupplier(data: Partial<Supplier> & { name: string; code: string }) {
  const list = supplierDb.list()
  if (data.id) {
    const idx = list.findIndex(s => s.id === data.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...data }
  } else {
    list.push({ ...data, id: genId(), status: 'active', createdAt: now() } as Supplier)
  }
  supplierDb.save(list)
  return Promise.resolve()
}

export function toggleSupplier(id: string) {
  const list = supplierDb.list()
  const item = list.find(s => s.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
  supplierDb.save(list)
  return Promise.resolve()
}

export function deleteSupplier(id: string) {
  const list = supplierDb.list().filter(s => s.id !== id)
  supplierDb.save(list)
  return Promise.resolve()
}
