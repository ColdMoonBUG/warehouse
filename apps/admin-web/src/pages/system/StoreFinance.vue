<template>
  <div class="store-finance-page">
    <el-card>
      <template #header>
        <span>超市销售流水汇总</span>
      </template>

      <el-table :data="summaries" v-loading="loading" stripe>
        <el-table-column prop="storeName" label="超市名称" min-width="160" />
        <el-table-column prop="saleCommission" label="销售提成" min-width="120" align="right">
          <template #default="{ row }">
            <span>{{ row.saleCommission.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="returnCommission" label="退货提成" min-width="120" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.returnCommission < 0 ? '#f56c6c' : '' }">{{ row.returnCommission.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="netCommission" label="净提成" min-width="120" align="right">
          <template #default="{ row }">
            <span style="font-weight: 600">{{ row.netCommission.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ledgerCount" label="流水笔数" width="100" align="center" />
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" :title="`${detailStoreName} - 提成流水`" width="900px">
      <el-table :data="detailLedgers" v-loading="detailLoading" stripe max-height="500">
        <el-table-column prop="bizType" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="bizTypeTag(row.bizType)" size="small">{{ bizTypeText(row.bizType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="productId" label="商品" min-width="120" />
        <el-table-column prop="qty" label="数量" width="80" align="right" />
        <el-table-column prop="price" label="单价" width="80" align="right">
          <template #default="{ row }">{{ (row.price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="100" align="right">
          <template #default="{ row }">{{ (row.amount || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="commissionAmount" label="提成" width="100" align="right">
          <template #default="{ row }">
            <span :style="{ color: row.commissionAmount < 0 ? '#f56c6c' : '#67c23a' }">{{ (row.commissionAmount || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  void_sale: '销售作废',
  return: '退货',
  void_return: '退货作废',
}

const bizTagMap: Record<string, string> = {
  sale: 'success',
  void_sale: 'danger',
  return: 'warning',
  void_return: 'info',
}

function bizTypeText(type: string) {
  return bizTypeMap[type] || type
}

function bizTypeTag(type: string) {
  return (bizTagMap[type] || '') as any
}

function formatDate(val: string) {
  if (!val) return '-'
  return new Date(val).toLocaleString('zh-CN')
}

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
</style>
