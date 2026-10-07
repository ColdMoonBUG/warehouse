#!/usr/bin/env node
// 只读接口快照：对同一份数据库分别跑新旧后端，再用 compare.mjs 对比，确认改动没有改变既有接口的返回结果。
// 用法：WH_ADMIN=admin:<密码哈希> WH_SP=<业务员>:<密码哈希> \
//      node scripts/api-regression/snapshot.mjs --base http://127.0.0.1:8888 --out ./snap-old [--from 2026-04-01 --to 2026-06-30]
// 只发 GET 请求（登录除外），不会修改数据。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { account } from './credentials.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]])
  return acc
}, []))
const base = (args.base || 'http://127.0.0.1:8888').replace(/\/$/, '')
const out = args.out || './snap'
const adminAccount = account('WH_ADMIN')
const spAccount = account('WH_SP')
const from = args.from || '2026-04-01'
const to = args.to || '2026-06-30'
mkdirSync(out, { recursive: true })

async function login(username, passwordHash) {
  const res = await fetch(`${base}/api/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, passwordHash }),
  })
  const cookie = (res.headers.get('set-cookie') || '').match(/JSESSIONID=[^;]+/)?.[0]
  const body = await res.json()
  if (body.code !== 200 || !cookie) throw new Error(`login ${username} failed: ${JSON.stringify(body)}`)
  return cookie
}

const timings = []
async function get(cookie, path) {
  const t0 = Date.now()
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie, 'Accept-Encoding': 'gzip' } })
  const text = await res.text()
  timings.push({ path, ms: Date.now() - t0, bytes: text.length, status: res.status })
  try { return JSON.parse(text) } catch { return { __raw: text.slice(0, 500), __status: res.status } }
}

function save(name, data) {
  writeFileSync(join(out, `${name.replace(/[^\w.-]+/g, '_')}.json`), JSON.stringify(data, null, 1))
}

const admin = await login(adminAccount.username, adminAccount.passwordHash)
const sp = await login(spAccount.username, spAccount.passwordHash)

const products = (await get(admin, '/api/product/list')).data || []
const stores = (await get(admin, '/api/store/list')).data || []
const firstSales = (await get(admin, '/api/sale/list?page=1&limit=50')).data || []
const firstReturns = (await get(admin, '/api/return/list?page=1&limit=50')).data || []
const transfers = (await get(admin, '/api/transfer/list')).data || []
const inbounds = (await get(admin, '/api/inbound/list')).data || []
const settlements = (await get(admin, '/api/finance/commission/settlements')).data || []
const busyStore = firstSales.find(d => d.storeId)?.storeId || stores[0]?.id
const linkedSale = firstSales.find(d => d.returnDocId) || firstSales[0]
const busyProduct = firstSales.flatMap(d => d.lines || [])[0]?.productId || products[0]?.id

const plan = {
  'product.list': '/api/product/list',
  'store.list': '/api/store/list',
  'store.listAll': '/api/store/listAll',
  'warehouse.list': '/api/warehouse/list',
  'account.list': '/api/account/list',
  'account.list.sp': '/api/account/list?role=salesperson',
  'sale.list.p1': '/api/sale/list?page=1&limit=20',
  'sale.list.p2.200': '/api/sale/list?page=2&limit=200',
  'sale.list.store': `/api/sale/list?page=1&limit=200&storeId=${busyStore}`,
  'sale.detail': `/api/sale/detail/${linkedSale?.id}`,
  'sale.unsettled': '/api/sale/unsettled?page=1&limit=50',
  'sale.unsettled.p2': '/api/sale/unsettled?page=2&limit=100',
  'sale.storeSaleQty': '/api/sale/storeSaleQty?days=400',
  'sale.productSaleQty': '/api/sale/productSaleQty?days=400',
  'sale.storeNetQty.all': '/api/sale/storeNetQty',
  'sale.storeNetQty.range': `/api/sale/storeNetQty?startDate=${from}&endDate=${to}`,
  'sale.storeRangeSummary': `/api/sale/storeRangeSummary?startDate=${from}&endDate=${to}`,
  'sale.productStat.all': `/api/sale/productStat?productId=${busyProduct}`,
  'sale.productStat.range': `/api/sale/productStat?productId=${busyProduct}&startDate=${from}&endDate=${to}`,
  'return.list.p1': '/api/return/list?page=1&limit=50',
  'return.list.p2.200': '/api/return/list?page=2&limit=200',
  'return.detail': `/api/return/detail/${linkedSale?.returnDocId || firstReturns[0]?.id}`,
  'inbound.list': '/api/inbound/list',
  'inbound.detail': `/api/inbound/detail/${inbounds[0]?.id}`,
  'outbound.list': '/api/outbound/list',
  'transfer.list': '/api/transfer/list',
  'transfer.detail.0': `/api/transfer/detail/${transfers[0]?.id}`,
  'transfer.detail.mid': `/api/transfer/detail/${transfers[Math.floor(transfers.length / 2)]?.id}`,
  'stock.list.admin': '/api/stock/list',
  'stock.list.main': '/api/stock/list?warehouseId=main',
  'finance.summary': '/api/finance/commission/summary',
  'finance.storeSummaries': `/api/finance/commission/store-summaries?date=${to}`,
  'finance.unsettled.big': '/api/finance/commission/unsettled?salespersonId=sp_big',
  'finance.unsettledByDoc.big': '/api/finance/commission/unsettled-by-doc?salespersonId=sp_big',
  'finance.settlements': '/api/finance/commission/settlements',
  'finance.settlement.detail': `/api/finance/commission/settlement/${settlements[0]?.id}`,
  'finance.storeDetail': `/api/finance/commission/store-detail/${busyStore}`,
  'ledger.list.main': '/api/ledger/list?warehouseId=main',
}
for (const [name, path] of Object.entries(plan)) save(name, await get(admin, path))

const spPlan = {
  'sp.stock.list': '/api/stock/list',
  'sp.warehouse.list': '/api/warehouse/list',
  'sp.finance.today': '/api/finance/commission/today',
}
for (const [name, path] of Object.entries(spPlan)) save(name, await get(sp, path))

// 全量翻页（模拟旧客户端的“拉全部”）
let page = 1, all = []
for (;;) {
  const list = (await get(admin, `/api/sale/list?page=${page}&limit=200`)).data || []
  all.push(...list)
  if (list.length < 200 || page > 200) break
  page++
}
save('sale.list.all', all)

writeFileSync(join(out, '_timings.json'), JSON.stringify(timings, null, 1))
const total = timings.reduce((s, t) => s + t.bytes, 0)
console.log(`saved ${Object.keys(plan).length + Object.keys(spPlan).length + 1} snapshots to ${out}; ${timings.length} requests, ${(total / 1024 / 1024).toFixed(1)} MB, ${timings.reduce((s, t) => s + t.ms, 0)} ms`)
