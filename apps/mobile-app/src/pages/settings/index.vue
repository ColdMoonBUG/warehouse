<template>
  <view class="settings-page">
    <view class="header">
      <text class="title">设置</text>
    </view>

    <view class="content">
      <view class="user-card" v-if="currentUser">
        <view class="avatar">{{ currentUser.displayName?.charAt(0) || '?' }}</view>
        <view class="info">
          <text class="name">{{ currentUser.displayName }}</text>
          <text class="role">{{ currentUser.role === 'admin' ? '管理员' : '业务员' }}</text>
        </view>
      </view>

      <view v-if="!isAdmin" class="earnings-card">
        <view class="earnings-head">
          <text class="earnings-title">今日收益</text>
          <text class="earnings-date">{{ todayCommission.date }}</text>
        </view>

        <view v-if="earningsLoading" class="earnings-empty">正在加载今日收益...</view>
        <view v-else>
          <view class="summary-grid">
            <view class="summary-item summary-total">
              <text class="summary-label">净收益</text>
              <text class="summary-value">¥{{ amountText(todayCommission.totalAmount) }}</text>
            </view>
            <view class="summary-item">
              <text class="summary-label">销售</text>
              <text class="summary-value positive">¥{{ amountText(todayCommission.saleAmount) }}</text>
            </view>
            <view class="summary-item">
              <text class="summary-label">退货</text>
              <text class="summary-value negative">¥{{ amountText(todayCommission.returnAmount) }}</text>
            </view>
            <view class="summary-item">
              <text class="summary-label">流水</text>
              <text class="summary-value">{{ todayCommission.ledgerCount }}笔</text>
            </view>
          </view>

          <view class="ledger-section">
            <view class="ledger-head">
              <text class="ledger-title">收益流水</text>
              <text class="ledger-count">{{ todayCommission.ledgerCount }}笔</text>
            </view>
            <view v-if="earningsError" class="earnings-empty">{{ earningsError }}</view>
            <view v-else-if="todayCommission.ledgers.length === 0" class="earnings-empty">今日暂无收益流水</view>
            <view v-for="item in todayCommission.ledgers" :key="item.id" class="ledger-item">
              <view class="ledger-row">
                <text class="ledger-name">{{ item.storeName || '未关联门店' }}</text>
                <text class="ledger-amount" :class="amountClass(item.commissionAmount)">{{ signedAmountText(item.commissionAmount) }}</text>
              </view>
              <view class="ledger-row ledger-row-sub">
                <text class="ledger-meta">{{ secondaryText(item) }}</text>
                <text class="ledger-time">{{ timeText(item.createdAt) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @tap="goStoreList">
          <text class="menu-text">门店管理</text>
        </view>
        <view class="menu-item" @tap="goPrinter">
          <text class="menu-text">蓝牙打印</text>
        </view>
        <view class="menu-item" @tap="goStock">
          <text class="menu-text">库存查询</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goProduct">
          <text class="menu-text">商品管理</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goSupplier">
          <text class="menu-text">供应商管理</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goInbound">
          <text class="menu-text">入库单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goOutbound">
          <text class="menu-text">出库单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goTransfer">
          <text class="menu-text">调拨单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goAccount">
          <text class="menu-text">账户管理</text>
        </view>
        <view class="menu-item" @tap="goSwitchAccount">
          <text class="menu-text">切换账户</text>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @tap="handleLogout">
          <text class="menu-text" style="color: #ff4d4f">退出登录</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getTodayCommissionSummary } from '@/api'
import type { TodayCommissionItem, TodayCommissionSummary } from '@/types'
import { formatDate, todayLocalDate } from '@/utils'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'

const userStore = useUserStore()
const currentUser = computed(() => userStore.currentUser)
const isAdmin = computed(() => userStore.isAdmin)
const earningsLoading = ref(false)
const earningsError = ref('')
const todayCommission = ref<TodayCommissionSummary>(createEmptyCommissionSummary())

function createEmptyCommissionSummary(): TodayCommissionSummary {
  return {
    date: todayLocalDate(),
    salespersonId: '',
    salespersonName: '',
    saleAmount: 0,
    returnAmount: 0,
    totalAmount: 0,
    ledgerCount: 0,
    ledgers: [],
  }
}

function amountText(value?: number) {
  return Number(value || 0).toFixed(2)
}

function signedAmountText(value?: number) {
  const amount = Number(value || 0)
  if (amount > 0) return `+¥${amount.toFixed(2)}`
  if (amount < 0) return `-¥${Math.abs(amount).toFixed(2)}`
  return '¥0.00'
}

function amountClass(value?: number) {
  return Number(value || 0) < 0 ? 'negative' : 'positive'
}

function bizTypeText(type?: string) {
  if (type === 'sale') return '销售提成'
  if (type === 'return') return '退货扣回'
  if (type === 'void_sale') return '销售作废冲回'
  if (type === 'void_return') return '退货作废返还'
  return '收益流水'
}

function secondaryText(item: TodayCommissionItem) {
  const parts = [bizTypeText(item.bizType)]
  if (item.docCode) parts.push(item.docCode)
  else if (item.docId) parts.push(item.docId)
  if (item.qty || item.qty === 0) parts.push(`${item.qty}袋`)
  return parts.join(' · ')
}

function timeText(value?: string | number) {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'string') {
    if (value.includes(' ')) return value.slice(11, 16)
    if (value.includes('T')) return formatDate(value, 'HH:mm')
    return value
  }
  return formatDate(new Date(value), 'HH:mm')
}

async function loadTodayCommission() {
  if (userStore.isAdmin) {
    todayCommission.value = createEmptyCommissionSummary()
    earningsError.value = ''
    return
  }
  earningsLoading.value = true
  earningsError.value = ''
  try {
    todayCommission.value = await getTodayCommissionSummary()
  } catch (e: any) {
    // API 失败可能是 JSESSIONID 过期，尝试刷新 session 后重试一次
    try {
      const referenceStore = useReferenceStore()
      await referenceStore.preloadCore(true)
      todayCommission.value = await getTodayCommissionSummary()
    } catch (retryError: any) {
      todayCommission.value = createEmptyCommissionSummary()
      earningsError.value = retryError.message || '今日收益加载失败'
    }
  } finally {
    earningsLoading.value = false
  }
}

function handleLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    success: (res) => {
      if (res.confirm) {
        userStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    },
  })
}

function goStoreList() {
  uni.navigateTo({ url: '/pages/settings/store-list' })
}

function goStoreAdd() {
  uni.navigateTo({ url: '/pages/settings/store-add' })
}

function goProduct() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/product/index' })
}

function goSupplier() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/supplier/index' })
}

function goPrinter() {
  uni.navigateTo({ url: '/pages/settings/printer' })
}

function goStock() {
  uni.navigateTo({ url: '/pages/settings/stock' })
}

function goInbound() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/inbound/index' })
}

function goOutbound() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/outbound/index' })
}

function goTransfer() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/transfer/index' })
}

function goAccount() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/account/index' })
}

function goSwitchAccount() {
  userStore.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}

onShow(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  await loadTodayCommission()
})
</script>

<style lang="scss" scoped>
.settings-page {
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

.user-card,
.earnings-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.user-card {
  display: flex;
  align-items: center;

  .avatar {
    width: 100rpx;
    height: 100rpx;
    border-radius: 50%;
    background: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: #fff;
    font-weight: bold;
    margin-right: 24rpx;
  }

  .info {
    display: flex;
    flex-direction: column;

    .name {
      font-size: 34rpx;
      color: #333;
      font-weight: 500;
      margin-bottom: 8rpx;
    }

    .role {
      font-size: 26rpx;
      color: #999;
    }
  }
}

.earnings-head,
.ledger-head,
.ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.earnings-head {
  margin-bottom: 20rpx;
}

.earnings-title,
.ledger-title {
  font-size: 30rpx;
  color: #333;
  font-weight: 600;
}

.earnings-date,
.ledger-count,
.ledger-meta,
.ledger-time {
  font-size: 24rpx;
  color: #94a3b8;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.summary-item {
  background: #f8fafc;
  border-radius: 12rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.summary-total {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
}

.summary-label {
  font-size: 24rpx;
  color: #64748b;
}

.summary-value {
  font-size: 34rpx;
  color: #111827;
  font-weight: 600;
}

.positive {
  color: #16a34a;
}

.negative {
  color: #dc2626;
}

.ledger-section {
  border-top: 2rpx solid #f1f5f9;
  padding-top: 20rpx;
}

.ledger-head {
  margin-bottom: 12rpx;
}

.ledger-item {
  padding: 18rpx 0;
  border-bottom: 2rpx solid #f8fafc;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.ledger-row-sub {
  margin-top: 8rpx;
}

.ledger-name,
.ledger-amount {
  font-size: 28rpx;
  color: #1f2937;
}

.ledger-amount {
  font-weight: 600;
}

.earnings-empty {
  text-align: center;
  color: #94a3b8;
  padding: 30rpx 0;
  font-size: 24rpx;
}

.menu-group {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 20rpx;

  .menu-item {
    padding: 30rpx;
    text-align: center;
    border-bottom: 2rpx solid #f0f0f0;

    &:last-child { border-bottom: none; }

    .menu-text {
      font-size: 30rpx;
    }
  }
}
</style>
