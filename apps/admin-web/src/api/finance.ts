import request from '@/utils/request'
import type { CommissionLedger, CommissionSettlementDetail, CommissionSettlementSummary, CommissionSummary } from '@/types'

export async function getCommissionSummaries(): Promise<CommissionSummary[]> {
  const res = await request.get('/finance/commission/summary')
  return res.data || []
}

export async function getUnsettledCommissionLedgers(salespersonId: string): Promise<CommissionLedger[]> {
  const res = await request.get('/finance/commission/unsettled', { params: { salespersonId } })
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
