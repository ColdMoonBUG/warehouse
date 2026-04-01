import request from '@/utils/request'
import type { Supplier } from '@/types'

export async function getSuppliers(): Promise<Supplier[]> {
  const res = await request.get('/supplier/list')
  return res.data
}

export async function saveSupplier(data: Partial<Supplier> & { name: string }) {
  await request.post('/supplier/save', data)
}

export async function toggleSupplier(id: string) {
  await request.post(`/supplier/toggle/${id}`)
}

export async function deleteSupplier(id: string) {
  await request.post(`/supplier/delete/${id}`)
}
