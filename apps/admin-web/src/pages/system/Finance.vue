<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <div>
            <span>财务结清</span>
            <div class="header-tip">按业务员查看未结提成分项，并一次结清该业务员全部未结金额。</div>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="summaries" border stripe>
        <el-table-column prop="salespersonName" label="业务员" min-width="120" />
        <el-table-column label="销售净提成" min-width="120">
          <template #default="{ row }">¥{{ amountText(row.saleAmount) }}</template>
        </el-table-column>
        <el-table-column label="退货净提成" min-width="120">
          <template #default="{ row }">¥{{ amountText(row.returnAmount) }}</template>
        </el-table-column>
        <el-table-column label="未结总额" min-width="120">
          <template #default="{ row }">
            <span class="amount total">¥{{ amountText(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ledgerCount" label="未结笔数" width="100" />
        <el-table-column label="最近结清" min-width="180">
          <template #default="{ row }">
            <span v-if="row.lastSettlementAt">{{ row.lastSettlementAt }} / ¥{{ amountText(row.lastSettlementAmount) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link @click="openUnsettled(row)">未结明细</el-button>
            <el-button link type="primary" :disabled="!row.ledgerCount" @click="openSettle(row)">结清</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="history-card">
      <template #header>
        <div class="header-row">
          <span>结清记录</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="settlements" border stripe>
        <el-table-column prop="salespersonName" label="业务员" min-width="120" />
        <el-table-column prop="settledByName" label="结清人" min-width="120" />
        <el-table-column label="销售净提成" min-width="120">
          <template #default="{ row }">¥{{ amountText(row.saleAmount) }}</template>
        </el-table-column>
        <el-table-column label="退货净提成" min-width="120">
          <template #default="{ row }">¥{{ amountText(row.returnAmount) }}</template>
        </el-table-column>
        <el-table-column label="结清总额" min-width="120">
          <template #default="{ row }"><span class="amount">¥{{ amountText(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column prop="ledgerCount" label="流水笔数" width="100" />
        <el-table-column prop="createdAt" label="结清时间" min-width="170" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link @click="openSettlement(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="unsettledDlg" :title="`${currentSummary?.salespersonName || ''} 未结明细`" width="960px" :close-on-click-modal="false" :body-style="{ maxHeight: '70vh', overflowY: 'auto', padding: '16px 20px' }">
      <!-- 月份汇总 -->
      <div class="month-tabs" v-if="unsettledMonths.length > 1">
        <el-button
          v-for="m in unsettledMonths"
          :key="m"
          :type="activeMonth === m ? 'primary' : ''"
          size="small"
          @click="activeMonth = m; currentPage = 1"
        >{{ m }}（{{ monthDocCount(m) }}单）</el-button>
      </div>

      <div v-if="unsettledByDocLoading" class="dlg-loading">加载中...</div>

      <div v-else-if="filteredUnsettledDocs.length === 0" class="dlg-empty">暂无未结单据</div>

      <div v-else class="doc-list">
        <div v-for="doc in pagedDocs" :key="doc.docId" class="doc-item">
          <!-- 单据头 -->
          <div class="doc-head" @click="toggleDoc(doc.docId)">
            <div class="doc-head-left">
              <el-tag :type="doc.docType === 'sale' ? 'primary' : 'warning'" size="small">
                {{ doc.docType === 'sale' ? '销单' : '退单' }}
              </el-tag>
              <span class="doc-code">{{ doc.docCode }}</span>
              <span class="doc-store">{{ doc.storeName || '-' }}</span>
              <span class="doc-date">{{ (doc.docDate || '').slice(0, 10) }}</span>
            </div>
            <div class="doc-head-right">
              <span v-if="doc.saleCommission > 0" class="commission-sale">+¥{{ amountText(doc.saleCommission) }}</span>
              <span v-if="doc.returnCommission < 0" class="commission-return">-¥{{ amountText(Math.abs(doc.returnCommission)) }}</span>
              <span class="commission-net">净 ¥{{ amountText(doc.netCommission) }}</span>
              <i :class="expandedDocs.has(doc.docId) ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" class="expand-icon" />
            </div>
          </div>

          <!-- 展开明细 -->
          <div v-if="expandedDocs.has(doc.docId)" class="doc-detail">
            <!-- 销售提成行 -->
            <div v-if="saleLines(doc).length > 0" class="detail-section">
              <div class="detail-section-title sale-title">📦 销售提成</div>
              <div class="detail-row header-row-inner">
                <span class="col-product">商品ID</span>
                <span class="col-qty">袋数</span>
                <span class="col-price">单价</span>
                <span class="col-amount">金额</span>
                <span class="col-commission">提成</span>
              </div>
              <div v-for="l in saleLines(doc)" :key="l.id" class="detail-row">
                <span class="col-product">{{ productMap[l.productId] || l.productId.slice(-8) }}</span>
                <span class="col-qty">{{ l.qty }}</span>
                <span class="col-price">¥{{ amountText(l.price) }}</span>
                <span class="col-amount">¥{{ amountText(l.amount) }}</span>
                <span class="col-commission sale-color">+¥{{ amountText(l.commissionAmount) }}</span>
              </div>
            </div>

            <!-- 退货抵扣行 -->
            <div v-if="returnLines(doc).length > 0" class="detail-section">
              <div class="detail-section-title return-title">↩️ 退货抵扣</div>
              <div class="detail-row header-row-inner">
                <span class="col-product">商品ID</span>
                <span class="col-qty">袋数</span>
                <span class="col-price">单价</span>
                <span class="col-amount">金额</span>
                <span class="col-commission">抵扣</span>
              </div>
              <div v-for="l in returnLines(doc)" :key="l.id" class="detail-row">
                <span class="col-product">{{ productMap[l.productId] || l.productId.slice(-8) }}</span>
                <span class="col-qty">{{ l.qty }}</span>
                <span class="col-price">¥{{ amountText(l.price) }}</span>
                <span class="col-amount">¥{{ amountText(l.amount) }}</span>
                <span class="col-commission return-color">-¥{{ amountText(Math.abs(Number(l.commissionAmount))) }}</span>
              </div>
            </div>

            <!-- 关联退单提示 -->
            <div v-if="doc.returnDocId" class="linked-return-tip">
              🔗 关联退单：{{ doc.returnDocId.slice(-12) }}（已包含在退货抵扣中）
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="filteredUnsettledDocs.length > 20" class="dlg-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="20"
          :total="filteredUnsettledDocs.length"
          layout="prev, pager, next, total"
          small
          @current-change="expandedDocs = new Set()"
        />
      </div>

      <!-- 月度小计 -->
      <div class="month-summary" v-if="filteredUnsettledDocs.length > 0">
        <span>{{ activeMonth || '全部' }}：{{ filteredUnsettledDocs.length }} 单</span>
        <span>销售提成 +¥{{ amountText(monthSaleCommission) }}</span>
        <span>退货抵扣 -¥{{ amountText(Math.abs(monthReturnCommission)) }}</span>
        <span class="net-total">净提成 ¥{{ amountText(monthNetCommission) }}</span>
      </div>
    </el-dialog>

    <el-dialog v-model="settleDlg" :title="`${currentSummary?.salespersonName || ''} 结清确认`" width="420px">
      <div class="settle-box">
        <div>销售净提成：¥{{ amountText(currentSummary?.saleAmount) }}</div>
        <div>退货净提成：¥{{ amountText(currentSummary?.returnAmount) }}</div>
        <div class="total">本次结清：¥{{ amountText(currentSummary?.totalAmount) }}</div>
      </div>
      <el-input v-model="settleRemark" type="textarea" :rows="3" placeholder="备注（可选）" />
      <template #footer>
        <el-button @click="settleDlg = false">取消</el-button>
        <el-button type="primary" @click="submitSettle">确认结清</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDlg" title="结清详情" width="980px">
      <div v-if="settlementDetail" class="detail-head">
        <div>业务员：{{ settlementDetail.settlement.salespersonName }}</div>
        <div>结清人：{{ settlementDetail.settlement.settledByName }}</div>
        <div>销售净提成：¥{{ amountText(settlementDetail.settlement.saleAmount) }}</div>
        <div>退货净提成：¥{{ amountText(settlementDetail.settlement.returnAmount) }}</div>
        <div>结清总额：¥{{ amountText(settlementDetail.settlement.totalAmount) }}</div>
        <div>结清时间：{{ settlementDetail.settlement.createdAt }}</div>
        <div v-if="settlementDetail.settlement.remark">备注：{{ settlementDetail.settlement.remark }}</div>
      </div>
      <el-table :data="settlementDetail?.ledgers || []" border stripe max-height="480">
        <el-table-column prop="createdAt" label="时间" width="170" />
        <el-table-column prop="bizType" label="类型" width="120" />
        <el-table-column prop="docId" label="单据ID" min-width="180" />
        <el-table-column prop="productId" label="商品ID" min-width="120" />
        <el-table-column prop="qty" label="袋数" width="80" />
        <el-table-column label="提成金额" min-width="120">
          <template #default="{ row }">¥{{ amountText(row.commissionAmount) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { refreshSession } from '@/api/auth'
import {
  getCommissionSettlementDetail,
  getCommissionSettlements,
  getCommissionSummaries,
  getUnsettledCommissionLedgers,
  getUnsettledByDoc,
  settleCommission,
} from '@/api/finance'
import { getProducts } from '@/api/product'
import type {
  CommissionLedger,
  CommissionSettlementDetail,
  CommissionSettlementSummary,
  CommissionSummary,
  UnsettledDocVO,
} from '@/types'

const router = useRouter()
const loading = ref(false)
const summaries = ref<CommissionSummary[]>([])
const settlements = ref<CommissionSettlementSummary[]>([])
const unsettledLedgers = ref<CommissionLedger[]>([])
const unsettledDocs = ref<UnsettledDocVO[]>([])
const unsettledByDocLoading = ref(false)
const settlementDetail = ref<CommissionSettlementDetail | null>(null)
const currentSummary = ref<CommissionSummary | null>(null)
const unsettledDlg = ref(false)
const settleDlg = ref(false)
const detailDlg = ref(false)
const settleRemark = ref('')
const expandedDocs = ref(new Set<string>())
const activeMonth = ref('')
const productMap = ref<Record<string, string>>({})

// 从 docDate 提取 YYYY-MM
function toMonth(dateStr?: string) {
  return (dateStr || '').slice(0, 7)
}

const unsettledMonths = computed(() => {
  const months = new Set<string>()
  for (const doc of unsettledDocs.value) {
    const m = toMonth(doc.docDate)
    if (m) months.add(m)
  }
  return [...months].sort((a, b) => b.localeCompare(a))
})

const PAGE_SIZE = 20
const currentPage = ref(1)

const filteredUnsettledDocs = computed(() => {
  return !activeMonth.value
    ? unsettledDocs.value
    : unsettledDocs.value.filter(d => toMonth(d.docDate) === activeMonth.value)
})

const pagedDocs = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredUnsettledDocs.value.slice(start, start + PAGE_SIZE)
})
const monthSaleCommission = computed(() =>
  filteredUnsettledDocs.value.reduce((s, d) => s + Number(d.saleCommission || 0), 0))
const monthReturnCommission = computed(() =>
  filteredUnsettledDocs.value.reduce((s, d) => s + Number(d.returnCommission || 0), 0))
const monthNetCommission = computed(() =>
  filteredUnsettledDocs.value.reduce((s, d) => s + Number(d.netCommission || 0), 0))

function monthDocCount(month: string) {
  return unsettledDocs.value.filter(d => toMonth(d.docDate) === month).length
}

function toggleDoc(docId: string) {
  if (expandedDocs.value.has(docId)) {
    expandedDocs.value.delete(docId)
  } else {
    expandedDocs.value.add(docId)
  }
  expandedDocs.value = new Set(expandedDocs.value)
}

function saleLines(doc: UnsettledDocVO) {
  return doc.ledgers.filter(l => !l.bizType?.startsWith('return') && !l.bizType?.startsWith('void'))
}

function returnLines(doc: UnsettledDocVO) {
  return doc.ledgers.filter(l => l.bizType?.startsWith('return') || l.bizType?.startsWith('void'))
}

function amountText(value?: number) {
  return Number(value || 0).toFixed(2)
}

async function ensureAdminSession() {
  const session = await refreshSession()
  if (session?.role === 'admin') {
    return true
  }
  router.replace('/login')
  return false
}

async function load() {
  loading.value = true
  try {
    if (!(await ensureAdminSession())) return
    ;[summaries.value, settlements.value] = await Promise.all([
      getCommissionSummaries(),
      getCommissionSettlements(),
    ])
    // 加载商品名映射
    const products = await getProducts()
    productMap.value = Object.fromEntries(products.map(p => [p.id, p.name]))
  } catch (error: any) {
    if (error?.message === '未登录') {
      router.replace('/login')
      return
    }
    throw error
  } finally {
    loading.value = false
  }
}

async function openUnsettled(row: CommissionSummary) {
  try {
    currentSummary.value = row
    expandedDocs.value = new Set()
    activeMonth.value = ''
    unsettledDlg.value = true
    unsettledByDocLoading.value = true
    unsettledDocs.value = await getUnsettledByDoc(row.salespersonId)
    // 默认选最近一个月
    activeMonth.value = unsettledMonths.value[0] || ''
    currentPage.value = 1
  } catch (error: any) {
    if (error?.message === '未登录') { router.replace('/login'); return }
    throw error
  } finally {
    unsettledByDocLoading.value = false
  }
}

function openSettle(row: CommissionSummary) {
  currentSummary.value = row
  settleRemark.value = ''
  settleDlg.value = true
}

async function submitSettle() {
  if (!currentSummary.value) return
  try {
    await ElMessageBox.confirm(`确认结清 ${currentSummary.value.salespersonName} 当前全部未结提成？`, '提示', { type: 'warning' })
    await settleCommission(currentSummary.value.salespersonId, settleRemark.value || undefined)
    settleDlg.value = false
    ElMessage.success('结清成功')
    await load()
  } catch (error: any) {
    if (error === 'cancel') return
    if (error?.message === '未登录') {
      router.replace('/login')
      return
    }
    throw error
  }
}

async function openSettlement(id: string) {
  try {
    settlementDetail.value = await getCommissionSettlementDetail(id)
    detailDlg.value = true
  } catch (error: any) {
    if (error?.message === '未登录') {
      router.replace('/login')
      return
    }
    throw error
  }
}

onMounted(load)
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.history-card {
  margin-top: 16px;
}

.amount {
  font-weight: 600;
}

.amount.total {
  color: #f59e0b;
}

.settle-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.settle-box .total {
  font-weight: 700;
}

.detail-head {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin-bottom: 16px;
  color: #cbd5e1;
}

/* 未结明细弹窗 */
.month-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.dlg-loading, .dlg-empty { text-align: center; padding: 40px 0; color: #64748b; }

.doc-list { display: flex; flex-direction: column; gap: 8px; }

.doc-item {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  overflow: hidden;
}

.doc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(255,255,255,0.04);
  gap: 12px;
}
.doc-head:hover { background: rgba(255,255,255,0.08); }

.doc-head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.doc-code { font-weight: 700; font-size: 14px; color: #e2e8f0; }
.doc-store { font-size: 13px; color: #94a3b8; }
.doc-date { font-size: 12px; color: #64748b; }

.doc-head-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; font-size: 13px; }
.commission-sale { color: #4ade80; }
.commission-return { color: #f87171; }
.commission-net { font-weight: 700; color: #e2e8f0; }
.expand-icon { font-size: 16px; color: #94a3b8; }

.doc-detail { padding: 12px 14px; background: rgba(0,0,0,0.15); }
.detail-section { margin-bottom: 12px; }
.detail-section-title { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.sale-title { color: #4ade80; }
.return-title { color: #f87171; }

.detail-row {
  display: grid;
  grid-template-columns: 2fr 50px 70px 80px 80px;
  gap: 4px;
  font-size: 12px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: #94a3b8;
}
.header-row-inner { color: #64748b; font-size: 11px; }
.col-product { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-qty, .col-price, .col-amount, .col-commission { text-align: right; }
.mono { font-family: ui-monospace, monospace; }
.sale-color { color: #4ade80; }
.return-color { color: #f87171; }

.linked-return-tip { font-size: 11px; color: #64748b; margin-top: 8px; }

.month-summary {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 0 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin-top: 12px;
  font-size: 13px;
  color: #94a3b8;
}
.net-total { font-weight: 700; color: #e2e8f0; }
.dlg-pagination { display: flex; justify-content: center; padding: 12px 0; }
</style>
