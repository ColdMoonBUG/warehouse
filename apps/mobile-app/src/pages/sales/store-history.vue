<template>
  <view class="history-page">
    <view class="header">
      <text class="title">{{ storeName }} - 历史销单</text>
    </view>

    <view class="content">
      <view class="filter-bar">
        <view class="filter-chips">
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

      <view v-if="loading" class="empty">加载中...</view>
      <view v-else-if="filteredSales.length === 0" class="empty">当前筛选范围暂无销单记录</view>
      <view v-for="doc in filteredSales" :key="doc.id" class="sale-card" @tap="goDetail(doc.id)">
        <view class="row">
          <text class="code">{{ doc.code }}</text>
          <text v-if="doc.docType === 'gift'" class="gift-tag">[赠送]</text>
          <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
        </view>
        <view class="row">
          <text class="date">{{ doc.date }}</text>
          <text class="amount">¥{{ docAmount(doc).toFixed(2) }}</text>
        </view>
        <view class="row">
          <text class="qty">{{ docKinds(doc) }}种 / {{ docQty(doc) }}袋</text>
        </view>
      </view>
      <view v-if="!loading && sales.length < total" class="load-more" @tap="loadMore">已显示 {{ sales.length }} / {{ total }}，点击加载更多</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getStores, querySales } from '@/api'
import type { DocQuery } from '@/api'
import type { SaleDoc } from '@/types'
import { formatDate, getPageQueryParam, normalizeCount } from '@/utils'

const PAGE_SIZE = 100
const userStore = useUserStore()
const storeId = ref('')
const storeName = ref('超市')
const sales = ref<SaleDoc[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
let seq = 0
const rangeMode = ref<'7d' | '30d' | 'custom'>('7d')
const customStart = ref('')
const customEnd = ref('')

function statusText(status: string) {
  const map: Record<string, string> = { draft: '草稿', posted: '已过账', voided: '已作废' }
  return map[status] || status
}

function docAmount(doc: SaleDoc) {
  if (doc.totalAmount != null) return Number(doc.totalAmount)
  return doc.lines.reduce((sum, line) => sum + normalizeCount(line.qty) * line.price, 0)
}

function docKinds(doc: SaleDoc) {
  return doc.lineCount != null ? doc.lineCount : doc.lines.length
}

function docQty(doc: SaleDoc) {
  if (doc.totalQty != null) return doc.totalQty
  return doc.lines.reduce((sum, line) => sum + normalizeCount(line.qty), 0)
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/sales/detail?id=${id}` })
}

function todayString() {
  return formatDate(new Date(), 'YYYY-MM-DD')
}

function daysAgoString(days: number) {
  const date = new Date()
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

// 日期筛选在服务器上做，只取这家超市在所选范围内的单据
const filteredSales = computed(() => sales.value)

function rangeQuery(): DocQuery {
  if (rangeMode.value === '7d') return { startDate: daysAgoString(6) }
  if (rangeMode.value === '30d') return { startDate: daysAgoString(29) }
  if (!customStart.value || !customEnd.value) return {}
  return { startDate: customStart.value, endDate: customEnd.value }
}

async function loadData() {
  if (!storeId.value) return
  const mySeq = ++seq
  loading.value = true
  try {
    const [res, storeList] = await Promise.all([
      querySales({ storeId: storeId.value, ...rangeQuery(), page: 1, limit: PAGE_SIZE }),
      getStores(),
    ])
    if (mySeq !== seq) return
    sales.value = res.list
    total.value = res.total
    page.value = 1
    const store = storeList.find(item => item.id === storeId.value)
    if (store) storeName.value = store.name
  } catch (e: any) {
    if (mySeq === seq) uni.showToast({ title: e?.message || '加载失败', icon: 'none' })
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

async function loadMore() {
  if (loading.value || sales.value.length >= total.value) return
  const mySeq = ++seq
  loading.value = true
  try {
    const res = await querySales({ storeId: storeId.value, ...rangeQuery(), page: page.value + 1, limit: PAGE_SIZE })
    if (mySeq !== seq) return
    sales.value = [...sales.value, ...res.list]
    total.value = res.total
    page.value += 1
  } catch (e: any) {
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' })
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

watch([rangeMode, customStart, customEnd], () => loadData())

onLoad((query) => {
  storeId.value = query?.storeId || getPageQueryParam('storeId')
  if (query?.storeName) storeName.value = decodeURIComponent(query.storeName)
})

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  setRangeMode('7d')
  loadData()
})
</script>

<style lang="scss" scoped>
.history-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.header .title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.filter-bar { background: #fff; border-radius: 16rpx; padding: 20rpx 24rpx; margin-bottom: 20rpx; }
.filter-chips { display: flex; gap: 16rpx; flex-wrap: wrap; }
.chip { padding: 12rpx 24rpx; border-radius: 999rpx; background: #f2f3f5; color: #666; font-size: 24rpx; }
.chip.active { background: #1677ff; color: #fff; }
.custom-range { display: flex; align-items: center; gap: 16rpx; margin-top: 20rpx; }
.date-box { min-width: 220rpx; padding: 14rpx 18rpx; border-radius: 12rpx; background: #f7f8fa; color: #333; font-size: 24rpx; text-align: center; }
.range-sep { color: #666; font-size: 24rpx; }
.sale-card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 4rpx 0; }
.code { font-size: 30rpx; color: #333; font-weight: 600; }
.gift-tag { font-size: 22rpx; color: #fa8c16; }
.status { font-size: 24rpx; color: #999; }
.status.posted { color: #52c41a; }
.status.voided { color: #ff4d4f; }
.date { font-size: 26rpx; color: #666; }
.amount { font-size: 28rpx; color: #333; font-weight: 600; }
.qty { font-size: 24rpx; color: #999; }
.empty { text-align: center; padding: 80rpx 0; color: #999; }
.load-more { text-align: center; padding: 24rpx 0 40rpx; font-size: 24rpx; color: #1677ff; }
</style>
