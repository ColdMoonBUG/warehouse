<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">业务员管理</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="actions"><button class="btn" @tap="goCreate">新增业务员</button></view>
      <view v-if="list.length===0" class="empty">暂无业务员</view>
      <view v-for="e in list" :key="e.id" class="card" @tap="goEdit(e)">
        <view class="row">
          <text class="name">{{ e.name }}</text>
          <text class="status" :class="e.status">{{ e.status==='active'?'启用':'停用' }}</text>
        </view>
        <view class="row">
          <text class="code">编码: {{ e.code }}</text>
          <text class="phone">{{ e.phone || '-' }}</text>
        </view>
        <view class="row actions">
          <button class="btn-mini" @tap.stop="toggle(e)">{{ e.status==='active'?'停用':'启用' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getEmployees, toggleEmployee } from '@/api'
import type { Employee } from '@/types'

const userStore = useUserStore()
const list = ref<Employee[]>([])

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
  list.value = await getEmployees()
}

async function toggle(e: Employee) {
  await toggleEmployee(e.id)
  load()
}

function goCreate() { uni.navigateTo({ url: '/pages/admin/employee/form' }) }
function goEdit(e: Employee) { uni.navigateTo({ url: `/pages/admin/employee/form?id=${e.id}` }) }
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
