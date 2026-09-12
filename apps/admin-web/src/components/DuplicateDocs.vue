<template>
  <el-card style="margin-top: 16px">
    <template #header>疑似重复单据</template>
    <div class="filters">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" :disabled="loading" />
      <el-input v-model="storeKeyword" placeholder="超市名称（可留空）" style="width: 220px" :disabled="loading" />
      <el-select v-model="kind" style="width: 140px" :disabled="loading">
        <el-option label="销售单" value="sale" /><el-option label="退货单" value="return" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="query">查疑似重复</el-button>
    </div>
    <p>同一天、同一超市、同一类型至少两张单据（含草稿，不含作废；销售单含赠品单）。仅供核对，不会自动作废。</p>
    <p v-if="searched">{{ label }}，共 {{ groups.length }} 组</p>
    <el-table v-if="searched" :data="groups" border max-height="500">
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column prop="store" label="超市" min-width="150" />
      <el-table-column label="张数" width="80"><template #default="{ row }">{{ row.docs.length }}</template></el-table-column>
      <el-table-column label="单据（点击核对）" min-width="350">
        <template #default="{ row }">
          <div v-for="d in row.docs" :key="d.id">
            <el-button link type="primary" @click="router.push(`/stock/${resultKind}/${d.id}`)">{{ d.code }}</el-button>
            {{ d.salesperson }} · {{ d.status === 'draft' ? '草稿' : '已过账' }} · ¥{{ d.amount.toFixed(2) }}
          </div>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getReportSales, getReportReturns } from '@/api/reporting'
import { getStores } from '@/api/store'
import { getSalespersonAccounts } from '@/api/auth'
import { monthRange, docDay, inRange, docAmount } from '@/utils/reporting'
const router = useRouter()
const range = ref<[string, string] | null>(monthRange())
const kind = ref('sale'), resultKind = ref('sale'), storeKeyword = ref(''), label = ref('')
const loading = ref(false), searched = ref(false)
interface Group { date: string; store: string; docs: { id: string; code: string; status: string; salesperson: string; amount: number }[] }
const groups = ref<Group[]>([])
async function query() {
  if (!range.value) return void ElMessage.warning('请选择日期范围')
  const dates: [string, string] = [...range.value]
  const type = kind.value, keyword = storeKeyword.value.trim().toLowerCase()
  loading.value = true; searched.value = false; groups.value = []
  try {
    const [docs, stores, accounts] = await Promise.all([type === 'sale' ? getReportSales() : getReportReturns(), getStores(), getSalespersonAccounts()])
    const storeMap = new Map(stores.map(s => [s.id, s.name]))
    const accountMap = new Map(accounts.map(a => [a.id, a.displayName]))
    const map = new Map<string, Group>()
    for (const d of docs) {
      const date = docDay(d), store = storeMap.get(d.storeId) || d.storeId
      if (!d.storeId || !['draft', 'posted'].includes(d.status) || !inRange(date, dates) || !store.toLowerCase().includes(keyword)) continue
      const key = JSON.stringify([date, d.storeId])
      const group = map.get(key) || { date, store, docs: [] }
      group.docs.push({ id: d.id, code: d.code, status: d.status, salesperson: accountMap.get(d.salespersonId) || d.salespersonId, amount: docAmount(d) })
      map.set(key, group)
    }
    groups.value = [...map.values()].filter(g => g.docs.length >= 2).sort((a, b) => b.date.localeCompare(a.date) || a.store.localeCompare(b.store))
    resultKind.value = type; label.value = `${dates.join(' 至 ')} · ${type === 'sale' ? '销售单' : '退货单'}`; searched.value = true
  } catch (e: any) { ElMessage.error(e.message || '查询失败') }
  finally { loading.value = false }
}
</script>
<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; }
p { font-size: 13px; }
</style>
