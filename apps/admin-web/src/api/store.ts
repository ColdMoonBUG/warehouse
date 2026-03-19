import { storeDb, genId, now } from '@/mock/storage'
import type { Store } from '@/types'

export function getStores() {
  return Promise.resolve(storeDb.list())
}

export function saveStore(data: Partial<Store> & { name: string; code?: string }) {
  const list = storeDb.list()
  if (data.id) {
    const idx = list.findIndex(s => s.id === data.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...data }
  } else {
    const code = data.code || data.name
    list.push({ ...data, code, id: genId(), status: 'active', createdAt: now() } as Store)
  }
  storeDb.save(list)
  return Promise.resolve()
}

export function toggleStore(id: string) {
  const list = storeDb.list()
  const item = list.find(s => s.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
  storeDb.save(list)
  return Promise.resolve()
}

export function deleteStore(id: string) {
  storeDb.save(storeDb.list().filter(s => s.id !== id))
  return Promise.resolve()
}
