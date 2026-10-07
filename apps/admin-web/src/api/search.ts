import request from '@/utils/request'
import { cleanParams } from '@/utils/params'

export type SearchDocType = 'sale' | 'return' | 'inbound' | 'transfer'

export interface DocSearchHit {
  type: SearchDocType
  id: string
  code: string
  status: string
  settled?: number | null
  /** 销单：sale/gift；退单：vehicle_return/warehouse_return */
  docType?: string | null
  date?: string
  createdAt?: string
  salespersonId?: string | null
  salespersonName?: string | null
  /** 销单/退单为门店，入库单为厂家，出库单为“调出 → 调入” */
  partyName?: string | null
  totalQty?: number
  totalAmount?: number | null
  remark?: string | null
  /** 销单 → 关联退单；退单 → 引用它的销单 */
  linkedId?: string | null
  linkedCode?: string | null
  linkedStatus?: string | null
}

export interface DocSearchParams {
  keyword?: string
  type?: SearchDocType | ''
  status?: string
  salespersonId?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export async function searchDocs(params: DocSearchParams): Promise<{ list: DocSearchHit[]; total: number }> {
  const res = await request.get('/doc/search', { params: cleanParams({ ...params }) }) as any
  return { list: res.data || [], total: res.count || 0 }
}
