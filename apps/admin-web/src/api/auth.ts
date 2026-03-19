import { accountDb, genId, now } from '@/mock/storage'
import type { Account, Role } from '@/types'

const SESSION_KEY = 'wh_session'
const SESSION_DAYS = 365  // 凭证保留1年

// 简单 hash（非加密，仅防明文存储）
export function simpleHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16)
}

export interface Session {
  accountId: string
  username: string
  displayName: string
  role: Role
  employeeId?: string
  expiresAt: string
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: Session = JSON.parse(raw)
    if (new Date(s.expiresAt) < new Date()) { localStorage.removeItem(SESSION_KEY); return null }
    return s
  } catch { return null }
}

export function saveSession(account: Account) {
  const exp = new Date()
  exp.setDate(exp.getDate() + SESSION_DAYS)
  const session: Session = {
    accountId: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    employeeId: account.employeeId,
    expiresAt: exp.toISOString()
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function loginByPassword(username: string, password: string): Session {
  const accounts = accountDb.list()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在或已停用')
  if (acc.passwordHash !== simpleHash(password)) throw new Error('密码错误')
  return saveSession(acc)
}

export function loginByGesture(username: string, gesture: string): Session {
  const accounts = accountDb.list()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在')
  const hash = simpleHash(gesture)
  if (acc.gestureHash === hash) return saveSession(acc)

  const parts = gesture.split('-').map(n => Number(n))
  if (parts.every(n => Number.isFinite(n) && n >= 1)) {
    const legacy = parts.map(n => n - 1).join('-')
    if (acc.gestureHash === simpleHash(legacy)) {
      acc.gestureHash = hash
      accountDb.save(accounts)
      return saveSession(acc)
    }
  }
  throw new Error('手势密码错误')
}

export function getAccounts() {
  return Promise.resolve(accountDb.list())
}

export function saveAccount(data: Partial<Account> & { username: string; displayName: string; role: Role }) {
  const list = accountDb.list()
  if (data.id) {
    const idx = list.findIndex(a => a.id === data.id)
    if (idx >= 0) list[idx] = { ...list[idx], ...data }
  } else {
    if (list.find(a => a.username === data.username)) throw new Error('用户名已存在')
    list.push({ ...data, id: genId(), status: 'active', createdAt: now() } as Account)
  }
  accountDb.save(list)
  return Promise.resolve()
}

export function toggleAccount(id: string) {
  const list = accountDb.list()
  const item = list.find(a => a.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
  accountDb.save(list)
  return Promise.resolve()
}

export function deleteAccount(id: string) {
  accountDb.save(accountDb.list().filter(a => a.id !== id))
  return Promise.resolve()
}
