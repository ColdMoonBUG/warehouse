<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">商品管理</text>
      <view style="width: 60rpx" />
    </view>

    <view class="content">
      <view class="actions">
        <button class="btn" @tap="goCreate">新增商品</button>
      </view>

      <view class="search-bar">
        <input v-model="keyword" placeholder="搜索商品名称/编码/条码" class="search-input" />
      </view>

      <view v-if="filteredList.length === 0" class="empty">{{ keyword ? '无匹配商品' : '暂无商品' }}</view>
      <view v-for="p in filteredList" :key="p.id" class="card" @tap="goEdit(p)">
        <view class="row">
          <text class="name">{{ p.name }}</text>
          <text class="status" :class="p.status">{{ p.status === 'active' ? '启用' : '停用' }}</text>
        </view>
        <view class="row">
          <text class="code">编码: {{ p.code }}</text>
          <text class="price">¥{{ p.salePrice || 0 }}</text>
        </view>
        <view class="row actions">
          <button class="btn-mini" @tap.stop="toggle(p)">{{ p.status === 'active' ? '停用' : '启用' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getProducts, toggleProduct } from '@/api'
import type { Product } from '@/types'

const userStore = useUserStore()
const list = ref<Product[]>([])
const keyword = ref('')

const filteredList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter(p => {
    const name = (p.name || '').toLowerCase()
    const code = (p.code || '').toLowerCase()
    const barcode = (p.barcode || '').toLowerCase()
    return name.includes(kw) || code.includes(kw) || barcode.includes(kw)
  })
})

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

async function load() {
  if (!guard()) return
  list.value = await getProducts()
}

function goCreate() { uni.navigateTo({ url: '/pages/admin/product/form' }) }
function goEdit(p: Product) { uni.navigateTo({ url: `/pages/admin/product/form?id=${p.id}` }) }

async function toggle(p: Product) {
  await toggleProduct(p.id)
  load()
}

function goBack() {
  uni.navigateBack()
}

onShow(() => {
  userStore.init()
  load()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.actions { margin-bottom: 20rpx; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
.search-bar { margin-bottom: 16rpx; }
.search-input { width: 100%; height: 72rpx; padding: 0 24rpx; background: #fff; border-radius: 36rpx; font-size: 28rpx; border: 1rpx solid #e8e8e8; box-sizing: border-box; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:6rpx; align-items:center; }
.name { font-size:30rpx; color:#333; }
.code, .price { font-size:24rpx; color:#666; }
.status { font-size:24rpx; }
.status.active { color:#52c41a; }
.status.inactive { color:#999; }
.btn-mini { height:56rpx; padding:0 16rpx; background:#f0f0f0; border-radius:8rpx; font-size:24rpx; }
.actions { margin-top: 6rpx; }
</style>
