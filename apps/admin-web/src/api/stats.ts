import request from '@/utils/request'
import type { InboundDoc, ReturnDoc } from '@/types'

export async function getAllInbounds(): Promise<InboundDoc[]> {
  const res = await request.get('/inbound/list')
  return res.data || []
}

export async function getAllReturns(): Promise<ReturnDoc[]> {
  const res = await request.get('/return/list')
  return res.data || []
}

export async function getAllAccounts() {
  const res = await request.get('/account/list')
  return res.data || []
}
