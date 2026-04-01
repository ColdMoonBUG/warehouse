<template>
  <view class="select-page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">选择业务员</text>
      <view style="width: 60rpx" />
    </view>

    <view class="content">
      <view class="section">
        <text class="label">请选择业务员</text>
        <picker mode="selector" :range="employees" range-key="name" @change="onChange">
          <view class="picker">
            <text>{{ selected?.name || '请选择业务员' }}</text>
          </view>
        </picker>
      </view>

      <button class="btn" @tap="confirm" :disabled="!selected">下一步</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getEmployees, getAccounts } from '@/api'
import type { Employee, Account } from '@/types'

const employees = ref<Employee[]>([])
const selected = ref<Employee | null>(null)
const accountId = ref('')
const username = ref('')
const displayName = ref('')

onLoad((query) => {
  if (query?.id) accountId.value = query.id
  if (query?.username) username.value = query.username
  if (query?.name) displayName.value = decodeURIComponent(query.name)
})

function goBack() { uni.navigateBack() }
function onChange(e: any) { selected.value = employees.value[Number(e.detail.value)] || null }

async function confirm() {
  if (!selected.value) return
  // 本地记忆：写入本地账户缓存（不写回后端）
  const list = await getAccounts()
  const acc = list.find(a => a.id === accountId.value)
  if (acc) {
    acc.employeeId = selected.value.id
    try {
      const key = 'wh_account'
      const raw = uni.getStorageSync(key)
      const data = raw ? JSON.parse(raw) : list
      const idx = data.findIndex((a: Account) => a.id === acc.id)
      if (idx >= 0) data[idx] = acc
      else data.push(acc)
      uni.setStorageSync(key, JSON.stringify(data))
      // 同步本地会话 employeeId
      const sessKey = 'wh_session'
      const sraw = uni.getStorageSync(sessKey)
      if (sraw) {
        const s = JSON.parse(sraw)
        s.employeeId = acc.employeeId
        uni.setStorageSync(sessKey, JSON.stringify(s))
      }
    } catch {}
  }
  const base = `username=${username.value}&name=${encodeURIComponent(displayName.value)}&id=${accountId.value}`
  uni.redirectTo({ url: `/pages/login/password?${base}` })
}

onMounted(async () => {
  employees.value = await getEmployees()
})
</script>

<style lang="scss" scoped>
.select-page { min-height: 100vh; background: #fff; }
.header { display:flex; align-items:center; justify-content:space-between; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:34rpx; font-weight:500; color:#333; }
.content { padding: 40rpx 30rpx; }
.section { background:#f7f7f7; border-radius:16rpx; padding:24rpx; margin-bottom:24rpx; }
.label { font-size:28rpx; color:#666; margin-bottom:12rpx; display:block; }
.picker { padding: 20rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:30rpx; background:#fff; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.btn::after { border:none; }
</style>
