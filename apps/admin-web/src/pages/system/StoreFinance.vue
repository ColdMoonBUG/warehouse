<template>
  <div class="store-finance-page">
    <el-card>
      <template #header>
        <span>超市收益流水</span>
      </template>

      <el-table :data="summaries" v-loading="loading" stripe border>
        <el-table-column prop="storeName" label="超市名称" min-width="160" />
        <el-table-column label="销售提成" min-width="120" align="right">
          <template #default="{ row }">
            <span style="color: #67c23a">+¥{{ Number(row.saleCommission || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="退货扣除" min-width="120" align="right">
          <template #default="{ row }">
            <span :style="{ color: Number(row.returnCommission || 0) < 0 ? '#f56c6c' : '#909399' }">
              ¥{{ Number(row.returnCommission || 0).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="净提成" min-width="120" align="right">
          <template #default="{ row }">
            <span style="font-weight: 600">¥{{ Number(row.netCommission || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ledgerCount" label="流水笔数" width="100" align="center" />
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="showDetail(row)">查看明细</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 明细弹窗：按单据聚合 -->
    <el-dialog v-model="detailVisible" :title="`${detailStoreName} — 收益明细`" width="820px">
      <div class="detail-summary">
        <span>销售提成：<b style="color: #67c23a">+¥{{ detailSaleCommission.toFixed(2) }}</b></span>
        <span>退货扣除：<b style="color: #f56c6c">¥{{ detailReturnCommission.toFixed(2) }}</b></span>
        <span>净提成：<b>¥{{ detailNetCommission.toFixed(2) }}</b></span>
      </div>
      <el-table :data="docSummaries" v-loading="detailLoading" stripe border max-height="480">
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="bizTagType(row.bizType)" size="small">{{ bizTypeText(row.bizType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="单号" min-width="140">
          <template #default="{ row }">{{ row.docCode || row.docId }}</template>
        </el-table-column>
        <el-table-column label="日期" width="110">
          <template #default="{ row }">{{ formatDocDate(row.docDate) }}</template>
        </el-table-column>
        <el-table-column label="销售金额" width="110" align="right">
          <template #default="{ row }">¥{{ Number(row.amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="提成（6%）" width="110" align="right">
          <template #default="{ row }">
            <span :style="{ color: Number(row.commissionAmount || 0) >= 0 ? '#67c23a' : '#f56c6c', fontWeight: 600 }">
              {{ Number(row.commissionAmount || 0) >= 0 ? '+' : '' }}¥{{ Number(row.commissionAmount || 0).toFixed(2) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getStoreCommissionSummaries, getStoreCommissionDetail } from '@/api/finance'
import type { StoreCommissionSummary, CommissionLedger } from '@/types'

const summaries = ref<StoreCommissionSummary[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailStoreName = ref('')
const detailLedgers = ref<CommissionLedger[]>([])
const detailLoading = ref(false)

const bizTypeMap: Record<string, string> = {
  sale: '销售',
  void_sale: '作废销售',
  return: '退货',
  void_return: '作废退货',
  gift: '赠送',
  void_gift: '作废赠送',
}

const bizTagMap: Record<string, string> = {
  sale: 'success',
  void_sale: 'danger',
  return: 'warning',
  void_return: 'info',
  gift: '',
  void_gift: 'danger',
}

function bizTypeText(type: string) {
  return bizTypeMap[type] || type
}

function bizTagType(type: string): any {
  return bizTagMap[type] || ''
}

function formatDocDate(val: any) {
  if (!val) return '-'
  // 后端可能返回时间戳数字或字符串
  const d = typeof val === 'number' ? new Date(val) : new Date(val)
  if (isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString('zh-CN')
}

// 按 docId 聚合：每张单据一行
const docSummaries = computed(() => {
  const groups = new Map<string, {
    docId: string; docCode: string; docDate: any; bizType: string; amount: number; commissionAmount: number
  }>()
  for (const item of detailLedgers.value) {
    const docId = item.docId || 'unknown'
    if (!groups.has(docId)) {
      groups.set(docId, {
        docId,
        docCode: item.docCode || docId,
        docDate: item.docDate,
        bizType: item.bizType || item.docType || 'sale',
        amount: 0,
        commissionAmount: 0,
      })
    }
    const g = groups.get(docId)!
    g.amount += Number(item.amount || 0)
    g.commissionAmount += Number(item.commissionAmount || 0)
  }
  return Array.from(groups.values()).sort((a, b) => {
    const da = a.docDate ? new Date(a.docDate).getTime() : 0
    const db = b.docDate ? new Date(b.docDate).getTime() : 0
    return db - da
  })
})

const detailSaleCommission = computed(() =>
  docSummaries.value
    .filter(d => d.bizType === 'sale' || d.bizType === 'gift')
    .reduce((s, d) => s + Number(d.commissionAmount || 0), 0)
)
const detailReturnCommission = computed(() =>
  docSummaries.value
    .filter(d => d.bizType === 'return' || d.bizType === 'void_sale' || d.bizType === 'void_gift')
    .reduce((s, d) => s + Number(d.commissionAmount || 0), 0)
)
const detailNetCommission = computed(() =>
  docSummaries.value.reduce((s, d) => s + Number(d.commissionAmount || 0), 0)
)

async function loadData() {
  loading.value = true
  try {
    summaries.value = await getStoreCommissionSummaries()
  } finally {
    loading.value = false
  }
}

async function showDetail(row: StoreCommissionSummary) {
  detailStoreName.value = row.storeName
  detailVisible.value = true
  detailLoading.value = true
  try {
    detailLedgers.value = await getStoreCommissionDetail(row.storeId)
  } finally {
    detailLoading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.store-finance-page {
  padding: 20px;
}

.detail-summary {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 14px;
  color: var(--el-text-color-regular, #606266);
}
</style>
