<template>
  <div class="store-finance-page">
    <!-- 筛选栏 -->
    <el-card class="filter-card">
      <div class="filter-row">
        <span class="filter-label">统计周期</span>
        <el-radio-group v-model="periodMode" @change="onPeriodChange">
          <el-radio-button value="today">今天</el-radio-button>
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

    <!-- 顶部汇总 -->
    <div class="summary-bar" v-if="rows.length > 0">
      <span>共 <b>{{ rows.length }}</b> 家超市</span>
      <span>销售额合计：<b class="amount-blue">¥{{ totalSale.toFixed(2) }}</b></span>
      <span>退货额合计：<b class="amount-red">-¥{{ totalReturn.toFixed(2) }}</b></span>
      <span>净销售额：<b class="amount-green">¥{{ totalNet.toFixed(2) }}</b></span>
    </div>

    <!-- 表格 -->
    <el-card>
      <div v-loading="loading">
        <div v-if="rows.length === 0 && !loading" class="empty-tip">{{ periodLabel }} 暂无销售数据</div>

        <el-table
          v-if="rows.length > 0"
          :data="rows"
          border
          stripe
          :default-sort="{ prop: 'netAmount', order: 'descending' }"
        >
          <el-table-column type="index" label="#" width="55" />
          <el-table-column prop="storeName" label="超市名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="saleAmount" label="销售额" width="130" sortable>
            <template #default="{ row }">
              <span class="amount-blue">¥{{ Number(row.saleAmount).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="returnAmount" label="退货额" width="130" sortable>
            <template #default="{ row }">
              <span v-if="Number(row.returnAmount) > 0" class="amount-red">
                -¥{{ Number(row.returnAmount).toFixed(2) }}
              </span>
              <span v-else class="amount-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="netAmount" label="净销售额" width="140" sortable>
            <template #default="{ row }">
              <b class="amount-green">¥{{ Number(row.netAmount).toFixed(2) }}</b>
            </template>
          </el-table-column>
          <el-table-column prop="saleDocCount" label="销单数" width="90" sortable />
          <el-table-column label="占比" width="100">
            <template #default="{ row }">
              <span class="pct">{{ totalNet > 0 ? (Number(row.netAmount) / totalNet * 100).toFixed(1) + '%' : '-' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import request from '@/utils/request'

type PeriodMode = 'today' | 'week' | 'month' | 'year' | 'custom'
const periodMode = ref<PeriodMode>('month')
const customRange = ref<[string, string] | null>(null)
const loading = ref(false)

interface StoreRow {
  storeId: string
  storeName: string
  saleAmount: number
  returnAmount: number
  netAmount: number
  saleDocCount: number
}
const rows = ref<StoreRow[]>([])

function todayStr() { return new Date().toISOString().slice(0, 10) }

function getDateRange(): { start: string; end: string } {
  const today = todayStr()
  const d = new Date()
  if (periodMode.value === 'today') return { start: today, end: today }
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

const totalSale = computed(() => rows.value.reduce((s, r) => s + Number(r.saleAmount), 0))
const totalReturn = computed(() => rows.value.reduce((s, r) => s + Number(r.returnAmount), 0))
const totalNet = computed(() => rows.value.reduce((s, r) => s + Number(r.netAmount), 0))

async function loadData() {
  loading.value = true
  rows.value = []
  try {
    const { start, end } = getDateRange()
    const res = await request.get('/sale/storeRangeSummary', {
      params: { startDate: start, endDate: end }
    })
    rows.value = (res.data || []).map((r: any) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      saleAmount: Number(r.saleAmount || 0),
      returnAmount: Number(r.returnAmount || 0),
      netAmount: Number(r.netAmount || 0),
      saleDocCount: Number(r.saleDocCount || 0),
    }))
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.store-finance-page { display: flex; flex-direction: column; gap: 16px; }

.filter-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.filter-label { font-weight: 600; color: #94a3b8; font-size: 13px; }
.period-label { font-size: 13px; color: #64748b; }

.summary-bar {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 12px 20px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  font-size: 14px;
  flex-wrap: wrap;
}

.amount-blue  { color: #409eff; font-weight: 700; }
.amount-red   { color: #f56c6c; font-weight: 600; }
.amount-green { color: #67c23a; font-weight: 700; }
.amount-muted { color: #c0c4cc; }
.pct { color: #909399; font-size: 13px; }

.empty-tip { text-align: center; padding: 60px; color: #c0c4cc; font-size: 14px; }
</style>
