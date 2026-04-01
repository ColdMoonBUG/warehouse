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
          <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
        </el-select>
        <el-select v-model="filterStore" clearable placeholder="门店" style="width:160px" @change="filter">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-date-picker v-model="filterDate" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="filter" />
      </div>

      <div v-if="isMobile" class="mobile-list">
        <div v-for="row in filtered" :key="row.id" class="mobile-item">
          <div class="mobile-main">
            <div class="code">{{ row.code }}</div>
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </div>
          <div class="mobile-meta">
            <span>{{ empName(row.employeeId) }}</span>
            <span>·</span>
            <span>{{ storeName(row.storeId) }}</span>
          </div>
          <div class="mobile-meta">
            <span>{{ row.date }}</span>
            <span>·</span>
            <span>总件数 {{ row.lines.reduce((s:number,l:any)=>s+l.qty,0) }}</span>
          </div>
          <div class="mobile-actions">
            <el-button link type="primary" @click="$router.push('/stock/sale/'+row.id)">查看/编辑</el-button>
          </div>
        </div>
      </div>

      <div v-else class="table-wrap">
        <el-table :data="filtered" border stripe>
          <el-table-column prop="code" label="单号" width="160" />
          <el-table-column label="业务员" width="100">
            <template #default="{row}">{{ empName(row.employeeId) }}</template>
          </el-table-column>
          <el-table-column label="门店" width="150">
            <template #default="{row}">{{ storeName(row.storeId) }}</template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column label="总件数" width="90">
            <template #default="{row}">{{ row.lines.reduce((s:number,l:any)=>s+l.qty,0) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" />
          <el-table-column label="操作" width="120">
            <template #default="{row}">
              <el-button link type="primary" @click="$router.push('/stock/sale/'+row.id)">查看/编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getSales } from '@/api/sale'
import { getEmployees } from '@/api/employee'
import { getStores } from '@/api/store'
import type { SaleDoc, Employee, Store } from '@/types'

const list = ref<SaleDoc[]>([])
const filtered = ref<SaleDoc[]>([])
const employees = ref<Employee[]>([])
const stores = ref<Store[]>([])
const filterEmp = ref('')
const filterStore = ref('')
const filterDate = ref<[string,string]|null>(null)
const isMobile = ref(window.innerWidth < 768)

function empName(id: string) { return employees.value.find(e => e.id === id)?.name || '-' }
function storeName(id: string) { return stores.value.find(s => s.id === id)?.name || '-' }
function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function onResize() { isMobile.value = window.innerWidth < 768 }

function filter() {
  filtered.value = list.value.filter(d => {
    if (filterEmp.value && d.employeeId !== filterEmp.value) return false
    if (filterStore.value && d.storeId !== filterStore.value) return false
    if (filterDate.value) {
      if (d.date < filterDate.value[0] || d.date > filterDate.value[1]) return false
    }
    return true
  })
}

async function load() {
  const [salesRes, employeeRes, storeRes] = await Promise.all([getSales(), getEmployees(), getStores()])
  list.value = salesRes.list
  employees.value = employeeRes
  stores.value = storeRes
  filter()
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
.mobile-meta { display:flex; gap:6px; color:#94a3b8; font-size:12px; margin-top:6px; }
.mobile-actions { margin-top: 8px; }
@media (max-width: 480px) {
  .header-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .filter-row { flex-direction: column; }
  .filter-row :deep(.el-select),
  .filter-row :deep(.el-date-editor) { width: 100% !important; }
}
</style>
