<template>
  <view class="return-page">
    <view class="header">
      <text class="title">退货</text>
    </view>

    <view class="content">
      <view class="actions">
        <button class="btn-create" @tap="goCreate">创建退货单</button>
      </view>

      <view v-if="list.length === 0" class="empty">暂无退货单</view>

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
          <text class="qty">数量: {{ totalQty(doc) }}</text>
          <text class="amount">金额: ¥{{ totalAmount(doc).toFixed(2) }}</text>
        </view>
        <view class="row">
          <text class="type">{{ typeText(doc.returnType) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getReturns, getStores } from '@/api'
import type { ReturnDoc, Store } from '@/types'

const userStore = useUserStore()
const list = ref<ReturnDoc[]>([])
const stores = ref<Store[]>([])

function goCreate() { uni.navigateTo({ url: '/pages/return/create' }) }
function goDetail(id: string) { uni.navigateTo({ url: `/pages/return/detail?id=${id}` }) }

function statusText(status: string) {
  if (status === 'posted') return '已过账'
  if (status === 'voided') return '已作废'
  return '草稿'
}
function typeText(t: string) { return t === 'warehouse_return' ? '回仓' : '车库退货' }

function totalQty(doc: ReturnDoc) { return doc.lines.reduce((s, l) => s + l.qty, 0) }
function totalAmount(doc: ReturnDoc) { return doc.lines.reduce((s, l) => s + l.qty * l.price, 0) }
function storeName(id: string) { return stores.value.find(s => s.id === id)?.name || id }

async function loadData() {
  const [docs, storeList] = await Promise.all([getReturns(), getStores()])
  const currentEmployeeId = userStore.currentUser?.employeeId
  list.value = userStore.isAdmin ? docs : docs.filter(d => d.employeeId === currentEmployeeId)
  stores.value = storeList
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadData()
})
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
</style>
