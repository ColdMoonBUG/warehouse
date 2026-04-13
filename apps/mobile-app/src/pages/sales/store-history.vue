<template>
  <view class="history-page">
    <view class="header">
      <text class="title">{{ storeName }} - 历史销单</text>
    </view>

    <view class="content">
      <view v-if="loading" class="empty">加载中...</view>
      <view v-else-if="sales.length === 0" class="empty">暂无销单记录</view>
      <view v-for="doc in sales" :key="doc.id" class="sale-card" @tap="goDetail(doc.id)">
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
          <text class="qty">{{ doc.lines.length }}种 / {{ docQty(doc) }}袋</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSales, getStores } from '@/api'
import type { SaleDoc, Store } from '@/types'
import { getPageQueryParam, normalizeCount } from '@/utils'

const userStore = useUserStore()
const storeId = ref('')
const storeName = ref('超市')
const sales = ref<SaleDoc[]>([])
const loading = ref(false)

function statusText(status: string) {
  const map: Record<string, string> = { draft: '草稿', posted: '已过账', voided: '已作废' }
  return map[status] || status
}

function docAmount(doc: SaleDoc) {
  return doc.lines.reduce((sum, l) => sum + normalizeCount(l.qty) * l.price, 0)
}

function docQty(doc: SaleDoc) {
  return doc.lines.reduce((sum, l) => sum + normalizeCount(l.qty), 0)
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/sales/detail?id=${id}` })
}

async function loadData() {
  if (!storeId.value) return
  loading.value = true
  try {
    const [list, storeList] = await Promise.all([
      getSales(storeId.value),
      getStores(),
    ])
    sales.value = list
    const store = storeList.find(s => s.id === storeId.value)
    if (store) storeName.value = store.name
  } finally {
    loading.value = false
  }
}

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
  loadData()
})
</script>

<style lang="scss" scoped>
.history-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.header .title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
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
</style>
