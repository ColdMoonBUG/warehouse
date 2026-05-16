<template>
  <div class="sales-stats-page">
    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <div class="filter-row">
        <span class="filter-label">统计周期</span>
        <el-radio-group v-model="periodMode" @change="onPeriodChange">
          <el-radio-button value="week">本周</el-radio-button>
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="year">本年</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <template v-if="periodMode === 'custom'">
          <el-date-picker
            v-model="customRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width:260px"
            @change="loadData"
          />
        </template>
        <span class="period-label">{{ periodLabel }}</span>
        <el-button :loading="loading" @click="loadData" style="margin-left:auto">刷新</el-button>
      </div>
    </el-card>

    <!-- 顶部汇总卡片 -->
    <div class="summary-cards" v-if="!loading">
      <el-card class="summary-card" v-for="sp in salespersonList" :key="sp.id">
        <div class="card-name">{{ sp.displayName }}</div>
        <div class="card-value">¥{{ (spTotals[sp.id] || 0).toFixed(2) }}</div>
        <div class="card-label">期间销售总额</div>
        <div class="card-sub">{{ spDocCount[sp.id] || 0 }} 张销单</div>
      </el-card>
      <el-card class="summary-card total-card">
        <div class="card-name">合计</div>
        <div class="card-value total-value">¥{{ grandTotal.toFixed(2) }}</div>
        <div class="card-label">三车合计销售额</div>
        <div class="card-sub">{{ totalDocCount }} 张销单</div>
      </el-card>
    </div>

    <!-- 每日销售明细表 -->
    <el-card class="table-card">
      <template #header>
        <div class="table-header">
          <span>📊 每日销售额（{{ periodLabel }}）</span>
          <span class="header-sub">仅统计已过账销单（不含作废）</span>
        </div>
      </template>

      <el-table
        :data="dailyRows"
        border
        stripe
        max-height="600"
        v-loading="loading"
        show-summary
        :summary-method="getSummary"
      >
        <el-table-column prop="date" label="日期" width="130" sortable fixed />
        <el-table-column
          v-for="sp in salespersonList"
          :key="sp.id"
          :label="sp.displayName"
          :prop="sp.id"
          width="130"
          sortable
        >
          <template #default="{ row }">
            <span v-if="row[sp.id] > 0" class="amount-cell">¥{{ row[sp.id].toFixed(2) }}</span>
            <span v-else class="empty-cell">-</span>
          </template>
        </el-table-column>
        <el-table-column label="当日合计" width="130" sortable prop="dayTotal">
          <template #default="{ row }">
            <b class="day-total">¥{{ row.dayTotal.toFixed(2) }}</b>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import request from '@/utils/request'

// ---- 周期选择 ----
type PeriodMode = 'week' | 'month' | 'year' | 'custom'
const periodMode = ref<PeriodMode>('month')
const customRange = ref<[string, string] | null>(null)
const loading = ref(false)

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getDateRange(): { start: string; end: string } {
  const today = todayStr()
  const d = new Date()
  if (periodMode.value === 'week') {
    const day = d.getDay() || 7
    const mon = new Date(d)
    mon.setDate(d.getDate() - day + 1)
    return { start: mon.toISOString().slice(0, 10), end: today }
  }
  if (periodMode.value === 'month') {
    return {
      start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      end: today
    }
  }
  if (periodMode.value === 'year') {
    return { start: `${d.getFullYear()}-01-01`, end: today }
  }
  if (periodMode.value === 'custom' && customRange.value) {
    return { start: customRange.value[0], end: customRange.value[1] }
  }
  return { start: today, end: today }
}

const periodLabel = computed(() => {
  const { start, end } = getDateRange()
  return start === end ? start : `${start} ~ ${end}`
})

function onPeriodChange() {
  if (periodMode.value !== 'custom') loadData()
}

// ---- 数据 ----
interface SpInfo { id: string; displayName: string }
const salespersonList = ref<SpInfo[]>([])

interface DailyRow {
  date: string
  dayTotal: number
  [spId: string]: number | string
}
const dailyRows = ref<DailyRow[]>([])

const spTotals = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}
  for (const row of dailyRows.value) {
    for (const sp of salespersonList.value) {
      result[sp.id] = (result[sp.id] || 0) + (Number(row[sp.id]) || 0)
    }
  }
  return result
})

const spDocCount = computed<Record<string, number>>(() => {
  // docCount 从原始数据里统计，这里用 dailyRows 中有值的天数 * 约估不准，改从 rawDocs 统计
  const result: Record<string, number> = {}
  for (const d of rawDocs.value) {
    const spId = d.salespersonId
    result[spId] = (result[spId] || 0) + 1
  }
  return result
})

const grandTotal = computed(() =>
  Object.values(spTotals.value).reduce((s, v) => s + v, 0)
)

const totalDocCount = computed(() =>
  Object.values(spDocCount.value).reduce((s, v) => s + v, 0)
)

// 原始销单列表（用于 docCount 统计）
const rawDocs = ref<any[]>([])

async function loadData() {
  loading.value = true
  try {
    // 1. 加载业务员列表
    const accRes = await request.get('/account/list')
    const accounts: any[] = accRes.data || []
    salespersonList.value = accounts
      .filter((a: any) => a.role === 'salesperson' && a.status === 'active')
      .map((a: any) => ({ id: a.id, displayName: a.displayName || a.username }))
      .sort((a, b) => {
        const order: Record<string, number> = { '大车': 0, '小车': 1, '三车': 2 }
        return (order[a.displayName] ?? 9) - (order[b.displayName] ?? 9)
      })

    // 2. 拉取范围内所有已过账销单（分页，每次200）
    const { start, end } = getDateRange()
    let page = 1
    const allDocs: any[] = []
    while (true) {
      const res = await request.get('/sale/list', { params: { page, limit: 200 } })
      const list: any[] = res.data || []
      // 过滤状态和日期
      for (const d of list) {
        if (d.status !== 'posted') continue
        const docDate = (d.docDate || d.date || '').slice(0, 10)
        if (docDate >= start && docDate <= end) allDocs.push(d)
      }
      // 如果本页最后一条日期已早于 start，停止翻页
      if (list.length < 200) break
      const lastDate = (list[list.length - 1]?.docDate || list[list.length - 1]?.date || '').slice(0, 10)
      if (lastDate < start) break
      page++
      if (page > 50) break // 安全上限
    }
    rawDocs.value = allDocs

    // 3. 按日期 × 业务员聚合
    const dateMap = new Map<string, DailyRow>()
    // 生成日期范围内所有日期（确保连续）
    const cur = new Date(start)
    const endDate = new Date(end)
    while (cur <= endDate) {
      const dateKey = cur.toISOString().slice(0, 10)
      const row: DailyRow = { date: dateKey, dayTotal: 0 }
      for (const sp of salespersonList.value) row[sp.id] = 0
      dateMap.set(dateKey, row)
      cur.setDate(cur.getDate() + 1)
    }

    for (const d of allDocs) {
      const dateKey = (d.docDate || d.date || '').slice(0, 10)
      const spId = d.salespersonId
      const amount = Number(d.totalAmount || 0)
      if (!dateMap.has(dateKey)) continue
      const row = dateMap.get(dateKey)!
      row[spId] = (Number(row[spId]) || 0) + amount
      row.dayTotal += amount
    }

    dailyRows.value = [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date))
  } finally {
    loading.value = false
  }
}

// 合计行
function getSummary({ columns }: any) {
  return columns.map((col: any, index: number) => {
    if (index === 0) return '合计'
    const sp = salespersonList.value.find(s => s.id === col.property)
    if (sp) return `¥${(spTotals.value[sp.id] || 0).toFixed(2)}`
    if (col.property === 'dayTotal') return `¥${grandTotal.value.toFixed(2)}`
    return ''
  })
}

onMounted(loadData)
</script>

<style scoped>
.sales-stats-page { display: flex; flex-direction: column; gap: 16px; }

.filter-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.filter-label { font-weight: 600; color: #94a3b8; font-size: 13px; }
.period-label { font-size: 13px; color: #64748b; }

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 900px) { .summary-cards { grid-template-columns: repeat(2, 1fr); } }

.summary-card :deep(.el-card__body) { padding: 20px; text-align: center; }
.card-name { font-size: 14px; font-weight: 600; color: #64748b; margin-bottom: 8px; }
.card-value { font-size: 26px; font-weight: 700; color: #409eff; line-height: 1.2; }
.total-card :deep(.el-card__body) { background: #f0f9ff; }
.total-value { color: #1d4ed8; font-size: 28px; }
.card-label { font-size: 12px; color: #94a3b8; margin-top: 6px; }
.card-sub { font-size: 12px; color: #64748b; margin-top: 4px; }

.table-card { }
.table-header { display: flex; align-items: center; gap: 12px; }
.header-sub { font-size: 12px; color: #94a3b8; }

.amount-cell { color: #409eff; font-weight: 600; }
.empty-cell { color: #c0c4cc; }
.day-total { color: #1d4ed8; font-size: 14px; }
</style>
