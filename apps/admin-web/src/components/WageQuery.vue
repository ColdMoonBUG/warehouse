<template>
  <el-card style="margin-top: 16px">
    <template #header>按日期查询工资（提成）</template>
    <div class="filters">
      <el-select v-model="accountId" placeholder="选择账户" filterable style="width: 200px" :disabled="loading">
        <el-option v-for="a in accounts" :key="a.salespersonId" :label="a.salespersonName" :value="a.salespersonId" />
      </el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" :disabled="loading" />
      <el-button type="primary" :loading="loading" @click="query">查询工资</el-button>
    </div>
    <p>按单据日期统计，包含已结清、未结清提成及作废冲销；不含底薪等未录入系统的工资项目。</p>
    <template v-if="result">
      <p>{{ result.label }}：工资合计 <b>¥{{ (result.total / 100).toFixed(2) }}</b></p>
      <el-table :data="result.rows" border max-height="400" show-summary>
        <el-table-column prop="date" label="日期" />
        <el-table-column prop="sale" label="销售净提成（元）" />
        <el-table-column prop="returns" label="退货净提成（元）" />
        <el-table-column prop="total" label="工资合计（元）" />
      </el-table>
    </template>
  </el-card>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getCommissionSettlements, getCommissionSettlementDetail, getUnsettledCommissionLedgers } from '@/api/finance'
import { getReportSales, getReportReturns } from '@/api/reporting'
import { docDay, monthRange, inRange } from '@/utils/reporting'
import type { CommissionSummary, CommissionLedger } from '@/types'
const props = defineProps<{ accounts: CommissionSummary[] }>()
const accountId = ref('')
const range = ref<[string, string] | null>(monthRange())
const loading = ref(false)
const result = ref<{ label: string; total: number; rows: { date: string; sale: number; returns: number; total: number }[] } | null>(null)
async function query() {
  if (!accountId.value || !range.value) return void ElMessage.warning('请选择账户和日期范围')
  const id = accountId.value
  const dates: [string, string] = [...range.value]
  loading.value = true
  result.value = null
  try {
    const [history, sales, returns] = await Promise.all([getCommissionSettlements(), getReportSales(), getReportReturns()])
    const ledgers = new Map<string, CommissionLedger>()
    // 不按结清日期筛选：本期单据可能在其他月份结清。
    for (const settlement of history.filter(s => s.salespersonId === id)) {
      const detail = await getCommissionSettlementDetail(settlement.id)
      detail.ledgers.forEach(l => ledgers.set(l.id, l))
    }
    // 最后读未结流水，避免结清期间把同一笔流水重复计入。
    ;(await getUnsettledCommissionLedgers(id)).forEach(l => ledgers.set(l.id, l))
    const saleDates = new Map(sales.map(d => [d.id, docDay(d)]))
    const returnDates = new Map(returns.map(d => [d.id, docDay(d)]))
    const daily = new Map<string, { sale: number; returns: number }>()
    for (const l of ledgers.values()) {
      if (l.salespersonId !== id) continue
      const isSale = ['sale', 'void_sale', 'gift', 'void_gift'].includes(l.bizType)
      const date = (isSale ? saleDates : returnDates).get(l.docId)
      if (!date) throw new Error('部分提成流水缺少原始单据日期，无法准确计算期间工资')
      if (!inRange(date, dates)) continue
      const row = daily.get(date) || { sale: 0, returns: 0 }
      row[isSale ? 'sale' : 'returns'] += Math.round(Number(l.commissionAmount || 0) * 100)
      daily.set(date, row)
    }
    const rows = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, sale: r.sale / 100, returns: r.returns / 100, total: (r.sale + r.returns) / 100 }))
    result.value = { label: `${props.accounts.find(a => a.salespersonId === id)?.salespersonName || id} · ${dates.join(' 至 ')}`, total: [...daily.values()].reduce((s, r) => s + r.sale + r.returns, 0), rows }
  } catch (e: any) { ElMessage.error(e.message || '工资查询失败') }
  finally { loading.value = false }
}
</script>
<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; }
p { font-size: 13px; }
</style>
