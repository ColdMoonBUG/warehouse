import type { Account, Session, Store, SaleDoc, Salesperson, SalespersonLocation, Product, ReturnDoc, Warehouse, Supplier, StockItem, InboundDoc, InboundLine, TransferDoc, TransferLine, OutboundDoc, OutboundLine, TodayCommissionSummary } from '@/types'
import { SESSION_KEY, SESSION_DAYS, BASE_URL, USE_MOCK } from '@/utils/config'
import { simpleHash, formatDate, todayLocalDate } from '@/utils'
import { accountDb, storeDb, saleDb, warehouseDb, productDb, supplierDb, genId, now } from '@/mock/storage'
const RETURN_STORAGE_KEY = 'wh_return'
const JSESSIONID_KEY = 'wh_jsessionid'

let jsessionid = uni.getStorageSync(JSESSIONID_KEY) || ''

function saveJsessionid(val: string) {
  jsessionid = val
  uni.setStorageSync(JSESSIONID_KEY, val)
}

function clearJsessionid() {
  jsessionid = ''
  uni.removeStorageSync(JSESSIONID_KEY)
}

function extractJsessionid(header: Record<string, string>): string {
  const setCookie = header['Set-Cookie'] || header['set-cookie'] || ''
  const xSessionId = header['X-Session-Id'] || header['x-session-id'] || ''
  const m = setCookie.match(/JSESSIONID=([^;]+)/)
  const extracted = m ? m[1] : (xSessionId || '')
  return extracted
}

type PersistablePackLine = {
  bagQty?: number
}

function toPersistedPackLine<T extends PersistablePackLine>(line: T): Omit<T, 'bagQty'> {
  const { bagQty, ...rest } = line
  return rest as Omit<T, 'bagQty'>
}

function toPersistedPackLines<T extends PersistablePackLine>(lines: T[] = []): Array<Omit<T, 'bagQty'>> {
  return lines.map(line => toPersistedPackLine(line))
}

interface ApiResult<T> {
  code: number
  msg: string
  data: T
  count?: number
}

async function requestListPage<T>(url: string): Promise<{ list: T[]; total: number }> {
  return request<{ list: T[]; total?: number; count?: number }>(url, 'GET').then((data: any) => {
    if (Array.isArray(data)) {
      return { list: data, total: data.length }
    }
    return {
      list: Array.isArray(data?.list) ? data.list : (Array.isArray(data?.data) ? data.data : []),
      total: Number(data?.total ?? data?.count ?? 0),
    }
  })
}

async function requestAllPaged<T>(baseUrl: string, pageSize: number = 200): Promise<T[]> {
  const result: T[] = []
  let page = 1
  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    const { list } = await requestListPage<T>(`${baseUrl}${separator}page=${page}&limit=${pageSize}`)
    result.push(...list)
    if (list.length < pageSize) break
    page += 1
  }
  return result
}

async function requestAllPagedLegacy<T>(url: string, pageSize: number = 200): Promise<T[]> {
  const result: T[] = []
  let page = 1
  while (true) {
    const separator = url.includes('?') ? '&' : '?'
    const list = await request<T[]>(`${url}${separator}page=${page}&limit=${pageSize}`, 'GET')
    result.push(...list)
    if (!Array.isArray(list) || list.length < pageSize) break
    page += 1
  }
  return result
}

async function requestAllSales(storeId?: string): Promise<SaleDoc[]> {
  const url = storeId ? `/api/sale/list?storeId=${encodeURIComponent(storeId)}` : '/api/sale/list'
  try {
    const list = await requestAllPaged<SaleDoc>(url)
    if (list.length) return list
  } catch {
    // ignore and fallback
  }
  return requestAllPagedLegacy<SaleDoc>(url)
}

async function requestAllUnsettledSales(): Promise<SaleDoc[]> {
  try {
    const list = await requestAllPaged<SaleDoc>('/api/sale/unsettled')
    if (list.length) return list
  } catch {
    // ignore and fallback
  }
  return requestAllPagedLegacy<SaleDoc>('/api/sale/unsettled')
}

async function requestAllReturns(): Promise<ReturnDoc[]> {
  return requestAllPagedLegacy<ReturnDoc>('/api/return/list')
}

async function requestAllTransfers(): Promise<TransferDoc[]> {
  return requestAllPagedLegacy<TransferDoc>('/api/transfer/list')
}

async function requestAllInbounds(): Promise<InboundDoc[]> {
  return requestAllPagedLegacy<InboundDoc>('/api/inbound/list')
}

async function requestAllOutbounds(): Promise<OutboundDoc[]> {
  return requestAllPagedLegacy<OutboundDoc>('/api/outbound/list')
}

async function requestAllAccounts(includeInactive = false): Promise<Account[]> {
  const url = `/api/account/list?includeInactive=${includeInactive ? 'true' : 'false'}`
  return requestAllPagedLegacy<Account>(url)
}

async function requestAllStores(includeInactive = false): Promise<Store[]> {
  const url = `/api/store/list?includeInactive=${includeInactive ? 'true' : 'false'}`
  return requestAllPagedLegacy<Store>(url)
}

async function requestAllProducts(): Promise<Product[]> {
  return requestAllPagedLegacy<Product>('/api/product/list')
}

async function requestAllWarehouses(): Promise<Warehouse[]> {
  return requestAllPagedLegacy<Warehouse>('/api/warehouse/list')
}

async function requestAllSuppliers(): Promise<Supplier[]> {
  return requestAllPagedLegacy<Supplier>('/api/supplier/list')
}

async function requestAllStock(warehouseId?: string): Promise<StockItem[]> {
  const url = warehouseId ? `/api/stock/list?warehouseId=${encodeURIComponent(warehouseId)}` : '/api/stock/list'
  return requestAllPagedLegacy<StockItem>(url)
}

type ReferenceCacheKey =
  | 'accounts_active'
  | 'accounts_all'
  | 'stores_active'
  | 'stores_all'
  | 'products'
  | 'warehouses'
  | 'suppliers'

interface ReferenceCacheEntry<T> {
  value?: T
  loadedAt: number
  promise?: Promise<T>
}

const REFERENCE_CACHE_TTL = 5 * 60 * 1000
const referenceCache = new Map<ReferenceCacheKey, ReferenceCacheEntry<unknown>>()

function getReferenceCacheEntry<T>(key: ReferenceCacheKey): ReferenceCacheEntry<T> {
  const current = referenceCache.get(key)
  if (current) return current as ReferenceCacheEntry<T>
  const entry: ReferenceCacheEntry<T> = { loadedAt: 0 }
  referenceCache.set(key, entry as ReferenceCacheEntry<unknown>)
  return entry
}

function getFreshReferenceCacheValue<T>(key: ReferenceCacheKey): T | undefined {
  const entry = referenceCache.get(key) as ReferenceCacheEntry<T> | undefined
  if (!entry || entry.value === undefined) return undefined
  if (Date.now() - entry.loadedAt > REFERENCE_CACHE_TTL) return undefined
  return entry.value
}

function loadReferenceCache<T>(key: ReferenceCacheKey, loader: () => Promise<T>): Promise<T> {
  const entry = getReferenceCacheEntry<T>(key)
  const cached = getFreshReferenceCacheValue<T>(key)
  if (cached !== undefined) return Promise.resolve(cached)
  if (entry.promise) return entry.promise
  entry.promise = loader()
    .then((value) => {
      entry.value = value
      entry.loadedAt = Date.now()
      return value
    })
    .finally(() => {
      entry.promise = undefined
    })
  return entry.promise
}

function invalidateReferenceCache(...keys: ReferenceCacheKey[]) {
  keys.forEach((key) => {
    referenceCache.delete(key)
  })
}

function invalidateAccountReferenceCache() {
  invalidateReferenceCache('accounts_active', 'accounts_all')
}

export interface UploadResult {
  path: string
}

const MOBILE_ACCOUNT_LABELS: Record<string, string> = {
  admin_root: '管理员',
  admin: '管理员',
  管理员: '管理员',
  sp_big: '大车',
  bigcar: '大车',
  大车: '大车',
  sp_small: '小车',
  smallcar: '小车',
  小车: '小车',
  sp_third: '三车',
  thirdcar: '三车',
  三车: '三车',
}

const MOBILE_SALESPERSON_PHONES: Record<string, string> = {
  大车: '18625667519',
  小车: '18625667559',
  三车: '18625667511',
}

const SALE_CODE_VEHICLE_NO: Record<string, string> = {
  大车: '1',
  小车: '2',
  三车: '3',
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

function normalizeDisplayName(displayName?: string): string {
  return getKnownMobileAccountLabel(displayName)
}

function normalizeAccountLink(account: Account): Account {
  if (account.role !== 'salesperson') {
    return {
      ...account,
      salespersonId: account.salespersonId || account.id,
    }
  }
  const salespersonId = account.salespersonId || account.id
  return {
    ...account,
    salespersonId,
  }
}

function getSalespersonKey(value?: string): string {
  return getKnownMobileAccountLabel(value) || normalizeMobileAccountToken(value)
}

function needsGeneratedSaleCode(code?: string): boolean {
  const trimmed = (code || '').trim()
  return !trimmed || /^XS\d+$/.test(trimmed)
}

function resolveSaleCodeDate(value?: string): string {
  const trimmed = (value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (trimmed) return formatDate(trimmed, 'YYYY-MM-DD')
  return todayLocalDate()
}

function resolveSaleVehicleNo(salespersonId?: string): string {
  const label = getKnownMobileAccountLabel(salespersonId)
  return SALE_CODE_VEHICLE_NO[label] || '0'
}

function buildSaleCodeFromList(list: SaleDoc[], doc: Partial<SaleDoc>): string {
  const codeDate = resolveSaleCodeDate(doc.date)
  const vehicleNo = resolveSaleVehicleNo(doc.salespersonId)
  const serial = list.filter(item => item.id !== doc.id && resolveSaleCodeDate(item.date) === codeDate && resolveSaleVehicleNo(item.salespersonId) === vehicleNo).length + 1
  return `XS${codeDate}-${vehicleNo}-${serial}`
}

export function isSameSalespersonId(left?: string, right?: string): boolean {
  if (!left || !right) return false
  return getSalespersonKey(left) === getSalespersonKey(right)
}

function getStoreSalespersonId(store: Store): string {
  return store.salespersonId || ''
}

export function getWarehouseSalespersonId(warehouse?: Warehouse | null): string {
  return warehouse?.salespersonId || ''
}

function getDocSalespersonId(doc: { salespersonId?: string }): string {
  return doc.salespersonId || ''
}

export function getSessionSalespersonId(session?: Session | null): string {
  if (!session) return ''
  if (session.role === 'admin') return ''
  if (session.salespersonId) return session.salespersonId
  return session.accountId || ''
}

function isStoreAssignedToSalesperson(store: Store, salespersonId?: string): boolean {
  return !!salespersonId && isSameSalespersonId(getStoreSalespersonId(store), salespersonId)
}

export function isOwnedStore(store?: Store | null, salespersonId?: string): boolean {
  if (!store) return false
  return isStoreAssignedToSalesperson(store, salespersonId)
}

export function hasAssignedStoresForSalesperson(stores: Store[], salespersonId?: string): boolean {
  return stores.some(store => isStoreAssignedToSalesperson(store, salespersonId))
}

export function getVisibleStoresForSalesperson(stores: Store[], salespersonId?: string): Store[] {
  const assignedStores = stores.filter(store => isStoreAssignedToSalesperson(store, salespersonId))
  return assignedStores.length ? assignedStores : stores
}

export function getVisibleStoresForSession(stores: Store[], isAdmin: boolean, salespersonId?: string): Store[] {
  if (isAdmin) return stores
  return getVisibleStoresForSalesperson(stores, salespersonId)
}

export function normalizeSalespersonAccounts(accounts: Account[]): Salesperson[] {
  return accounts
    .map(account => normalizeAccountLink(account))
    .filter((account): account is Salesperson => account.role === 'salesperson')
}

export function getSalespersonName(accounts: Array<{ salespersonId?: string; id?: string; displayName: string }>, value?: string): string {
  if (!value) return '-'
  return accounts.find(account => isSameSalespersonId(account.salespersonId || account.id, value))?.displayName || '-'
}

export function formatSalespersonDisplayName(value?: string): string {
  const label = getKnownMobileAccountLabel(value) || (value || '').trim()
  if (!label) return '-'
  const phone = MOBILE_SALESPERSON_PHONES[label]
  return phone ? `${label}（手机号${phone}）` : label
}

export function getSalespersonDisplayName(
  accounts: Array<{ salespersonId?: string; id?: string; displayName: string }>,
  value?: string
): string {
  return formatSalespersonDisplayName(getSalespersonName(accounts, value))
}


function request<T>(url: string, method: 'GET' | 'POST', data?: any): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jsessionid) {
    headers['Cookie'] = `JSESSIONID=${jsessionid}`
  }
  return new Promise((resolve, reject) => {
    uni.request({
      url: fullUrl,
      method,
      data,
      header: headers,
      success: (res) => {
        const resHeader = (res.header || {}) as Record<string, string>
        const newSid = extractJsessionid(resHeader)
        if (newSid) {
          saveJsessionid(newSid)
        }
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

function getMobileAccountLabel(role: Account['role'], salespersonId?: string, displayName?: string): string {
  if (role === 'admin') return '管理员'
  return getKnownMobileAccountLabel(salespersonId) || normalizeDisplayName(displayName)
}

function normalizeStore(store: Store): Store {
  return {
    ...store,
    salespersonId: store.salespersonId || '',
  }
}

function normalizeWarehouse(warehouse: Warehouse): Warehouse {
  const salespersonId = getWarehouseSalespersonId(warehouse)
  return {
    ...warehouse,
    salespersonId,
  }
}

function normalizeSaleDoc(doc: SaleDoc): SaleDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function normalizeReturnDoc(doc: ReturnDoc): ReturnDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function normalizeOutboundDoc(doc: OutboundDoc): OutboundDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function toPersistedSaleDoc(doc: SaleDoc): SaleDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function toPersistedReturnDoc(doc: ReturnDoc): ReturnDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function toPersistedOutboundDoc(doc: OutboundDoc): OutboundDoc {
  const salespersonId = getDocSalespersonId(doc)
  return {
    ...doc,
    salespersonId,
  }
}

function normalizeMobileAccount(account: Account): Account {
  const linkedAccount = normalizeAccountLink(account)
  const label = getMobileAccountLabel(linkedAccount.role, linkedAccount.salespersonId, linkedAccount.displayName)
  if (!label) {
    return {
      ...linkedAccount,
      displayName: linkedAccount.displayName || linkedAccount.username,
    }
  }
  return {
    ...linkedAccount,
    displayName: label,
  }
}

function normalizeMobileSession(session: Session): Session {
  const salespersonId = getSessionSalespersonId(session)
  const label = getMobileAccountLabel(session.role, salespersonId, session.displayName)
  if (!label) {
    return {
      ...session,
      salespersonId,
      displayName: session.displayName || session.username,
    }
  }
  return {
    ...session,
    salespersonId,
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
  const salespersonId = normalizedAccount.role === 'salesperson'
    ? (normalizedAccount.salespersonId || normalizedAccount.id || '')
    : (normalizedAccount.salespersonId || '')
  const session: Session = {
    accountId: normalizedAccount.id,
    username: normalizedAccount.username,
    displayName: normalizedAccount.displayName,
    role: normalizedAccount.role,
    salespersonId,
    expiresAt: exp.toISOString(),
  }
  uni.setStorageSync(SESSION_KEY, JSON.stringify(session))
  return session
}

export function logout() {
  uni.removeStorageSync(SESSION_KEY)
  clearJsessionid()
  clearReferenceDataCache()
}

export async function getAccounts(includeInactive = false): Promise<Account[]> {
  const cacheKey: ReferenceCacheKey = includeInactive ? 'accounts_all' : 'accounts_active'
  return loadReferenceCache(cacheKey, async () => {
    if (USE_MOCK) {
      const list = includeInactive ? accountDb.list() : accountDb.list().filter(a => a.status === 'active')
      return normalizeMobileAccounts(list)
    }
    const accounts = await getRequest<Account[]>('/api/account/list', {
      includeInactive: includeInactive ? 'true' : undefined,
    })
    return normalizeMobileAccounts(accounts)
  })
}

export async function getSalespersonAccounts(includeInactive = false): Promise<Salesperson[]> {
  const accounts = await getAccounts(includeInactive)
  return normalizeSalespersonAccounts(accounts)
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

  const acc = await request<Account>('/api/account/loginByGesture', 'POST', {
    username,
    gestureHash: normalizedHash,
  })
  if (!acc) throw new Error('账户不存在')
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
    invalidateAccountReferenceCache()
    return
  }
  await request<void>('/api/account/setGesture', 'POST', {
    id: accountId,
    gestureHash: normalizedHash,
  })
  invalidateAccountReferenceCache()
}

export async function setPassword(accountId: string, passwordHash: string): Promise<void> {
  if (USE_MOCK) {
    const accounts = accountDb.list()
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) throw new Error('账户不存在')
    acc.passwordHash = passwordHash
    accountDb.save(accounts)
    invalidateAccountReferenceCache()
    return
  }
  await request<void>('/api/account/setPassword', 'POST', {
    id: accountId,
    passwordHash,
  })
  invalidateAccountReferenceCache()
}

export async function toggleAccount(id: string): Promise<void> {
  if (USE_MOCK) {
    const accounts = accountDb.list()
    const acc = accounts.find(item => item.id === id)
    if (!acc) throw new Error('账户不存在')
    acc.status = acc.status === 'active' ? 'inactive' : 'active'
    accountDb.save(accounts)
    invalidateAccountReferenceCache()
    return
  }
  await request<void>(`/api/account/toggle/${id}`, 'POST')
  invalidateAccountReferenceCache()
}

export async function getStores(): Promise<Store[]> {
  return loadReferenceCache('stores_active', async () => {
    if (USE_MOCK) {
      return storeDb.list().filter(s => s.status === 'active').map(normalizeStore)
    }
    return (await request<Store[]>('/api/store/list', 'GET')).map(normalizeStore)
  })
}

export async function getStoresAll(): Promise<Store[]> {
  return loadReferenceCache('stores_all', async () => {
    if (USE_MOCK) {
      return storeDb.list().map(normalizeStore)
    }
    return (await request<Store[]>('/api/store/listAll', 'GET')).map(normalizeStore)
  })
}

export async function toggleStore(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = storeDb.list()
    const store = list.find(s => s.id === id)
    if (!store) throw new Error('超市不存在')
    store.status = store.status === 'active' ? 'inactive' : 'active'
    storeDb.save(list)
    invalidateReferenceCache('stores_active', 'stores_all')
    return
  }
  await request<void>(`/api/store/toggle/${id}`, 'POST')
  invalidateReferenceCache('stores_active', 'stores_all')
}

export async function deleteStore(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = storeDb.list().filter(s => s.id !== id)
    storeDb.save(list)
    invalidateReferenceCache('stores_active', 'stores_all')
    return
  }
  await request<void>(`/api/store/delete/${id}`, 'POST')
  invalidateReferenceCache('stores_active', 'stores_all')
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
    invalidateReferenceCache('stores_active', 'stores_all')
    return
  }
  await request<void>('/api/store/save', 'POST', data)
  invalidateReferenceCache('stores_active', 'stores_all')
}

export async function getProducts(): Promise<Product[]> {
  return loadReferenceCache('products', async () => {
    if (USE_MOCK) {
      return productDb.list().filter(p => p.status === 'active')
    }
    return request<Product[]>('/api/product/list', 'GET')
  })
}

export async function getWarehouses(): Promise<Warehouse[]> {
  return loadReferenceCache('warehouses', async () => {
    if (USE_MOCK) {
      return warehouseDb.ensureMain().map(normalizeWarehouse)
    }
    return (await request<Warehouse[]>('/api/warehouse/list', 'GET')).map(normalizeWarehouse)
  })
}

export async function saveWarehouse(data: Partial<Warehouse> & { name: string; type: string }) {
  await request<void>('/api/warehouse/save', 'POST', data)
  invalidateReferenceCache('warehouses')
}

export async function deleteWarehouse(id: string) {
  await request<void>(`/api/warehouse/delete/${id}`, 'POST')
  invalidateReferenceCache('warehouses')
}

export async function getSuppliers(): Promise<Supplier[]> {
  return loadReferenceCache('suppliers', async () => {
    if (USE_MOCK) {
      return []
    }
    return request<Supplier[]>('/api/supplier/list', 'GET')
  })
}

export async function getSupplierDetail(id: string): Promise<Supplier | null> {
  if (USE_MOCK) {
    return supplierDb.list().find(s => s.id === id) || null
  }
  return request<Supplier>(`/api/supplier/detail/${id}`, 'GET')
}

export async function saveSupplier(data: Partial<Supplier> & { name: string; code: string }) {
  await request<void>('/api/supplier/save', 'POST', data)
  invalidateReferenceCache('suppliers')
}

export async function toggleSupplier(id: string) {
  await request<void>(`/api/supplier/toggle/${id}`, 'POST')
  invalidateReferenceCache('suppliers')
}

export async function deleteSupplier(id: string) {
  await request<void>(`/api/supplier/delete/${id}`, 'POST')
  invalidateReferenceCache('suppliers')
}

export async function getProductDetail(id: string): Promise<Product | null> {
  if (USE_MOCK) {
    return productDb.list().find(p => p.id === id) || null
  }
  return request<Product>(`/api/product/detail/${id}`, 'GET')
}

export async function saveProduct(data: Partial<Product> & { name: string; code: string }) {
  await request<void>('/api/product/save', 'POST', data)
  invalidateReferenceCache('products')
}

export async function toggleProduct(id: string) {
  await request<void>(`/api/product/toggle/${id}`, 'POST')
  invalidateReferenceCache('products')
}

export async function deleteProduct(id: string) {
  await request<void>(`/api/product/delete/${id}`, 'POST')
  invalidateReferenceCache('products')
}

export async function getStock(warehouseId?: string): Promise<StockItem[]> {
  const params = warehouseId ? { warehouseId } : undefined
  return getRequest<StockItem[]>('/api/stock/list', params)
}

export async function getTodayCommissionSummary(): Promise<TodayCommissionSummary> {
  if (USE_MOCK) {
    const session = getSession()
    const salespersonId = getSessionSalespersonId(session)
    return {
      date: new Date().toISOString().slice(0, 10),
      salespersonId,
      salespersonName: session?.displayName || '',
      saleAmount: 0,
      returnAmount: 0,
      totalAmount: 0,
      ledgerCount: 0,
      ledgers: [],
    }
  }
  return request<TodayCommissionSummary>('/api/finance/commission/today', 'GET')
}

export async function getInbounds(): Promise<InboundDoc[]> {
  return request<InboundDoc[]>('/api/inbound/list', 'GET')
}

export async function getInboundDetail(id: string): Promise<InboundDoc | null> {
  return request<InboundDoc>(`/api/inbound/detail/${id}`, 'GET')
}

export async function saveInbound(doc: InboundDoc, lines: InboundLine[]) {
  await request<void>('/api/inbound/save', 'POST', { doc, lines: toPersistedPackLines(lines) })
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
  await request<void>('/api/transfer/save', 'POST', { doc, lines: toPersistedPackLines(lines) })
}

export async function postTransfer(id: string) {
  await request<void>(`/api/transfer/post/${id}`, 'POST')
}

export async function voidTransfer(id: string) {
  await request<void>(`/api/transfer/void/${id}`, 'POST')
}

export async function getOutbounds(): Promise<OutboundDoc[]> {
  if (USE_MOCK) {
    return []
  }
  return (await request<OutboundDoc[]>('/api/outbound/list', 'GET')).map(normalizeOutboundDoc)
}

export async function getOutboundDetail(id: string): Promise<OutboundDoc | null> {
  if (USE_MOCK) {
    return null
  }
  const doc = await request<OutboundDoc>(`/api/outbound/detail/${id}`, 'GET')
  return doc ? normalizeOutboundDoc(doc) : null
}

export async function saveOutbound(doc: OutboundDoc, lines: OutboundLine[]) {
  const nextDoc = toPersistedOutboundDoc({ ...doc, lines: toPersistedPackLines(lines) })
  await request<void>('/api/outbound/save', 'POST', { doc: nextDoc, lines: nextDoc.lines })
}

export async function postOutbound(id: string) {
  await request<void>(`/api/outbound/post/${id}`, 'POST')
}

export async function voidOutbound(id: string) {
  await request<void>(`/api/outbound/void/${id}`, 'POST')
}

export async function preloadReferenceData() {
  await Promise.allSettled([
    getAccounts(),
    getStores(),
    getProducts(),
    getWarehouses(),
    getSuppliers(),
  ])
}

export async function preloadPostLoginReferenceData() {
  await Promise.allSettled([
    getStores(),
    getProducts(),
    getWarehouses(),
    getSuppliers(),
  ])
}

export function clearReferenceDataCache() {
  referenceCache.clear()
}

export async function uploadSalespersonLocation(latitude: number, longitude: number): Promise<void> {
  const session = getSession()
  const salespersonId = getSessionSalespersonId(session)
  if (!salespersonId) return

  if (USE_MOCK) {
    const key = 'wh_salesperson_location'
    let list: SalespersonLocation[] = []
    try {
      list = JSON.parse(localStorage.getItem(key) || '[]')
    } catch {
      list = []
    }
    const label = session?.displayName || salespersonId
    const current: SalespersonLocation = {
      id: salespersonId,
      salespersonId,
      salespersonName: label,
      lat: latitude,
      lng: longitude,
      updatedAt: now(),
    }
    const index = list.findIndex(item => isSameSalespersonId(item.salespersonId, salespersonId))
    if (index >= 0) list[index] = current
    else list.push(current)
    localStorage.setItem(key, JSON.stringify(list))
    return
  }

  await request<void>('/api/salesperson/location', 'POST', { latitude, longitude })
}

export async function uploadFile(filePath: string) {
  return new Promise<UploadResult>((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (jsessionid) headers['Cookie'] = `JSESSIONID=${jsessionid}`

    uni.uploadFile({
      url: `${BASE_URL}/api/file/uploadFile`,
      filePath,
      name: 'mf',
      header: headers,
      success: (res) => {
        const resHeader = (res.header || {}) as Record<string, string>
        const newSid = extractJsessionid(resHeader)
        if (newSid) saveJsessionid(newSid)

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
  return `${BASE_URL}/api/file/showImageByPath?path=${encodeURIComponent(path)}`
}

export async function getSales(storeId?: string): Promise<SaleDoc[]> {
  if (USE_MOCK) {
    let list = saleDb.list().map(normalizeSaleDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (storeId) list = list.filter(d => d.storeId === storeId)
    return list
  }
  return (await requestAllSales(storeId)).map(normalizeSaleDoc)
}

export async function getSaleDetail(id: string): Promise<SaleDoc | null> {
  if (USE_MOCK) {
    const doc = saleDb.list().find(d => d.id === id)
    return doc ? normalizeSaleDoc(doc) : null
  }
  const doc = await request<SaleDoc>(`/api/sale/detail/${id}`, 'GET')
  return doc ? normalizeSaleDoc(doc) : null
}

export async function saveSale(doc: SaleDoc): Promise<SaleDoc> {
  const nextDoc = toPersistedSaleDoc({ ...doc, lines: toPersistedPackLines(doc.lines) })
  if (USE_MOCK) {
    if (!nextDoc.id) {
      nextDoc.id = genId()
    }
    if (!nextDoc.createdAt) {
      nextDoc.createdAt = now()
    }
    const list = saleDb.list()
    if (needsGeneratedSaleCode(nextDoc.code)) {
      nextDoc.code = buildSaleCodeFromList(list, nextDoc)
    }
    const idx = list.findIndex(d => d.id === nextDoc.id)
    if (idx >= 0) {
      list[idx] = nextDoc
    } else {
      list.push(nextDoc)
    }
    saleDb.save(list)
    return normalizeSaleDoc(nextDoc)
  }
  const saved = await request<SaleDoc>('/api/sale/save', 'POST', { doc: nextDoc, lines: nextDoc.lines })
  return normalizeSaleDoc(saved)
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

export async function linkSaleReturn(saleId: string, returnDocId: string): Promise<void> {
  if (USE_MOCK) {
    const list = saleDb.list()
    const doc = list.find(d => d.id === saleId)
    if (doc) { doc.returnDocId = returnDocId; saleDb.save(list) }
    return
  }
  await request<void>(`/api/sale/linkReturn/${saleId}?returnDocId=${encodeURIComponent(returnDocId)}`, 'POST')
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

export async function getProductSaleQty(days = 30): Promise<Record<string, number>> {
  if (USE_MOCK) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const docs = saleDb.list().filter(d => d.status === 'posted' && d.date >= cutoff)
    const result: Record<string, number> = {}
    for (const doc of docs) {
      for (const line of doc.lines) {
        result[line.productId] = (result[line.productId] || 0) + line.qty
      }
    }
    return result
  }
  return request<Record<string, number>>(`/api/sale/productSaleQty?days=${days}`, 'GET')
}

export async function getReturns(): Promise<ReturnDoc[]> {
  if (USE_MOCK) {
    try {
      return JSON.parse(localStorage.getItem(RETURN_STORAGE_KEY) || '[]').map(normalizeReturnDoc)
    } catch {
      return []
    }
  }
  return (await requestAllReturns()).map(normalizeReturnDoc)
}

export async function getReturnDetail(id: string): Promise<ReturnDoc | null> {
  if (USE_MOCK) {
    const list = await getReturns()
    return list.find(d => d.id === id) || null
  }
  const doc = await request<ReturnDoc>(`/api/return/detail/${id}`, 'GET')
  return doc ? normalizeReturnDoc(doc) : null
}

export async function saveReturn(doc: ReturnDoc, lines: ReturnDoc['lines']): Promise<ReturnDoc> {
  const nextDoc: ReturnDoc = toPersistedReturnDoc({
    ...doc,
    lines: toPersistedPackLines(lines),
  })
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
    if (idx >= 0) list[idx] = normalizeReturnDoc(nextDoc)
    else list.push(normalizeReturnDoc(nextDoc))
    localStorage.setItem(RETURN_STORAGE_KEY, JSON.stringify(list.map(toPersistedReturnDoc)))
    return normalizeReturnDoc(nextDoc)
  }
  const saved = await request<ReturnDoc>('/api/return/save', 'POST', { doc: nextDoc, lines: nextDoc.lines })
  return normalizeReturnDoc(saved)
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

// --- 未收款管理 ---
export async function getUnsettledSales(): Promise<SaleDoc[]> {
  if (USE_MOCK) {
    return saleDb.list()
      .map(normalizeSaleDoc)
      .filter(d => d.status === 'posted' && !d.settled)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return (await requestAllUnsettledSales()).map(normalizeSaleDoc)
}

export async function settleSale(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = saleDb.list()
    const doc = list.find(d => d.id === id)
    if (doc) {
      doc.settled = 1
      doc.settledAt = new Date().toISOString()
      saleDb.save(list)
    }
    return
  }
  await request<void>(`/api/sale/settle/${id}`, 'POST')
}
