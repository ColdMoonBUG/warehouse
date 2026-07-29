import request from '@/utils/request'
import type { InboundDoc, ReturnDoc } from '@/types'

export async function getAllInbounds(): Promise<InboundDoc[]> {
  const res = await request.get('/inbound/list')
  return res.data || []
}

// 退货单全量拉取：后端 /return/list 默认每页 50，必须翻页，否则统计只算到最近 50 张
// 兜底：任一页失败时，返回已成功获取的部分数据，不让整个统计页崩掉
export async function getAllReturns(): Promise<ReturnDoc[]> {
  const PAGE_SIZE = 200
  const MAX_PAGES = 100 // 安全上限，防止后端 total 异常导致死循环
  const all: ReturnDoc[] = []
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res: any = await request.get('/return/list', { params: { page, limit: PAGE_SIZE } })
      const list: ReturnDoc[] = res?.data || []
      all.push(...list)
      const total = Number(res?.count) || 0
      if (list.length < PAGE_SIZE) break
      if (total > 0 && all.length >= total) break
    }
  } catch (e) {
    // 已取到数据则降级返回部分结果；一条都没取到才向上抛（让页面走原有的未登录/错误处理）
    if (all.length === 0) throw e
    console.warn('[getAllReturns] 分页中断，返回部分数据', all.length, e)
  }
  return all
}

export async function getAllAccounts() {
  const res = await request.get('/account/list')
  return res.data || []
}
