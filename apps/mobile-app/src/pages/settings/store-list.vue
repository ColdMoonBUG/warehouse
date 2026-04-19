<template>
  <view class="store-list-page">
    <view class="header">
      <text class="title">超市管理</text>
    </view>

    <view class="content">
      <view class="actions">
        <button class="btn-add" @tap="goAdd">新增超市</button>
      </view>

      <view class="search-bar">
        <input v-model="keyword" placeholder="搜索超市名称/地址" class="search-input" />
      </view>

      <view v-if="filteredStores.length === 0" class="empty">暂无超市</view>

      <view v-for="s in filteredStores" :key="s.id" class="store-item">
        <view class="store-main">
          <view class="name-row">
            <text class="name" :class="{ 'own-store': isOwnStore(s) }">{{ s.name }}</text>
            <text v-if="isOwnStore(s) && storeDistance(s)" class="distance-tag">{{ storeDistance(s) }}</text>
          </view>
          <text class="meta">状态：{{ s.status === 'active' ? '启用' : '停用' }}</text>
          <text class="meta" v-if="salespersonName(s)">
            业务员：{{ salespersonName(s) }}
          </text>
        </view>
        <view class="ops">
          <button class="btn btn-history" @tap="goHistory(s)">历史销单</button>
          <button class="btn" @tap="goEdit(s)">编辑</button>
          <button class="btn btn-nav" @tap="navigateToStore(s)" v-if="s.lat && s.lng">导航</button>
          <button class="btn btn-danger" @tap="remove(s)">删除</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getStoresAll, deleteStore, getSalespersonAccounts, getSalespersonName, isOwnedStore, getSessionSalespersonId } from '@/api'
import type { Store, Salesperson } from '@/types'
import { useUserStore } from '@/store/user'
import { requestCurrentLocation } from '@/utils/location'
import { haversineDistance, formatDistance } from '@/utils/geo'

const userStore = useUserStore()
const stores = ref<Store[]>([])
const salespersons = ref<Salesperson[]>([])
const keyword = ref('')
const userLocation = ref<{ lat: number; lng: number } | null>(null)

const currentSpId = computed(() => getSessionSalespersonId(userStore.currentUser))

function isOwnStore(store: Store) {
  return isOwnedStore(store, currentSpId.value)
}

function storeDistance(store: Store): string {
  if (!userLocation.value || !store.lat || !store.lng) return ''
  const dist = haversineDistance(userLocation.value.lat, userLocation.value.lng, store.lat, store.lng)
  return formatDistance(dist)
}

const sortedStores = computed(() => {
  return [...stores.value].sort((a, b) => {
    const ownA = isOwnedStore(a, currentSpId.value) ? 0 : 1
    const ownB = isOwnedStore(b, currentSpId.value) ? 0 : 1
    if (ownA !== ownB) return ownA - ownB
    // 同组内按距离排序（有坐标的优先）
    if (userLocation.value && a.lat && a.lng && b.lat && b.lng) {
      const dA = haversineDistance(userLocation.value.lat, userLocation.value.lng, a.lat, a.lng)
      const dB = haversineDistance(userLocation.value.lat, userLocation.value.lng, b.lat, b.lng)
      return dA - dB
    }
    return 0
  })
})

const filteredStores = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return sortedStores.value
  return sortedStores.value.filter(s => {
    const name = (s.name || '').toLowerCase()
    const addr = (s.address || '').toLowerCase()
    return name.includes(kw) || addr.includes(kw)
  })
})

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

function goHistory(store: Store) {
  uni.navigateTo({ url: `/pages/sales/store-history?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}` })
}

function navigateToStore(store: Store) {
  const lat = store.lat!
  const lng = store.lng!
  const name = encodeURIComponent(store.name)
  uni.showActionSheet({
    itemList: ['高德地图', '百度地图', '腾讯地图'],
    success: (res) => {
      switch (res.tapIndex) {
        case 0:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`amapuri://route/plan/?dlat=${lat}&dlon=${lng}&dname=${name}&dev=0&t=0`, () => {
            plus.runtime.openURL(`https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car`)
          })
          // #endif
          break
        case 1:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`baidumap://map/direction?destination=latlng:${lat},${lng}|name:${name}&coord_type=gcj02&mode=driving`, () => {
            plus.runtime.openURL(`https://api.map.baidu.com/direction?destination=latlng:${lat},${lng}|name:${name}&coord_type=gcj02&mode=driving&output=html`)
          })
          // #endif
          break
        case 2:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`qqmap://map/routeplan?type=drive&to=${name}&tocoord=${lat},${lng}&coord_type=1&referer=warehouse`, () => {
            plus.runtime.openURL(`https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=${name}&tocoord=${lat},${lng}&referer=warehouse`)
          })
          // #endif
          break
      }
    },
  })
}

function remove(store: Store) {
  uni.showModal({
    title: '提示',
    content: `确认删除门店"${store.name}"？`,
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
  requestCurrentLocation()
    .then(loc => { userLocation.value = { lat: loc.latitude, lng: loc.longitude } })
    .catch(() => {})
})
</script>

<style lang="scss" scoped>
.store-list-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.actions { margin-bottom: 20rpx; }
.btn-add { width: 100%; height: 80rpx; background: #1890ff; color: #fff; font-size: 30rpx; border-radius: 40rpx; border: none; }
.search-bar { margin-bottom: 20rpx; }
.search-input { width: 100%; height: 72rpx; padding: 0 24rpx; background: #fff; border-radius: 36rpx; font-size: 28rpx; border: 1rpx solid #e8e8e8; box-sizing: border-box; }
.store-item { background: #fff; padding: 24rpx; border-radius: 16rpx; margin-bottom: 20rpx; }
.store-main { margin-bottom: 16rpx; }
.name-row { display:flex; align-items:center; gap: 10rpx; margin-bottom: 4rpx; }
.name { font-size: 30rpx; color:#333; font-weight:600; }
.name.own-store { color: #ff4d4f; }
.distance-tag { font-size: 22rpx; color: #ff4d4f; background: #fff1f0; padding: 2rpx 12rpx; border-radius: 999rpx; white-space: nowrap; }
.meta { font-size: 24rpx; color:#999; margin-top: 6rpx; }
.ops { display:flex; flex-wrap: wrap; gap: 12rpx; }
.btn { padding: 0 20rpx; height: 64rpx; background:#1890ff; color:#fff; border-radius: 10rpx; font-size: 26rpx; line-height:64rpx; }
.btn-nav { background:#1890ff; }
.btn-danger { background:#722ed1; }
.btn-history { background:#13c2c2; }
.empty { text-align:center; padding: 40rpx 0; color:#999; }
</style>
