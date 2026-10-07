import request from '@/utils/request'
import type { SaleDoc, ReturnDoc } from '@/types'

export interface ReportRange {
  /** 单据日期范围（yyyy-MM-dd），只拉这个范围内的单据 */
  startDate?: string
  endDate?: string
  /** 只用到合计数量/金额时传 false，后端不返回明细，数据量小很多 */
  withLines?: boolean
}

// 报表必须读取完整列表；中途失败不展示部分汇总。
export async function getReportDocs<T extends { id: string }>(kind: 'sale' | 'return', range: ReportRange = {}): Promise<T[]> {
  const docs = new Map<string, T>()
  const filter = Object.fromEntries(Object.entries(range).filter(([, v]) => v !== undefined && v !== ''))
  for (let page = 1; page <= 1000; page++) {
    const res = await request.get(`/${kind}/list`, { params: { page, limit: 200, ...filter } })
    const list: T[] = res.data || []
    const previous = docs.size
    list.forEach(d => docs.set(d.id, d))
    if (list.length < 200) return [...docs.values()]
    if (docs.size === previous) throw new Error('单据分页未推进，无法生成完整报表')
  }
  throw new Error('单据过多，无法生成完整报表')
}
export const getReportSales = (range?: ReportRange) => getReportDocs<SaleDoc>('sale', range)
export const getReportReturns = (range?: ReportRange) => getReportDocs<ReturnDoc>('return', range)
