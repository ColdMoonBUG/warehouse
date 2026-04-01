import request from '@/utils/request'
import type { Account, Role } from '@/types'

const SESSION_KEY = 'wh_session'
const SESSION_DAYS = 365

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

// 简单hash（与后端保持一致）
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

// 登录（/api/account/login）
export async function loginByPassword(username: string, password: string): Promise<Session> {
  const res = await request.post('/account/login', {
    username,
    passwordHash: simpleHash(password),
  })
  const acc = res.data as Account | undefined
  if (!acc) throw new Error('账户不存在')
  return saveSession(acc)
}

// 手势登录（仍通过 account 表）
export async function loginByGesture(username: string, gesture: string): Promise<Session> {
  const accounts = await getAccounts()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在')
  if (acc.gestureHash !== hashGesture(gesture)) throw new Error('手势密码错误')
  return saveSession(acc)
}

// 获取验证码图片（旧系统兼容）
export function getLoginCode(): string {
  return '/login/getCode?ts=' + Date.now()
}

// 登录（兼容旧登录接口）
export async function loginByPasswordLegacy(username: string, password: string): Promise<Session> {
  await request.post('/login/login', null, {
    params: { loginname: username, pwd: password }
  })
  const accounts = await getAccounts()
  const acc = accounts.find(a => a.username === username && a.status === 'active')
  if (!acc) throw new Error('账户不存在')
  return saveSession(acc)
}

// 获取账户列表
export async function getAccounts(): Promise<Account[]> {
  const res = await request.get('/account/list')
  return res.data
}

// 保存账户
export async function saveAccount(data: Partial<Account> & { username: string; displayName: string; role: Role }) {
  await request.post('/account/save', data)
}

// 切换账户状态
export async function toggleAccount(id: string) {
  await request.post(`/account/toggle/${id}`)
}

// 删除账户
export async function deleteAccount(id: string) {
  await request.post(`/account/delete/${id}`)
}

// 设置手势密码
export async function setGesture(id: string, gesture: string) {
  await request.post('/account/setGesture', { id, gestureHash: hashGesture(gesture) })
}

export async function setPassword(id: string, passwordHash: string) {
  await request.post('/account/setPassword', { id, passwordHash })
}
