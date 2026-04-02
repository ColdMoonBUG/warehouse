import request from '@/utils/request'
import { BAG_UNIT } from '@/utils/pack'
import type { Product } from '@/types'

export async function getProducts(): Promise<Product[]> {
  const res = await request.get('/product/list')
  return (res.data || []).map((item: Product) => ({
    ...item,
    unit: BAG_UNIT,
    boxQty: Math.max(1, Number(item.boxQty) || 1)
  }))
}

export async function saveProduct(data: Partial<Product> & { name: string }) {
  await request.post('/product/save', { ...data, unit: BAG_UNIT, boxQty: Math.max(1, Number(data.boxQty) || 1) })
}

export async function toggleProduct(id: string) {
  await request.post(`/product/toggle/${id}`)
}

export async function deleteProduct(id: string) {
  await request.post(`/product/delete/${id}`)
}
