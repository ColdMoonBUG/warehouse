import request from '@/utils/request'
import type { Account, Role } from '@/types'

const SESSION_KEY = 'wh_session'
const SESSION_DAYS = 365

export interface Session {
  accountId: string
  username: string
  displayName: string
  role: Role
  expiresAt: string
}

type LoginResponse = {
  data?: Account
}

function toSession(account: Account): Session {
  const exp = new Date()
  exp.setDate(exp.getDate() + SESSION_DAYS)
  return {
    accountId: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    expiresAt: exp.toISOString()
  }
}

function persistSession(account: Account) {
  const session = toSession(account)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: Session = JSON.parse(raw)
    if (new Date(s.expiresAt) < new Date()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function saveSession(account: Account) {
  return persistSession(account)
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export async function logoutRemote() {
  try {
    await request.post('/account/logout')
  } finally {
    logout()
  }
}

export function simpleHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

export function normalizeGesture(gesture: string): string {
  return gesture.replace(/-/g, '')
}

export function hashGesture(gesture: string): string {
  return simpleHash(normalizeGesture(gesture))
}

export function isSalespersonAccount(account: Pick<Account, 'role'>) {
  return account.role === 'salesperson'
}

export function filterSalespersonAccounts(accounts: Account[]) {
  return accounts.filter(isSalespersonAccount)
}

export function findSalespersonAccount(accounts: Account[], value?: string) {
  if (!value) return undefined
  return filterSalespersonAccounts(accounts).find(account => account.id === value)
}

export function normalizeSalespersonId(accounts: Account[], value?: string) {
  return findSalespersonAccount(accounts, value)?.id || ''
}

export function getSalespersonName(accounts: Account[], value?: string) {
  return findSalespersonAccount(accounts, value)?.displayName || '-'
}

export async function loginByPassword(username: string, password: string): Promise<Session> {
  const res = await request.post('/account/login', {
    username,
    passwordHash: simpleHash(password),
  }) as unknown as LoginResponse
  const acc = res.data
  if (!acc) throw new Error('账户不存在')
  return persistSession(acc)
}

export async function loginByGesture(username: string, gesture: string): Promise<Session> {
  const res = await request.post('/account/loginByGesture', {
    username,
    gestureHash: hashGesture(gesture),
  }) as unknown as LoginResponse
  const acc = res.data
  if (!acc) throw new Error('账户不存在')
  return persistSession(acc)
}

export async function currentAccount(): Promise<Account | null> {
  const res = await request.get('/account/current') as unknown as LoginResponse
  return res.data || null
}

export async function refreshSession(): Promise<Session | null> {
  try {
    const account = await currentAccount()
    return account ? persistSession(account) : null
  } catch {
    logout()
    return null
  }
}

export function getLoginCode(): string {
  return '/login/getCode?ts=' + Date.now()
}

export async function loginByPasswordLegacy(username: string, password: string): Promise<Session> {
  await request.post('/login/login', null, {
    params: { loginname: username, pwd: password }
  })
  const accounts = await getAccounts()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在')
  return persistSession(acc)
}

export async function getAccounts(includeInactive = false): Promise<Account[]> {
  const res = await request.get('/account/list', { params: { includeInactive } })
  return res.data
}

export async function getSalespersonAccounts(): Promise<Account[]> {
  const res = await request.get('/account/list', { params: { role: 'salesperson' } })
  return filterSalespersonAccounts(res.data || [])
}

export async function saveAccount(data: Partial<Account> & { username: string; displayName: string; role: Role }) {
  await request.post('/account/save', data)
}

export async function toggleAccount(id: string) {
  await request.post(`/account/toggle/${id}`)
}

export async function deleteAccount(id: string) {
  await request.post(`/account/delete/${id}`)
}

export async function setGesture(id: string, gesture: string) {
  await request.post('/account/setGesture', { id, gestureHash: hashGesture(gesture) })
}

export async function setPassword(id: string, passwordHash: string) {
  await request.post('/account/setPassword', { id, passwordHash })
}
