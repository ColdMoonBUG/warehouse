import request from '@/utils/request'
import type { SaleDoc, ReturnDoc } from '@/types'

// 报表必须读取完整列表；中途失败不展示部分汇总。
export async function getReportDocs<T extends { id: string }>(kind: 'sale' | 'return'): Promise<T[]> {
  const docs = new Map<string, T>()
  for (let page = 1; page <= 1000; page++) {
    const res = await request.get(`/${kind}/list`, { params: { page, limit: 200 } })
    const list: T[] = res.data || []
    const previous = docs.size
    list.forEach(d => docs.set(d.id, d))
    if (list.length < 200) return [...docs.values()]
    if (docs.size === previous) throw new Error('单据分页未推进，无法生成完整报表')
  }
  throw new Error('单据过多，无法生成完整报表')
}
export const getReportSales = () => getReportDocs<SaleDoc>('sale')
export const getReportReturns = () => getReportDocs<ReturnDoc>('return')
