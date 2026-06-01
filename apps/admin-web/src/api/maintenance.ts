import request from '@/utils/request'

export interface MaintenanceState {
  mode: 'TEST' | 'LIVE' | 'VEHICLE_UNLIMITED'
  updatedAt?: string
  updatedBy?: string
  lastResetAt?: string
  lastResetBy?: string
  initMode?: boolean
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

export async function switchToVehicleUnlimitedMode(): Promise<MaintenanceState> {
  const res = await request.post('/maintenance/mode/vehicle-unlimited')
  return res.data
}

export async function resetBusinessData(): Promise<ResetBusinessResult> {
  const res = await request.post('/maintenance/reset')
  return res.data
}

export async function resetStockOnly(): Promise<ResetBusinessResult> {
  const res = await request.post('/maintenance/reset-stock-only')
  return res.data
}

export async function enableInitMode(): Promise<MaintenanceState> {
  const res = await request.post('/maintenance/mode/init/enable')
  return res.data
}

export async function disableInitMode(): Promise<MaintenanceState> {
  const res = await request.post('/maintenance/mode/init/disable')
  return res.data
}
