#!/usr/bin/env node
// 新版后端行为测试（只能在测试库上运行，会写数据；建议运行模式为 LIVE，才能测到库存校验）。
// 用法：WH_ADMIN=admin:<密码哈希> WH_SP=<业务员>:<密码哈希> \
//       node scripts/api-regression/new-features.mjs --base http://127.0.0.1:8891 --db wh_new --mysql "C:/.../mysql.exe"
//       [--old http://127.0.0.1:8890 --old-db wh_old]  同时在旧后端上演示并发丢库存问题
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { account } from './credentials.mjs'

const adminAccount = account('WH_ADMIN')
const spAccount = account('WH_SP')

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]])
  return acc
}, []))
const sql = (db, q) => execFileSync(args.mysql || 'mysql', ['--user=root', '--host=127.0.0.1', '--default-character-set=utf8mb4', '-N', '-B', db, '-e', q], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean).map(l => l.split('\t'))
const one = (db, q) => sql(db, q)[0]?.[0]
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
const cid = () => randomUUID().replace(/-/g, '').slice(0, 24)

class Client {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.cookie = '' }
  async call(method, path, body) {
    const res = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const m = (res.headers.get('set-cookie') || '').match(/JSESSIONID=[^;]+/)
    if (m) this.cookie = m[0]
    const text = await res.text()
    try { return { http: res.status, ...JSON.parse(text) } } catch { return { http: res.status, code: -999, msg: text.slice(0, 200) } }
  }
  get(p) { return this.call('GET', p) }
  post(p, b) { return this.call('POST', p, b) }
}

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

async function setup(c, db) {
  await c.post('/api/account/login', adminAccount)
  const products = sql(db, "SELECT id, sale_price FROM wh_product WHERE status='active' ORDER BY id LIMIT 4")
  const store = one(db, "SELECT id FROM wh_store WHERE salesperson_id='sp_big' AND status='active' ORDER BY id LIMIT 1")
  // 给车库补足库存，便于后续测试
  const t = await c.post('/api/transfer/save', { doc: { fromWarehouseId: 'main', toWarehouseId: 'veh_sp_big', date: today }, lines: products.map(p => ({ productId: p[0], qty: 0, boxQty: 0 })) })
  await c.post(`/api/transfer/post/${t.data.id}`)
  for (const p of products) sql(db, `INSERT INTO wh_stock (warehouse_id, product_id, qty) VALUES ('veh_sp_big','${p[0]}',50) ON DUPLICATE KEY UPDATE qty=50`)
  return { products, store }
}
const stockOf = (db, pid, wh = 'veh_sp_big') => Number(one(db, `SELECT qty FROM wh_stock WHERE warehouse_id='${wh}' AND product_id='${pid}'`) || 0)
const saleBody = (store, lines, extra = {}) => ({ doc: { salespersonId: 'sp_big', storeId: store, warehouseId: 'veh_sp_big', date: today, docType: 'sale', ...extra }, lines })

async function concurrentStockTest(label, c, db, ctx) {
  const [p] = ctx.products
  sql(db, `UPDATE wh_stock SET qty=50 WHERE warehouse_id='veh_sp_big' AND product_id='${p[0]}'`)
  const drafts = []
  for (let i = 0; i < 6; i++) {
    const r = await c.post('/api/sale/save', saleBody(ctx.store, [{ productId: p[0], qty: 1, boxQty: 0, price: Number(p[1]) }]))
    drafts.push(r.data.id)
  }
  const results = await Promise.all(drafts.map(id => c.post(`/api/sale/post/${id}`)))
  const ok = results.filter(r => r.code === 200).length
  const final = stockOf(db, p[0])
  check(`${label}: 6 张不同销单并发过账同一车库同一商品，库存不丢扣减`, final === 50 - ok, `成功 ${ok} 张，期望库存 ${50 - ok}，实际 ${final}`)
}

const c = new Client(args.base)
const db = args.db
const ctx = await setup(c, db)
const [p1, p2, p3] = ctx.products

// a. 已过账单据不能再被保存覆盖
{
  const s = await c.post('/api/sale/save', saleBody(ctx.store, [{ productId: p1[0], qty: 2, boxQty: 0, price: Number(p1[1]) }]))
  await c.post(`/api/sale/post/${s.data.id}`)
  const before = sql(db, `SELECT status, total_qty FROM wh_sale_doc WHERE id='${s.data.id}'`)[0].join()
  const r = await c.post('/api/sale/save', { doc: { ...saleBody(ctx.store, []).doc, id: s.data.id, status: 'draft' }, lines: [{ productId: p1[0], qty: 9, boxQty: 0, price: 1 }] })
  const after = sql(db, `SELECT status, total_qty FROM wh_sale_doc WHERE id='${s.data.id}'`)[0].join()
  check('已过账销单再次保存被拒绝且数据不变', r.code === -1 && before === after, `${r.msg} | ${before} -> ${after}`)
  const rr = await c.post('/api/sale/post/' + s.data.id)
  check('重复过账返回“单据状态异常”', rr.code === -1, rr.msg)
}

// b. 同一张单并发重复过账只生效一次
{
  const stock0 = stockOf(db, p2[0])
  const s = await c.post('/api/sale/save', saleBody(ctx.store, [{ productId: p2[0], qty: 3, boxQty: 0, price: Number(p2[1]) }]))
  const results = await Promise.all(Array.from({ length: 5 }, () => c.post(`/api/sale/post/${s.data.id}`)))
  const ok = results.filter(r => r.code === 200).length
  const ledgers = Number(one(db, `SELECT COUNT(*) FROM wh_ledger WHERE doc_id='${s.data.id}'`))
  const comm = Number(one(db, `SELECT COUNT(*) FROM wh_commission_ledger WHERE doc_id='${s.data.id}'`))
  check('同一销单 5 个并发过账请求只成功 1 个', ok === 1, `成功 ${ok}`)
  check('库存流水、提成流水各只有一份', ledgers === 1 && comm === 1, `ledger=${ledgers} commission=${comm}`)
  check('库存只扣一次', stockOf(db, p2[0]) === stock0 - 3, `${stock0} -> ${stockOf(db, p2[0])}`)
}

// c. 不同单据并发过账不丢库存
await concurrentStockTest('新后端', c, db, ctx)
if (args.old) {
  const oc = new Client(args.old)
  const octx = await setup(oc, args['old-db'])
  console.log('（以下为旧后端对照，FAIL 说明旧版存在并发丢扣减问题）')
  const before = failed
  await concurrentStockTest('旧后端', oc, args['old-db'], octx)
  failed = before
}

// d. 一次提交销单+退单：幂等重试不重复开单
{
  const saleId = cid(), retId = cid()
  const body = {
    doc: { id: saleId, salespersonId: 'sp_big', storeId: ctx.store, warehouseId: 'veh_sp_big', date: today, docType: 'sale', paymentType: 'cash' },
    lines: [{ productId: p1[0], qty: 2, boxQty: 0, price: Number(p1[1]), lineNo: 1 }, { productId: p3[0], qty: 1, boxQty: 0, price: Number(p3[1]), lineNo: 2 }],
    returnDoc: { id: retId, returnType: 'vehicle_return' },
    returnLines: [{ productId: p2[0], qty: 1, boxQty: 0, price: Number(p2[1]), lineNo: 1 }],
  }
  const s0 = [stockOf(db, p1[0]), stockOf(db, p2[0]), stockOf(db, p3[0])]
  const r1 = await c.post('/api/sale/submit', body)
  check('submit 首次成功', r1.code === 200 && r1.data?.sale?.status === 'posted' && r1.data?.returnDoc?.status === 'posted', r1.msg)
  check('现金单自动收款且记为现金', r1.data?.sale?.settled === 1 && r1.data?.sale?.paymentType === 'cash')
  check('销单已关联退单', r1.data?.sale?.returnDocId === retId)
  const r2 = await c.post('/api/sale/submit', body)
  check('相同请求重试返回同一结果（replayed）', r2.code === 200 && r2.data?.replayed === true && r2.data?.sale?.code === r1.data?.sale?.code, r2.msg)
  const counts = sql(db, `SELECT (SELECT COUNT(*) FROM wh_sale_doc WHERE id='${saleId}'), (SELECT COUNT(*) FROM wh_ledger WHERE doc_id IN ('${saleId}','${retId}')), (SELECT COUNT(*) FROM wh_commission_ledger WHERE doc_id IN ('${saleId}','${retId}'))`)[0].map(Number)
  check('重试后没有多出单据/流水', counts[0] === 1 && counts[1] === 3 && counts[2] === 3, counts.join(','))
  const s1 = [stockOf(db, p1[0]), stockOf(db, p2[0]), stockOf(db, p3[0])]
  check('库存只变化一次（销 -2/-1，退 +1）', s1[0] === s0[0] - 2 && s1[1] === s0[1] + 1 && s1[2] === s0[2] - 1, `${s0} -> ${s1}`)
  const list = await c.get(`/api/return/list?page=1&limit=5&keyword=${encodeURIComponent(r1.data.returnDoc.code)}`)
  check('退单列表能看到关联销单单号', list.data?.[0]?.saleDocCode === r1.data.sale.code, JSON.stringify(list.data?.[0]?.saleDocCode))

  // f. 作废销单时连同关联退单一起作废
  const v = await c.post(`/api/sale/void/${saleId}`)
  const st = sql(db, `SELECT (SELECT status FROM wh_sale_doc WHERE id='${saleId}'), (SELECT status FROM wh_return_doc WHERE id='${retId}')`)[0]
  check('作废销单同时作废关联退单', v.code === 200 && st[0] === 'voided' && st[1] === 'voided', `${v.msg} ${st}`)
  const s2 = [stockOf(db, p1[0]), stockOf(db, p2[0]), stockOf(db, p3[0])]
  check('作废后库存全部回到提交前', s2.join() === s0.join(), `${s0} -> ${s2}`)
  const r3 = await c.post('/api/sale/submit', body)
  check('已作废的单再提交被拒绝', r3.code === -1, r3.msg)
}

// e. 库存不足时整笔提交回滚，不留下任何单据
{
  const saleId = cid(), retId = cid()
  const r = await c.post('/api/sale/submit', {
    doc: { id: saleId, salespersonId: 'sp_big', storeId: ctx.store, warehouseId: 'veh_sp_big', date: today },
    lines: [{ productId: p1[0], qty: 999999, boxQty: 0, price: 1 }],
    returnDoc: { id: retId }, returnLines: [{ productId: p2[0], qty: 1, boxQty: 0, price: 1 }],
  })
  const n = Number(one(db, `SELECT (SELECT COUNT(*) FROM wh_sale_doc WHERE id='${saleId}') + (SELECT COUNT(*) FROM wh_return_doc WHERE id='${retId}')`))
  check('库存不足提交失败且两张单都没有落库', r.code === -1 && n === 0, `${r.msg} rows=${n}`)
}

// g. 关联退单无法作废（车库库存已不够扣回）时，销单照常作废并提示
{
  const saleId = cid(), retId = cid()
  await c.post('/api/sale/submit', {
    doc: { id: saleId, salespersonId: 'sp_big', storeId: ctx.store, warehouseId: 'veh_sp_big', date: today },
    lines: [{ productId: p1[0], qty: 1, boxQty: 0, price: 1 }],
    returnDoc: { id: retId }, returnLines: [{ productId: p3[0], qty: 5, boxQty: 0, price: 1 }],
  })
  sql(db, `UPDATE wh_stock SET qty=0 WHERE warehouse_id='veh_sp_big' AND product_id='${p3[0]}'`)
  const v = await c.post(`/api/sale/void/${saleId}`)
  const st = sql(db, `SELECT (SELECT status FROM wh_sale_doc WHERE id='${saleId}'), (SELECT status FROM wh_return_doc WHERE id='${retId}')`)[0]
  check('退单作废失败不阻断销单作废，并返回提示', v.code === 200 && st[0] === 'voided' && st[1] === 'posted' && /未能作废/.test(v.msg), `${v.msg} ${st}`)
  sql(db, `UPDATE wh_stock SET qty=50 WHERE warehouse_id='veh_sp_big' AND product_id='${p3[0]}'`)
}

// h. 单独提交退单 + 关联销单，可重试
{
  const s = await c.post('/api/sale/save', saleBody(ctx.store, [{ productId: p1[0], qty: 1, boxQty: 0, price: 1 }]))
  await c.post(`/api/sale/post/${s.data.id}`)
  const retId = cid()
  const body = { doc: { id: retId, salespersonId: 'sp_big', storeId: ctx.store, fromWarehouseId: 'veh_sp_big', returnType: 'vehicle_return', date: today }, lines: [{ productId: p2[0], qty: 1, boxQty: 0, price: 1 }], linkSaleId: s.data.id }
  const r1 = await c.post('/api/return/submit', body)
  const r2 = await c.post('/api/return/submit', body)
  const link = one(db, `SELECT return_doc_id FROM wh_sale_doc WHERE id='${s.data.id}'`)
  const ledgers = Number(one(db, `SELECT COUNT(*) FROM wh_ledger WHERE doc_id='${retId}'`))
  check('退单 submit 重试幂等且关联到销单', r1.code === 200 && r2.data?.replayed === true && link === retId && ledgers === 1, `${r1.msg} ${r2.msg} link=${link} ledgers=${ledgers}`)
  const other = await c.post('/api/return/submit', { ...body, doc: { ...body.doc, id: cid() } })
  check('销单已关联有效退单时不允许被另一张退单覆盖', other.code === -1, other.msg)
}

// i. 客户端预生成 id 的草稿：首次保存即新建，不再产生孤儿明细
{
  const id = cid()
  const r = await c.post('/api/sale/save', { doc: { ...saleBody(ctx.store, []).doc, id }, lines: [{ productId: p1[0], qty: 1, boxQty: 0, price: 1 }] })
  const rows = sql(db, `SELECT (SELECT COUNT(*) FROM wh_sale_doc WHERE id='${id}'), (SELECT COUNT(*) FROM wh_sale_line WHERE doc_id='${id}')`)[0].map(Number)
  check('客户端 id 草稿保存后单头和明细都在', r.code === 200 && rows[0] === 1 && rows[1] === 1, rows.join(','))
  await c.post(`/api/sale/delete/${id}`)
}

// j. 列表筛选与旧的“全量拉取再在前端过滤”结果一致
{
  const all = []
  for (let page = 1; ; page++) {
    const r = await c.get(`/api/sale/list?page=${page}&limit=200`)
    all.push(...r.data)
    if (r.data.length < 200) break
  }
  const dates = [...new Set(all.map(d => d.date))].sort()
  const start = dates[Math.floor(dates.length / 3)], end = dates[Math.floor(dates.length * 2 / 3)]
  const expect = all.filter(d => d.salespersonId === 'sp_small' && d.date >= start && d.date <= end)
  const got = await c.get(`/api/sale/list?page=1&limit=500&salespersonId=sp_small&startDate=${start}&endDate=${end}&withLines=false`)
  check('按业务员+日期筛选的结果与全量过滤一致', got.count === expect.length && got.data.map(d => d.id).join() === expect.map(d => d.id).join(), `${got.count} vs ${expect.length}`)
  const sumOk = got.data.every(d => {
    const full = expect.find(x => x.id === d.id)
    const qty = full.lines.reduce((s, l) => s + l.qty, 0)
    const amt = full.lines.reduce((s, l) => s + l.qty * l.price, 0)
    return d.lines.length === 0 && d.lineCount === full.lines.length && d.totalQty === qty && Math.abs(d.totalAmount - amt) < 0.001
  })
  check('withLines=false 时汇总数量/金额/品种数与明细一致', sumOk)
  const unsettled = all.filter(d => d.status === 'posted' && !d.settled)
  const u = await c.get('/api/sale/list?page=1&limit=1&status=unsettled')
  check('status=unsettled 计数正确', u.count === unsettled.length, `${u.count} vs ${unsettled.length}`)
  const code = all.find(d => d.code && d.code.startsWith('XS-'))?.code
  const k = await c.get(`/api/sale/list?page=1&limit=50&keyword=${encodeURIComponent(code)}`)
  check('关键词按单号搜索命中', k.data.some(d => d.code === code), code)
}

// k. 服务端模糊搜索
{
  const sample = sql(db, "SELECT d.code, s.name FROM wh_sale_doc d JOIN wh_store s ON s.id=d.store_id WHERE d.code LIKE 'XS-%' ORDER BY d.created_at DESC LIMIT 1")[0]
  const compact = sample[0].replace(/^XS-/, '').split('-').slice(0, 3).join('').slice(2)
  const r1 = await c.get(`/api/doc/search?keyword=${encodeURIComponent(compact)}&type=sale&limit=200`)
  check(`单号去掉“-”也能搜到（${compact}）`, r1.data.some(d => d.code === sample[0]), `${r1.count} 条`)
  const r2 = await c.get(`/api/doc/search?keyword=${encodeURIComponent(sample[1].slice(0, 2) + ' ' + sample[0].slice(-3))}&limit=200`)
  check('多个关键词同时命中（门店名+单号片段）', r2.data.some(d => d.code === sample[0]), `${r2.count} 条`)
  const pname = one(db, "SELECT p.name FROM wh_sale_line l JOIN wh_product p ON p.id=l.product_id LIMIT 1")
  const r3 = await c.get(`/api/doc/search?keyword=${encodeURIComponent(pname)}&type=sale&limit=5`)
  check('按商品名搜索', r3.count > 0, `${pname}: ${r3.count} 条`)
  const r4 = await c.get('/api/doc/search?keyword=%25&limit=5')
  check('输入 % 不会匹配全部', r4.count < Number(one(db, 'SELECT COUNT(*) FROM wh_sale_doc')), `${r4.count} 条`)
}

// l. 安全：账户列表不再返回密码哈希；测试工具接口需要管理员
{
  const anon = new Client(args.base)
  const acc = await anon.get('/api/account/list')
  check('账户列表不含密码哈希', acc.data.every(a => !('passwordHash' in a)) && acc.data.some(a => a.gestureHash === '******'))
  const clear = await anon.post('/api/test/clear-business-data')
  check('未登录不能清空业务数据', clear.code === -1, clear.msg)
  const login = await anon.post('/api/account/login', spAccount)
  check('业务员登录不受影响', login.code === 200 && login.data?.role === 'salesperson')
  const meta = await anon.get('/api/meta/info')
  check('meta/info 返回能力列表', meta.code === 200 && meta.data.features.includes('sale.submit'))
}

console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
