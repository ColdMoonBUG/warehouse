<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <span>退货单列表</span>
          <el-button type="primary" @click="$router.push('/stock/return/new')">+ 新建退货单</el-button>
        </div>
      </template>
      <div class="filter-row">
        <el-select v-model="filterEmp" clearable placeholder="业务员" style="width:140px" :disabled="session?.role === 'salesperson'" @change="reload">
          <el-option v-for="account in salespersonAccounts" :key="account.id" :label="account.displayName" :value="account.id" />
        </el-select>
        <el-select v-model="filterStore" clearable filterable placeholder="门店" style="width:180px" @change="reload">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="filterType" clearable placeholder="退货类型" style="width:140px" @change="reload">
          <el-option label="退回车库" value="vehicle_return" />
          <el-option label="退回仓库" value="warehouse_return" />
        </el-select>
        <el-select v-model="filterStatus" clearable placeholder="状态" style="width:120px" @change="reload">
          <el-option label="草稿" value="draft" />
          <el-option label="已过账" value="posted" />
          <el-option label="已作废" value="voided" />
        </el-select>
        <el-date-picker v-model="filterDate" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="reload" />
        <el-input v-model="keyword" clearable placeholder="单号/门店/备注" style="width:200px" @keyup.enter="reload" @clear="reload" />
      </div>

      <div v-if="isMobile" v-loading="loading" class="mobile-list">
        <div v-for="row in list" :key="row.id" class="mobile-item">
          <div class="mobile-main">
            <div class="code">{{ row.code }}</div>
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </div>
          <div class="mobile-meta">
            <span>{{ salespersonName(row.salespersonId) }}</span>
            <span>·</span>
            <span>{{ storeName(row.storeId) }}</span>
          </div>
          <div class="mobile-meta">
            <span>{{ row.date }}</span>
            <span>·</span>
            <span>总袋数 {{ totalQty(row) }}</span>
            <template v-if="row.saleDocId">
              <span>·</span>
              <span>关联销单 <DocLink type="sale" :id="row.saleDocId" :code="row.saleDocCode" :status="row.saleDocStatus" /></span>
            </template>
          </div>
          <div class="mobile-actions">
            <el-button link type="primary" @click="$router.push('/stock/return/'+row.id)">查看/编辑</el-button>
          </div>
        </div>
      </div>

      <div v-else class="table-wrap">
        <el-table v-loading="loading" :data="list" border stripe>
          <el-table-column prop="code" label="单号" width="170" />
          <el-table-column label="业务员" width="100">
            <template #default="{row}">{{ salespersonName(row.salespersonId) }}</template>
          </el-table-column>
          <el-table-column label="门店" min-width="150">
            <template #default="{row}">{{ storeName(row.storeId) }}</template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column label="类型" width="100">
            <template #default="{row}">{{ row.returnType === 'warehouse_return' ? '退回仓库' : '退回车库' }}</template>
          </el-table-column>
          <el-table-column label="总袋数" width="90">
            <template #default="{row}">{{ totalQty(row) }}</template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{row}">¥{{ totalAmount(row).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联销单" min-width="190">
            <template #default="{row}">
              <DocLink type="sale" :id="row.saleDocId" :code="row.saleDocCode" :status="row.saleDocStatus" />
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="120" />
          <el-table-column label="操作" width="120">
            <template #default="{row}">
              <el-button link type="primary" @click="$router.push('/stock/return/'+row.id)">查看/编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getReturnsPage } from '@/api/return'
import { getSalespersonAccounts, getSession } from '@/api/auth'
import { getStores } from '@/api/store'
import DocLink from '@/components/DocLink.vue'
import type { ReturnDoc, Account, Store } from '@/types'

const list = ref<ReturnDoc[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const salespersonAccounts = ref<Account[]>([])
const stores = ref<Store[]>([])
const filterEmp = ref('')
const filterStore = ref('')
const filterType = ref('')
const filterStatus = ref('')
const filterDate = ref<[string,string]|null>(null)
const keyword = ref('')
const isMobile = ref(window.innerWidth < 768)
const session = getSession()

function salespersonName(id: string) { return salespersonAccounts.value.find(account => account.id === id)?.displayName || '-' }
function storeName(id: string) { return stores.value.find(s => s.id === id)?.name || '-' }
function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }
function totalQty(doc: ReturnDoc) { return doc.totalQty ?? doc.lines.reduce((s, l) => s + l.qty, 0) }
function totalAmount(doc: ReturnDoc) { return Number(doc.totalAmount ?? doc.lines.reduce((s, l) => s + l.qty * l.price, 0)) }

function onResize() { isMobile.value = window.innerWidth < 768 }

function visibleStores(list: Store[]) {
  if (session?.role !== 'salesperson') return list
  return list.filter(store => store.salespersonId === session.accountId)
}

function reload() {
  page.value = 1
  return load()
}

async function load() {
  loading.value = true
  try {
    const res = await getReturnsPage(page.value, pageSize.value, {
      salespersonId: session?.role === 'salesperson' ? session.accountId : filterEmp.value,
      storeId: filterStore.value,
      returnType: filterType.value,
      status: filterStatus.value,
      startDate: filterDate.value?.[0],
      endDate: filterDate.value?.[1],
      keyword: keyword.value.trim(),
      withLines: false,
    })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadReference() {
  const [accountList, storeList] = await Promise.all([getSalespersonAccounts(), getStores()])
  salespersonAccounts.value = session?.role === 'salesperson'
    ? accountList.filter(account => account.id === session.accountId)
    : accountList
  stores.value = visibleStores(storeList)
  if (session?.role === 'salesperson') {
    filterEmp.value = session.accountId
  }
}

onMounted(() => {
  loadReference()
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
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.mobile-list { display: flex; flex-direction: column; gap: 10px; min-height: 60px; }
.mobile-item {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
}
.mobile-main { display: flex; justify-content: space-between; align-items: center; }
.mobile-main .code { font-weight: 600; color: #e5e7eb; }
.mobile-meta { display:flex; gap:6px; color:#94a3b8; font-size:12px; margin-top:6px; flex-wrap:wrap; }
.mobile-actions { margin-top: 8px; }
@media (max-width: 480px) {
  .header-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .filter-row { flex-direction: column; }
  .filter-row :deep(.el-select),
  .filter-row :deep(.el-input),
  .filter-row :deep(.el-date-editor) { width: 100% !important; }
  .pager { justify-content: center; }
}
</style>
