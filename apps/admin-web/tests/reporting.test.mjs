import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import * as vue from 'vue'
const require = createRequire(import.meta.url)
const errors = []
function load(file, names, mocks = {}) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  if (file.endsWith('.vue')) source = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  source += `\nmodule.exports = { ${names} };`
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, console, defineProps: () => ({ accounts: [{ salespersonId: 'a', salespersonName: '甲' }] }), require: id => {
    if (id in mocks) return mocks[id]
    if (id === '@/api/sale') return { getSaleById: async () => null }
    if (id === '@/api/return') return { getReturnById: async () => null }
    if (id === 'vue') return { ...vue, onMounted: () => {} }
    if (id === 'element-plus') return { ElMessage: { error: e => errors.push(e), warning: e => errors.push(e) } }
    if (id === 'vue-router') return { useRouter: () => ({ push() {} }) }
    if (id === '@/utils/reporting') return helpers
    return require(id)
  } })
  return module.exports
}
const helpers = load('utils/reporting.ts', 'docDay, docAmount, docQty, inRange, monthRange, daysInRange')
const doc = (id, date, extra = {}) => ({ id, code: id, date, status: 'posted', salespersonId: 'a', storeId: 'shop', totalAmount: 1000, lines: [{ qty: 10, price: 100 }], ...extra })
const dates = ['2026-07-01', '2026-07-03']
test('销售净额：按退货日期扣款、负数、停用账户、回仓及作废排除', async () => {
  const state = load('pages/system/SalesStats.vue', 'loadData, periodMode, customRange, dailyRows, grandTotal', {
    '@/utils/request': { get: async () => ({ data: [{ id: 'a', role: 'salesperson', status: 'inactive', displayName: '甲' }] }) },
    '@/api/reporting': { getReportSales: async () => [doc('s', dates[0]), doc('void', dates[0], { status: 'voided' })], getReportReturns: async () => [doc('r', dates[1], { returnType: 'vehicle_return', totalAmount: 200 }), doc('w', dates[1], { returnType: 'warehouse_return', totalAmount: 200 })] }
  })
  state.periodMode.value = 'custom'; state.customRange.value = dates
  await state.loadData()
  assert.equal(state.grandTotal.value, 800)
  assert.equal(state.dailyRows.value.find(r => r.date === dates[1]).dayTotal, -200)
})
test('工资：展示后端按单据日期汇总的结果（合计单位分，明细单位元）', async () => {
  let called
  const state = load('components/WageQuery.vue', 'query, accountId, range, result', {
    '@/api/finance': { getWage: async (...a) => { called = a; return { rows: [{ date: dates[0], sale: 100, returns: 0, total: 100 }, { date: dates[1], sale: 0, returns: -20, total: -20 }], total: 8000, undated: [], undatedTotal: 0 } } }
  })
  state.accountId.value = 'a'; state.range.value = dates
  await state.query()
  assert.deepEqual([...called], ['a', ...dates])
  assert.equal(state.result.value.total, 8000)
  assert.equal(state.result.value.rows[1].total, -20)
  assert.equal(state.result.value.label, '甲 · 2026-07-01 至 2026-07-03')
})
test('重复单据：按超市和日期分组，跨账户计入，排除作废及范围外单据', async () => {
  const state = load('components/DuplicateDocs.vue', 'query, range, groups', {
    '@/api/reporting': { getReportSales: async () => [doc('1', dates[0]), doc('2', dates[0], { salespersonId: 'b', status: 'draft' }), doc('3', dates[1]), doc('4', dates[1], { status: 'voided' }), doc('5', '2026-06-01'), doc('6', dates[0], { storeId: 'other' })] },
    '@/api/store': { getStores: async () => [{ id: 'shop', name: '超市' }] }, '@/api/auth': { getSalespersonAccounts: async () => [] }
  })
  state.range.value = dates; await state.query()
  assert.equal(state.groups.value.length, 1)
  assert.equal(state.groups.value[0].docs.length, 2)
})
test('领销汇总：只算主仓到本人车库，赠品和两类退货分别统计，补齐空白日期', async () => {
  const state = load('pages/system/AccountDailyStats.vue', 'query, accountId, range, rows', {
    '@/api/auth': {}, '@/api/stock': { getWarehouses: async () => [{ id: 'main', type: 'main' }, { id: 'car', type: 'vehicle', salespersonId: 'a' }], getTransfers: async () => [doc('t', dates[0], { fromWarehouseId: 'main', toWarehouseId: 'car' }), doc('other', dates[0], { fromWarehouseId: 'car', toWarehouseId: 'main' })] },
    '@/api/reporting': { getReportSales: async () => [doc('s', dates[0]), doc('g', dates[0], { docType: 'gift' })], getReportReturns: async () => [doc('r', dates[0], { returnType: 'vehicle_return' }), doc('w', dates[0], { returnType: 'warehouse_return' })] }
  })
  state.accountId.value = 'a'; state.range.value = dates; await state.query()
  const r = state.rows.value[0]
  assert.equal(r.received, 10); assert.equal(r.sold, 10); assert.equal(r.gift, 10)
  assert.equal(r.returned, 10); assert.equal(r.warehouseReturn, 10); assert.equal(r.netSold, 0)
  assert.equal(state.rows.value.length, 3); assert.equal(state.rows.value[2].received, 0)
})
test('报表完整分页，失败不降级为部分统计', async () => {
  let page = 0
  const api = load('api/reporting.ts', 'getReportSales', { '@/utils/request': { get: async () => ({ data: ++page === 1 ? Array.from({ length: 200 }, (_, i) => ({ id: String(i) })) : [{ id: 'last' }] }) } })
  assert.equal((await api.getReportSales()).length, 201)
  let params
  const ranged = load('api/reporting.ts', 'getReportSales', { '@/utils/request': { get: async (_, opts) => { params = opts.params; return { data: [] } } } })
  await ranged.getReportSales({ startDate: dates[0], endDate: dates[1], withLines: false })
  assert.deepEqual(JSON.parse(JSON.stringify(params)), { page: 1, limit: 200, startDate: dates[0], endDate: dates[1], withLines: false })
  const bad = load('api/reporting.ts', 'getReportSales', { '@/utils/request': { get: async (_, { params }) => { if (params.page === 2) throw new Error('offline'); return { data: Array.from({ length: 200 }, (_, i) => ({ id: String(i) })) } } } })
  await assert.rejects(bad.getReportSales(), /offline/)
})
test('工资：原单已删除的流水作为待核对单列，不计入小计', async () => {
  const state = load('components/WageQuery.vue', 'query, accountId, range, result', {
    '@/api/finance': { getWage: async () => ({
      rows: [{ date: dates[0], sale: 100, returns: 0, total: 100 }], total: 10000,
      undated: [{ id: '2', docId: 'deleted', salespersonId: 'a', commissionAmount: -20, bizType: 'return', createdAt: dates[0] }], undatedTotal: -2000,
    }) }
  })
  state.accountId.value = 'a'; state.range.value = dates; await state.query()
  assert.equal(state.result.value.total, 10000)
  assert.equal(state.result.value.undatedTotal, -2000)
  assert.equal(state.result.value.undated.length, 1)
  assert.equal(state.result.value.rows.length, 1)
})
test('所有场景未触发查询错误', () => assert.deepEqual(errors, []))
