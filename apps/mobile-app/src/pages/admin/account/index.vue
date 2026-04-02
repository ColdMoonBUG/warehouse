<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">账户管理</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="tip">系统仅保留管理员、大车、小车、三车四个固定账户，仅维护登录凭据。</view>
      <view v-if="list.length === 0" class="empty">暂无账户</view>
      <view v-for="account in list" :key="account.id" class="card">
        <view class="row">
          <text class="name">{{ account.displayName }}</text>
          <text class="status" :class="account.status">{{ account.status === 'active' ? '启用' : '停用' }}</text>
        </view>
        <view class="row">
          <text class="meta">用户名：{{ account.username }}</text>
          <text class="meta">{{ account.role === 'admin' ? '管理员' : '业务员' }}</text>
        </view>
        <view class="row">
          <text class="meta">手势：{{ account.gestureHash ? '已设置' : '未设置' }}</text>
        </view>
        <view class="ops">
          <button class="btn-mini" @tap.stop="goEdit(account)">设置凭据</button>
          <button class="btn-mini" @tap.stop="toggle(account)">{{ account.status === 'active' ? '停用' : '启用' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getAccounts, toggleAccount } from '@/api'
import type { Account } from '@/types'

const userStore = useUserStore()
const list = ref<Account[]>([])

function guard() {
  userStore.init()
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

async function load() {
  if (!guard()) return
  list.value = await getAccounts(true)
}

async function toggle(account: Account) {
  await toggleAccount(account.id)
  await load()
}

function goEdit(account: Account) {
  uni.navigateTo({ url: `/pages/admin/account/form?id=${account.id}` })
}

function goBack() {
  uni.navigateBack()
}

onShow(() => {
  load()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.tip { margin-bottom:20rpx; padding:20rpx 24rpx; background:#eef6ff; color:#3b82f6; border-radius:16rpx; font-size:24rpx; line-height:1.6; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:10rpx; align-items:center; gap:16rpx; }
.row:last-child { margin-bottom:0; }
.name { font-size:30rpx; color:#333; font-weight:600; }
.meta { font-size:24rpx; color:#666; }
.status.active { color:#52c41a; }
.status.inactive { color:#999; }
.ops { display:flex; justify-content:flex-end; gap:12rpx; margin-top:12rpx; }
.btn-mini { height:56rpx; padding:0 20rpx; background:#f0f0f0; border-radius:999rpx; font-size:24rpx; line-height:56rpx; }
.btn-mini::after { border:none; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
</style>
