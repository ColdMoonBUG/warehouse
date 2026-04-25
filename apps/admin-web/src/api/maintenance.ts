import request from '@/utils/request'

export interface MaintenanceState {
  mode: 'TEST' | 'LIVE'
  updatedAt?: string
  updatedBy?: string
  lastResetAt?: string
  lastResetBy?: string
}

export interface ResetBusinessResult {
  deletedRows: number
  rebuiltWarehouses: number
  tableRows: Record<string, number>
  state: MaintenanceState
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const res = await request.get('/maintenance/state')
  return res.data
}

export async function switchToTestMode(): Promise<MaintenanceState> {
  const res = await request.post('/maintenance/mode/test')
  return res.data
}

export async function switchToLiveMode(): Promise<MaintenanceState> {
  const res = await request.post('/maintenance/mode/live')
  return res.data
}

export async function resetBusinessData(): Promise<ResetBusinessResult> {
  const res = await request.post('/maintenance/reset')
  return res.data
}
