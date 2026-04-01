<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">供应商管理</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="actions"><button class="btn" @tap="goCreate">新增供应商</button></view>
      <view v-if="list.length===0" class="empty">暂无供应商</view>
      <view v-for="s in list" :key="s.id" class="card" @tap="goEdit(s)">
        <view class="row">
          <text class="name">{{ s.name }}</text>
          <text class="status" :class="s.status">{{ s.status==='active'?'启用':'停用' }}</text>
        </view>
        <view class="row">
          <text class="code">编码: {{ s.code }}</text>
          <text class="phone">{{ s.phone || '-' }}</text>
        </view>
        <view class="row actions">
          <button class="btn-mini" @tap.stop="toggle(s)">{{ s.status==='active'?'停用':'启用' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSuppliers, toggleSupplier } from '@/api'
import type { Supplier } from '@/types'

const userStore = useUserStore()
const list = ref<Supplier[]>([])

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
  list.value = await getSuppliers()
}

async function toggle(s: Supplier) {
  await toggleSupplier(s.id)
  load()
}

function goCreate() { uni.navigateTo({ url: '/pages/admin/supplier/form' }) }
function goEdit(s: Supplier) { uni.navigateTo({ url: `/pages/admin/supplier/form?id=${s.id}` }) }
function goBack() { uni.navigateBack() }

onShow(() => {
  userStore.init()
  load()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.actions { margin-bottom: 20rpx; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:32rpx; border:none; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:6rpx; align-items:center; }
.name { font-size:30rpx; color:#333; }
.code, .phone { font-size:24rpx; color:#666; }
.status.active { color:#52c41a; }
.status.inactive { color:#999; }
.btn-mini { height:56rpx; padding:0 16rpx; background:#f0f0f0; border-radius:8rpx; font-size:24rpx; }
.actions { margin-top: 6rpx; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
</style>
