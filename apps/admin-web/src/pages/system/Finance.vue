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

    <el-dialog v-model="unsettledDlg" :title="`${currentSummary?.salespersonName || ''} 未结明细`" width="900px">
      <el-table :data="unsettledLedgers" border stripe max-height="480">
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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { refreshSession } from '@/api/auth'
import {
  getCommissionSettlementDetail,
  getCommissionSettlements,
  getCommissionSummaries,
  getUnsettledCommissionLedgers,
  settleCommission,
} from '@/api/finance'
import type {
  CommissionLedger,
  CommissionSettlementDetail,
  CommissionSettlementSummary,
  CommissionSummary,
} from '@/types'

const router = useRouter()
const loading = ref(false)
const summaries = ref<CommissionSummary[]>([])
const settlements = ref<CommissionSettlementSummary[]>([])
const unsettledLedgers = ref<CommissionLedger[]>([])
const settlementDetail = ref<CommissionSettlementDetail | null>(null)
const currentSummary = ref<CommissionSummary | null>(null)
const unsettledDlg = ref(false)
const settleDlg = ref(false)
const detailDlg = ref(false)
const settleRemark = ref('')

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
    unsettledLedgers.value = await getUnsettledCommissionLedgers(row.salespersonId)
    unsettledDlg.value = true
  } catch (error: any) {
    if (error?.message === '未登录') {
      router.replace('/login')
      return
    }
    throw error
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
</style>
