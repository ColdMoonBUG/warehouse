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
          <view class="picker"><text>{{ selectedWarehouse?.name || '全部仓库' }}</text></view>
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
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getStock, getWarehouses, getProducts } from '@/api'
import type { StockItem, Warehouse, Product } from '@/types'

const userStore = useUserStore()
const list = ref<StockItem[]>([])
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])
const selectedWarehouse = ref<Warehouse | null>(null)

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function onWarehouseChange(e: any) {
  const idx = Number(e.detail.value)
  selectedWarehouse.value = warehouses.value[idx] || null
  load()
}

function productName(id: string) {
  return products.value.find(p => p.id === id)?.name || id
}

function warehouseName(id: string) {
  return warehouses.value.find(w => w.id === id)?.name || id
}

function goBack() {
  uni.navigateBack()
}

async function load() {
  if (!guard()) return
  const wid = selectedWarehouse.value?.id
  list.value = await getStock(wid)
}

onShow(async () => {
  userStore.init()
  if (!guard()) return
  const [whs, pros] = await Promise.all([getWarehouses(), getProducts()])
  warehouses.value = whs
  products.value = pros
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
.empty { text-align:center; color:#999; padding:40rpx 0; }
</style>
