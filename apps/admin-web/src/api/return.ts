import request from '@/utils/request'
import { toPersistedPackLine } from '@/utils/pack'
import type { ReturnDoc, ReturnLine } from '@/types'

export async function getReturns(): Promise<ReturnDoc[]> {
  const res = await request.get('/return/list')
  return res.data
}

export async function getReturnById(id: string): Promise<ReturnDoc | null> {
  const res = await request.get(`/return/detail/${id}`)
  return res.data
}

export async function saveReturn(doc: Partial<ReturnDoc>, lines: ReturnLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  const res = await request.post('/return/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return res.data as ReturnDoc
}

export async function postReturn(id: string) {
  await request.post(`/return/post/${id}`)
}

export async function voidReturn(id: string) {
  await request.post(`/return/void/${id}`)
}
