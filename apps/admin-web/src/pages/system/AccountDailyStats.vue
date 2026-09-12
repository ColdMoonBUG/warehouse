<template>
  <el-card>
    <template #header>账户每日领货／销售汇总</template>
    <div class="filters">
      <el-select v-model="accountId" placeholder="选择账户" filterable style="width: 200px" :disabled="loading">
        <el-option v-for="a in accounts" :key="a.id" :label="a.displayName" :value="a.id" />
      </el-select>
      <el-date-picker v-model="month" type="month" value-format="YYYY-MM" placeholder="快捷选择月份" :disabled="loading" @change="selectMonth" />
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" :disabled="loading" />
      <el-button type="primary" :loading="loading" @click="query">查询</el-button>
    </div>
    <p>按单据日期统计已过账单据，单位：袋。领货指主仓出库到该账户车库；销售与赠品分列，超市退货与回仓退货分列。此表不是库存余额。</p>
    <template v-if="searched">
      <p>{{ label }}</p>
      <el-table :data="rows" border stripe show-summary max-height="600">
        <el-table-column prop="date" label="日期" width="125" />
        <el-table-column prop="received" label="领货量" />
        <el-table-column prop="sold" label="销售量" />
        <el-table-column prop="gift" label="赠品量" />
        <el-table-column prop="returned" label="超市退货量" />
        <el-table-column prop="warehouseReturn" label="回仓退货量" />
        <el-table-column prop="netSold" label="净销售量" />
      </el-table>
    </template>
  </el-card>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { getSalespersonAccounts } from '@/api/auth'
import { getTransfers, getWarehouses } from '@/api/stock'
import { getReportSales, getReportReturns } from '@/api/reporting'
import { monthRange, docDay, daysInRange, docQty } from '@/utils/reporting'
import type { Account } from '@/types'
const accounts = ref<Account[]>([])
const accountId = ref(''), month = ref(dayjs().format('YYYY-MM')), label = ref('')
const range = ref<[string, string] | null>(monthRange())
const loading = ref(false), searched = ref(false)
interface Row { date: string; received: number; sold: number; gift: number; returned: number; warehouseReturn: number; netSold: number }
const rows = ref<Row[]>([])
function selectMonth(value: string | null) {
  if (value) range.value = [dayjs(value).startOf('month').format('YYYY-MM-DD'), dayjs(value).endOf('month').format('YYYY-MM-DD')]
}
async function query() {
  if (!accountId.value || !range.value) return void ElMessage.warning('请选择账户和日期范围')
  const id = accountId.value, dates: [string, string] = [...range.value]
  loading.value = true; searched.value = false; rows.value = []
  try {
    const [warehouses, transfers, sales, returns] = await Promise.all([getWarehouses(), getTransfers(), getReportSales(), getReportReturns()])
    const vehicleIds = new Set(warehouses.filter(w => w.type === 'vehicle' && w.salespersonId === id).map(w => w.id))
    const mainIds = new Set(warehouses.filter(w => w.type === 'main').map(w => w.id))
    if (!vehicleIds.size) throw new Error('该账户没有关联车库，无法统计领货量')
    const daily = new Map<string, Row>(daysInRange(dates).map(date => [date, { date, received: 0, sold: 0, gift: 0, returned: 0, warehouseReturn: 0, netSold: 0 }]))
    for (const d of transfers) {
      const row = daily.get(docDay(d))
      if (row && d.status === 'posted' && mainIds.has(d.fromWarehouseId) && vehicleIds.has(d.toWarehouseId)) row.received += docQty(d)
    }
    for (const d of sales) {
      const row = daily.get(docDay(d))
      if (row && d.status === 'posted' && d.salespersonId === id) row[d.docType === 'gift' ? 'gift' : 'sold'] += docQty(d)
    }
    for (const d of returns) {
      const row = daily.get(docDay(d))
      if (row && d.status === 'posted' && d.salespersonId === id) row[d.returnType === 'warehouse_return' ? 'warehouseReturn' : 'returned'] += docQty(d)
    }
    rows.value = [...daily.values()].map(r => ({ ...r, netSold: r.sold - r.returned }))
    label.value = `${accounts.value.find(a => a.id === id)?.displayName || id} · ${dates.join(' 至 ')}`
    searched.value = true
  } catch (e: any) { ElMessage.error(e.message || '查询失败') }
  finally { loading.value = false }
}
onMounted(async () => {
  try { accounts.value = await getSalespersonAccounts() }
  catch (e: any) { ElMessage.error(e.message || '账户加载失败') }
})
</script>
<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; }
p { font-size: 13px; }
</style>
