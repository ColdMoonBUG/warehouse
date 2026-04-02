<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">账户凭据</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view v-if="account" class="summary-card">
        <view class="summary-row">
          <text class="summary-label">账户</text>
          <text class="summary-value">{{ account.displayName }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">用户名</text>
          <text class="summary-value">{{ account.username }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">角色</text>
          <text class="summary-value">{{ account.role === 'admin' ? '管理员' : '业务员' }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">手势</text>
          <text class="summary-value">{{ account.gestureHash ? '已设置' : '未设置' }}</text>
        </view>
      </view>

      <view class="section">
        <text class="label">新密码</text>
        <input v-model="password" password placeholder="留空则不修改" />
      </view>
      <view class="section">
        <text class="label">确认密码</text>
        <input v-model="confirmPassword" password placeholder="请再次输入新密码" />
      </view>

      <button class="btn-save" @tap="savePassword">保存密码</button>
      <button class="btn-secondary" @tap="goSetGesture">设置手势密码</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getAccounts, setPassword } from '@/api'
import type { Account } from '@/types'
import { getPageQueryParam, simpleHash } from '@/utils'

const userStore = useUserStore()
const queryId = ref('')
const account = ref<Account | null>(null)
const password = ref('')
const confirmPassword = ref('')

function guard() {
  userStore.init()
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

async function loadAccount(id: string) {
  const list = await getAccounts(true)
  account.value = list.find(item => item.id === id) || null
  if (!account.value) {
    uni.showToast({ title: '账户不存在', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
  }
}

async function savePassword() {
  if (!account.value) return
  if (!password.value) {
    uni.showToast({ title: '请输入新密码', icon: 'none' })
    return
  }
  if (password.value !== confirmPassword.value) {
    uni.showToast({ title: '两次密码不一致', icon: 'none' })
    return
  }
  await setPassword(account.value.id, simpleHash(password.value))
  uni.showToast({ title: '保存成功', icon: 'success' })
  password.value = ''
  confirmPassword.value = ''
  await loadAccount(account.value.id)
}

function goSetGesture() {
  if (!account.value) return
  uni.navigateTo({
    url: `/pages/login/set-gesture?username=${encodeURIComponent(account.value.username)}&name=${encodeURIComponent(account.value.displayName)}&id=${account.value.id}&mode=manage`,
  })
}

function goBack() {
  uni.navigateBack()
}

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  if (!guard()) return
  if (!queryId.value) {
    uni.showToast({ title: '账户信息缺失', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  await loadAccount(queryId.value)
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.summary-card, .section { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.summary-row { display:flex; justify-content:space-between; gap:16rpx; margin-bottom:12rpx; }
.summary-row:last-child { margin-bottom:0; }
.summary-label { font-size:26rpx; color:#666; }
.summary-value { font-size:28rpx; color:#333; }
.label { display:block; font-size:26rpx; color:#666; margin-bottom:10rpx; }
input { font-size:30rpx; }
.btn-save, .btn-secondary { width:100%; height:88rpx; border-radius:44rpx; font-size:32rpx; border:none; }
.btn-save { background:#1890ff; color:#fff; }
.btn-secondary { margin-top:16rpx; background:#fff; color:#1890ff; border:2rpx solid #b5d4ff; }
</style>
