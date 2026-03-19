import { productDb, genId, now } from '@/mock/storage'
import type { Product } from '@/types'

export function getProducts() {
  return Promise.resolve(productDb.list())
}

export function saveProduct(data: Partial<Product> & { name: string; code: string }) {
  const list = productDb.list()
  if (data.id) {
    const idx = list.findIndex(p => p.id === data.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...data }
  } else {
    list.push({ ...data, id: genId(), status: 'active', createdAt: now() } as Product)
  }
  productDb.save(list)
  return Promise.resolve()
}

export function toggleProduct(id: string) {
  const list = productDb.list()
  const item = list.find(p => p.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
  productDb.save(list)
  return Promise.resolve()
}

export function deleteProduct(id: string) {
  productDb.save(productDb.list().filter(p => p.id !== id))
  return Promise.resolve()
}
