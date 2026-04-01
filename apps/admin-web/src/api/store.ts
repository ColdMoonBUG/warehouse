import request from '@/utils/request'
import type { Store } from '@/types'

export async function getStores(): Promise<Store[]> {
  const res = await request.get('/store/list')
  return res.data
}

export async function saveStore(data: Partial<Store> & { name: string; code?: string }) {
  await request.post('/store/save', data)
}

export async function toggleStore(id: string) {
  await request.post(`/store/toggle/${id}`)
}

export async function deleteStore(id: string) {
  await request.post(`/store/delete/${id}`)
}
