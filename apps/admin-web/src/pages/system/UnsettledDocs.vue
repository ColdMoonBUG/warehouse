<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <span>未收款销单</span>
          <el-button type="primary" @click="loadData" :loading="loading">刷新</el-button>
        </div>
      </template>

      <div class="filter-row">
        <el-select v-model="filterEmp" clearable placeholder="业务员" style="width:140px" @change="reload">
          <el-option v-for="a in accounts" :key="a.id" :label="a.displayName" :value="a.id" />
        </el-select>
        <el-date-picker v-model="filterDate" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" style="width:240px" @change="reload" />
        <span class="summary">共 {{ total }} 张未收款</span>
      </div>
      <el-table v-loading="loading" :data="docs" border stripe>
        <el-table-column prop="code" label="单号" min-width="180" />
        <el-table-column label="超市" min-width="140">
          <template #default="{ row }">{{ storeName(row.storeId) }}</template>
        </el-table-column>
        <el-table-column label="业务员" min-width="100">
          <template #default="{ row }">{{ salespersonName(row.salespersonId) }}</template>
        </el-table-column>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column label="付款方式" width="90">
          <template #default="{ row }">{{ row.paymentType === 'cash' ? '现金' : '单子' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">¥{{ docAmount(row).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.docType === 'gift'" type="warning" size="small">赠送</el-tag>
            <el-tag v-else size="small">销售</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联退单" min-width="170">
          <template #default="{ row }">
            <DocLink type="return" :id="row.returnDocId" :code="row.returnDocCode" :status="row.returnDocStatus" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="doSettle(row)">确认收款</el-button>
            <el-button link @click="$router.push('/stock/sale/' + row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[50, 100, 200]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadData"
          @size-change="reload"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUnsettledSales, settleSale } from '@/api/sale'
import { getSalespersonAccounts } from '@/api/auth'
import { getStores } from '@/api/store'
import DocLink from '@/components/DocLink.vue'
import type { Account, SaleDoc, Store } from '@/types'

const loading = ref(false)
const docs = ref<SaleDoc[]>([])
const stores = ref<Store[]>([])
const accounts = ref<Account[]>([])
// 以前只显示最近 50 张未收款单；现在可翻页、按业务员和日期筛选
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const filterEmp = ref('')
const filterDate = ref<[string, string] | null>(null)

function reload() {
  page.value = 1
  return loadData()
}

function storeName(id: string) {
  return stores.value.find(s => s.id === id)?.name || id
}

function salespersonName(id: string) {
  return accounts.value.find(account => account.id === id)?.displayName || id || '-'
}

function docAmount(doc: SaleDoc) {
  if (doc.totalAmount !== undefined) return Number(doc.totalAmount)
  if (!doc.lines) return 0
  return doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0)
}

async function loadData() {
  loading.value = true
  try {
    const [saleResult, storeList, accountList] = await Promise.all([
      getUnsettledSales(page.value, pageSize.value, {
        salespersonId: filterEmp.value,
        startDate: filterDate.value?.[0],
        endDate: filterDate.value?.[1],
        withLines: false,
      }),
      getStores(),
      getSalespersonAccounts(),
    ])
    docs.value = saleResult.list
    total.value = saleResult.total
    stores.value = storeList
    accounts.value = accountList
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function doSettle(doc: SaleDoc) {
  try {
    await ElMessageBox.confirm(`确认「${doc.code}」已收款？`, '确认收款')
    await settleSale(doc.id)
    ElMessage.success('已确认收款')
    await loadData()
  } catch {
    // ignore
  }
}

onMounted(loadData)
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-row { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; align-items:center; }
.summary { color:#64748b; font-size:13px; }
.pager { display:flex; justify-content:flex-end; margin-top:12px; }
</style>
