<template>
  <view class="sales-page">
    <view class="header">
      <text class="title">销退</text>
    </view>

    <view class="content">
      <view class="tabs">
        <view class="tab" :class="{active: activeTab==='sale'}" @tap="activeTab='sale'">销售</view>
        <view class="tab" :class="{active: activeTab==='return'}" @tap="activeTab='return'">退货</view>
      </view>

      <view v-if="activeTab==='sale'">
        <view class="actions">
          <button class="btn-create" @tap="goCreate">创建销单</button>
        </view>
        <view v-if="sales.length === 0" class="empty">暂无销单</view>
        <view v-for="doc in sales" :key="doc.id" class="sale-card" @tap="goDetail(doc.id)">
          <view class="row">
            <text class="code">{{ doc.code }}</text>
            <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
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

      <view v-else>
        <view class="actions">
          <button class="btn-create" @tap="goReturnCreate">创建退货单</button>
        </view>
        <view v-if="returns.length === 0" class="empty">暂无退货单</view>
        <view v-for="doc in returns" :key="doc.id" class="sale-card" @tap="goReturnDetail(doc.id)">
          <view class="row">
            <text class="code">{{ doc.code }}</text>
            <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
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
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSales, getStores, getReturns, getSessionSalespersonId, isSameSalespersonId } from '@/api'
import type { SaleDoc, Store, ReturnDoc } from '@/types'

const userStore = useUserStore()
const activeTab = ref<'sale'|'return'>('sale')
const sales = ref<SaleDoc[]>([])
const returns = ref<ReturnDoc[]>([])
const stores = ref<Store[]>([])

function goReturnCreate() { uni.navigateTo({ url: '/pages/return/create' }) }
function goReturnDetail(id: string) { uni.navigateTo({ url: `/pages/return/detail?id=${id}` }) }

function totalReturnQty(doc: ReturnDoc) { return doc.lines.reduce((s, l) => s + l.qty, 0) }
function totalReturnAmount(doc: ReturnDoc) { return doc.lines.reduce((s, l) => s + l.qty * l.price, 0) }

const listReturns = async () => {
  const docs = await getReturns()
  const currentSalespersonId = getSessionSalespersonId(userStore.currentUser)
  returns.value = userStore.isAdmin ? docs : docs.filter(d => isSameSalespersonId(d.salespersonId, currentSalespersonId))
}

const listSales = async () => {
  const saleList = await getSales()
  const currentSalespersonId = getSessionSalespersonId(userStore.currentUser)
  sales.value = userStore.isAdmin ? saleList : saleList.filter(d => isSameSalespersonId(d.salespersonId, currentSalespersonId))
}

const loadAll = async () => {
  const storeList = await getStores()
  stores.value = storeList
  await Promise.all([listSales(), listReturns()])
}

function goCreate() {
  uni.navigateTo({ url: '/pages/sales/create' })
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/sales/detail?id=${id}` })
}

function statusText(status: string) {
  if (status === 'posted') return '已过账'
  if (status === 'voided') return '已作废'
  return '草稿'
}

function totalQty(doc: SaleDoc) {
  return doc.lines.reduce((s, l) => s + l.qty, 0)
}

function totalAmount(doc: SaleDoc) {
  return doc.lines.reduce((s, l) => s + l.qty * l.price, 0)
}

function getStoreName(id: string) {
  return stores.value.find(s => s.id === id)?.name || id
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
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
  background: #fff;
  border-radius: 12rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  font-size: 28rpx;
  color: #666;
}

.tab.active {
  color: #1890ff;
  font-weight: 600;
  background: rgba(24, 144, 255, 0.08);
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

  .status {
    font-size: 24rpx;
    color: #999;
  }

  .status.posted { color: #52c41a; }
  .status.voided { color: #ff4d4f; }

  .store, .date, .qty, .amount {
    font-size: 24rpx;
    color: #666;
  }
}
</style>
