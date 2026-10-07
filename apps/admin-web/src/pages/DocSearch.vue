<template>
  <div class="search-page">
    <el-card>
      <template #header>
        <span>单据查询</span>
      </template>

      <div class="search-bar">
        <el-input
          v-model="keyword"
          placeholder="单号、门店、业务员、商品、金额、备注…多个词用空格分开"
          clearable
          size="large"
          @keyup.enter="doSearch(1)"
          @clear="doSearch(1)"
          style="flex: 1; min-width: 260px"
        >
          <template #prefix><i class="ri-search-line" /></template>
        </el-input>
        <el-select v-model="docType" style="width: 130px" size="large" @change="doSearch(1)">
          <el-option label="全部类型" value="" />
          <el-option label="销售单" value="sale" />
          <el-option label="退货单" value="return" />
          <el-option v-if="!isSalesperson" label="入库单" value="inbound" />
          <el-option v-if="!isSalesperson" label="出库单" value="transfer" />
        </el-select>
        <el-select v-model="status" style="width: 120px" size="large" @change="doSearch(1)">
          <el-option label="全部状态" value="" />
          <el-option label="草稿" value="draft" />
          <el-option label="已过账" value="posted" />
          <el-option label="已作废" value="voided" />
        </el-select>
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" size="large"
          start-placeholder="开始日期" end-placeholder="结束日期" style="width: 260px" @change="doSearch(1)" />
        <el-button type="primary" size="large" :loading="loading" @click="doSearch(1)">查询</el-button>
      </div>
      <div class="tip">
        支持：单号（可省略“-”，如输入 0514 能找到 XS-2026-05-14-…）、日期、门店/厂家名（可用拼音首字母，如 hyc）、
        业务员、单据里的商品名或条码、金额、备注。在服务器上分页查询，历史单据也能搜到。
      </div>

      <div v-if="searched && results.length === 0 && !loading" class="empty">
        未找到匹配单据
      </div>

      <div v-if="results.length > 0" v-loading="loading" class="result-list">
        <div class="result-count">共 {{ total }} 张</div>
        <div
          v-for="item in results"
          :key="item.type + item.id"
          class="result-item"
          @click="goDetail(item)"
        >
          <div class="result-main">
            <el-tag :type="typeTagType(item.type)" size="small" class="type-tag">{{ typeLabel(item) }}</el-tag>
            <span class="code">{{ item.code }}</span>
            <el-tag :type="statusTagType(item)" size="small">{{ statusLabel(item) }}</el-tag>
          </div>
          <div class="result-meta">
            <span v-if="item.salespersonName">👤 {{ item.salespersonName }}</span>
            <span v-if="item.partyName">🏪 {{ item.partyName }}</span>
            <span v-if="item.date">📅 {{ item.date }}</span>
            <span v-if="item.totalQty">📦 {{ item.totalQty }} 袋</span>
            <span v-if="item.totalAmount != null">¥{{ Number(item.totalAmount).toFixed(2) }}</span>
            <span v-if="item.linkedId" @click.stop>
              🔗 {{ item.type === 'sale' ? '关联退单' : '关联销单' }}
              <DocLink :type="item.type === 'sale' ? 'return' : 'sale'" :id="item.linkedId" :code="item.linkedCode" :status="item.linkedStatus" />
            </span>
          </div>
          <div v-if="item.remark" class="result-remark">备注：{{ item.remark }}</div>
        </div>
        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            @current-change="doSearch"
          />
        </div>
      </div>
    </el-card>
    <DuplicateDocs v-if="!isSalesperson" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DuplicateDocs from '@/components/DuplicateDocs.vue'
import DocLink from '@/components/DocLink.vue'
import { useRouter } from 'vue-router'
import { getSession } from '@/api/auth'
import { searchDocs, type DocSearchHit } from '@/api/search'

const router = useRouter()
const session = getSession()
const isSalesperson = session?.role === 'salesperson'
const keyword = ref('')
const docType = ref<'' | 'sale' | 'return' | 'inbound' | 'transfer'>('')
const status = ref('')
const range = ref<[string, string] | null>(null)
const loading = ref(false)
const searched = ref(false)
const results = ref<DocSearchHit[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50

async function doSearch(toPage?: number) {
  if (typeof toPage === 'number') page.value = toPage
  searched.value = true
  loading.value = true
  try {
    const res = await searchDocs({
      keyword: keyword.value.trim(),
      type: docType.value,
      status: status.value,
      startDate: range.value?.[0],
      endDate: range.value?.[1],
      salespersonId: isSalesperson ? session?.accountId : undefined,
      page: page.value,
      limit: pageSize,
    })
    results.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function goDetail(item: DocSearchHit) {
  const pathMap: Record<string, string> = {
    sale: '/stock/sale/',
    return: '/stock/return/',
    inbound: '/stock/inbound/',
    transfer: '/stock/transfer/',
  }
  router.push(pathMap[item.type] + item.id)
}

function typeLabel(item: DocSearchHit) {
  if (item.type === 'sale' && item.docType === 'gift') return '赠送单'
  if (item.type === 'return' && item.docType === 'warehouse_return') return '回仓退货'
  return { sale: '销售单', return: '退货单', inbound: '入库单', transfer: '出库单' }[item.type] || item.type
}
function typeTagType(type: string) {
  return ({ sale: 'primary', return: 'warning', inbound: 'success', transfer: 'info' } as Record<string, any>)[type] || ''
}
function statusLabel(item: DocSearchHit) {
  if (item.type === 'sale' && item.status === 'posted') return item.settled ? '已结清' : '未结清'
  return ({ draft: '草稿', posted: '已过账', voided: '已作废' } as Record<string, string>)[item.status] || item.status
}
function statusTagType(item: DocSearchHit) {
  if (item.type === 'sale' && item.status === 'posted') return item.settled ? 'success' : 'warning'
  return ({ draft: 'info', posted: 'success', voided: 'danger' } as Record<string, any>)[item.status] || ''
}
</script>

<style scoped>
.search-page {}
.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tip {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 16px;
  line-height: 1.6;
}
.empty {
  text-align: center;
  padding: 60px 0;
  color: #64748b;
}
.result-count {
  font-size: 13px;
  color: #94a3b8;
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
.pager { display: flex; justify-content: center; margin-top: 8px; }
@media (max-width: 600px) {
  .search-bar { flex-direction: column; }
  .search-bar :deep(.el-select),
  .search-bar :deep(.el-date-editor) { width: 100% !important; }
}
</style>
