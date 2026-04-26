<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <span>销售单列表</span>
          <el-button type="primary" @click="$router.push('/stock/sale/new')">+ 新建销售单</el-button>
        </div>
      </template>
      <div class="filter-row">
        <el-select v-model="filterEmp" clearable placeholder="业务员" style="width:140px" @change="filter">
          <el-option v-for="account in salespersonAccounts" :key="account.id" :label="account.displayName" :value="account.id" />
        </el-select>
        <el-select v-model="filterStore" clearable placeholder="门店" style="width:160px" @change="filter">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="filterPayType" clearable placeholder="付款方式" style="width:140px" @change="filter">
          <el-option label="现金" value="cash" />
          <el-option label="单子" value="bill" />
        </el-select>
        <el-select v-model="filterStatus" clearable placeholder="状态" style="width:160px" @change="filter">
          <el-option label="草稿" value="draft" />
          <el-option label="未结清" value="unsettled" />
          <el-option label="已结清" value="settled" />
          <el-option label="已作废" value="voided" />
        </el-select>
        <el-date-picker v-model="filterDate" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="filter" />
      </div>

      <div v-if="isMobile" class="mobile-list">
        <div v-for="row in filtered" :key="row.id" class="mobile-item">
          <div class="mobile-main">
            <div class="code">{{ row.code }}</div>
            <el-tag :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
          </div>
          <div class="mobile-meta">
            <span>{{ salespersonName(row.salespersonId) }}</span>
            <span>·</span>
            <span>{{ storeName(row.storeId) }}</span>
          </div>
          <div class="mobile-meta">
            <span>{{ row.date }}</span>
            <span>·</span>
            <span>{{ paymentTypeLabel(row.paymentType) }}</span>
            <span>·</span>
            <span>总袋数 {{ totalQty(row) }}</span>
          </div>
          <div class="mobile-meta">
            <span>金额 ¥{{ totalAmount(row).toFixed(2) }}</span>
            <span v-if="row.returnDocId">·</span>
            <span v-if="row.returnDocId">已关联退单</span>
          </div>
          <div class="mobile-actions">
            <el-button link type="primary" @click="$router.push('/stock/sale/' + row.id)">查看/编辑</el-button>
            <el-button v-if="canSettle(row)" link type="success" @click="doSettle(row)">确认收款</el-button>
            <el-button v-if="canUnsettle(row)" link @click="doUnsettle(row)">取消收款</el-button>
          </div>
        </div>
      </div>

      <div v-else class="table-wrap">
        <el-table :data="filtered" border stripe>
          <el-table-column prop="code" label="单号" width="180" />
          <el-table-column label="业务员" width="100">
            <template #default="{ row }">{{ salespersonName(row.salespersonId) }}</template>
          </el-table-column>
          <el-table-column label="门店" min-width="150">
            <template #default="{ row }">{{ storeName(row.storeId) }}</template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column label="付款方式" width="90">
            <template #default="{ row }">{{ paymentTypeLabel(row.paymentType) }}</template>
          </el-table-column>
          <el-table-column label="总袋数" width="90">
            <template #default="{ row }">{{ totalQty(row) }}</template>
          </el-table-column>
          <el-table-column label="总金额" width="110">
            <template #default="{ row }">¥{{ totalAmount(row).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="结清时间" min-width="160">
            <template #default="{ row }">{{ row.settledAt || '-' }}</template>
          </el-table-column>
          <el-table-column label="关联退单" width="110">
            <template #default="{ row }">{{ row.returnDocId || '-' }}</template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="140" />
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="$router.push('/stock/sale/' + row.id)">查看/编辑</el-button>
              <el-button v-if="canSettle(row)" link type="success" @click="doSettle(row)">确认收款</el-button>
              <el-button v-if="canUnsettle(row)" link @click="doUnsettle(row)">取消收款</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSales, settleSale, unsettleSale } from '@/api/sale'
import { getSalespersonAccounts, getSession } from '@/api/auth'
import { getStores } from '@/api/store'
import type { SaleDoc, Account, Store } from '@/types'

const list = ref<SaleDoc[]>([])
const filtered = ref<SaleDoc[]>([])
const salespersonAccounts = ref<Account[]>([])
const stores = ref<Store[]>([])
const filterEmp = ref('')
const filterStore = ref('')
const filterPayType = ref('')
const filterStatus = ref('')
const filterDate = ref<[string, string] | null>(null)
const isMobile = ref(window.innerWidth < 768)
const session = getSession()

function salespersonName(id: string) {
  return salespersonAccounts.value.find(account => account.id === id)?.displayName || '-'
}
function storeName(id: string) {
  return stores.value.find(s => s.id === id)?.name || '-'
}
function paymentTypeLabel(type?: string) {
  return type === 'cash' ? '现金' : '单子'
}
function totalQty(doc: SaleDoc) {
  return doc.totalQty ?? doc.lines.reduce((sum, line) => sum + line.qty, 0)
}
function totalAmount(doc: SaleDoc) {
  return doc.totalAmount ?? doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0)
}
function statusLabel(doc: SaleDoc) {
  if (doc.status === 'draft') return '草稿'
  if (doc.status === 'voided') return '已作废'
  return doc.settled ? '已结清' : '未结清'
}
function statusType(doc: SaleDoc) {
  if (doc.status === 'draft') return 'info'
  if (doc.status === 'voided') return 'danger'
  return doc.settled ? 'success' : 'warning'
}
function canSettle(doc: SaleDoc) {
  return doc.status === 'posted' && !doc.settled
}
function canUnsettle(doc: SaleDoc) {
  return doc.status === 'posted' && !!doc.settled && session?.role === 'admin'
}

function onResize() { isMobile.value = window.innerWidth < 768 }

function visibleStores(list: Store[]) {
  if (session?.role !== 'salesperson') return list
  return list.filter(store => store.salespersonId === session.accountId)
}

function filter() {
  filtered.value = list.value.filter(doc => {
    if (session?.role === 'salesperson' && doc.salespersonId !== session.accountId) return false
    if (filterEmp.value && doc.salespersonId !== filterEmp.value) return false
    if (filterStore.value && doc.storeId !== filterStore.value) return false
    if (filterPayType.value && (doc.paymentType || 'bill') !== filterPayType.value) return false
    if (filterStatus.value === 'draft' && doc.status !== 'draft') return false
    if (filterStatus.value === 'voided' && doc.status !== 'voided') return false
    if (filterStatus.value === 'unsettled' && !(doc.status === 'posted' && !doc.settled)) return false
    if (filterStatus.value === 'settled' && !(doc.status === 'posted' && !!doc.settled)) return false
    if (filterDate.value) {
      if (doc.date < filterDate.value[0] || doc.date > filterDate.value[1]) return false
    }
    return true
  })
}

async function load() {
  const [salesRes, accountRes, storeRes] = await Promise.all([getSales(), getSalespersonAccounts(), getStores()])
  list.value = salesRes.list
  salespersonAccounts.value = session?.role === 'salesperson'
    ? accountRes.filter(account => account.id === session.accountId)
    : accountRes
  stores.value = visibleStores(storeRes)
  if (session?.role === 'salesperson') {
    filterEmp.value = session.accountId
  }
  const allowedStoreIds = new Set(stores.value.map(store => store.id))
  if (filterStore.value && !allowedStoreIds.has(filterStore.value)) {
    filterStore.value = ''
  }
  filter()
}

async function doSettle(doc: SaleDoc) {
  try {
    await ElMessageBox.confirm(`确认「${doc.code}」已收款？`, '确认收款')
    await settleSale(doc.id)
    ElMessage.success('已确认收款')
    await load()
  } catch {
    // ignore
  }
}

async function doUnsettle(doc: SaleDoc) {
  try {
    await ElMessageBox.confirm(`确认取消「${doc.code}」的收款状态？`, '取消收款')
    await unsettleSale(doc.id)
    ElMessage.success('已取消收款')
    await load()
  } catch {
    // ignore
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-row { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.table-wrap { overflow-x: auto; }
.mobile-list { display: flex; flex-direction: column; gap: 10px; }
.mobile-item {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
}
.mobile-main { display: flex; justify-content: space-between; align-items: center; }
.mobile-main .code { font-weight: 600; color: #e5e7eb; }
.mobile-meta { display:flex; gap:6px; color:#94a3b8; font-size:12px; margin-top:6px; flex-wrap:wrap; }
.mobile-actions { margin-top: 8px; display:flex; gap:8px; flex-wrap:wrap; }
@media (max-width: 480px) {
  .header-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .filter-row { flex-direction: column; }
  .filter-row :deep(.el-select),
  .filter-row :deep(.el-date-editor) { width: 100% !important; }
}
</style>
