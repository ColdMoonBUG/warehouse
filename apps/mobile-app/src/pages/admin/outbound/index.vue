<template>
  <view class="page">
    <view class="header"><text class="title">出库单</text></view>
    <view class="content">
      <view class="actions"><button class="btn" @tap="goCreate">新增出库单</button></view>
      <view v-if="list.length===0" class="empty">暂无出库单</view>
      <view v-for="doc in list" :key="doc.id" class="card" @tap="goEdit(doc)">
        <view class="row">
          <text class="code">{{ doc.code }}</text>
          <text class="status" :class="doc.status">{{ statusText(doc.status) }}</text>
        </view>
        <view class="row">
          <text class="date">{{ doc.date }}</text>
          <text class="qty">数量: {{ totalQty(doc) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getOutbounds } from '@/api'
import type { OutboundDoc } from '@/types'

const userStore = useUserStore()
const list = ref<OutboundDoc[]>([])

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

async function loadList() {
  try {
    list.value = await getOutbounds()
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' })
  }
}

function statusText(status: string) {
  if (status === 'posted') return '已过账'
  if (status === 'voided') return '已作废'
  return '草稿'
}

function totalQty(doc: OutboundDoc) {
  return doc.lines.reduce((s, l) => s + l.qty, 0)
}

function goCreate() { uni.navigateTo({ url: '/pages/admin/outbound/form' }) }
function goEdit(doc: OutboundDoc) { uni.navigateTo({ url: `/pages/admin/outbound/form?id=${doc.id}` }) }

onShow(async () => {
  userStore.init()
  if (!guard()) return
  await loadList()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.actions { margin-bottom: 20rpx; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:32rpx; border:none; }
.card { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.row { display:flex; justify-content:space-between; margin-bottom:6rpx; }
.code { font-size:30rpx; color:#333; }
.date, .qty { font-size:24rpx; color:#666; }
.status.posted { color:#52c41a; }
.status.voided { color:#ff4d4f; }
.empty { text-align:center; color:#999; padding:40rpx 0; }
</style>
