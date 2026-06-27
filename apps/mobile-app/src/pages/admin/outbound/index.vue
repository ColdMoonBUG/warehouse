<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">出库单</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="actions"><button class="btn" @tap="goCreate">新增出库单</button></view>
      <view class="filter-bar">
        <picker mode="date" :value="filterDate" @change="onDateChange">
          <view class="date-picker">
            <text>{{ filterDate || '选择日期筛选' }}</text>
            <text v-if="filterDate" class="date-clear" @tap.stop="clearDate">×</text>
          </view>
        </picker>
      </view>
      <view v-if="filteredList.length===0" class="empty">{{ filterDate ? '该日期无出库单' : '暂无出库单' }}</view>
      <view v-for="doc in filteredList" :key="doc.id" class="card" @tap="goEdit(doc)">
        <view class="row">
          <text class="code">{{ doc.code }}</text>
          <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
        </view>
        <view class="row">
          <text class="warehouse">{{ whName(doc.fromWarehouseId) }} → {{ whName(doc.toWarehouseId) }}</text>
          <text class="date">{{ doc.date }}</text>
        </view>
        <view class="row summary-row">
          <text class="qty">{{ totalQty(doc) }}袋</text>
          <text class="sku">{{ doc.lines?.length || 0 }}种商品</text>
        </view>
        <view v-if="doc.remark" class="row">
          <text class="remark">{{ doc.remark }}</text>
        </view>
        <view v-if="doc.status === 'posted' && doc.lines?.length" class="remain-block">
          <view class="remain-head" @tap.stop="toggleRemain(doc.id)">
            <text class="remain-title">当天出库后剩余</text>
            <text class="remain-toggle">{{ expandedDocIds[doc.id] ? '收起' : '展开' }}</text>
          </view>
          <view v-if="expandedDocIds[doc.id]" class="remain-list">
            <view v-for="line in doc.lines" :key="line.id" class="remain-item">
              <template v-if="remainingText(line)">
                <text class="remain-name">{{ productName(line.productId) }}</text>
                <text class="remain-value">{{ remainingText(line) }}</text>
              </template>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getTransfers } from '@/api'
import type { TransferDoc } from '@/types'
import { formatRemainingStockText, normalizeCount } from '@/utils'

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const list = ref<TransferDoc[]>([])
const filterDate = ref('')
const expandedDocIds = ref<Record<string, boolean>>({})

const filteredList = computed(() => {
  if (!filterDate.value) return list.value
  return list.value.filter(d => d.date === filterDate.value)
})

function onDateChange(e: any) {
  filterDate.value = e.detail.value
}

function clearDate() {
  filterDate.value = ''
}

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function statusText(status: string) {
  if (status === 'posted') return '已过账'
  if (status === 'voided') return '已作废'
  return '草稿'
}

function whName(id: string) {
  return referenceStore.warehouses.find(w => w.id === id)?.name || id
}

function productName(productId: string) {
  return referenceStore.products.find(product => product.id === productId)?.name || productId
}

function totalQty(doc: TransferDoc) {
  return (doc.lines || []).reduce((sum, line) => sum + normalizeCount(line.qty), 0)
}

function remainingText(line: { remainingQty?: number; productId?: string }) {
  if (line.remainingQty === null || line.remainingQty === undefined) return ''
  const product = line.productId ? referenceStore.products.find(p => p.id === line.productId) : undefined
  return formatRemainingStockText(line.remainingQty, product?.boxQty)
}

function toggleRemain(docId: string) {
  expandedDocIds.value = {
    ...expandedDocIds.value,
    [docId]: !expandedDocIds.value[docId],
  }
}

function goCreate() { uni.navigateTo({ url: '/pages/admin/outbound/form' }) }
function goEdit(doc: TransferDoc) { uni.navigateTo({ url: `/pages/admin/outbound/form?id=${doc.id}` }) }
function goBack() { uni.navigateBack() }

onShow(async () => {
  userStore.init()
  if (!guard()) return
  referenceStore.hydrate()
  try {
    list.value = await getTransfers()
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
  referenceStore.preloadCore()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.actions { margin-bottom: 20rpx; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:32rpx; border:none; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:6rpx; gap: 16rpx; }
.code { font-size:30rpx; color:#333; font-weight:500; }
.warehouse { font-size:28rpx; color:#1890ff; }
.date { font-size:24rpx; color:#666; }
.qty, .sku { font-size:24rpx; color:#666; }
.remark { font-size:24rpx; color:#666; flex:1; }
.status { font-size:24rpx; }
.status.posted { color:#52c41a; }
.status.voided { color:#ff4d4f; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
.filter-bar { margin-bottom: 16rpx; }
.date-picker { display: flex; align-items: center; justify-content: space-between; height: 72rpx; padding: 0 24rpx; background: #fff; border-radius: 36rpx; font-size: 28rpx; border: 1rpx solid #e8e8e8; }
.date-clear { font-size: 36rpx; color: #999; padding-left: 16rpx; }
.summary-row { margin-top: 6rpx; }
.remain-block { margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid #f0f0f0; }
.remain-head { display:flex; align-items:center; justify-content:space-between; }
.remain-title { font-size:24rpx; color:#333; font-weight:500; }
.remain-toggle { font-size:22rpx; color:#1890ff; }
.remain-list { margin-top: 12rpx; display:flex; flex-direction:column; gap:8rpx; }
.remain-item { display:flex; align-items:center; justify-content:space-between; gap:16rpx; }
.remain-name { flex:1; font-size:24rpx; color:#666; }
.remain-value { font-size:24rpx; color:#0f766e; }
</style>
