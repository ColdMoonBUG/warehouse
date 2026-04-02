import request from '@/utils/request'
import { toPersistedPackLine } from '@/utils/pack'
import type { Warehouse, StockItem, InboundDoc, InboundLine, TransferDoc, TransferLine } from '@/types'

export async function getWarehouses(): Promise<Warehouse[]> {
  const res = await request.get('/warehouse/list')
  return res.data
}

export async function getStock(warehouseId?: string): Promise<StockItem[]> {
  const res = await request.get('/stock/list', { params: { warehouseId } })
  return res.data
}

export async function getInbounds(): Promise<InboundDoc[]> {
  const res = await request.get('/inbound/list')
  return res.data
}

export async function getInboundById(id: string): Promise<InboundDoc | null> {
  const res = await request.get(`/inbound/detail/${id}`)
  return res.data
}

export async function saveInbound(doc: Partial<InboundDoc>, lines: InboundLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  const res = await request.post('/inbound/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return res.data as InboundDoc
}

export async function postInbound(id: string) {
  await request.post(`/inbound/post/${id}`)
}

export async function voidInbound(id: string) {
  await request.post(`/inbound/void/${id}`)
}

export async function getTransfers(): Promise<TransferDoc[]> {
  const res = await request.get('/transfer/list')
  return res.data
}

export async function getTransferById(id: string): Promise<TransferDoc | null> {
  const res = await request.get(`/transfer/detail/${id}`)
  return res.data
}

export async function saveTransfer(doc: Partial<TransferDoc>, lines: TransferLine[]) {
  const payload = { ...doc } as any
  delete payload.createdAt
  delete payload.updatedAt
  const res = await request.post('/transfer/save', { doc: payload, lines: lines.map(line => toPersistedPackLine(line)) })
  return res.data as TransferDoc
}

export async function postTransfer(id: string) {
  await request.post(`/transfer/post/${id}`)
}

export async function voidTransfer(id: string) {
  await request.post(`/transfer/void/${id}`)
}
