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
      <p>{{ result.label }}：{{ result.undated.length ? '已确认日期的提成小计' : '工资合计' }} <b>¥{{ (result.total / 100).toFixed(2) }}</b></p>
      <el-alert v-if="result.undated.length" type="warning" :closable="false" show-icon
        :title="`该账户有 ${result.undated.length} 笔历史流水无法确认单据日期，净额 ¥${(result.undatedTotal / 100).toFixed(2)}。未计入上述小计，当前结果不是完整期间工资。`"
        description="以下待核对流水来自该账户全部历史，无法判断是否属于所选日期范围；流水发生时间和结清时间不作为单据日期。" />
      <el-table :data="result.rows" border max-height="400" show-summary>
        <el-table-column prop="date" label="日期" />
        <el-table-column prop="sale" label="销售净提成（元）" />
        <el-table-column prop="returns" label="退货净提成（元）" />
        <el-table-column prop="total" label="工资合计（元）" />
      </el-table>
      <el-collapse v-if="result.undated.length" style="margin-top: 12px">
        <el-collapse-item title="缺少单据日期的历史流水（待核对）" name="undated">
          <el-table :data="result.undated" border max-height="300">
            <el-table-column prop="docId" label="单据 ID" min-width="180" />
            <el-table-column prop="bizType" label="流水类型" width="120" />
            <el-table-column prop="createdAt" label="流水发生时间（非单据日期）" min-width="200" />
            <el-table-column label="提成（元）" width="120">
              <template #default="{ row }">{{ Number(row.commissionAmount || 0).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </template>
  </el-card>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getCommissionSettlements, getCommissionSettlementDetail, getUnsettledCommissionLedgers } from '@/api/finance'
import { getReportSales, getReportReturns } from '@/api/reporting'
import { getSaleById } from '@/api/sale'
import { getReturnById } from '@/api/return'
import { docDay, monthRange, inRange } from '@/utils/reporting'
import type { CommissionSummary, CommissionLedger } from '@/types'
const props = defineProps<{ accounts: CommissionSummary[] }>()
const accountId = ref('')
const range = ref<[string, string] | null>(monthRange())
const loading = ref(false)
const result = ref<{ label: string; total: number; undated: CommissionLedger[]; undatedTotal: number; rows: { date: string; sale: number; returns: number; total: number }[] } | null>(null)
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
    // 列表缺失时再查原单详情；仍无日期的历史流水单独展示，不猜测所属期间。
    const checked = new Set<string>()
    for (const l of ledgers.values()) {
      if (l.salespersonId !== id) continue
      const isSale = ['sale', 'void_sale', 'gift', 'void_gift'].includes(l.bizType)
      const dateMap = isSale ? saleDates : returnDates
      const key = `${isSale ? 'sale' : 'return'}:${l.docId}`
      if (dateMap.get(l.docId) || checked.has(key)) continue
      checked.add(key)
      if (!l.docId) continue
      const original = await (isSale ? getSaleById(l.docId) : getReturnById(l.docId))
      if (original && docDay(original)) dateMap.set(l.docId, docDay(original))
    }
    const undated: CommissionLedger[] = []
    const daily = new Map<string, { sale: number; returns: number }>()
    for (const l of ledgers.values()) {
      if (l.salespersonId !== id) continue
      const isSale = ['sale', 'void_sale', 'gift', 'void_gift'].includes(l.bizType)
      const date = (isSale ? saleDates : returnDates).get(l.docId)
      if (!date) { undated.push(l); continue }
      if (!inRange(date, dates)) continue
      const row = daily.get(date) || { sale: 0, returns: 0 }
      row[isSale ? 'sale' : 'returns'] += Math.round(Number(l.commissionAmount || 0) * 100)
      daily.set(date, row)
    }
    const rows = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, r]) => ({ date, sale: r.sale / 100, returns: r.returns / 100, total: (r.sale + r.returns) / 100 }))
    result.value = { label: `${props.accounts.find(a => a.salespersonId === id)?.salespersonName || id} · ${dates.join(' 至 ')}`, undated, undatedTotal: undated.reduce((sum, l) => sum + Math.round(Number(l.commissionAmount || 0) * 100), 0), total: [...daily.values()].reduce((s, r) => s + r.sale + r.returns, 0), rows }
  } catch (e: any) { ElMessage.error(e.message || '工资查询失败') }
  finally { loading.value = false }
}
</script>
<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; }
p { font-size: 13px; }
</style>
