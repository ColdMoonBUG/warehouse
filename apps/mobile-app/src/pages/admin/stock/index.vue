<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">库存查询</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="section">
        <text class="label">选择仓库</text>
        <picker mode="selector" :range="warehouses" range-key="name" @change="onWarehouseChange">
          <view class="picker"><text>{{ selectedWarehouse?.name || '请选择仓库' }}</text></view>
        </picker>
      </view>

      <view v-if="list.length===0" class="empty">暂无库存</view>
      <view v-for="item in list" :key="item.productId + '-' + item.warehouseId" class="card">
        <view class="row">
          <text class="name">{{ productName(item.productId) }}</text>
          <text class="qty">数量: {{ item.qty }}袋</text>
        </view>
        <view class="row">
          <text class="warehouse">仓库: {{ warehouseName(item.warehouseId) }}</text>
        </view>
        <view v-if="compareStockText(item.productId, item.warehouseId)" class="compare">{{ compareStockText(item.productId, item.warehouseId) }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSessionSalespersonId, getStock, getWarehouses, getProducts, isSameSalespersonId } from '@/api'
import type { StockItem, Warehouse, Product } from '@/types'
import { formatStockPreview, getProductStockQty, toStockQtyMap } from '@/utils'

const userStore = useUserStore()
const sessionSalespersonId = computed(() => getSessionSalespersonId(userStore.currentUser))
const list = ref<StockItem[]>([])
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])
const selectedWarehouse = ref<Warehouse | null>(null)
const mainStockMap = ref<Record<string, number>>({})

function getVisibleWarehouses(allWarehouses: Warehouse[]) {
  if (userStore.isAdmin) return allWarehouses
  return allWarehouses.filter(warehouse => {
    if (warehouse.type === 'main') return true
    if (warehouse.type !== 'vehicle') return false
    return isSameSalespersonId(warehouse.salespersonId, sessionSalespersonId.value)
  })
}

function ensureDefaultWarehouse() {
  if (selectedWarehouse.value && warehouses.value.some(item => item.id === selectedWarehouse.value?.id)) {
    return
  }
  if (!warehouses.value.length) {
    selectedWarehouse.value = null
    return
  }
  if (!userStore.isAdmin) {
    const ownVehicle = warehouses.value.find(item => item.type === 'vehicle')
    selectedWarehouse.value = ownVehicle || warehouses.value.find(item => item.type === 'main') || warehouses.value[0]
    return
  }
  selectedWarehouse.value = warehouses.value[0]
}

function onWarehouseChange(e: any) {
  const idx = Number(e.detail.value)
  selectedWarehouse.value = warehouses.value[idx] || null
  void load()
}

function productName(id: string) {
  return products.value.find(p => p.id === id)?.name || id
}

function warehouseName(id: string) {
  return warehouses.value.find(w => w.id === id)?.name || id
}

function compareStockText(productId: string, warehouseId: string) {
  const selected = selectedWarehouse.value
  if (!selected) return ''
  const mainWarehouse = warehouses.value.find(w => w.type === 'main')
  if (!mainWarehouse || mainWarehouse.id === warehouseId) return ''
  return formatStockPreview([
    { label: selected.type === 'vehicle' ? '车库' : '当前仓', qty: getProductStockQty(toStockQtyMap(list.value), productId) },
    { label: '主仓', qty: getProductStockQty(mainStockMap.value, productId) },
  ])
}

function goBack() {
  uni.navigateBack()
}

async function load() {
  ensureDefaultWarehouse()
  const wid = selectedWarehouse.value?.id
  if (!wid) {
    list.value = []
    mainStockMap.value = {}
    return
  }
  const stockList = await getStock(wid)
  list.value = stockList
  const mainWarehouse = warehouses.value.find(w => w.type === 'main')
  if (mainWarehouse && mainWarehouse.id !== wid) {
    mainStockMap.value = toStockQtyMap(await getStock(mainWarehouse.id))
    return
  }
  mainStockMap.value = toStockQtyMap(stockList)
}

onShow(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  const [whs, pros] = await Promise.all([getWarehouses(), getProducts()])
  warehouses.value = getVisibleWarehouses(whs)
  products.value = pros
  ensureDefaultWarehouse()
  await load()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.section { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.label { display:block; font-size:26rpx; color:#666; margin-bottom:10rpx; }
.picker { padding: 20rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:30rpx; background:#fff; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:6rpx; }
.name { font-size:30rpx; color:#333; }
.qty, .warehouse { font-size:24rpx; color:#666; }
.compare { font-size:22rpx; color:#1890ff; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
</style>
