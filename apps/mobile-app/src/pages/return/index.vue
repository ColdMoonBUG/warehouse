<template>
  <view class="return-page">
    <view class="header">
      <text class="title">退货</text>
    </view>

    <view class="content">
      <view class="actions">
        <button class="btn-create" @tap="goCreate">创建退货单</button>
      </view>

      <view v-if="list.length === 0" class="empty">{{ loading ? '加载中...' : (error || '暂无退货单') }}</view>

      <view v-for="doc in list" :key="doc.id" class="doc-card" @tap="goDetail(doc.id)">
        <view class="row">
          <text class="code">{{ doc.code }}</text>
          <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
        </view>
        <view class="row">
          <text class="store">{{ storeName(doc.storeId) }}</text>
          <text class="date">{{ doc.date }}</text>
        </view>
        <view class="row">
          <text class="qty">数量: {{ totalQty(doc) }}袋</text>
          <text class="amount">金额: ¥{{ totalAmount(doc).toFixed(2) }}</text>
        </view>
        <view class="row">
          <text class="type">{{ typeText(doc.returnType) }}</text>
          <text v-if="doc.saleDocCode" class="type">关联销单 {{ doc.saleDocCode }}</text>
        </view>
      </view>

      <view v-if="list.length > 0" class="list-footer">
        <text v-if="loading">加载中...</text>
        <text v-else-if="list.length < total" class="load-more" @tap="loadMore">已显示 {{ list.length }} / {{ total }}，点击加载更多</text>
        <text v-else>共 {{ total }} 张</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onReachBottom, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getStores, getSessionSalespersonId, queryReturns } from '@/api'
import type { ReturnDoc, Store } from '@/types'

// 按页向服务器要数据（每页 50 张，最新的在前），不再一次拉全部退货单
const PAGE_SIZE = 50

const userStore = useUserStore()
const list = ref<ReturnDoc[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const error = ref('')
const stores = ref<Store[]>([])
let seq = 0

function goCreate() { uni.navigateTo({ url: '/pages/return/create' }) }
function goDetail(id: string) { uni.navigateTo({ url: `/pages/return/detail?id=${id}` }) }

function statusText(status: string) {
  if (status === 'posted') return '已过账'
  if (status === 'voided') return '已作废'
  return '草稿'
}
function typeText(t: string) { return t === 'warehouse_return' ? '回仓' : '车库退货' }

function totalQty(doc: ReturnDoc) { return doc.totalQty ?? doc.lines.reduce((s, l) => s + l.qty, 0) }
function totalAmount(doc: ReturnDoc) { return Number(doc.totalAmount ?? doc.lines.reduce((s, l) => s + l.qty * l.price, 0)) }
const storeNameMap = computed(() => new Map(stores.value.map(s => [s.id, s.name])))
function storeName(id: string) { return storeNameMap.value.get(id) || id }

function baseQuery() {
  return userStore.isAdmin ? {} : { salespersonId: getSessionSalespersonId(userStore.currentUser) }
}

async function loadData() {
  const mySeq = ++seq
  loading.value = true
  error.value = ''
  try {
    const pages = Math.min(Math.max(1, page.value), 10)
    const [res, storeList] = await Promise.all([
      queryReturns({ ...baseQuery(), page: 1, limit: PAGE_SIZE * pages }),
      getStores(),
    ])
    if (mySeq !== seq) return
    list.value = res.list
    total.value = res.total
    page.value = pages
    stores.value = storeList
  } catch (e: any) {
    console.error('[return/index] loadData 失败:', e?.message || e)
    error.value = '加载失败: ' + (e?.message || '未知错误')
    uni.showToast({ title: error.value, icon: 'none' })
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

async function loadMore() {
  if (loading.value || list.value.length >= total.value) return
  const mySeq = ++seq
  loading.value = true
  try {
    const res = await queryReturns({ ...baseQuery(), page: page.value + 1, limit: PAGE_SIZE })
    if (mySeq !== seq) return
    list.value = [...list.value, ...res.list]
    total.value = res.total
    page.value += 1
  } catch (e: any) {
    uni.showToast({ title: '加载失败: ' + (e?.message || '未知错误'), icon: 'none' })
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadData()
})

onReachBottom(() => loadMore())
</script>

<style lang="scss" scoped>
.return-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.actions { margin-bottom: 20rpx; }
.btn-create { width: 100%; height: 88rpx; background: #1890ff; color: #fff; font-size: 32rpx; border-radius: 44rpx; border: none; }
.btn-create::after { border: none; }
.empty { text-align: center; padding: 60rpx 0; color: #999; }
.doc-card { background: #fff; border-radius: 16rpx; padding: 20rpx; margin-bottom: 16rpx; }
.row { display:flex; justify-content: space-between; margin-bottom: 8rpx; }
.code { font-size: 30rpx; color: #333; font-weight: 600; }
.status { font-size: 24rpx; color: #999; }
.status.posted { color: #52c41a; }
.status.voided { color: #ff4d4f; }
.store, .date, .qty, .amount, .type { font-size: 24rpx; color: #666; }
.list-footer { text-align: center; padding: 24rpx 0 40rpx; font-size: 24rpx; color: #999; }
.load-more { color: #1677ff; }
</style>
