<template>
  <div class="search-page">
    <el-card>
      <template #header>
        <span>单据查询</span>
      </template>

      <div class="search-bar">
        <el-input
          v-model="keyword"
          placeholder="输入单号、门店名、业务员名称..."
          clearable
          size="large"
          @keyup.enter="doSearch"
          @clear="doSearch"
          style="flex: 1"
        >
          <template #prefix><i class="ri-search-line" /></template>
        </el-input>
        <el-select v-model="docType" style="width: 140px" size="large" @change="doSearch">
          <el-option label="全部类型" value="" />
          <el-option label="销售单" value="sale" />
          <el-option label="退货单" value="return" />
          <el-option label="入库单" value="inbound" />
          <el-option label="出库单" value="transfer" />
        </el-select>
        <el-button type="primary" size="large" :loading="loading" @click="doSearch">查询</el-button>
      </div>

      <div v-if="searched && results.length === 0 && !loading" class="empty">
        未找到匹配单据
      </div>

      <div v-if="results.length > 0" class="result-list">
        <div
          v-for="item in results"
          :key="item.id"
          class="result-item"
          @click="goDetail(item)"
        >
          <div class="result-main">
            <el-tag :type="typeTagType(item.type)" size="small" class="type-tag">{{ typeLabel(item.type) }}</el-tag>
            <span class="code">{{ item.code }}</span>
            <el-tag :type="statusTagType(item.status)" size="small">{{ statusLabel(item.status) }}</el-tag>
          </div>
          <div class="result-meta">
            <span v-if="item.salesperson">👤 {{ item.salesperson }}</span>
            <span v-if="item.store">🏪 {{ item.store }}</span>
            <span v-if="item.date">📅 {{ item.date }}</span>
            <span v-if="item.totalQty">📦 {{ item.totalQty }} 袋</span>
            <span v-if="item.totalAmount">¥{{ item.totalAmount.toFixed(2) }}</span>
          </div>
          <div v-if="item.remark" class="result-remark">备注：{{ item.remark }}</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSales } from '@/api/sale'
import { getReturns } from '@/api/return'
import { getInbounds, getTransfers } from '@/api/stock'
import { getSalespersonAccounts } from '@/api/auth'
import { getStores } from '@/api/store'
import type { SaleDoc, ReturnDoc, InboundDoc, TransferDoc, Account, Store } from '@/types'

const router = useRouter()
const keyword = ref('')
const docType = ref('')
const loading = ref(false)
const searched = ref(false)

interface ResultItem {
  id: string
  type: 'sale' | 'return' | 'inbound' | 'transfer'
  code: string
  status: string
  salesperson?: string
  store?: string
  date?: string
  totalQty?: number
  totalAmount?: number
  remark?: string
}

const results = ref<ResultItem[]>([])

let accountMap: Record<string, string> = {}
let storeMap: Record<string, string> = {}
let dataLoaded = false

async function ensureRefData() {
  if (dataLoaded) return
  const [accounts, stores] = await Promise.all([getSalespersonAccounts(), getStores()])
  accountMap = Object.fromEntries((accounts as Account[]).map(a => [a.id, a.displayName]))
  storeMap = Object.fromEntries((stores as Store[]).map(s => [s.id, s.name]))
  dataLoaded = true
}

function matchKw(kw: string, ...fields: (string | undefined)[]) {
  if (!kw) return true
  const k = kw.toLowerCase()
  return fields.some(f => f && f.toLowerCase().includes(k))
}

async function doSearch() {
  const kw = keyword.value.trim()
  searched.value = true
  loading.value = true
  results.value = []

  try {
    await ensureRefData()
    const all: ResultItem[] = []

    if (!docType.value || docType.value === 'sale') {
      const { list } = await getSales(1, 500)
      for (const doc of list as SaleDoc[]) {
        const sp = accountMap[doc.salespersonId] || ''
        const st = storeMap[doc.storeId] || ''
        if (!matchKw(kw, doc.code, sp, st, doc.remark)) continue
        all.push({
          id: doc.id, type: 'sale', code: doc.code, status: doc.status,
          salesperson: sp, store: st, date: doc.date,
          totalQty: doc.totalQty ?? doc.lines.reduce((s, l) => s + l.qty, 0),
          totalAmount: doc.totalAmount ?? doc.lines.reduce((s, l) => s + l.qty * l.price, 0),
          remark: doc.remark,
        })
      }
    }

    if (!docType.value || docType.value === 'return') {
      const list = await getReturns() as ReturnDoc[]
      for (const doc of list) {
        const sp = accountMap[doc.salespersonId] || ''
        const st = storeMap[doc.storeId] || ''
        if (!matchKw(kw, doc.code, sp, st, doc.remark)) continue
        const qty = doc.lines.reduce((s, l) => s + l.qty, 0)
        const amount = doc.lines.reduce((s, l) => s + l.qty * l.price, 0)
        all.push({
          id: doc.id, type: 'return', code: doc.code, status: doc.status,
          salesperson: sp, store: st, date: doc.date,
          totalQty: qty, totalAmount: amount, remark: doc.remark,
        })
      }
    }

    if (!docType.value || docType.value === 'inbound') {
      const list = await getInbounds() as InboundDoc[]
      for (const doc of list) {
        if (!matchKw(kw, doc.code, doc.remark)) continue
        const qty = doc.lines.reduce((s, l) => s + l.qty, 0)
        const amount = doc.lines.reduce((s, l) => s + l.qty * l.price, 0)
        all.push({
          id: doc.id, type: 'inbound', code: doc.code, status: doc.status,
          date: doc.date, totalQty: qty, totalAmount: amount, remark: doc.remark,
        })
      }
    }

    if (!docType.value || docType.value === 'transfer') {
      const list = await getTransfers() as TransferDoc[]
      for (const doc of list) {
        if (!matchKw(kw, doc.code, doc.remark)) continue
        const qty = doc.lines.reduce((s, l) => s + l.qty, 0)
        all.push({
          id: doc.id, type: 'transfer', code: doc.code, status: doc.status,
          date: doc.date, totalQty: qty, remark: doc.remark,
        })
      }
    }

    // 按日期倒序
    all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    results.value = all
  } finally {
    loading.value = false
  }
}

function goDetail(item: ResultItem) {
  const pathMap: Record<string, string> = {
    sale: '/stock/sale/',
    return: '/stock/return/',
    inbound: '/stock/inbound/',
    transfer: '/stock/transfer/',
  }
  router.push(pathMap[item.type] + item.id)
}

function typeLabel(type: string) {
  return { sale: '销售单', return: '退货单', inbound: '入库单', transfer: '出库单' }[type] || type
}
function typeTagType(type: string) {
  return { sale: 'primary', return: 'warning', inbound: 'success', transfer: 'info' }[type] || ''
}
function statusLabel(status: string) {
  return { draft: '草稿', posted: '已过账', voided: '已作废' }[status] || status
}
function statusTagType(status: string) {
  return { draft: 'info', posted: 'success', voided: 'danger' }[status] || ''
}
</script>

<style scoped>
.search-page {}
.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.empty {
  text-align: center;
  padding: 60px 0;
  color: #64748b;
}
.result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.result-item {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  cursor: pointer;
  transition: background 0.15s;
}
.result-item:hover {
  background: rgba(255,255,255,0.07);
}
.result-main {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.type-tag { flex-shrink: 0; }
.code {
  font-weight: 700;
  font-size: 15px;
  color: #e2e8f0;
  flex: 1;
}
.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 13px;
  color: #94a3b8;
}
.result-remark {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}
@media (max-width: 600px) {
  .search-bar { flex-direction: column; }
  .search-bar :deep(.el-select) { width: 100% !important; }
}
</style>
