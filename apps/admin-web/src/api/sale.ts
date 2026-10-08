import request from '@/utils/request'
import { toPersistedPackLine } from '@/utils/pack'
import { cleanParams } from '@/utils/params'
import type { SaleDoc, SaleLine, Warehouse } from '@/types'

type SaleListResponse = {
  data?: SaleDoc[]
  count?: number
}

/** 服务端筛选条件（都可不传）；status 支持 draft/posted/voided/unsettled/settled，逗号分隔 */
export interface DocListFilter {
  salespersonId?: string
  storeId?: string
  status?: string
  docType?: string
  paymentType?: string
  returnType?: string
  startDate?: string
  endDate?: string
  keyword?: string
  /** false 时不返回明细，只带 totalQty/totalAmount/lineCount，列表页用 */
  withLines?: boolean
}

export async function getSales(page = 1, limit = 20, filter: DocListFilter = {}): Promise<{ list: SaleDoc[], total: number }> {
  const res = await request.get('/sale/list', { params: cleanParams({ page, limit, ...filter }) }) as unknown as SaleListResponse
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
  delete payload.lines
  const res = await request.post('/sale/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return { ...res.data, lines: doc.lines || lines } as SaleDoc
}

export async function postSale(id: string) {
  await request.post(`/sale/post/${id}`)
}

/** 默认连同关联的已过账退单一起作废；返回后端提示（关联退单未能作废时有内容） */
export async function voidSale(id: string, cascadeReturn = true): Promise<string> {
  const res = await request.post(`/sale/void/${id}`, null, { params: { cascadeReturn } }) as unknown as { msg?: string }
  return res.msg && res.msg !== '操作成功' ? res.msg : ''
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

export async function getUnsettledSales(page = 1, limit = 50, filter: Pick<DocListFilter, 'salespersonId' | 'startDate' | 'endDate' | 'withLines'> = {}): Promise<{ list: SaleDoc[], total: number }> {
  const res = await request.get('/sale/unsettled', { params: cleanParams({ page, limit, ...filter }) }) as unknown as SaleListResponse
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
