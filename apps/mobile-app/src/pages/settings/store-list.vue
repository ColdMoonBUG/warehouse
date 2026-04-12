<template>
  <view class="store-list-page">
    <view class="header">
      <text class="title">超市管理</text>
    </view>

    <view class="content">
      <view class="actions">
        <button class="btn-add" @tap="goAdd">新增超市</button>
      </view>

      <view v-if="stores.length === 0" class="empty">暂无超市</view>

      <view v-for="s in stores" :key="s.id" class="store-item">
        <view class="info">
          <text class="name">{{ s.name }}</text>
          <text class="meta">状态：{{ s.status === 'active' ? '启用' : '停用' }}</text>
          <text class="meta" v-if="salespersonName(s)">
            业务员：{{ salespersonName(s) }}
          </text>
        </view>
        <view class="ops">
          <button class="btn" @tap="goEdit(s)">编辑</button>
          <button class="btn" :class="s.status === 'active' ? 'btn-warn' : 'btn-ok'" @tap="toggle(s)">
            {{ s.status === 'active' ? '停用' : '启用' }}
          </button>
          <button class="btn btn-danger" @tap="remove(s)">删除</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStoresAll, toggleStore, deleteStore, getSalespersonAccounts, getSalespersonName } from '@/api'
import type { Store, Salesperson } from '@/types'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const stores = ref<Store[]>([])
const salespersons = ref<Salesperson[]>([])

async function loadData() {
  const [storeList, salespersonList] = await Promise.all([
    getStoresAll(),
    getSalespersonAccounts(),
  ])
  stores.value = storeList
  salespersons.value = salespersonList
}

function salespersonName(store: Store) {
  return getSalespersonName(salespersons.value, store.salespersonId)
}

function guard() {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}

function goAdd() {
  uni.navigateTo({ url: '/pages/settings/store-add' })
}

function goEdit(store: Store) {
  uni.navigateTo({ url: `/pages/settings/store-add?id=${store.id}` })
}

async function toggle(store: Store) {
  await toggleStore(store.id)
  store.status = store.status === 'active' ? 'inactive' : 'active'
}

function remove(store: Store) {
  uni.showModal({
    title: '提示',
    content: `确认删除门店“${store.name}”？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await deleteStore(store.id)
        uni.showToast({ title: '已删除', icon: 'success' })
        await loadData()
      } catch (e: any) {
        uni.showToast({ title: e?.message || '删除失败', icon: 'none' })
      }
    },
  })
}

onShow(() => {
  userStore.init()
  if (!guard()) return
  loadData()
})
</script>

<style lang="scss" scoped>
.store-list-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.actions { margin-bottom: 20rpx; }
.btn-add { width: 100%; height: 80rpx; background: #1890ff; color: #fff; font-size: 30rpx; border-radius: 40rpx; border: none; }
.store-item { background: #fff; padding: 24rpx; border-radius: 16rpx; margin-bottom: 20rpx; display:flex; justify-content:space-between; align-items:center; }
.info { display:flex; flex-direction:column; }
.name { font-size: 30rpx; color:#333; font-weight:600; }
.meta { font-size: 24rpx; color:#999; margin-top: 6rpx; }
.ops { display:flex; gap: 12rpx; }
.btn { padding: 0 20rpx; height: 64rpx; background:#1890ff; color:#fff; border-radius: 10rpx; font-size: 26rpx; line-height:64rpx; }
.btn-warn { background:#ff4d4f; }
.btn-ok { background:#52c41a; }
.btn-danger { background:#722ed1; }
.empty { text-align:center; padding: 40rpx 0; color:#999; }
</style>
