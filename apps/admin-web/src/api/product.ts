import request from '@/utils/request'
import type { Product } from '@/types'

export async function getProducts(): Promise<Product[]> {
  const res = await request.get('/product/list')
  return res.data
}

export async function saveProduct(data: Partial<Product> & { name: string }) {
  await request.post('/product/save', data)
}

export async function toggleProduct(id: string) {
  await request.post(`/product/toggle/${id}`)
}

export async function deleteProduct(id: string) {
  await request.post(`/product/delete/${id}`)
}
