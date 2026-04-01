import request from '@/utils/request'
import type { SaleDoc, SaleLine, Warehouse } from '@/types'

type SaleListResponse = {
  data?: SaleDoc[]
  count?: number
}

// 获取销售单列表
export async function getSales(page = 1, limit = 20): Promise<{ list: SaleDoc[], total: number }> {
  const res = await request.get('/sale/list', { params: { page, limit } }) as unknown as SaleListResponse
  return { list: res.data || [], total: res.count || 0 }
}

// 获取销售单详情
export async function getSaleById(id: string): Promise<SaleDoc | null> {
  const res = await request.get(`/sale/detail/${id}`)
  return res.data
}

// 保存销售单
export async function saveSale(doc: Partial<SaleDoc>, lines: SaleLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  const res = await request.post('/sale/save', { doc: payload, lines })
  return res.data as SaleDoc
}

// 过账
export async function postSale(id: string) {
  await request.post(`/sale/post/${id}`)
}

// 作废
export async function voidSale(id: string) {
  await request.post(`/sale/void/${id}`)
}

// 删除
export async function deleteSale(id: string) {
  await request.post(`/sale/delete/${id}`)
}

// 获取仓库列表
export async function getWarehouses(): Promise<Warehouse[]> {
  const res = await request.get('/warehouse/list')
  return res.data
}

// 按门店统计销量
export async function getStoreSaleQty(days = 30): Promise<Record<string, number>> {
  const res = await request.get('/sale/storeSaleQty', { params: { days } })
  return res.data || {}
}
