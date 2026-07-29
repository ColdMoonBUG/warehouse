import request from '@/utils/request'
import { toPersistedPackLine } from '@/utils/pack'
import type { SaleDoc, SaleLine, Warehouse } from '@/types'

type SaleListResponse = {
  data?: SaleDoc[]
  count?: number
}

export async function getSales(page = 1, limit = 20): Promise<{ list: SaleDoc[], total: number }> {
  const res = await request.get('/sale/list', { params: { page, limit } }) as unknown as SaleListResponse
  return {
    list: res.data || [],
    total: res.count || 0
  }
}

export async function getSaleById(id: string): Promise<SaleDoc | null> {
  const res = await request.get(`/sale/detail/${id}`)
  return res.data
}

export async function saveSale(doc: Partial<SaleDoc>, lines: SaleLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  const res = await request.post('/sale/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return res.data as SaleDoc
}

export async function postSale(id: string) {
  await request.post(`/sale/post/${id}`)
}

export async function voidSale(id: string) {
  await request.post(`/sale/void/${id}`)
}

export async function deleteSale(id: string) {
  await request.post(`/sale/delete/${id}`)
}

export async function getWarehouses(): Promise<Warehouse[]> {
  const res = await request.get('/warehouse/list')
  return res.data
}

export async function getStoreSaleQty(days = 30): Promise<Record<string, number>> {
  const res = await request.get('/sale/storeSaleQty', { params: { days } })
  return res.data || {}
}

export interface ProductStat {
  saleQty: number
  giftQty: number
  saleAmount: number
  vehicleReturnQty: number
  warehouseReturnQty: number
  returnQty: number
  returnAmount: number
  netQty: number
}

export async function getProductStat(productId: string, startDate?: string, endDate?: string): Promise<ProductStat> {
  const params: Record<string, string> = { productId }
  if (startDate && endDate) { params.startDate = startDate; params.endDate = endDate }
  const res = await request.get('/sale/productStat', { params })
  return res.data
}

export async function getUnsettledSales(page = 1, limit = 50): Promise<{ list: SaleDoc[], total: number }> {
  const res = await request.get('/sale/unsettled', { params: { page, limit } }) as unknown as SaleListResponse
  return {
    list: res.data || [],
    total: res.count || 0
  }
}

export async function settleSale(id: string) {
  await request.post(`/sale/settle/${id}`)
}

export async function unsettleSale(id: string) {
  await request.post(`/sale/unsettle/${id}`)
}

export async function linkSaleReturn(id: string, returnDocId: string) {
  await request.post(`/sale/linkReturn/${id}`, null, { params: { returnDocId } })
}
