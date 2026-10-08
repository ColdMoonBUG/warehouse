#!/usr/bin/env node
// 写操作等价性测试：在两份相同的数据库副本上，分别对旧后端和新后端执行同一串业务操作
// （入库、出库、销单、现金单、赠送单、退单、回仓、关联、收款、作废、超卖、重复过账……），
// 再比较两边数据库里的单据、库存、库存流水、提成流水是否一致。
// 用法：node scripts/api-regression/write-equivalence.mjs --old http://127.0.0.1:8890 --new http://127.0.0.1:8891 \
//        --old-db wh_old --new-db wh_new --mysql "C:/.../mysql.exe"
//       需要环境变量 WH_ADMIN=admin:<密码哈希>
// 只能在测试库上运行！会写入数据。
import { execFileSync } from 'node:child_process'
import { account } from './credentials.mjs'

const adminAccount = account('WH_ADMIN')

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]])
  return acc
}, []))
const mysqlBin = args.mysql || 'mysql'
const mysqlArgs = (db) => [`--user=${args['db-user'] || 'root'}`, `--host=${args['db-host'] || '127.0.0.1'}`, '--default-character-set=utf8mb4', '-N', '-B', db]
const sql = (db, q) => execFileSync(mysqlBin, [...mysqlArgs(db), '-e', q], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).map(l => l.split('\t'))

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

class Client {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.cookie = '' }
  async call(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const sc = res.headers.get('set-cookie')
    const m = sc && sc.match(/JSESSIONID=[^;]+/)
    if (m) this.cookie = m[0]
    const text = await res.text()
    try { return { http: res.status, ...JSON.parse(text) } } catch { return { http: res.status, code: -999, msg: text.slice(0, 200) } }
  }
  get(p) { return this.call('GET', p) }
  post(p, b) { return this.call('POST', p, b) }
}

async function scenario(c, db) {
  const log = []
  const ids = {}
  const step = async (name, fn) => {
    const r = await fn()
    log.push({ name, code: r.code, msg: r.code === 200 ? '' : r.msg })
    return r
  }
  await c.post('/api/account/login', adminAccount)
  const [p1, p2, p3] = sql(db, "SELECT id, sale_price, purchase_price FROM wh_product WHERE status='active' ORDER BY id LIMIT 3")
  const [store] = sql(db, "SELECT id FROM wh_store WHERE salesperson_id='sp_big' AND status='active' ORDER BY id LIMIT 1")
  const [supplier] = sql(db, 'SELECT id FROM wh_supplier ORDER BY id LIMIT 1')
  const date = today()
  const line = (p, qty, extra = {}) => ({ id: 'x', productId: p[0], qty, boxQty: 0, price: Number(p[1]), ...extra })

  let r = await step('inbound.save', () => c.post('/api/inbound/save', { doc: { supplierId: supplier[0], date, status: 'draft' }, lines: [line(p1, 100, { price: Number(p1[2]) }), line(p2, 50, { price: Number(p2[2]) }), line(p3, 30, { price: Number(p3[2]) })] }))
  ids.inbound = r.data?.id
  await step('inbound.post', () => c.post(`/api/inbound/post/${ids.inbound}`))

  r = await step('transfer.save', () => c.post('/api/transfer/save', { doc: { fromWarehouseId: 'main', toWarehouseId: 'veh_sp_big', date, status: 'draft' }, lines: [{ productId: p1[0], qty: 40, boxQty: 0 }, { productId: p2[0], qty: 20, boxQty: 0 }, { productId: p3[0], qty: 10, boxQty: 0 }] }))
  ids.transfer = r.data?.id
  await step('transfer.post', () => c.post(`/api/transfer/post/${ids.transfer}`))

  const sale = (extra, lines) => ({ doc: { salespersonId: 'sp_big', storeId: store[0], warehouseId: 'veh_sp_big', date, status: 'draft', docType: 'sale', ...extra }, lines })
  r = await step('saleA.save', () => c.post('/api/sale/save', sale({}, [line(p1, 5, { lineNo: 1 }), line(p2, 3, { lineNo: 2 })])))
  ids.saleA = r.data?.id
  await step('saleA.post', () => c.post(`/api/sale/post/${ids.saleA}`))
  r = await step('saleB.save', () => c.post('/api/sale/save', sale({ paymentType: 'cash' }, [line(p1, 5), line(p3, 1)])))
  ids.saleB = r.data?.id
  await step('saleB.post', () => c.post(`/api/sale/post/${ids.saleB}`))
  r = await step('gift.save', () => c.post('/api/sale/save', sale({ docType: 'gift' }, [line(p3, 2)])))
  ids.gift = r.data?.id
  await step('gift.post', () => c.post(`/api/sale/post/${ids.gift}`))

  const ret = (extra, lines) => ({ doc: { salespersonId: 'sp_big', storeId: store[0], fromWarehouseId: 'veh_sp_big', returnType: 'vehicle_return', date, status: 'draft', ...extra }, lines })
  r = await step('return1.save', () => c.post('/api/return/save', ret({}, [line(p1, 2, { lineNo: 1 })])))
  ids.return1 = r.data?.id
  await step('return1.post', () => c.post(`/api/return/post/${ids.return1}`))
  await step('saleA.link', () => c.post(`/api/sale/linkReturn/${ids.saleA}?returnDocId=${ids.return1}`))
  r = await step('return2.save', () => c.post('/api/return/save', ret({ returnType: 'warehouse_return', toWarehouseId: 'return' }, [line(p2, 4)])))
  ids.return2 = r.data?.id
  await step('return2.post', () => c.post(`/api/return/post/${ids.return2}`))

  await step('saleA.settle', () => c.post(`/api/sale/settle/${ids.saleA}`))
  await step('saleA.unsettle', () => c.post(`/api/sale/unsettle/${ids.saleA}`))
  await step('saleA.settle2', () => c.post(`/api/sale/settle/${ids.saleA}`))
  await step('saleA.post.again', () => c.post(`/api/sale/post/${ids.saleA}`))
  await step('saleB.void', () => c.post(`/api/sale/void/${ids.saleB}?cascadeReturn=false`))
  await step('saleB.void.again', () => c.post(`/api/sale/void/${ids.saleB}?cascadeReturn=false`))
  await step('return2.void', () => c.post(`/api/return/void/${ids.return2}`))
  await step('gift.void', () => c.post(`/api/sale/void/${ids.gift}?cascadeReturn=false`))
  await step('transfer.void.insufficient', () => c.post(`/api/transfer/void/${ids.transfer}`))

  r = await step('oversell.save', () => c.post('/api/sale/save', sale({}, [line(p1, 100000)])))
  ids.oversell = r.data?.id
  await step('oversell.post', () => c.post(`/api/sale/post/${ids.oversell}`))
  r = await step('draft.save', () => c.post('/api/sale/save', sale({ remark: 'draft-edit' }, [line(p2, 1)])))
  ids.draft = r.data?.id
  await step('draft.update', () => c.post('/api/sale/save', { doc: { ...sale({ remark: 'edited' }, []).doc, id: ids.draft }, lines: [line(p2, 2), line(p3, 1)] }))
  await step('draft.delete', () => c.post(`/api/sale/delete/${ids.draft}`))
  await step('inbound.void', () => c.post(`/api/inbound/void/${ids.inbound}`))
  return { log, ids }
}

function state(db, ids) {
  const label = Object.fromEntries(Object.entries(ids).filter(([, v]) => v).map(([k, v]) => [v, k]))
  const inList = Object.values(ids).filter(Boolean).map(v => `'${v}'`).join(',') || "''"
  const map = rows => rows.map(r => r.map(v => label[v] || v).join(' | ')).sort()
  return {
    saleDocs: map(sql(db, `SELECT id, code, status, payment_type, doc_type, settled, total_qty, total_amount, COALESCE(return_doc_id,'-') FROM wh_sale_doc WHERE id IN (${inList})`)),
    saleLines: map(sql(db, `SELECT doc_id, product_id, line_no, qty, price, amount FROM wh_sale_line WHERE doc_id IN (${inList})`)),
    returnDocs: map(sql(db, `SELECT id, code, status, return_type, total_qty, total_amount FROM wh_return_doc WHERE id IN (${inList})`)),
    returnLines: map(sql(db, `SELECT doc_id, product_id, line_no, qty, price, amount FROM wh_return_line WHERE doc_id IN (${inList})`)),
    otherDocs: map(sql(db, `SELECT id, status FROM wh_inbound_doc WHERE id IN (${inList}) UNION ALL SELECT id, status FROM wh_transfer_doc WHERE id IN (${inList})`)),
    stock: map(sql(db, 'SELECT warehouse_id, product_id, qty FROM wh_stock')),
    ledger: map(sql(db, `SELECT doc_id, biz_type, warehouse_id, product_id, SUM(qty), COUNT(*) FROM wh_ledger WHERE doc_id IN (${inList}) GROUP BY doc_id, biz_type, warehouse_id, product_id`)),
    commission: map(sql(db, `SELECT doc_id, biz_type, product_id, SUM(qty), SUM(amount), SUM(commission_amount), COUNT(*) FROM wh_commission_ledger WHERE doc_id IN (${inList}) GROUP BY doc_id, biz_type, product_id`)),
  }
}

const oldC = new Client(args.old), newC = new Client(args.new)
const [o, n] = [await scenario(oldC, args['old-db']), await scenario(newC, args['new-db'])]
let failures = 0
o.log.forEach((s, i) => {
  const t = n.log[i]
  const same = s.code === t.code
  if (!same) failures++
  console.log(`${same ? 'OK ' : 'DIFF'} ${s.name.padEnd(28)} old=${s.code}${s.msg ? ' ' + s.msg : ''} | new=${t.code}${t.msg ? ' ' + t.msg : ''}`)
})
const so = state(args['old-db'], o.ids), sn = state(args['new-db'], n.ids)
for (const key of Object.keys(so)) {
  const a = so[key].join('\n'), b = sn[key].join('\n')
  if (a === b) { console.log(`OK  state.${key} (${so[key].length} rows)`); continue }
  failures++
  console.log(`DIFF state.${key}`)
  const sa = new Set(so[key]), sb = new Set(sn[key])
  so[key].filter(x => !sb.has(x)).slice(0, 10).forEach(x => console.log('   old only: ' + x))
  sn[key].filter(x => !sa.has(x)).slice(0, 10).forEach(x => console.log('   new only: ' + x))
}
console.log(failures ? `${failures} difference(s)` : 'ALL EQUAL')
process.exit(failures ? 1 : 0)
