import request from '@/utils/request'
import { toPersistedPackLine } from '@/utils/pack'
import { cleanParams } from '@/utils/params'
import type { DocListFilter } from '@/api/sale'
import type { ReturnDoc, ReturnLine } from '@/types'

/** 旧接口语义：默认只返回最近 50 张。新页面请用 getReturnsPage。 */
export async function getReturns(): Promise<ReturnDoc[]> {
  const res = await request.get('/return/list')
  return res.data
}

export async function getReturnsPage(page = 1, limit = 50, filter: DocListFilter = {}): Promise<{ list: ReturnDoc[], total: number }> {
  const res = await request.get('/return/list', { params: cleanParams({ page, limit, ...filter }) }) as any
  return { list: res.data || [], total: res.count || 0 }
}

export async function getReturnById(id: string): Promise<ReturnDoc | null> {
  const res = await request.get(`/return/detail/${id}`)
  return res.data
}

export async function saveReturn(doc: Partial<ReturnDoc>, lines: ReturnLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  delete payload.lines
  const res = await request.post('/return/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return { ...res.data, lines: doc.lines || lines } as ReturnDoc
}

/** 保存并过账（可选关联销单），一个请求、一个事务；doc.id 需由前端预先生成，重试不会重复过账。 */
export async function submitReturn(doc: Partial<ReturnDoc>, lines: ReturnLine[], linkSaleId?: string): Promise<ReturnDoc> {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  delete payload.lines
  const res = await request.post('/return/submit', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)), linkSaleId })
  return res.data.returnDoc as ReturnDoc
}

export async function postReturn(id: string) {
  await request.post(`/return/post/${id}`)
}

export async function voidReturn(id: string) {
  await request.post(`/return/void/${id}`)
}
