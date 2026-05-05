<template>
  <view class="sales-page">
    <view class="header">
      <text class="title">销退</text>
    </view>

    <view class="content">
      <view class="tabs">
        <view class="tab sale-tab" :class="{active: activeTab==='sale'}" @tap="switchTab('sale')">
          <text class="tab-title">销售</text>
          <text class="tab-desc">开销单、看历史</text>
        </view>
        <view class="tab return-tab" :class="{active: activeTab==='return'}" @tap="switchTab('return')">
          <text class="tab-title">退货</text>
          <text class="tab-desc">处理退单</text>
        </view>
        <view class="tab unsettled-tab" :class="{active: activeTab==='unsettled'}" @tap="switchTab('unsettled')">
          <text class="tab-title">未收款</text>
          <text class="tab-desc">确认已收款</text>
        </view>
      </view>

      <view v-if="userStore.isAdmin" class="search-bar">
        <input v-model="searchKeyword" class="search-input" placeholder="搜索单号" />
        <text v-if="searchKeyword" class="search-clear" @tap="searchKeyword = ''">×</text>
      </view>

      <view class="range-bar">
        <view class="range-chips">
          <view class="chip" :class="{ active: rangeMode === '7d' }" @tap="setRangeMode('7d')">7天</view>
          <view class="chip" :class="{ active: rangeMode === '30d' }" @tap="setRangeMode('30d')">30天</view>
          <view class="chip" :class="{ active: rangeMode === 'custom' }" @tap="setRangeMode('custom')">选择日期范围</view>
        </view>
        <view v-if="rangeMode === 'custom'" class="custom-range">
          <picker mode="date" :value="customStart" @change="onStartDateChange">
            <view class="date-box">{{ customStart || '开始日期' }}</view>
          </picker>
          <text class="range-sep">至</text>
          <picker mode="date" :value="customEnd" @change="onEndDateChange">
            <view class="date-box">{{ customEnd || '结束日期' }}</view>
          </picker>
        </view>
      </view>

      <view class="range-summary">当前筛选：{{ rangeSummaryText }}</view>

      <view v-if="activeTab==='sale'">
        <view class="actions">
          <button class="btn-create" @tap="goCreate">创建销单</button>
        </view>
        <view v-if="filteredSales.length === 0" class="empty">暂无销单</view>
        <view v-for="doc in filteredSales" :key="doc.id" class="sale-card" @tap="goDetail(doc)">
          <view class="row">
            <text class="code">{{ doc.code }}</text>
            <text v-if="doc.docType === 'gift'" class="gift-tag">[赠送]</text>
            <text class="status" :class="statusClass(doc)">{{ statusText(doc) }}</text>
          </view>
          <view class="row">
            <text class="store">{{ getStoreName(doc.storeId) }}</text>
            <text class="date">{{ doc.date }}</text>
          </view>
          <view class="row">
            <text class="qty">数量: {{ totalQty(doc) }}袋</text>
            <text class="amount">金额: ¥{{ totalAmount(doc).toFixed(2) }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="activeTab==='return'">
        <view class="actions">
          <button class="btn-create" @tap="goReturnCreate">创建退货单</button>
        </view>
        <view v-if="filteredReturns.length === 0" class="empty">暂无退货单</view>
        <view v-for="doc in filteredReturns" :key="doc.id" class="sale-card" @tap="goReturnDetail(doc.id)">
          <view class="row">
            <text class="code">{{ doc.code }}</text>
            <text class="status" :class="doc.status">{{ statusTextByStatus(doc.status) }}</text>
          </view>
          <view class="row">
            <text class="store">{{ getStoreName(doc.storeId) }}</text>
            <text class="date">{{ doc.date }}</text>
          </view>
          <view class="row">
            <text class="qty">数量: {{ totalReturnQty(doc) }}袋</text>
            <text class="amount">金额: ¥{{ totalReturnAmount(doc).toFixed(2) }}</text>
          </view>
        </view>
      </view>

      <view v-else>
        <view v-if="unsettledLoading" class="empty">加载中...</view>
        <view v-else-if="filteredUnsettledDocs.length === 0" class="empty">暂无未收款销单</view>
        <view v-for="doc in filteredUnsettledDocs" :key="doc.id" class="sale-card">
          <view class="row">
            <text class="code">{{ doc.code }}</text>
            <text v-if="doc.docType === 'gift'" class="gift-tag">[赠送]</text>
            <text class="unsettled-tag">未收款</text>
          </view>
          <view class="row">
            <text class="store">{{ getStoreName(doc.storeId) }}</text>
            <text class="date">{{ doc.date }}</text>
          </view>
          <view class="row">
            <text class="qty">数量: {{ totalQty(doc) }}袋</text>
            <text class="amount">金额: ¥{{ totalAmount(doc).toFixed(2) }}</text>
          </view>
          <view class="row settle-row">
            <button class="btn-settle" @tap.stop="doSettle(doc)">确认收款</button>
            <button class="btn-detail" @tap.stop="goDetail(doc)">详情</button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getReturns, getSales, getSessionSalespersonId, getStores, getUnsettledSales, isSameSalespersonId, settleSale } from '@/api'
import type { ReturnDoc, SaleDoc, Store } from '@/types'
import { formatDate } from '@/utils'

const userStore = useUserStore()
const activeTab = ref<'sale'|'return'|'unsettled'>('sale')
const sales = ref<SaleDoc[]>([])
const returns = ref<ReturnDoc[]>([])
const stores = ref<Store[]>([])
const searchKeyword = ref('')
const unsettledDocs = ref<SaleDoc[]>([])
const unsettledLoading = ref(false)
const rangeMode = ref<'7d' | '30d' | 'custom'>('7d')
const customStart = ref('')
const customEnd = ref('')

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  date.setHours(0, 0, 0, 0)
  return date
}

function todayString() {
  return formatDate(startOfToday(), 'YYYY-MM-DD')
}

function daysAgoString(days: number) {
  const date = startOfToday()
  date.setDate(date.getDate() - days)
  return formatDate(date, 'YYYY-MM-DD')
}

function normalizeRange() {
  if (rangeMode.value !== 'custom') return
  if (customStart.value && customEnd.value && customStart.value > customEnd.value) {
    const temp = customStart.value
    customStart.value = customEnd.value
    customEnd.value = temp
  }
}

function inDateWindow(value: string, startDaysAgo: number) {
  const docDate = parseLocalDate(value)
  if (!docDate) return false
  const start = startOfToday()
  start.setDate(start.getDate() - startDaysAgo)
  return docDate.getTime() >= start.getTime()
}

function inCustomRange(value: string) {
  const docDate = parseLocalDate(value)
  const start = parseLocalDate(customStart.value)
  const end = parseLocalDate(customEnd.value)
  if (!docDate || !start || !end) return true
  return docDate.getTime() >= start.getTime() && docDate.getTime() <= end.getTime()
}
function setRangeMode(mode: '7d' | '30d' | 'custom') {
  rangeMode.value = mode
  if (mode === 'custom') {
    if (!customEnd.value) customEnd.value = todayString()
    if (!customStart.value) customStart.value = daysAgoString(6)
    normalizeRange()
  }
}

function onStartDateChange(e: any) {
  customStart.value = e.detail.value
  normalizeRange()
}

function onEndDateChange(e: any) {
  customEnd.value = e.detail.value
  normalizeRange()
}

const rangeSummaryText = computed(() => {
  if (rangeMode.value === '7d') return '最近7天'
  if (rangeMode.value === '30d') return '最近30天'
  return `${customStart.value || '开始日期'} 至 ${customEnd.value || '结束日期'}`
})

function inCurrentRange(date: string) {
  if (!date) return false
  if (rangeMode.value === '7d') {
    return inDateWindow(date, 6)
  }
  if (rangeMode.value === '30d') {
    return inDateWindow(date, 29)
  }
  if (!customStart.value || !customEnd.value) return true
  return inCustomRange(date)
}

function filterBySearch<T extends { code?: string }>(list: T[]) {
  const key = searchKeyword.value.trim().toLowerCase()
  if (!key) return list
  return list.filter(item => (item.code || '').toLowerCase().includes(key))
}

const filteredSales = computed(() => filterBySearch(sales.value.filter(doc => inCurrentRange(doc.date))))
const filteredReturns = computed(() => filterBySearch(returns.value.filter(doc => inCurrentRange(doc.date))))
const filteredUnsettledDocs = computed(() => filterBySearch(unsettledDocs.value.filter(doc => inCurrentRange(doc.date))))

function switchTab(tab: 'sale' | 'return' | 'unsettled') {
  activeTab.value = tab
  searchKeyword.value = ''
  if (tab === 'unsettled') loadUnsettled()
}

function goReturnCreate() { uni.navigateTo({ url: '/pages/return/create' }) }
function goReturnDetail(id: string) { uni.navigateTo({ url: `/pages/return/detail?id=${id}` }) }

function totalReturnQty(doc: ReturnDoc) { return doc.lines.reduce((sum, line) => sum + line.qty, 0) }
function totalReturnAmount(doc: ReturnDoc) { return doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0) }

const listReturns = async () => {
  const docs = await getReturns()
  const currentSalespersonId = getSessionSalespersonId(userStore.currentUser)
  returns.value = userStore.isAdmin ? docs : docs.filter(doc => isSameSalespersonId(doc.salespersonId, currentSalespersonId))
}

const listSales = async () => {
  const saleList = await getSales()
  const currentSalespersonId = getSessionSalespersonId(userStore.currentUser)
  sales.value = userStore.isAdmin ? saleList : saleList.filter(doc => isSameSalespersonId(doc.salespersonId, currentSalespersonId))
}

const loadAll = async () => {
  stores.value = await getStores()
  await Promise.all([listSales(), listReturns()])
}

async function loadUnsettled() {
  unsettledLoading.value = true
  try {
    const docs = await getUnsettledSales()
    const currentSalespersonId = getSessionSalespersonId(userStore.currentUser)
    unsettledDocs.value = userStore.isAdmin ? docs : docs.filter(doc => isSameSalespersonId(doc.salespersonId, currentSalespersonId))
  } catch {
    unsettledDocs.value = []
  } finally {
    unsettledLoading.value = false
  }
}

function doSettle(doc: SaleDoc) {
  uni.showModal({
    title: '确认收款',
    content: `确认「${doc.code}」已收款？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await settleSale(doc.id)
        uni.showToast({ title: '已确认收款', icon: 'success' })
        await loadUnsettled()
      } catch (e: any) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none' })
      }
    },
  })
}

function goCreate() {
  uni.navigateTo({ url: '/pages/sales/create' })
}

function goDetail(doc: SaleDoc) {
  if (doc.status === 'draft') {
    uni.navigateTo({ url: `/pages/sales/create?draftId=${doc.id}` })
  } else {
    uni.navigateTo({ url: `/pages/sales/detail?id=${doc.id}` })
  }
}

function statusText(doc: SaleDoc) {
  if (doc.status === 'voided') return '已作废'
  if (doc.status === 'draft') return '草稿'
  if (doc.status === 'posted') return (doc.settled ?? 0) === 0 ? '未结清' : '已过账'
  return doc.status
}

function statusTextByStatus(status: string) {
  const map: Record<string, string> = { draft: '草稿', posted: '已过账', voided: '已作废' }
  return map[status] || status
}

function statusClass(doc: SaleDoc) {
  if (doc.status === 'voided') return 'voided'
  if (doc.status === 'draft') return 'draft'
  if (doc.status === 'posted') return (doc.settled ?? 0) === 0 ? 'unsettled' : 'posted'
  return ''
}

function totalQty(doc: SaleDoc) {
  return doc.lines.reduce((sum, line) => sum + line.qty, 0)
}

function totalAmount(doc: SaleDoc) {
  return doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0)
}

function getStoreName(id: string) {
  return stores.value.find(store => store.id === id)?.name || id
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  setRangeMode('7d')
  loadAll()
})
</script>

<style lang="scss" scoped>
.sales-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #fff;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));

  .title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
  }
}

.content {
  padding: 30rpx;
}

.tabs {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 132rpx;
  text-align: center;
  padding: 18rpx 10rpx;
  font-size: 28rpx;
  color: #4b5563;
  background: #fff;
  border: 3rpx solid #dbe3ee;
  border-radius: 20rpx;
  box-sizing: border-box;
}

.tab:not(.active) {
  box-shadow: 0 4rpx 10rpx rgba(15, 23, 42, 0.05);
}

.bottom-action-cards {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}

.bottom-action-card {
  flex: 1;
  min-height: 120rpx;
  padding: 18rpx 16rpx;
  border-radius: 18rpx;
  background: #fff;
  border: 3rpx solid #dbe3ee;
  box-sizing: border-box;
}

.bottom-action-card .action-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
}

.bottom-action-card .action-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
}

.bottom-action-card.sale {
  border-color: #14b8a6;
  background: #f0fdfa;
}

.bottom-action-card.return {
  border-color: #f97316;
  background: #fff7ed;
}

.bottom-action-card.unsettled {
  border-color: #ef4444;
  background: #fef2f2;
}

.bottom-action-card.sale .action-title { color: #0f766e; }
.bottom-action-card.return .action-title { color: #9a3412; }
.bottom-action-card.unsettled .action-title { color: #b91c1c; }

.tab-title {
  font-size: 30rpx;
  font-weight: 700;
}

.tab-desc {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #94a3b8;
}

.tab.sale-tab.active {
  color: #0f766e;
  border-color: #14b8a6;
  background: #f0fdfa;
  box-shadow: 0 6rpx 16rpx rgba(20, 184, 166, 0.12);
}

.tab.return-tab.active {
  color: #9a3412;
  border-color: #f97316;
  background: #fff7ed;
  box-shadow: 0 6rpx 16rpx rgba(249, 115, 22, 0.12);
}

.tab.unsettled-tab.active {
  color: #b91c1c;
  border-color: #ef4444;
  background: #fef2f2;
  box-shadow: 0 6rpx 16rpx rgba(239, 68, 68, 0.12);
}

.usage-tip {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  background: #fffbe6;
  border: 2rpx solid #ffe58f;
  border-radius: 14rpx;
  color: #8c6d1f;
  font-size: 24rpx;
  line-height: 1.6;
}

.search-bar {
  position: relative;
  margin-bottom: 20rpx;

  .search-input {
    width: 100%;
    height: 72rpx;
    padding: 0 80rpx 0 24rpx;
    background: #fff;
    border-radius: 36rpx;
    font-size: 28rpx;
    border: 1rpx solid #e8e8e8;
  }

  .search-clear {
    position: absolute;
    right: 24rpx;
    top: 50%;
    transform: translateY(-50%);
    width: 48rpx;
    height: 48rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: #999;
    background: #f5f5f5;
    border-radius: 50%;
  }
}

.range-bar {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 16rpx;
}

.range-chips {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
}

.chip {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: #f2f3f5;
  color: #666;
  font-size: 24rpx;
}

.chip.active {
  background: #1677ff;
  color: #fff;
}

.custom-range {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 20rpx;
}

.date-box {
  min-width: 220rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: #f7f8fa;
  color: #333;
  font-size: 24rpx;
  text-align: center;
}

.range-sep {
  color: #666;
  font-size: 24rpx;
}

.range-summary {
  margin-bottom: 20rpx;
  padding: 0 8rpx;
  font-size: 24rpx;
  color: #666;
}

.actions {
  margin-bottom: 20rpx;

  .btn-create {
    width: 100%;
    height: 88rpx;
    background: #1890ff;
    color: #fff;
    font-size: 32rpx;
    border-radius: 44rpx;
    border: none;

    &::after {
      border: none;
    }
  }
}

.empty {
  text-align: center;
  padding: 60rpx 0;
  color: #999;
}

.sale-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;

  .row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8rpx;
  }

  .code {
    font-size: 30rpx;
    color: #333;
    font-weight: 600;
  }

  .gift-tag {
    font-size: 22rpx;
    color: #fa8c16;
    margin-left: 8rpx;
  }

  .status {
    font-size: 24rpx;
    color: #999;
  }

  .status.posted { color: #52c41a; }
  .status.voided { color: #ff4d4f; }
  .status.unsettled { color: #fa8c16; }
  .status.draft { color: #999; }

  .store, .date, .qty, .amount {
    font-size: 24rpx;
    color: #666;
  }

  .unsettled-tag {
    font-size: 22rpx;
    color: #ff4d4f;
    background: #fff1f0;
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
  }

  .settle-row {
    margin-top: 8rpx;
    gap: 16rpx;
  }

  .btn-settle {
    flex: 1;
    height: 64rpx;
    background: #52c41a;
    color: #fff;
    font-size: 26rpx;
    border-radius: 32rpx;
    border: none;
    line-height: 64rpx;
  }

  .btn-settle::after {
    border: none;
  }

  .btn-detail {
    flex: 1;
    height: 64rpx;
    background: #fff;
    color: #1890ff;
    font-size: 26rpx;
    border-radius: 32rpx;
    border: 2rpx solid #1890ff;
    line-height: 64rpx;
  }

  .btn-detail::after {
    border: none;
  }
}
</style>
