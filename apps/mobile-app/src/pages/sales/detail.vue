<template>
  <view class="detail-page">
    <view class="header">
      <text class="title">销单详情</text>
    </view>

    <view v-if="doc" class="content">
      <view class="card">
        <view class="row">
          <text class="label">单号</text>
          <text class="value">{{ doc.code }}</text>
        </view>
        <view class="row">
          <text class="label">日期</text>
          <text class="value">{{ doc.date }}</text>
        </view>
        <view class="row">
          <text class="label">超市</text>
          <text class="value">{{ storeName }}</text>
        </view>
        <view class="row">
          <text class="label">业务员</text>
          <text class="value">{{ salespersonName }}</text>
        </view>
      </view>

      <view class="card">
        <view class="card-title">商品明细</view>
        <view v-for="line in doc.lines" :key="line.id" class="line">
          <text class="name">{{ getProductName(line.productId) }}</text>
          <text class="qty">{{ lineQtyText(line) }}</text>
          <text class="price">¥{{ line.price }}</text>
        </view>
      </view>

      <view class="summary">
        <text>合计数量: {{ totalQty }}袋</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <button class="btn-print" @tap="printSale">打印销单</button>
      <button class="btn-void" v-if="doc.status==='posted'" @tap="voidDoc">作废销单</button>
    </view>

    <view v-else class="empty">加载中...</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getSaleDetail, getStores, getSalespersonAccounts, getProducts, voidSale, isSameSalespersonId } from '@/api'
import type { SaleDoc, Store, Salesperson, Product } from '@/types'
import { getPageQueryParam, formatPackSummary, normalizeCount } from '@/utils'

async function voidDoc() {
  if (!doc.value) return
  await voidSale(doc.value.id)
  uni.showToast({ title: '已作废', icon: 'success' })
  await loadDetail()
}
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

const doc = ref<SaleDoc | null>(null)
const stores = ref<Store[]>([])
const salespersons = ref<Salesperson[]>([])
const products = ref<Product[]>([])
const docId = ref('')

const storeName = computed(() => {
  const s = stores.value.find(i => i.id === doc.value?.storeId)
  return s?.name || '-'
})

const salespersonName = computed(() => {
  const e = salespersons.value.find(i => isSameSalespersonId(i.salespersonId || i.id, doc.value?.salespersonId))
  return e?.displayName || '-'
})

const totalQty = computed(() => {
  if (!doc.value) return 0
  return doc.value.lines.reduce((s, l) => s + l.qty, 0)
})

const totalAmount = computed(() => {
  if (!doc.value) return 0
  return doc.value.lines.reduce((s, l) => s + l.qty * l.price, 0)
})

function getProductName(id: string) {
  return products.value.find(p => p.id === id)?.name || id
}

function lineQtyText(line: { productId: string; qty: number; boxQty?: number }) {
  const product = products.value.find(p => p.id === line.productId)
  const packQty = product?.boxQty
  return formatPackSummary(normalizeCount(line.qty), normalizeCount(line.boxQty), packQty)
}

function printSale() {
  uni.showToast({ title: '打印功能待接入蓝牙', icon: 'none' })
}

async function loadDetail() {
  if (!docId.value) return
  const [detail, storeList, salespersonList, productList] = await Promise.all([
    getSaleDetail(docId.value),
    getStores(),
    getSalespersonAccounts(),
    getProducts(),
  ])
  doc.value = detail
  stores.value = storeList
  salespersons.value = salespersonList
  products.value = productList
}

onLoad((query) => {
  docId.value = query?.id || getPageQueryParam('id')
})

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadDetail()
})
</script>

<style lang="scss" scoped>
.detail-page {
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

.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;

  .row {
    display: flex;
    justify-content: space-between;
    padding: 10rpx 0;

    .label {
      color: #666;
    }

    .value {
      color: #333;
    }
  }
}

.card-title {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
}

.line {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;

  .name {
    color: #333;
  }

  .qty {
    color: #666;
  }

  .price {
    color: #333;
  }
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 10rpx;
  color: #333;
}

.btn-print {
  width: 100%;
  height: 88rpx;
  background: #1890ff;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-bottom: 16rpx;
}

.btn-void {
  width: 100%;
  height: 88rpx;
  background: #ff4d4f;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
}

.empty {
  text-align: center;
  padding: 80rpx 0;
  color: #999;
}
</style>
