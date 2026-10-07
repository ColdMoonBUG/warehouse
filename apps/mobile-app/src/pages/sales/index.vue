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
        <view v-if="filteredSales.length === 0" class="empty">{{ current.loading ? '加载中...' : (current.error || '暂无销单') }}</view>
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
        <view v-if="filteredReturns.length === 0" class="empty">{{ current.loading ? '加载中...' : (current.error || '暂无退货单') }}</view>
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
        <view v-if="filteredUnsettledDocs.length === 0" class="empty">{{ current.loading ? '加载中...' : (current.error || '暂无未收款销单') }}</view>
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

      <view v-if="current.list.length > 0" class="list-footer">
        <text v-if="current.loading">加载中...</text>
        <text v-else-if="current.list.length < current.total" class="load-more" @tap="loadMore">已显示 {{ current.list.length }} / {{ current.total }}，点击加载更多</text>
        <text v-else>共 {{ current.total }} 张</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onReachBottom, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSessionSalespersonId, getStores, queryReturns, querySales, queryUnsettledSales, settleSale } from '@/api'
import type { DocPage, DocQuery } from '@/api'
import type { ReturnDoc, SaleDoc, Store } from '@/types'
import { debounce, formatDate } from '@/utils'
import { readListCache, writeListCache } from '@/utils/list-cache'

type Tab = 'sale' | 'return' | 'unsettled'
interface TabState {
  list: any[]
  total: number
  page: number
  loading: boolean
  error: string
  key: string
  seq: number
}

// 每次只向服务器要一页（50 张）当前筛选范围内、当前业务员的单据，不再把全部历史单据拉到手机上
const PAGE_SIZE = 50

const userStore = useUserStore()
const activeTab = ref<Tab>('sale')
const stores = ref<Store[]>([])
const searchKeyword = ref('')
const tabs = reactive<Record<Tab, TabState>>({
  sale: { list: [], total: 0, page: 0, loading: false, error: '', key: '', seq: 0 },
  return: { list: [], total: 0, page: 0, loading: false, error: '', key: '', seq: 0 },
  unsettled: { list: [], total: 0, page: 0, loading: false, error: '', key: '', seq: 0 },
})
const current = computed(() => tabs[activeTab.value])
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

/** 当前日期筛选对应的查询范围（与原来的“最近 N 天”口径一致：只限制起始日） */
function rangeDates(): Pick<DocQuery, 'startDate' | 'endDate'> {
  if (rangeMode.value === '7d') return { startDate: daysAgoString(6) }
  if (rangeMode.value === '30d') return { startDate: daysAgoString(29) }
  const start = parseLocalDate(customStart.value)
  const end = parseLocalDate(customEnd.value)
  if (!start || !end) return {}
  return { startDate: customStart.value, endDate: customEnd.value }
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

const filteredSales = computed(() => tabs.sale.list as SaleDoc[])
const filteredReturns = computed(() => tabs.return.list as ReturnDoc[])
const filteredUnsettledDocs = computed(() => tabs.unsettled.list as SaleDoc[])

function buildQuery(): DocQuery {
  const query: DocQuery = { ...rangeDates(), limit: PAGE_SIZE }
  const keyword = searchKeyword.value.trim()
  if (keyword) query.keyword = keyword
  if (!userStore.isAdmin) query.salespersonId = getSessionSalespersonId(userStore.currentUser)
  return query
}

function fetchPage(tab: Tab, query: DocQuery): Promise<DocPage<any>> {
  if (tab === 'sale') return querySales(query)
  if (tab === 'return') return queryReturns(query)
  return queryUnsettledSales(query)
}

/** 加载某个页签；reset=true 从第一页重新查（先显示缓存，后台刷新），否则加载下一页 */
async function loadTab(tab: Tab, reset = true) {
  const state = tabs[tab]
  const query = buildQuery()
  const key = `${tab}|${userStore.currentUser?.accountId || ''}|${JSON.stringify(query)}`
  if (reset) {
    const cached = readListCache<any>(key)
    if (cached) {
      state.list = cached.list
      state.total = cached.total
      state.page = cached.page
    } else if (state.key !== key) {
      state.list = []
      state.total = 0
      state.page = 0
    }
    state.key = key
  } else if (state.loading || state.list.length >= state.total) {
    return
  }
  // 只采用最后一次请求的结果，先发后到的旧结果直接丢弃
  const seq = ++state.seq
  state.loading = true
  state.error = ''
  try {
    if (reset) {
      // 重新查询时把已经展开的页数一次取回，避免“加载更多”的位置被重置
      const pages = Math.min(Math.max(1, state.page), 10)
      const res = await fetchPage(tab, { ...query, page: 1, limit: PAGE_SIZE * pages })
      if (seq !== state.seq) return
      state.list = res.list
      state.total = res.total
      state.page = pages
    } else {
      const res = await fetchPage(tab, { ...query, page: state.page + 1 })
      if (seq !== state.seq) return
      state.list = [...state.list, ...res.list]
      state.total = res.total
      state.page += 1
    }
    writeListCache(key, { list: state.list, total: state.total, page: state.page })
  } catch (e: any) {
    if (seq === state.seq) {
      state.error = `加载失败：${e?.message || '网络异常'}`
      if (state.list.length) uni.showToast({ title: state.error, icon: 'none' })
    }
  } finally {
    if (seq === state.seq) state.loading = false
  }
}

function reloadActiveTab() {
  loadTab(activeTab.value, true)
}

function loadMore() {
  loadTab(activeTab.value, false)
}

const debouncedReload = debounce(reloadActiveTab, 400)

watch([rangeMode, customStart, customEnd], () => reloadActiveTab())
watch(searchKeyword, () => debouncedReload())

function switchTab(tab: 'sale' | 'return' | 'unsettled') {
  activeTab.value = tab
  searchKeyword.value = ''
  reloadActiveTab()
}

function goReturnCreate() { uni.navigateTo({ url: '/pages/return/create' }) }
function goReturnDetail(id: string) { uni.navigateTo({ url: `/pages/return/detail?id=${id}` }) }

function totalReturnQty(doc: ReturnDoc) { return doc.totalQty ?? doc.lines.reduce((sum, line) => sum + line.qty, 0) }
function totalReturnAmount(doc: ReturnDoc) { return Number(doc.totalAmount ?? doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0)) }

async function loadUnsettled() {
  await loadTab('unsettled', true)
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
  return doc.totalQty ?? doc.lines.reduce((sum, line) => sum + line.qty, 0)
}

function totalAmount(doc: SaleDoc) {
  return Number(doc.totalAmount ?? doc.lines.reduce((sum, line) => sum + line.qty * line.price, 0))
}

const storeNameMap = computed(() => new Map(stores.value.map(store => [store.id, store.name])))
function getStoreName(id: string) {
  return storeNameMap.value.get(id) || id
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  const rangeChanged = rangeMode.value !== '7d'
  setRangeMode('7d')
  getStores().then(list => { stores.value = list }).catch(() => {})
  // 日期范围被重置时由 watch 触发查询，这里只处理未变化的情况，避免重复请求
  if (!rangeChanged) reloadActiveTab()
})

onReachBottom(() => loadMore())
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

.list-footer {
  text-align: center;
  padding: 24rpx 0 40rpx;
  font-size: 24rpx;
  color: #999;
}

.load-more {
  color: #1677ff;
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
