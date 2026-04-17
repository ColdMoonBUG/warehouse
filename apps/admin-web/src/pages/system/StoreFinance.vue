<template>
  <div class="store-finance-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <span class="page-title">收益流水</span>
          <el-date-picker
            v-model="queryDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width:150px"
            @change="loadData"
          />
          <el-button type="primary" size="small" @click="loadData">刷新</el-button>
        </div>
      </template>

      <!-- 顶部汇总 -->
      <div class="summary-bar" v-if="summaries.length > 0">
        <span>共 <b>{{ totalDocCount }}</b> 笔</span>
        <span>净提成合计：<b class="amount-green">+¥{{ totalNetCommission.toFixed(2) }}</b></span>
      </div>

      <div v-loading="loading">
        <div v-if="summaries.length === 0 && !loading" class="empty-tip">暂无数据</div>

        <div v-for="row in summaries" :key="row.storeId" class="store-item">
          <!-- 超市行：点击展开 -->
          <div class="store-row" @click="toggleStore(row)">
            <span class="store-name">{{ row.storeName }}</span>
            <span class="store-right">
              <span class="commission-amount">+¥{{ Number(row.netCommission || 0).toFixed(2) }}</span>
              <span class="doc-count">{{ getDocCount(row.storeId) }}笔</span>
              <el-icon class="expand-icon" :class="{ rotated: expandedStoreId === row.storeId }">
                <ArrowRight />
              </el-icon>
            </span>
          </div>

          <!-- 展开：该超市当日各张销单 -->
          <div v-if="expandedStoreId === row.storeId" class="doc-list">
            <div v-if="detailLoading" class="doc-loading">加载中...</div>
            <div v-else-if="filteredDocList.length === 0" class="doc-loading">暂无明细</div>
            <div v-for="doc in filteredDocList" :key="doc.docId" class="doc-row">
              <span class="doc-code">{{ doc.docCode }}</span>
              <span class="doc-type-tag" :class="doc.bizType === 'gift' ? 'tag-gift' : 'tag-sale'">
                {{ doc.bizType === 'gift' ? '赠送' : '销售' }}
              </span>
              <span class="doc-amount">¥{{ doc.amount.toFixed(2) }}</span>
              <span class="doc-commission" :class="doc.commissionAmount >= 0 ? 'amount-green' : 'amount-red'">
                {{ doc.commissionAmount >= 0 ? '+' : '' }}¥{{ doc.commissionAmount.toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { getStoreCommissionSummaries, getStoreCommissionDetail } from '@/api/finance'
import type { StoreCommissionSummary, CommissionLedger } from '@/types'

const today = new Date().toISOString().slice(0, 10)
const queryDate = ref(today)

const summaries = ref<StoreCommissionSummary[]>([])
const loading = ref(false)
const expandedStoreId = ref<string | null>(null)
// 原始流水 → 前端按 queryDate 过滤 + 按 docId 聚合
const rawLedgers = ref<CommissionLedger[]>([])
const detailLoading = ref(false)

// 按 docId 聚合，过滤出当天数据
const filteredDocList = computed(() => {
  const dateStr = queryDate.value  // "2026-04-17"
  const filtered = rawLedgers.value.filter(l => {
    if (!l.docDate) return true  // 无日期不过滤
    const d = typeof l.docDate === 'string' ? l.docDate : new Date(l.docDate).toISOString()
    return d.startsWith(dateStr)
  })

  const groups = new Map<string, { docId: string; docCode: string; bizType: string; amount: number; commissionAmount: number }>()
  for (const l of filtered) {
    const key = l.docId || 'unknown'
    if (!groups.has(key)) {
      groups.set(key, {
        docId: key,
        docCode: l.docCode || key,
        bizType: l.bizType || 'sale',
        amount: 0,
        commissionAmount: 0,
      })
    }
    const g = groups.get(key)!
    g.amount += Number(l.amount || 0)
    g.commissionAmount += Number(l.commissionAmount || 0)
  }
  return Array.from(groups.values())
})

// 缓存：每个 storeId 展开后的 docCount（从已加载数据中算）
const docCountCache = ref<Record<string, number>>({})

function getDocCount(storeId: string): number {
  if (storeId === expandedStoreId.value) return filteredDocList.value.length
  return docCountCache.value[storeId] ?? '?'
}

const totalDocCount = computed(() =>
  summaries.value.reduce((s, r) => {
    const cached = docCountCache.value[r.storeId]
    return s + (cached ?? 0)
  }, 0)
)

const totalNetCommission = computed(() =>
  summaries.value.reduce((s, r) => s + Number(r.netCommission || 0), 0)
)

async function loadData() {
  loading.value = true
  expandedStoreId.value = null
  rawLedgers.value = []
  docCountCache.value = {}
  try {
    summaries.value = await getStoreCommissionSummaries(queryDate.value)
  } finally {
    loading.value = false
  }
}

async function toggleStore(row: StoreCommissionSummary) {
  if (expandedStoreId.value === row.storeId) {
    expandedStoreId.value = null
    rawLedgers.value = []
    return
  }
  expandedStoreId.value = row.storeId
  rawLedgers.value = []
  detailLoading.value = true
  try {
    rawLedgers.value = await getStoreCommissionDetail(row.storeId)
    // 缓存 docCount 供顶部汇总显示
    docCountCache.value[row.storeId] = filteredDocList.value.length
  } finally {
    detailLoading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.store-finance-page { padding: 20px; }

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.summary-bar {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 14px;
  color: #606266;
}

.amount-green { color: #67c23a; font-weight: 600; }
.amount-red   { color: #f56c6c; font-weight: 600; }

.store-item { border-bottom: 1px solid #ebeef5; }

.store-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s;
}
.store-row:hover { background: #f5f7fa; }

.store-name { font-size: 15px; font-weight: 500; color: #303133; }

.store-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.commission-amount { font-size: 16px; font-weight: 700; color: #67c23a; }

.doc-count {
  font-size: 13px;
  color: #909399;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
}

.expand-icon { color: #c0c4cc; transition: transform 0.2s; }
.expand-icon.rotated { transform: rotate(90deg); }

.doc-list {
  background: #fafafa;
  border-top: 1px solid #ebeef5;
  padding: 4px 0;
}

.doc-loading { padding: 12px 32px; font-size: 13px; color: #909399; }

.doc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 32px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
  color: #606266;
}
.doc-row:last-child { border-bottom: none; }

.doc-code { flex: 1; font-family: monospace; color: #303133; }

.doc-type-tag { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-sale { background: #ecf5ff; color: #409eff; }
.tag-gift { background: #fdf6ec; color: #e6a23c; }

.doc-amount { color: #606266; min-width: 80px; text-align: right; }
.doc-commission { min-width: 80px; text-align: right; font-weight: 600; }

.empty-tip { text-align: center; padding: 40px; color: #c0c4cc; font-size: 14px; }
</style>
