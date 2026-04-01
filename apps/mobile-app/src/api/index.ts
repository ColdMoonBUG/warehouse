import type { Account, Session, Store, SaleDoc, Employee, Product, ReturnDoc, Warehouse, Supplier, StockItem, InboundDoc, InboundLine, TransferDoc, TransferLine, OutboundDoc, OutboundLine } from '@/types'
import { SESSION_KEY, SESSION_DAYS, BASE_URL, USE_MOCK } from '@/utils/config'
import { simpleHash } from '@/utils'
import { accountDb, storeDb, saleDb, employeeDb, productDb, supplierDb, genId, now } from '@/mock/storage'
const RETURN_STORAGE_KEY = 'wh_return'

interface ApiResult<T> {
  code: number
  msg: string
  data: T
  count?: number
}

export interface UploadResult {
  path: string
}

const MOBILE_ACCOUNT_LABELS: Record<string, string> = {
  e1: '大车',
  emp001: '大车',
  大车: '大车',
  大车业务: '大车',
  e2: '小车',
  emp002: '小车',
  小车: '小车',
  小车业务: '小车',
  e3: '三车',
  emp003: '三车',
  三车: '三车',
  三车业务: '三车',
}

const MOBILE_ACCOUNT_ORDER = ['管理员', '大车', '小车', '三车']

function normalizeMobileAccountToken(value?: string): string {
  return (value || '').trim().replace(/\s+/g, '').toLowerCase()
}

function getKnownMobileAccountLabel(value?: string): string {
  const key = normalizeMobileAccountToken(value)
  if (!key) return ''
  return MOBILE_ACCOUNT_LABELS[key] || ''
}

function normalizeEmployeeId(employeeId?: string): string {
  return getKnownMobileAccountLabel(employeeId) || normalizeMobileAccountToken(employeeId)
}

function normalizeDisplayName(displayName?: string): string {
  return getKnownMobileAccountLabel(displayName)
}

export function isSameEmployeeId(left?: string, right?: string): boolean {
  if (!left || !right) return false
  return normalizeEmployeeId(left) === normalizeEmployeeId(right)
}

function isStoreAssignedToEmployee(store: Store, employeeId?: string): boolean {
  return !!employeeId && isSameEmployeeId(store.defaultEmployeeId, employeeId)
}

export function hasAssignedStoresForEmployee(stores: Store[], employeeId?: string): boolean {
  return stores.some(store => isStoreAssignedToEmployee(store, employeeId))
}

export function getVisibleStoresForSession(stores: Store[], isAdmin: boolean, employeeId?: string): Store[] {
  if (isAdmin) return stores
  const assignedStores = stores.filter(store => isStoreAssignedToEmployee(store, employeeId))
  return assignedStores.length ? assignedStores : stores
}

function request<T>(url: string, method: 'GET' | 'POST', data?: any): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`
  console.log('[API] 请求:', fullUrl)
  return new Promise((resolve, reject) => {
    uni.request({
      url: fullUrl,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        console.log('[API] 响应:', fullUrl, JSON.stringify(res.data))
        const body = res.data as ApiResult<T>
        if (body && body.code === 200) {
          resolve(body.data)
        } else {
          reject(new Error(body?.msg || '请求失败'))
        }
      },
      fail: (err) => {
        console.error('[API] 失败:', fullUrl, err)
        reject(new Error(err?.errMsg || '网络异常'))
      },
    })
  })
}

function getRequest<T>(url: string, params?: any): Promise<T> {
  if (!params) return request<T>(url, 'GET')
  const query = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  return request<T>(query ? `${url}?${query}` : url, 'GET')
}

function getMobileAccountLabel(role: Account['role'], employeeId?: string, displayName?: string): string {
  if (role === 'admin') return '管理员'
  return getKnownMobileAccountLabel(employeeId) || normalizeDisplayName(displayName)
}

function normalizeMobileAccount(account: Account): Account {
  const label = getMobileAccountLabel(account.role, account.employeeId, account.displayName)
  if (!label) {
    return {
      ...account,
      displayName: account.displayName || account.username,
    }
  }
  return {
    ...account,
    displayName: label,
  }
}

function normalizeMobileSession(session: Session): Session {
  const label = getMobileAccountLabel(session.role, session.employeeId, session.displayName)
  if (!label) {
    return {
      ...session,
      displayName: session.displayName || session.username,
    }
  }
  return {
    ...session,
    displayName: label,
  }
}

function normalizeMobileAccounts(accounts: Account[]): Account[] {
  const normalizedAccounts = accounts.map(normalizeMobileAccount)
  return MOBILE_ACCOUNT_ORDER
    .map(label => normalizedAccounts.find(account => account.displayName === label))
    .filter((account): account is Account => !!account)
}

export function getSession(): Session | null {
  try {
    const raw = uni.getStorageSync(SESSION_KEY)
    if (!raw) return null
    const parsedSession: Session = JSON.parse(raw)
    if (new Date(parsedSession.expiresAt) < new Date()) {
      uni.removeStorageSync(SESSION_KEY)
      return null
    }
    return normalizeMobileSession(parsedSession)
  } catch {
    return null
  }
}

export function saveSession(account: Account): Session {
  const normalizedAccount = normalizeMobileAccount(account)
  const exp = new Date()
  exp.setDate(exp.getDate() + SESSION_DAYS)
  const session: Session = {
    accountId: normalizedAccount.id,
    username: normalizedAccount.username,
    displayName: normalizedAccount.displayName,
    role: normalizedAccount.role,
    employeeId: normalizedAccount.employeeId,
    expiresAt: exp.toISOString(),
  }
  uni.setStorageSync(SESSION_KEY, JSON.stringify(session))
  return session
}

export function logout() {
  uni.removeStorageSync(SESSION_KEY)
}

export async function getAccounts(): Promise<Account[]> {
  if (USE_MOCK) {
    return normalizeMobileAccounts(accountDb.list().filter(a => a.status === 'active'))
  }
  const accounts = await request<Account[]>('/api/account/list', 'GET')
  return normalizeMobileAccounts(accounts)
}

export async function loginByPassword(username: string, password: string): Promise<Session> {
  if (USE_MOCK) {
    const accounts = accountDb.list()
    const acc = accounts.find(a => a.username === username && a.status === 'active')
    if (!acc) throw new Error('账户不存在或已停用')
    if (acc.passwordHash !== simpleHash(password)) throw new Error('密码错误')
    return saveSession(acc)
  }

  const acc = await request<Account>('/api/account/login', 'POST', {
    username,
    passwordHash: simpleHash(password),
  })
  if (!acc) throw new Error('账户不存在')
  return saveSession(acc)
}

export async function loginByGesture(username: string, gesture: string): Promise<Session> {
  const normalized = gesture.replace(/-/g, '')
  const normalizedHash = simpleHash(normalized)

  if (USE_MOCK) {
    const accounts = accountDb.list()
    const acc = accounts.find(a => a.username === username && a.status === 'active')
    if (!acc) throw new Error('账户不存在')
    if (acc.gestureHash === normalizedHash) return saveSession(acc)
    throw new Error('手势密码错误')
  }

  const accounts = await getAccounts()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在')
  if (acc.gestureHash !== normalizedHash) throw new Error('手势密码错误')
  return saveSession(acc)
}

export async function setGesture(accountId: string, gesture: string): Promise<void> {
  const normalized = gesture.replace(/-/g, '')
  const normalizedHash = simpleHash(normalized)
  if (USE_MOCK) {
    const accounts = accountDb.list()
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) throw new Error('账户不存在')
    acc.gestureHash = normalizedHash
    accountDb.save(accounts)
    return
  }
  await request<void>('/api/account/setGesture', 'POST', {
    id: accountId,
    gestureHash: normalizedHash,
  })
}

export async function getStores(): Promise<Store[]> {
  if (USE_MOCK) {
    return storeDb.list().filter(s => s.status === 'active')
  }
  return request<Store[]>('/api/store/list', 'GET')
}

export async function getStoresAll(): Promise<Store[]> {
  if (USE_MOCK) {
    return storeDb.list()
  }
  return request<Store[]>('/api/store/listAll', 'GET')
}

export async function toggleStore(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = storeDb.list()
    const store = list.find(s => s.id === id)
    if (!store) throw new Error('超市不存在')
    store.status = store.status === 'active' ? 'inactive' : 'active'
    storeDb.save(list)
    return
  }
  await request<void>(`/api/store/toggle/${id}`, 'POST')
}

export async function saveStore(data: Partial<Store> & { name: string; code?: string }): Promise<void> {
  if (USE_MOCK) {
    const list = storeDb.list()
    if (data.id) {
      const idx = list.findIndex(s => s.id === data.id)
      if (idx >= 0) list[idx] = { ...list[idx], ...data }
    } else {
      const code = data.code || data.name
      list.push({ ...data, code, id: genId(), status: 'active', createdAt: now() } as Store)
    }
    storeDb.save(list)
    return
  }
  await request<void>('/api/store/save', 'POST', data)
}

export async function getEmployees(): Promise<Employee[]> {
  if (USE_MOCK) {
    return employeeDb.list().filter(e => e.status === 'active')
  }
  return request<Employee[]>('/api/employee/list', 'GET')
}

export async function getEmployeeDetail(id: string): Promise<Employee | null> {
  if (USE_MOCK) {
    return employeeDb.list().find(e => e.id === id) || null
  }
  return request<Employee>(`/api/employee/detail/${id}`, 'GET')
}

export async function saveEmployee(data: Partial<Employee> & { name: string; code: string }) {
  await request<void>('/api/employee/save', 'POST', data)
}

export async function toggleEmployee(id: string) {
  await request<void>(`/api/employee/toggle/${id}`, 'POST')
}

export async function deleteEmployee(id: string) {
  await request<void>(`/api/employee/delete/${id}`, 'POST')
}

export async function getProducts(): Promise<Product[]> {
  if (USE_MOCK) {
    return productDb.list().filter(p => p.status === 'active')
  }
  return request<Product[]>('/api/product/list', 'GET')
}

export async function getWarehouses(): Promise<Warehouse[]> {
  if (USE_MOCK) {
    return []
  }
  return request<Warehouse[]>('/api/warehouse/list', 'GET')
}

export async function saveWarehouse(data: Partial<Warehouse> & { name: string; type: string }) {
  await request<void>('/api/warehouse/save', 'POST', data)
}

export async function deleteWarehouse(id: string) {
  await request<void>(`/api/warehouse/delete/${id}`, 'POST')
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (USE_MOCK) {
    return []
  }
  return request<Supplier[]>('/api/supplier/list', 'GET')
}

export async function getSupplierDetail(id: string): Promise<Supplier | null> {
  if (USE_MOCK) {
    return supplierDb.list().find(s => s.id === id) || null
  }
  return request<Supplier>(`/api/supplier/detail/${id}`, 'GET')
}

export async function saveSupplier(data: Partial<Supplier> & { name: string; code: string }) {
  await request<void>('/api/supplier/save', 'POST', data)
}

export async function toggleSupplier(id: string) {
  await request<void>(`/api/supplier/toggle/${id}`, 'POST')
}

export async function deleteSupplier(id: string) {
  await request<void>(`/api/supplier/delete/${id}`, 'POST')
}

export async function getProductDetail(id: string): Promise<Product | null> {
  if (USE_MOCK) {
    return productDb.list().find(p => p.id === id) || null
  }
  return request<Product>(`/api/product/detail/${id}`, 'GET')
}

export async function saveProduct(data: Partial<Product> & { name: string; code: string }) {
  await request<void>('/api/product/save', 'POST', data)
}

export async function toggleProduct(id: string) {
  await request<void>(`/api/product/toggle/${id}`, 'POST')
}

export async function deleteProduct(id: string) {
  await request<void>(`/api/product/delete/${id}`, 'POST')
}

export async function getStock(warehouseId?: string): Promise<StockItem[]> {
  const params = warehouseId ? { warehouseId } : undefined
  return getRequest<StockItem[]>('/api/stock/list', params)
}

export async function getInbounds(): Promise<InboundDoc[]> {
  return request<InboundDoc[]>('/api/inbound/list', 'GET')
}

export async function getInboundDetail(id: string): Promise<InboundDoc | null> {
  return request<InboundDoc>(`/api/inbound/detail/${id}`, 'GET')
}

export async function saveInbound(doc: InboundDoc, lines: InboundLine[]) {
  await request<void>('/api/inbound/save', 'POST', { doc, lines })
}

export async function postInbound(id: string) {
  await request<void>(`/api/inbound/post/${id}`, 'POST')
}

export async function voidInbound(id: string) {
  await request<void>(`/api/inbound/void/${id}`, 'POST')
}

export async function getTransfers(): Promise<TransferDoc[]> {
  return request<TransferDoc[]>('/api/transfer/list', 'GET')
}

export async function getTransferDetail(id: string): Promise<TransferDoc | null> {
  return request<TransferDoc>(`/api/transfer/detail/${id}`, 'GET')
}

export async function saveTransfer(doc: TransferDoc, lines: TransferLine[]) {
  await request<void>('/api/transfer/save', 'POST', { doc, lines })
}

export async function postTransfer(id: string) {
  await request<void>(`/api/transfer/post/${id}`, 'POST')
}

export async function voidTransfer(id: string) {
  await request<void>(`/api/transfer/void/${id}`, 'POST')
}

export async function getOutbounds(): Promise<OutboundDoc[]> {
  return request<OutboundDoc[]>('/api/outbound/list', 'GET')
}

export async function getOutboundDetail(id: string): Promise<OutboundDoc | null> {
  return request<OutboundDoc>(`/api/outbound/detail/${id}`, 'GET')
}

export async function saveOutbound(doc: OutboundDoc, lines: OutboundLine[]) {
  await request<void>('/api/outbound/save', 'POST', { doc, lines })
}

export async function postOutbound(id: string) {
  await request<void>(`/api/outbound/post/${id}`, 'POST')
}

export async function voidOutbound(id: string) {
  await request<void>(`/api/outbound/void/${id}`, 'POST')
}

export async function uploadFile(filePath: string) {
  return new Promise<UploadResult>((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_URL}/file/uploadFile`,
      filePath,
      name: 'mf',
      success: (res) => {
        let payload: any = null
        try {
          payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch {
          payload = null
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(payload?.msg || '上传失败'))
          return
        }

        if (payload && typeof payload === 'object' && 'code' in payload) {
          if (payload.code !== 200 || !payload.data?.path) {
            reject(new Error(payload.msg || '上传失败'))
            return
          }
          resolve(payload.data)
          return
        }

        if (payload?.path) {
          resolve(payload)
          return
        }

        reject(new Error(payload?.msg || '上传失败'))
      },
      fail: (err) => reject(new Error(err?.errMsg || '上传失败')),
    })
  })
}

export function getImageUrl(path: string) {
  if (!path) return ''
  return `${BASE_URL}/file/showImageByPath?path=${encodeURIComponent(path)}`
}

export async function getSales(): Promise<SaleDoc[]> {
  if (USE_MOCK) {
    return saleDb.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return request<SaleDoc[]>('/api/sale/list', 'GET')
}

export async function getSaleDetail(id: string): Promise<SaleDoc | null> {
  if (USE_MOCK) {
    const doc = saleDb.list().find(d => d.id === id)
    return doc || null
  }
  return request<SaleDoc>(`/api/sale/detail/${id}`, 'GET')
}

export async function saveSale(doc: SaleDoc): Promise<SaleDoc> {
  if (USE_MOCK) {
    const nextDoc = { ...doc }
    if (!nextDoc.id) {
      nextDoc.id = genId()
    }
    if (!nextDoc.code) {
      nextDoc.code = `XS${Date.now()}`
    }
    if (!nextDoc.createdAt) {
      nextDoc.createdAt = now()
    }
    const list = saleDb.list()
    const idx = list.findIndex(d => d.id === nextDoc.id)
    if (idx >= 0) {
      list[idx] = nextDoc
    } else {
      list.push(nextDoc)
    }
    saleDb.save(list)
    return nextDoc
  }
  return request<SaleDoc>('/api/sale/save', 'POST', { doc, lines: doc.lines })
}

export async function postSale(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = saleDb.list()
    const doc = list.find(d => d.id === id)
    if (!doc || doc.status !== 'draft') throw new Error('单据状态异常')
    doc.status = 'posted'
    saleDb.save(list)
    return
  }
  await request<void>(`/api/sale/post/${id}`, 'POST')
}

export async function voidSale(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = saleDb.list()
    const doc = list.find(d => d.id === id)
    if (!doc || doc.status !== 'posted') throw new Error('只能作废已过账单据')
    doc.status = 'voided'
    saleDb.save(list)
    return
  }
  await request<void>(`/api/sale/void/${id}`, 'POST')
}

export async function getStoreSaleQty(days = 30): Promise<Record<string, number>> {
  if (USE_MOCK) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const docs = saleDb.list().filter(d => d.status === 'posted' && d.date >= cutoff)
    const result: Record<string, number> = {}
    for (const doc of docs) {
      const total = doc.lines.reduce((s, l) => s + l.qty, 0)
      result[doc.storeId] = (result[doc.storeId] || 0) + total
    }
    return result
  }
  return request<Record<string, number>>(`/api/sale/storeSaleQty?days=${days}`, 'GET')
}

export async function getReturns(): Promise<ReturnDoc[]> {
  if (USE_MOCK) {
    try { return JSON.parse(localStorage.getItem(RETURN_STORAGE_KEY) || '[]') } catch { return [] }
  }
  return request<ReturnDoc[]>('/api/return/list', 'GET')
}

export async function getReturnDetail(id: string): Promise<ReturnDoc | null> {
  if (USE_MOCK) {
    const list = await getReturns()
    return list.find(d => d.id === id) || null
  }
  return request<ReturnDoc>(`/api/return/detail/${id}`, 'GET')
}

export async function saveReturn(doc: ReturnDoc, lines: ReturnDoc['lines']): Promise<ReturnDoc> {
  const nextDoc: ReturnDoc = {
    ...doc,
    lines,
  }
  if (USE_MOCK) {
    if (!nextDoc.id) {
      nextDoc.id = genId()
    }
    if (!nextDoc.code) {
      nextDoc.code = `RT${Date.now()}`
    }
    if (!nextDoc.createdAt) {
      nextDoc.createdAt = now()
    }
    const list = await getReturns()
    const idx = list.findIndex(d => d.id === nextDoc.id)
    if (idx >= 0) list[idx] = nextDoc
    else list.push(nextDoc)
    localStorage.setItem(RETURN_STORAGE_KEY, JSON.stringify(list))
    return nextDoc
  }
  return request<ReturnDoc>('/api/return/save', 'POST', { doc: nextDoc, lines })
}

export async function postReturn(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = await getReturns()
    const doc = list.find(d => d.id === id)
    if (!doc || doc.status !== 'draft') throw new Error('单据状态异常')
    doc.status = 'posted'
    localStorage.setItem(RETURN_STORAGE_KEY, JSON.stringify(list))
    return
  }
  await request<void>(`/api/return/post/${id}`, 'POST')
}

export async function voidReturn(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = await getReturns()
    const doc = list.find(d => d.id === id)
    if (!doc || doc.status !== 'posted') throw new Error('只能作废已过账单据')
    doc.status = 'voided'
    localStorage.setItem(RETURN_STORAGE_KEY, JSON.stringify(list))
    return
  }
  await request<void>(`/api/return/void/${id}`, 'POST')
}
