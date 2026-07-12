<template>
  <div class="stats-page">
    <!-- 时间范围选择 -->
    <el-card class="filter-card">
      <div class="filter-row">
        <span class="filter-label">统计周期</span>
        <el-radio-group v-model="periodMode" @change="onPeriodChange">
          <el-radio-button value="today">今天</el-radio-button>
          <el-radio-button value="week">本周</el-radio-button>
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="quarter">近3个月</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <template v-if="periodMode === 'custom'">
          <el-date-picker
            v-model="customRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="loadData"
            style="width: 260px"
          />
        </template>
        <span class="period-label">{{ periodLabel }}</span>
        <el-button :loading="loading" @click="loadData" style="margin-left: auto">刷新</el-button>
      </div>
      <!-- 商品筛选 -->
      <div class="filter-row" style="margin-top: 10px">
        <span class="filter-label">商品筛选</span>
        <el-select
          v-model="selectedProductId"
          clearable
          filterable
          placeholder="全部商品（可搜索名称）"
          style="width: 260px"
        >
          <el-option
            v-for="p in productOptions"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
        <span v-if="selectedProductId" class="filter-hint">
          已筛选：{{ productMap[selectedProductId] }}
        </span>
      </div>
    </el-card>

    <!-- 汇总卡片 -->
    <div class="summary-cards">
      <el-card class="summary-card">
        <div class="card-value inbound-color">{{ inboundSummary.displayQty }}</div>
        <div class="card-label">进货总量</div>
        <div class="card-sub">{{ inboundSummary.docCount }} 张入库单</div>
      </el-card>
      <el-card class="summary-card">
        <div class="card-value inbound-color">¥{{ inboundSummary.totalAmount.toFixed(2) }}</div>
        <div class="card-label">进货总金额</div>
        <div class="card-sub">按进货价计算</div>
      </el-card>
      <el-card class="summary-card">
        <div class="card-value return-color">{{ returnSummary.displayQty }}</div>
        <div class="card-label">退货总量</div>
        <div class="card-sub">{{ returnSummary.docCount }} 张退货单（含车库+回仓）</div>
      </el-card>
      <el-card class="summary-card">
        <div class="card-value loss-color">¥{{ returnSummary.totalAmount.toFixed(2) }}</div>
        <div class="card-label">退货总亏损</div>
        <div class="card-sub">回仓退货 ¥{{ returnSummary.warehouseReturnAmount.toFixed(2) }}</div>
      </el-card>
      <el-card v-if="selectedProductId" class="summary-card">
        <div class="card-value transfer-color">{{ transferSummary.displayQty }}</div>
        <div class="card-label">出库总量</div>
        <div class="card-sub">{{ transferSummary.docCount }} 张出库单</div>
      </el-card>
      <el-card v-if="selectedProductId" class="summary-card">
        <div class="card-value transfer-color">{{ transferSummary.toWarehouseCount.toLocaleString() }}</div>
        <div class="card-label">涉及目标仓库</div>
        <div class="card-sub">按每天出库去向统计</div>
      </el-card>
    </div>

    <!-- 进货统计 -->
    <el-card class="table-card">
      <template #header>
        <div class="table-header">
          <span>📦 进货统计（按日期）</span>
          <span class="header-sub">共 {{ inboundByDate.length }} 天有入库</span>
        </div>
      </template>
      <el-table :data="inboundByDate" border stripe max-height="400" v-loading="loading">
        <el-table-column prop="date" label="日期" width="130" sortable />
        <el-table-column prop="docCount" label="入库单数" width="100" sortable />
        <el-table-column label="总量" width="140" sortable prop="totalQty">
          <template #default="{ row }">{{ row.displayQty }}</template>
        </el-table-column>
        <el-table-column label="总金额" width="130" sortable prop="totalAmount">
          <template #default="{ row }">¥{{ row.totalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="商品明细" min-width="300">
          <template #default="{ row }">
            <div class="product-chips">
              <el-tag
                v-for="p in row.products.slice(0, 6)"
                :key="p.productId"
                size="small"
                type="info"
              >{{ p.name }} {{ formatBoxBag(p.qty, p.productId) }}</el-tag>
              <span v-if="row.products.length > 6" class="more-tag">+{{ row.products.length - 6 }}种</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 出库统计（按日期/仓库） -->
    <el-card v-if="selectedProductId" class="table-card">
      <template #header>
        <div class="table-header">
          <span>🚚 出库统计（按日期 / 目标仓库）</span>
          <span class="header-sub">商品：{{ productMap[selectedProductId] }}</span>
        </div>
      </template>
      <el-table :data="transferByDateWarehouse" border stripe max-height="400" v-loading="loading">
        <el-table-column prop="date" label="日期" width="130" sortable />
        <el-table-column prop="toWarehouseName" label="目标仓库" width="150" />
        <el-table-column prop="docCount" label="出库单数" width="100" sortable />
        <el-table-column label="总量" width="140" sortable prop="totalQty">
          <template #default="{ row }">{{ formatBoxBag(row.totalQty, selectedProductId) }}</template>
        </el-table-column>
        <el-table-column label="出库单号" min-width="260">
          <template #default="{ row }">
            <div class="product-chips">
              <el-tag v-for="code in row.codes.slice(0, 4)" :key="code" size="small" type="info">{{ code }}</el-tag>
              <span v-if="row.codes.length > 4" class="more-tag">+{{ row.codes.length - 4 }}张</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 退货统计（按业务员） -->
    <el-card class="table-card">
      <template #header>
        <div class="table-header">
          <span>↩️ 退货回仓统计（按业务员）</span>
          <span class="header-sub">{{ periodLabel }}</span>
        </div>
      </template>
      <el-table :data="returnBySalesperson" border stripe v-loading="loading">
        <el-table-column prop="salespersonName" label="业务员" width="120" />
        <el-table-column prop="docCount" label="退货单数" width="100" sortable />
        <el-table-column label="总量" width="140" sortable prop="totalQty">
          <template #default="{ row }">{{ row.displayQty }}</template>
        </el-table-column>
        <el-table-column label="总金额" width="130" sortable prop="totalAmount">
          <template #default="{ row }">¥{{ row.totalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="车库退货" width="120">
          <template #default="{ row }">{{ row.vehicleDisplayQty }}</template>
        </el-table-column>
        <el-table-column label="回仓退货" width="120">
          <template #default="{ row }">{{ row.warehouseDisplayQty }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button link @click="openReturnDetail(row)">明细</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 退货统计（按日期） -->
    <el-card class="table-card">
      <template #header>
        <div class="table-header">
          <span>↩️ 退货回仓统计（按日期）</span>
        </div>
      </template>
      <el-table :data="returnByDate" border stripe max-height="400" v-loading="loading">
        <el-table-column prop="date" label="日期" width="130" sortable />
        <el-table-column prop="docCount" label="退货单数" width="100" sortable />
        <el-table-column label="总量" width="140" sortable prop="totalQty">
          <template #default="{ row }">{{ row.displayQty }}</template>
        </el-table-column>
        <el-table-column label="总金额" width="130" sortable prop="totalAmount">
          <template #default="{ row }">¥{{ row.totalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="涉及业务员" min-width="200">
          <template #default="{ row }">
            <div class="product-chips">
              <el-tag v-for="sp in row.salespersons" :key="sp" size="small">{{ sp }}</el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 退货明细弹窗 -->
    <el-dialog
      v-model="detailDlg"
      :title="`${currentSp?.salespersonName || ''} 退货明细`"
      width="860px"
    >
      <el-table :data="currentSpDocs" border stripe max-height="500">
        <el-table-column prop="code" label="单号" width="180" />
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.returnType === 'warehouse_return' ? 'warning' : 'success'" size="small">
              {{ row.returnType === 'warehouse_return' ? '回仓' : '车库' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="总袋数" width="90">
          <template #default="{ row }">{{ row.lines.reduce((s: number, l: any) => s + l.qty, 0) }}</template>
        </el-table-column>
        <el-table-column label="总金额" width="110">
          <template #default="{ row }">¥{{ row.lines.reduce((s: number, l: any) => s + l.qty * l.price, 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'posted' ? 'success' : row.status === 'voided' ? 'danger' : 'info'" size="small">
              {{ row.status === 'posted' ? '已过账' : row.status === 'voided' ? '已作废' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { getAllInbounds, getAllReturns, getAllAccounts } from '@/api/stats'
import { getProducts } from '@/api/product'
import { getTransfers, getWarehouses } from '@/api/stock'
import { getPackSize } from '@/utils/pack'
import type { InboundDoc, ReturnDoc, TransferDoc, Warehouse } from '@/types'

const router = useRouter()
const loading = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ---- 时间范围 ----
type PeriodMode = 'today' | 'week' | 'month' | 'quarter' | 'custom'
const periodMode = ref<PeriodMode>('quarter')
const customRange = ref<[string, string] | null>(null)

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateRange(): { start: string; end: string } {
  const today = todayStr()
  if (periodMode.value === 'today') return { start: today, end: today }
  if (periodMode.value === 'week') {
    const d = new Date()
    const day = d.getDay() || 7
    const mon = new Date(d)
    mon.setDate(d.getDate() - day + 1)
    return { start: `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`, end: today }
  }
  if (periodMode.value === 'month') {
    const d = new Date()
    return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: today }
  }
  if (periodMode.value === 'quarter') {
    const d = new Date()
    d.setMonth(d.getMonth() - 2)
    return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: today }
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
const allInbounds = ref<InboundDoc[]>([])
const allReturns = ref<ReturnDoc[]>([])
const allTransfers = ref<TransferDoc[]>([])
const accountMap = ref<Record<string, string>>({})
const productMap = ref<Record<string, string>>({}) // productId -> name
const productBoxQtyMap = ref<Record<string, number>>({}) // productId -> boxQty
const warehouseMap = ref<Record<string, string>>({})

// 商品筛选
const selectedProductId = ref<string>('')
interface ProductOption { id: string; name: string }
const productOptions = ref<ProductOption[]>([])

function inRange(date: string, start: string, end: string) {
  // 兼容 "2026-05-14T00:00:00" 和 "2026-05-14" 两种格式
  const d = (date || '').slice(0, 10)
  return d >= start && d <= end
}

function matchesSelectedProduct(line: { productId?: string }) {
  return !selectedProductId.value || line.productId === selectedProductId.value
}

function formatBoxBag(qty: number, productId?: string): string {
  const boxQty = productId ? (productBoxQtyMap.value[productId] || 1) : 1
  if (boxQty <= 1) return `${qty}袋`
  const boxes = Math.floor(qty / boxQty)
  const bags = qty % boxQty
  if (boxes === 0) return `${bags}袋`
  if (bags === 0) return `${boxes}箱`
  return `${boxes}箱${bags}袋`
}

function formatMixedBoxBag(lines: Array<{ productId?: string; qty: number }>): string {
  let totalBoxes = 0
  let totalBags = 0
  for (const l of lines) {
    const boxQty = l.productId ? (productBoxQtyMap.value[l.productId] || 1) : 1
    if (boxQty <= 1) {
      totalBags += l.qty
    } else {
      totalBoxes += Math.floor(l.qty / boxQty)
      totalBags += l.qty % boxQty
    }
  }
  if (totalBoxes === 0) return `${totalBags}袋`
  if (totalBags === 0) return `${totalBoxes}箱`
  return `${totalBoxes}箱${totalBags}袋`
}

const filteredInbounds = computed(() => {
  const { start, end } = getDateRange()
  return allInbounds.value.filter(d => {
    if (d.status !== 'posted' || !inRange(d.date, start, end)) return false
    if (selectedProductId.value) {
      return d.lines.some(l => l.productId === selectedProductId.value)
    }
    return true
  })
})

const filteredReturns = computed(() => {
  const { start, end } = getDateRange()
  return allReturns.value.filter(d => {
    if (d.status !== 'posted' || !inRange(d.date, start, end)) return false
    if (selectedProductId.value) {
      return d.lines.some(l => l.productId === selectedProductId.value)
    }
    return true
  })
})

// ---- 进货汇总 ----
const inboundSummary = computed(() => {
  const docs = filteredInbounds.value
  let totalQty = 0, totalAmount = 0
  const lines: Array<{ productId?: string; qty: number }> = []
  for (const d of docs) {
    for (const l of d.lines) {
      if (!matchesSelectedProduct(l)) continue
      totalQty += l.qty
      totalAmount += l.qty * l.price
      lines.push(l)
    }
  }
  return { docCount: docs.length, totalQty, totalAmount, displayQty: formatMixedBoxBag(lines) }
})

// ---- 退货汇总（全部退货 = 亏损） ----
const returnSummary = computed(() => {
  const docs = filteredReturns.value
  let totalQty = 0, totalAmount = 0
  let warehouseReturnAmount = 0
  const lines: Array<{ productId?: string; qty: number }> = []
  const whLines: Array<{ productId?: string; qty: number }> = []
  for (const d of docs) {
    for (const l of d.lines) {
      if (!matchesSelectedProduct(l)) continue
      totalQty += l.qty
      totalAmount += l.qty * l.price
      lines.push(l)
      if (d.returnType === 'warehouse_return') {
        warehouseReturnAmount += l.qty * l.price
        whLines.push(l)
      }
    }
  }
  return {
    docCount: docs.length, totalQty, totalAmount,
    warehouseReturnAmount,
    displayQty: formatMixedBoxBag(lines),
    whDisplayQty: formatMixedBoxBag(whLines),
  }
})

const filteredTransfers = computed(() => {
  const { start, end } = getDateRange()
  return allTransfers.value.filter(d => {
    if (d.status !== 'posted' || !inRange(d.date, start, end)) return false
    if (selectedProductId.value) {
      return d.lines.some(l => l.productId === selectedProductId.value)
    }
    return true
  })
})

const transferSummary = computed(() => {
  const docs = filteredTransfers.value
  let totalQty = 0
  const warehouseSet = new Set<string>()
  const lines: Array<{ productId?: string; qty: number }> = []
  for (const d of docs) {
    for (const l of d.lines) {
      if (!matchesSelectedProduct(l)) continue
      totalQty += l.qty
      lines.push(l)
    }
    warehouseSet.add(d.toWarehouseId)
  }
  return { docCount: docs.length, totalQty, toWarehouseCount: warehouseSet.size, displayQty: formatMixedBoxBag(lines) }
})

// ---- 进货按日期 ----
const inboundByDate = computed(() => {
  const map = new Map<string, { date: string; docCount: number; totalQty: number; totalAmount: number; products: Map<string, { productId: string; name: string; qty: number }> }>()
  for (const doc of filteredInbounds.value) {
    const dateKey = (doc.date || '').slice(0, 10)
    if (!map.has(dateKey)) {
      map.set(dateKey, { date: dateKey, docCount: 0, totalQty: 0, totalAmount: 0, products: new Map() })
    }
    const entry = map.get(dateKey)!
    entry.docCount++
    for (const line of doc.lines) {
      if (!matchesSelectedProduct(line)) continue
      entry.totalQty += line.qty
      entry.totalAmount += line.qty * line.price
      const existing = entry.products.get(line.productId)
      if (existing) {
        existing.qty += line.qty
      } else {
        entry.products.set(line.productId, { productId: line.productId, name: productMap.value[line.productId] || line.productId, qty: line.qty })
      }
    }
  }
  return [...map.values()]
    .map(e => ({ ...e, products: [...e.products.values()], displayQty: formatMixedBoxBag([...e.products.values()]) }))
    .sort((a, b) => b.date.localeCompare(a.date))
})

// ---- 出库按日期 / 目标仓库 ----
const transferByDateWarehouse = computed(() => {
  const map = new Map<string, {
    date: string
    toWarehouseId: string
    toWarehouseName: string
    docCount: number
    totalQty: number
    codes: string[]
  }>()

  for (const doc of filteredTransfers.value) {
    const dateKey = (doc.date || '').slice(0, 10)
    const warehouseId = doc.toWarehouseId || ''
    const key = `${dateKey}__${warehouseId}`
    if (!map.has(key)) {
      map.set(key, {
        date: dateKey,
        toWarehouseId: warehouseId,
        toWarehouseName: warehouseMap.value[warehouseId] || warehouseId || '-',
        docCount: 0,
        totalQty: 0,
        codes: [],
      })
    }
    const entry = map.get(key)!
    const matchedQty = doc.lines.reduce((sum, line) => sum + (matchesSelectedProduct(line) ? line.qty : 0), 0)
    if (matchedQty <= 0) continue
    entry.docCount++
    entry.totalQty += matchedQty
    entry.codes.push(doc.code)
  }

  return [...map.values()]
    .map(e => ({ ...e, codes: [...e.codes] }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.toWarehouseName.localeCompare(b.toWarehouseName, 'zh-CN'))
})

// ---- 退货按业务员 ----
const returnBySalesperson = computed(() => {
  const map = new Map<string, {
    salespersonId: string; salespersonName: string
    docCount: number; totalQty: number; totalAmount: number
    vehicleReturnQty: number; warehouseReturnQty: number
    lines: Array<{ productId?: string; qty: number }>
    vehicleLines: Array<{ productId?: string; qty: number }>
    warehouseLines: Array<{ productId?: string; qty: number }>
  }>()
  for (const doc of filteredReturns.value) {
    const spId = doc.salespersonId
    const spName = accountMap.value[spId] || spId
    if (!map.has(spId)) {
      map.set(spId, { salespersonId: spId, salespersonName: spName, docCount: 0, totalQty: 0, totalAmount: 0, vehicleReturnQty: 0, warehouseReturnQty: 0, lines: [], vehicleLines: [], warehouseLines: [] })
    }
    const entry = map.get(spId)!
    entry.docCount++
    for (const l of doc.lines) {
      if (!matchesSelectedProduct(l)) continue
      entry.totalQty += l.qty
      entry.totalAmount += l.qty * l.price
      entry.lines.push(l)
      if (doc.returnType === 'warehouse_return') {
        entry.warehouseReturnQty += l.qty
        entry.warehouseLines.push(l)
      } else {
        entry.vehicleReturnQty += l.qty
        entry.vehicleLines.push(l)
      }
    }
  }
  return [...map.values()]
    .map(e => ({
      ...e,
      displayQty: formatMixedBoxBag(e.lines),
      vehicleDisplayQty: formatMixedBoxBag(e.vehicleLines),
      warehouseDisplayQty: formatMixedBoxBag(e.warehouseLines),
    }))
    .sort((a, b) => b.totalQty - a.totalQty)
})

// ---- 退货按日期 ----
const returnByDate = computed(() => {
  const map = new Map<string, { date: string; docCount: number; totalQty: number; totalAmount: number; salespersons: Set<string>; lines: Array<{ productId?: string; qty: number }> }>()
  for (const doc of filteredReturns.value) {
    const dateKey = (doc.date || '').slice(0, 10)
    if (!map.has(dateKey)) {
      map.set(dateKey, { date: dateKey, docCount: 0, totalQty: 0, totalAmount: 0, salespersons: new Set(), lines: [] })
    }
    const entry = map.get(dateKey)!
    entry.docCount++
    for (const l of doc.lines) {
      if (!matchesSelectedProduct(l)) continue
      entry.totalQty += l.qty
      entry.totalAmount += l.qty * l.price
      entry.lines.push(l)
    }
    entry.salespersons.add(accountMap.value[doc.salespersonId] || doc.salespersonId)
  }
  return [...map.values()]
    .map(e => ({ ...e, salespersons: [...e.salespersons], displayQty: formatMixedBoxBag(e.lines) }))
    .sort((a, b) => b.date.localeCompare(a.date))
})

// ---- 明细弹窗 ----
const detailDlg = ref(false)
const currentSp = ref<{ salespersonId: string; salespersonName: string } | null>(null)
const currentSpDocs = computed(() => {
  if (!currentSp.value) return []
  return filteredReturns.value.filter(d => d.salespersonId === currentSp.value!.salespersonId)
    .sort((a, b) => b.date.localeCompare(a.date))
})

function openReturnDetail(row: { salespersonId: string; salespersonName: string }) {
  currentSp.value = row
  detailDlg.value = true
}

// ---- 加载 ----
async function loadData() {
  if (loading.value) return
  loading.value = true
  try {
    const [inbounds, returns, transfers, accounts, products, warehouses] = await Promise.all([
      getAllInbounds(),
      getAllReturns(),
      getTransfers(),
      getAllAccounts(),
      getProducts(),
      getWarehouses(),
    ])
    allInbounds.value = inbounds
    allReturns.value = returns
    allTransfers.value = transfers
    // 建立 id -> displayName 映射
    const map: Record<string, string> = {}
    for (const acc of accounts) {
      map[acc.id] = acc.displayName || acc.username
    }
    accountMap.value = map
    // 建立 productId -> name 映射
    const pmap: Record<string, string> = {}
    const pbmap: Record<string, number> = {}
    for (const p of products) {
      pmap[p.id] = p.name
      pbmap[p.id] = p.boxQty || 1
    }
    productMap.value = pmap
    productBoxQtyMap.value = pbmap
    productOptions.value = products.map((p: any) => ({ id: p.id, name: p.name }))
      .sort((a: ProductOption, b: ProductOption) => a.name.localeCompare(b.name, 'zh-CN'))
    const wmap: Record<string, string> = {}
    for (const w of warehouses as Warehouse[]) {
      wmap[w.id] = w.name
    }
    warehouseMap.value = wmap
  } catch (e: any) {
    if (e?.message === '未登录') { router.replace('/login'); return }
  } finally {
    loading.value = false
  }
}

function startAutoRefresh() {
  if (refreshTimer) return
  refreshTimer = setInterval(() => {
    void loadData()
  }, 60_000)
}

function stopAutoRefresh() {
  if (!refreshTimer) return
  clearInterval(refreshTimer)
  refreshTimer = null
}

onMounted(() => {
  void loadData()
  startAutoRefresh()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.stats-page { display: flex; flex-direction: column; gap: 16px; }

.filter-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.filter-label { font-weight: 600; color: #94a3b8; font-size: 13px; }
.period-label { font-size: 13px; color: #64748b; }
.filter-hint { font-size: 13px; color: #409eff; font-weight: 500; }

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 900px) {
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
}

.summary-card :deep(.el-card__body) { padding: 20px; text-align: center; }
.card-value { font-size: 28px; font-weight: 700; line-height: 1.2; }
.card-label { font-size: 13px; color: #94a3b8; margin-top: 6px; }
.card-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
.inbound-color { color: #3b82f6; }
.return-color { color: #f59e0b; }
.transfer-color { color: #10b981; }
.loss-color { color: #dc2626; }

.table-card { }
.table-header { display: flex; align-items: center; gap: 12px; }
.header-sub { font-size: 12px; color: #94a3b8; }

.product-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.more-tag { font-size: 12px; color: #94a3b8; align-self: center; }
</style>
