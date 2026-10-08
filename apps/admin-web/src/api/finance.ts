import request from '@/utils/request'
import type { CommissionLedger, CommissionSettlementDetail, CommissionSettlementSummary, CommissionSummary, StoreCommissionSummary, UnsettledDocVO } from '@/types'

export async function getCommissionSummaries(): Promise<CommissionSummary[]> {
  const res = await request.get('/finance/commission/summary')
  return res.data || []
}

export async function getUnsettledCommissionLedgers(salespersonId: string): Promise<CommissionLedger[]> {
  const res = await request.get('/finance/commission/unsettled', { params: { salespersonId } })
  return res.data || []
}

export async function getUnsettledByDoc(salespersonId: string): Promise<UnsettledDocVO[]> {
  const res = await request.get('/finance/commission/unsettled-by-doc', { params: { salespersonId } })
  return res.data || []
}

export async function settleCommission(salespersonId: string, remark?: string): Promise<CommissionSettlementSummary> {
  const res = await request.post('/finance/commission/settle', { salespersonId, remark })
  return res.data
}

export async function getCommissionSettlements(): Promise<CommissionSettlementSummary[]> {
  const res = await request.get('/finance/commission/settlements')
  return res.data || []
}

export async function getCommissionSettlementDetail(id: string): Promise<CommissionSettlementDetail> {
  const res = await request.get(`/finance/commission/settlement/${id}`)
  return res.data
}

export async function getStoreCommissionSummaries(date?: string): Promise<StoreCommissionSummary[]> {
  const params = date ? { date } : {}
  const res = await request.get('/finance/commission/store-summaries', { params })
  return res.data || []
}

export async function getStoreCommissionDetail(storeId: string): Promise<CommissionLedger[]> {
  const res = await request.get(`/finance/commission/store-detail/${storeId}`)
  return res.data || []
}

export interface WageResult {
  /** 按单据日期汇总，单位：元 */
  rows: { date: string; sale: number; returns: number; total: number }[]
  /** 区间内合计，单位：分 */
  total: number
  /** 原单已不存在、无法确定日期的流水 */
  undated: CommissionLedger[]
  /** undated 合计，单位：分 */
  undatedTotal: number
}

/** 后端按单据日期统计某业务员区间内的提成（含已结清、未结清、作废冲销）。 */
export async function getWage(salespersonId: string, startDate: string, endDate: string): Promise<WageResult> {
  const res = await request.get('/finance/commission/wage', { params: { salespersonId, startDate, endDate } })
  return res.data
}
