<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">库存查询</text>
      <view style="width: 60rpx" />
    </view>

    <view class="content">
      <view class="section summary-card">
        <text class="section-title">查看范围</text>
        <view class="summary-row">
          <text class="summary-label">当前仓库</text>
          <text class="summary-value">{{ warehouseLabel(selectedWarehouse) }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">总仓</text>
          <text class="summary-value">{{ mainWarehouse?.name || '未配置' }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">选择仓库</text>
        <picker mode="selector" :range="accessibleWarehouses" range-key="name" @change="onWarehouseChange">
          <view class="picker"><text>{{ warehouseLabel(selectedWarehouse) }}</text></view>
        </picker>
      </view>

      <view v-if="loading" class="empty">正在加载库存...</view>
      <view v-else-if="filteredItems.length === 0" class="empty">{{ keyword ? '无匹配商品' : '暂无库存' }}</view>
      <view v-else>
        <view class="search-bar">
          <input v-model="keyword" placeholder="搜索商品名称" class="search-input" />
        </view>
        <view v-for="item in filteredItems" :key="item.productId" class="card">
          <text class="name">{{ item.name }}</text>
          <view class="stock-row">
            <text class="stock-label">当前仓</text>
            <text class="stock-value" :class="{ 'low-stock': item.qty < 10 }">{{ formatQty(item.qty, item.boxQty) }}</text>
          </view>
          <view class="stock-row">
            <text class="stock-label">总仓</text>
            <text class="stock-value">{{ formatQty(item.mainQty, item.boxQty) }}</text>
          </view>
          <text v-if="compareText(item)" class="compare-text">{{ compareText(item) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getProducts, getSessionSalespersonId, getStock, getWarehouses, isSameSalespersonId } from '@/api'
import { useUserStore } from '@/store/user'
import type { Product, StockItem, Warehouse } from '@/types'
import { stockPoller } from '@/utils/stock-sync'

const userStore = useUserStore()
const products = ref<Product[]>([])
const allWarehouses = ref<Warehouse[]>([])
const accessibleWarehouses = computed(() => {
  if (userStore.isAdmin) return allWarehouses.value
  const salespersonId = getSessionSalespersonId(userStore.currentUser)
  return allWarehouses.value.filter((warehouse) => {
    if (warehouse.type === 'main') return true
    return warehouse.type === 'vehicle' && isSameSalespersonId(warehouse.salespersonId, salespersonId)
  })
})
const selectedWarehouse = ref<Warehouse | null>(null)
const mainWarehouse = computed(() => accessibleWarehouses.value.find(warehouse => warehouse.type === 'main') || null)
const list = ref<StockItem[]>([])
const mainStockMap = ref<Record<string, number>>({})
const loading = ref(false)
const keyword = ref('')
let unsubscribeStock: (() => void) | null = null

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return items.value
  return items.value.filter(item => item.name.toLowerCase().includes(kw))
})

function subscribeStockUpdates() {
  if (unsubscribeStock) {
    unsubscribeStock()
    unsubscribeStock = null
  }
  const warehouseId = selectedWarehouse.value?.id
  if (!warehouseId) return
  unsubscribeStock = stockPoller.subscribe(warehouseId, (stockList) => {
    list.value = stockList
  })
}

onUnmounted(() => {
  if (unsubscribeStock) {
    unsubscribeStock()
    unsubscribeStock = null
  }
})

const items = computed(() => {
  const ids = new Set<string>()
  list.value.forEach(item => ids.add(item.productId))
  Object.keys(mainStockMap.value).forEach(productId => ids.add(productId))

  const orderedIds = products.value
    .map(product => product.id)
    .filter(id => ids.has(id))
  Array.from(ids).forEach(id => {
    if (!orderedIds.includes(id)) orderedIds.push(id)
  })

  return orderedIds.map(productId => ({
    productId,
    name: products.value.find(product => product.id === productId)?.name || productId,
    boxQty: products.value.find(product => product.id === productId)?.boxQty || 1,
    qty: list.value.find(item => item.productId === productId)?.qty || 0,
    mainQty: mainStockMap.value[productId] || 0,
  }))
})

function warehouseLabel(warehouse?: Warehouse | null) {
  if (!warehouse) return '请选择仓库'
  return warehouse.type === 'main' ? `${warehouse.name}（总仓）` : warehouse.name
}

// 袋数转 X箱Y袋
function formatQty(qty: number, boxQty: number): string {
  if (!boxQty || boxQty <= 1) return `${qty}袋`
  const boxes = Math.floor(qty / boxQty)
  const bags = qty % boxQty
  if (boxes > 0 && bags > 0) return `${boxes}箱${bags}袋`
  if (boxes > 0) return `${boxes}箱`
  return `${bags}袋`
}

function compareText(item: { productId: string; qty: number; mainQty: number; boxQty: number }) {
  if (!selectedWarehouse.value || selectedWarehouse.value.type === 'main') return ''
  return `当前仓${formatQty(item.qty, item.boxQty)}｜主仓${formatQty(item.mainQty, item.boxQty)}`
}

function onWarehouseChange(e: any) {
  const idx = Number(e.detail.value)
  selectedWarehouse.value = accessibleWarehouses.value[idx] || null
  loadStock()
  subscribeStockUpdates()
}

function goBack() {
  uni.navigateBack()
}

async function loadStock() {
  const warehouseId = selectedWarehouse.value?.id
  list.value = warehouseId ? await getStock(warehouseId) : []
  if (!mainWarehouse.value) {
    mainStockMap.value = {}
    return
  }
  const mainStock = await getStock(mainWarehouse.value.id)
  mainStockMap.value = Object.fromEntries(mainStock.map(item => [item.productId, item.qty || 0]))
}

async function load() {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }

  loading.value = true
  try {
    const [warehouseList, productList] = await Promise.all([getWarehouses(), getProducts()])
    allWarehouses.value = warehouseList
    products.value = productList
    if (!selectedWarehouse.value || !accessibleWarehouses.value.some(item => item.id === selectedWarehouse.value?.id)) {
      const salespersonId = getSessionSalespersonId(userStore.currentUser)
      selectedWarehouse.value = accessibleWarehouses.value.find((warehouse) => {
        return warehouse.type === 'vehicle' && isSameSalespersonId(warehouse.salespersonId, salespersonId)
      }) || accessibleWarehouses.value[0] || null
    }
    await loadStock()
    subscribeStockUpdates()
  } finally {
    loading.value = false
  }
}

onShow(() => {
  load()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));
}

.back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  color: #333;
}

.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
}

.content {
  padding: 30rpx;
}

.section,
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.section-title,
.name {
  display: block;
  font-size: 30rpx;
  color: #333;
  font-weight: 600;
}

.section-title {
  margin-bottom: 16rpx;
}

.summary-row,
.stock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-row + .summary-row,
.stock-row + .stock-row {
  margin-top: 10rpx;
}

.summary-label,
.stock-label {
  font-size: 24rpx;
  color: #64748b;
}

.summary-value,
.stock-value {
  font-size: 26rpx;
  color: #0f172a;
}

.picker {
  padding: 20rpx;
  border: 2rpx solid #eee;
  border-radius: 12rpx;
  font-size: 28rpx;
  background: #fff;
}

.name {
  margin-bottom: 16rpx;
}

.compare-text {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #1890ff;
}

.empty {
  text-align: center;
  color: #999;
  padding: 48rpx 0;
}

.search-bar {
  margin-bottom: 16rpx;
}

.search-input {
  width: 100%;
  height: 72rpx;
  padding: 0 24rpx;
  background: #fff;
  border-radius: 36rpx;
  font-size: 28rpx;
  border: 1rpx solid #e8e8e8;
  box-sizing: border-box;
}

.low-stock {
  color: #dc2626;
  font-weight: 600;
}
</style>
