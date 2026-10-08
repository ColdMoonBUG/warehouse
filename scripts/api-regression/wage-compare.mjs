#!/usr/bin/env node
// 校验后端 /api/finance/commission/wage 与旧版“工资查询”前端算法（拉全部单据 + 全部提成流水在浏览器里拼）结果一致。
// 用法：WH_ADMIN=admin:<密码哈希> node scripts/api-regression/wage-compare.mjs --base http://127.0.0.1:8889 [--from 2026-04-01 --to 2026-07-31]
import { account } from './credentials.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]])
  return acc
}, []))
const base = (args.base || 'http://127.0.0.1:8889').replace(/\/$/, '')
let cookie = ''
async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) })
  const m = (res.headers.get('set-cookie') || '').match(/JSESSIONID=[^;]+/)
  if (m) cookie = m[0]
  return res.json()
}
async function all(kind) {
  const out = []
  for (let page = 1; ; page++) {
    const r = await call('GET', `/api/${kind}/list?page=${page}&limit=200`)
    out.push(...r.data)
    if (r.data.length < 200) return out
  }
}
const docDay = d => (d.docDate || d.date || '').slice(0, 10)

// —— 旧版 WageQuery.vue 的算法（原样搬过来，作为对照基准）——
async function oldWage(id, dates, sales, returns, history) {
  const ledgers = new Map()
  for (const s of history.filter(s => s.salespersonId === id)) {
    const detail = (await call('GET', `/api/finance/commission/settlement/${s.id}`)).data
    detail.ledgers.forEach(l => ledgers.set(l.id, l))
  }
  ;(await call('GET', `/api/finance/commission/unsettled?salespersonId=${id}`)).data.forEach(l => ledgers.set(l.id, l))
  const saleDates = new Map(sales.map(d => [d.id, docDay(d)]))
  const returnDates = new Map(returns.map(d => [d.id, docDay(d)]))
  const undated = []
  const daily = new Map()
  for (const l of ledgers.values()) {
    if (l.salespersonId !== id) continue
    const isSale = ['sale', 'void_sale', 'gift', 'void_gift'].includes(l.bizType)
    const date = (isSale ? saleDates : returnDates).get(l.docId)
    if (!date) { undated.push(l); continue }
    if (!(date >= dates[0] && date <= dates[1])) continue
    const row = daily.get(date) || { sale: 0, returns: 0 }
    row[isSale ? 'sale' : 'returns'] += Math.round(Number(l.commissionAmount || 0) * 100)
    daily.set(date, row)
  }
  const rows = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, sale: r.sale / 100, returns: r.returns / 100, total: (r.sale + r.returns) / 100 }))
  return { rows, total: [...daily.values()].reduce((s, r) => s + r.sale + r.returns, 0), undated: undated.length, undatedTotal: undated.reduce((s, l) => s + Math.round(Number(l.commissionAmount || 0) * 100), 0) }
}

await call('POST', '/api/account/login', account('WH_ADMIN'))
const [sales, returns, history] = [await all('sale'), await all('return'), (await call('GET', '/api/finance/commission/settlements')).data]
const ranges = [[args.from || '2026-04-01', args.to || '2026-07-31'], ['2026-05-01', '2026-05-31'], ['2026-06-15', '2026-06-15'], ['2020-01-01', '2020-01-31']]
let bad = 0
for (const sp of ['sp_big', 'sp_small', 'sp_third']) {
  for (const range of ranges) {
    const o = await oldWage(sp, range, sales, returns, history)
    const n = (await call('GET', `/api/finance/commission/wage?salespersonId=${sp}&startDate=${range[0]}&endDate=${range[1]}`)).data
    const nn = { rows: n.rows.map(r => ({ date: r.date, sale: Number(r.sale), returns: Number(r.returns), total: Number(r.total) })), total: n.total, undated: n.undated.length, undatedTotal: n.undatedTotal }
    const same = JSON.stringify(o) === JSON.stringify(nn)
    if (!same) bad++
    console.log(`${same ? 'OK  ' : 'DIFF'} ${sp} ${range.join('~')} total=${o.total}/${nn.total} days=${o.rows.length}/${nn.rows.length} undated=${o.undated}/${nn.undated}`)
  }
}
process.exit(bad ? 1 : 0)
