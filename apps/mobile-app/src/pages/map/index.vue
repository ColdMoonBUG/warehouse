<template>
  <view class="map-page">
    <map
      id="storeMap"
      class="map-view"
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :scale="mapScale"
      :markers="markers"
      :show-location="false"
      :map-key="AMAP_KEY"
      @markertap="onMarkerTap"
      @regionchange="onRegionChange"
    />

    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-main">
        <text class="search-text">门店地图</text>
        <button class="location-btn" size="mini" :loading="locationLoading" @tap="locateCurrentPosition(true)">
          {{ locationActionText }}
        </button>
      </view>
      <text class="location-text" :class="{ error: !!locationErrorMessage }">{{ locationMessage }}</text>
    </view>

    <!-- 图例 -->
    <view class="legend">
      <template v-if="userStore.isAdmin">
        <view class="legend-title">近30天销量</view>
        <view class="legend-item"><view class="dot" style="background: #22c55e" /><text>低</text></view>
        <view class="legend-item"><view class="dot" style="background: #eab308" /><text>中低</text></view>
        <view class="legend-item"><view class="dot" style="background: #f97316" /><text>中高</text></view>
        <view class="legend-item"><view class="dot" style="background: #ef4444" /><text>高</text></view>
      </template>
      <template v-else>
        <view class="legend-title">门店归属</view>
        <view class="legend-item"><view class="dot" style="background: #ef4444" /><text>我的店</text></view>
        <view class="legend-item"><view class="dot" style="background: #1890ff" /><text>其他店</text></view>
      </template>
    </view>

    <!-- 门店信息弹窗 -->
    <view v-if="selectedStore" class="store-popup">
      <view class="popup-mask" @tap="selectedStore = null" />
      <view class="popup-content">
        <view class="popup-header">
          <view class="popup-title-wrap">
            <text class="store-name" :class="{ owned: isOwnedStoreItem(selectedStore) }">{{ selectedStore.name }}</text>
            <text v-if="selectedStore.salespersonName" class="salesperson-tag">（业务员：{{ selectedStore.salespersonName }}）</text>
            <text v-if="isOwnedStoreItem(selectedStore)" class="owner-tag">我的店</text>
          </view>
          <view class="close-btn" @tap="selectedStore = null">×</view>
        </view>
        <view class="popup-body">
          <view class="info-row" v-if="selectedStore.salespersonName">
            <text class="label">归属业务员</text>
            <text class="value" :class="{ owned: isOwnedStoreItem(selectedStore) }">{{ selectedStore.salespersonName }}</text>
          </view>
          <view class="info-row">
            <text class="label">地址</text>
            <text class="value">{{ selectedStore.address || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="label">30天销量</text>
            <text class="value">
              <text class="qty">{{ selectedStore.saleQty || 0 }}</text> 袋
            </text>
          </view>
        </view>
        <view class="popup-footer">
          <button class="btn-nav" @tap="navigateToStore">导航到店</button>
          <button class="btn-history" @tap="goStoreHistory">历史销单</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getStores, getStoreSaleQty, getSalespersonAccounts, isOwnedStore, isSameSalespersonId, getSessionSalespersonId } from '@/api'
import { AMAP_KEY } from '@/utils/config'
import { requestCurrentLocation, openLocationSettings } from '@/utils/location'
import type { Store, Salesperson } from '@/types'

interface StoreWithSale extends Store {
  saleQty: number
  color: string
  salespersonName?: string
}

const DEFAULT_CENTER = { latitude: 32.9987, longitude: 112.5292 }

const userStore = useUserStore()

const mapCenter = ref({ ...DEFAULT_CENTER })
const mapScale = ref(13)
const markers = shallowRef<any[]>([])
const stores = shallowRef<StoreWithSale[]>([])
const salespersons = shallowRef<Salesperson[]>([])
const selectedStore = ref<StoreWithSale | null>(null)
const locationLoading = ref(false)
const locationReady = ref(false)
const locationErrorMessage = ref('')
const currentLat = ref(0)
const currentLng = ref(0)
const CURRENT_LOCATION_MARKER_ID = 9999
let _locationTimer: ReturnType<typeof setInterval> | null = null

const COLOR_ICON_MAP: Record<string, string> = {
  '#22c55e': '/static/marker-green.png',
  '#eab308': '/static/marker-yellow.png',
  '#f97316': '/static/marker-orange.png',
  '#ef4444': '/static/marker-red.png',
  '#1890ff': '/static/marker-blue.png',
}

function markerIconPath(color: string): string {
  return COLOR_ICON_MAP[color] || '/static/marker-blue.png'
}

function updateLocationMarker() {
  if (!currentLat.value || !currentLng.value) return
  // 使用新文件名（location-arrow.png）避免 HBuilderX 旧资源缓存命中
  // 高德地图原生 marker 的 width/height 单位是 px，36px 在主流安卓设备上视觉合适
  const locMarker = {
    id: CURRENT_LOCATION_MARKER_ID,
    latitude: currentLat.value,
    longitude: currentLng.value,
    iconPath: '/static/location-arrow.png',
    width: 36,
    height: 36,
    anchor: { x: 0.5, y: 0.5 },
    zIndex: 1,  // 低于店铺 marker，不遮挡
  }
  const arr = markers.value
  const idx = arr.findIndex(m => m.id === CURRENT_LOCATION_MARKER_ID)
  if (idx >= 0) {
    arr[idx] = locMarker
    markers.value = [...arr]
  } else {
    markers.value = [...arr, locMarker]
  }
}

const locationMessage = computed(() => {
  if (locationLoading.value) return '正在获取当前位置…'
  if (locationErrorMessage.value) return locationErrorMessage.value
  if (locationReady.value) return '已定位到当前位置，可点击重试'
  return '正在使用默认位置，可点击定位当前位置'
})

const locationActionText = computed(() => {
  if (locationLoading.value) return '定位中'
  return locationReady.value ? '重新定位' : '定位当前位置'
})

function gradeColor(qty: number, max: number): string {
  if (max === 0) return '#22c55e'
  const pct = qty / max
  if (pct >= 0.75) return '#ef4444'
  if (pct >= 0.5) return '#f97316'
  if (pct >= 0.25) return '#eab308'
  return '#22c55e'
}

function ownershipColor(isOwn: boolean): string {
  return isOwn ? '#ef4444' : '#1890ff'
}

function createMarkerIcon(color: string, name: string): string {
  return markerIconPath(color)
}

async function locateCurrentPosition(showToastOnFail = false) {
  if (locationLoading.value) return false
  locationLoading.value = true
  locationErrorMessage.value = ''
  try {
    const loc = await requestCurrentLocation()
    mapCenter.value = { latitude: loc.latitude, longitude: loc.longitude }
    currentLat.value = loc.latitude
    currentLng.value = loc.longitude
    locationReady.value = true
    updateLocationMarker()
    // 触发地图原生定位点显示
    try {
      const mapCtx = uni.createMapContext('storeMap')
      mapCtx.moveToLocation({ latitude: loc.latitude, longitude: loc.longitude })
    } catch { /* ignore */ }
    return true
  } catch (e: any) {
    locationReady.value = false
    locationErrorMessage.value = e?.message || '定位失败，当前先显示默认区域'
    if (showToastOnFail) {
      uni.showToast({ title: locationErrorMessage.value, icon: 'none' })
      if (e?.reason === 'permission' || e?.reason === 'service') {
        setTimeout(() => openLocationSettings(), 200)
      }
    }
  } finally {
    locationLoading.value = false
  }
  return false
}

function updateMarkers(storeList: Store[], saleQty: Record<string, number>) {
  const sessionSpId = getSessionSalespersonId(userStore.currentUser)
  const isAdmin = userStore.isAdmin
  const maxQty = Math.max(...Object.values(saleQty), 1)
  const builtStores: StoreWithSale[] = []
  const builtMarkers: any[] = []
  let mi = 0
  for (const s of storeList) {
    if (!s.lat || !s.lng) continue
    const qty = saleQty[s.id] || 0
    const isOwn = isOwnedStore(s, sessionSpId)
    const color = isAdmin ? gradeColor(qty, maxQty) : ownershipColor(isOwn)
    const salesperson = salespersons.value.find(item =>
      item.id === s.salespersonId ||
      item.salespersonId === s.salespersonId ||
      isSameSalespersonId(item.salespersonId || item.id, s.salespersonId)
    )
    builtStores.push({ ...s, saleQty: qty, color, salespersonName: salesperson?.displayName })
    builtMarkers.push({
      id: mi++,
      latitude: s.lat,
      longitude: s.lng,
      iconPath: markerIconPath(color),
      width: 24,
      height: 24,
      anchor: { x: 0.5, y: 0.5 },
      label: {
        content: s.name.length > 7 ? s.name.slice(0, 7) + '...' : s.name,
        color: '#666666',
        fontSize: 10,
        anchorX: 14,
        anchorY: -4,
        bgColor: '#ffffffcc',
        padding: 2,
        borderRadius: 3,
      },
    })
  }
  _cachedStores = builtStores
  _cachedMarkers = builtMarkers  // 不含定位点
  stores.value = builtStores
  // markers = 门店 + 定位点
  markers.value = [...builtMarkers]
  updateLocationMarker()
}

function onRegionChange(_e: any) { /* unused */ }

let _regionTimer: ReturnType<typeof setTimeout> | null = null
let _lastLabelVisible = false

function isOwnedStoreItem(store?: Store | null) {
  return isOwnedStore(store, getSessionSalespersonId(userStore.currentUser))
}

const MAP_CACHE_TTL = 5 * 60 * 1000 // 5分钟
let _lastLoadTime = 0
let _cachedStoreList: any[] = []
let _cachedSaleQty: Record<string, number> = {}
let _cachedSalespersons: any[] = []
let _cachedMarkers: any[] = []  // 缓存构建好的 markers，命中时直接复用
let _cachedStores: StoreWithSale[] = []

// 监听门店变更事件，强制下次刷新
uni.$on('store:updated', () => {
  _lastLoadTime = 0
  _cachedMarkers = []
  _cachedStores = []
})

async function loadBusinessData(force = false) {
  const now = Date.now()
  const expired = now - _lastLoadTime > MAP_CACHE_TTL
  if (!force && !expired && _cachedStoreList.length > 0) {
    salespersons.value = _cachedSalespersons
    // 关键优化：如果已有缓存的 markers 数组，直接整个数组赋值（shallowRef 不会做深度 diff）
    if (_cachedMarkers.length > 0) {
      stores.value = _cachedStores
      markers.value = _cachedMarkers
      // 仅追加定位点，不重建门店 markers
      updateLocationMarker()
      return
    }
    updateMarkers(_cachedStoreList, _cachedSaleQty)
    return
  }
  const [storeList, saleQty, salespersonList] = await Promise.all([
    getStores(),
    getStoreSaleQty(30),
    getSalespersonAccounts(),
  ])
  _cachedStoreList = storeList
  _cachedSaleQty = saleQty
  _cachedSalespersons = salespersonList
  _lastLoadTime = Date.now()
  salespersons.value = salespersonList
  updateMarkers(storeList, saleQty)
}

function onMarkerTap(e: any) {
  console.log('[map] onMarkerTap event:', JSON.stringify(e))
  const markerId = e?.detail?.markerId ?? e?.markerId ?? e?.detail?.id ?? e?.id
  console.log('[map] markerId:', markerId, 'stores.length:', stores.value.length)
  if (markerId === undefined || markerId === null) return
  if (markerId === CURRENT_LOCATION_MARKER_ID) return
  const store = stores.value[markerId]
  console.log('[map] store:', store?.name)
  if (store) {
    selectedStore.value = store
    showStoreActions(store)
  }
}

function showStoreActions(store: StoreWithSale) {
  // 标题拼入业务员名，因为地图组件会盖住普通弹窗，只能用 ActionSheet
  const titleParts = [store.name]
  if (store.salespersonName) titleParts.push(`业务员：${store.salespersonName}`)
  const items = ['导航到店', '历史销单']
  uni.showActionSheet({
    title: titleParts.join('\n'),
    itemList: items,
    success: (res) => {
      if (res.tapIndex === 0) {
        navigateToStore()
      } else if (res.tapIndex === 1) {
        goStoreHistory()
      }
    },
    fail: () => { selectedStore.value = null },
  })
}

function goStoreHistory() {
  if (!selectedStore.value) return
  const store = selectedStore.value
  selectedStore.value = null
  uni.navigateTo({
    url: `/pages/sales/store-history?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`,
  })
}

function navigateToStore() {
  if (!selectedStore.value) return
  const { lat, lng, name } = selectedStore.value
  const n = encodeURIComponent(name)
  uni.showActionSheet({
    itemList: ['高德地图', '百度地图', '腾讯地图'],
    success: (res) => {
      switch (res.tapIndex) {
        case 0:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`amapuri://route/plan/?dlat=${lat}&dlon=${lng}&dname=${n}&dev=0&t=0`, () => {
            plus.runtime.openURL(`https://uri.amap.com/navigation?to=${lng},${lat},${n}&mode=car`)
          })
          // #endif
          break
        case 1:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`baidumap://map/direction?destination=latlng:${lat},${lng}|name:${n}&coord_type=gcj02&mode=driving`, () => {
            plus.runtime.openURL(`https://api.map.baidu.com/direction?destination=latlng:${lat},${lng}|name:${n}&coord_type=gcj02&mode=driving&output=html`)
          })
          // #endif
          break
        case 2:
          // #ifdef APP-PLUS
          plus.runtime.openURL(`qqmap://map/routeplan?type=drive&to=${n}&tocoord=${lat},${lng}&coord_type=1&referer=warehouse`, () => {
            plus.runtime.openURL(`https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=${n}&tocoord=${lat},${lng}&referer=warehouse`)
          })
          // #endif
          break
      }
    },
  })
}

onHide(() => {
  if (_locationTimer) {
    clearInterval(_locationTimer)
    _locationTimer = null
  }
})

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  selectedStore.value = null
  loadBusinessData()
  if (!currentLat.value || !currentLng.value) {
    locateCurrentPosition(false)
  }
  // 每10秒自动刷新位置
  if (_locationTimer) clearInterval(_locationTimer)
  _locationTimer = setInterval(() => {
    locateCurrentPosition(false)
  }, 30000)
})
</script>

<style lang="scss" scoped>
.map-page {
  position: relative;
  width: 100%;
  height: 100vh;
}

.map-view {
  width: 100%;
  height: 100%;
}

.search-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));
  background: rgba(255, 255, 255, 0.9);

  .search-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20rpx;
  }

  .search-text {
    font-size: 32rpx;
    font-weight: 600;
    color: #333;
  }

  .location-btn {
    margin: 0;
    padding: 0 24rpx;
    height: 60rpx;
    line-height: 60rpx;
    background: #1890ff;
    color: #fff;
    border-radius: 999rpx;
    font-size: 24rpx;

    &::after {
      border: none;
    }
  }

  .location-text {
    display: block;
    margin-top: 10rpx;
    font-size: 22rpx;
    color: #64748b;

    &.error {
      color: #ef4444;
    }
  }
}

.legend {
  position: absolute;
  right: 20rpx;
  bottom: 180rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);

  .legend-title {
    font-size: 24rpx;
    font-weight: 500;
    color: #333;
    margin-bottom: 12rpx;
  }

  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 8rpx;

    .dot {
      width: 16rpx;
      height: 16rpx;
      border-radius: 50%;
      margin-right: 10rpx;
    }

    text {
      font-size: 22rpx;
      color: #666;
    }
  }
}

.store-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;

  .popup-mask {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
  }

  .popup-content {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fff;
    border-radius: 32rpx 32rpx 0 0;
    padding: 40rpx 30rpx;
    padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  }

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30rpx;

    .popup-title-wrap {
      display: flex;
      align-items: center;
      gap: 12rpx;
      min-width: 0;
      flex: 1;
    }

    .store-name {
      font-size: 36rpx;
      font-weight: 600;
    }

    .store-name.owned {
      color: #ff4d4f;
    }

    .salesperson-tag {
      font-size: 24rpx;
      color: #64748b;
      font-weight: 400;
    }

    .owner-tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 88rpx;
      height: 40rpx;
      padding: 0 14rpx;
      border-radius: 999rpx;
      background: #fff1f0;
      color: #ff4d4f;
      font-size: 22rpx;
    }

    .close-btn {
      font-size: 40rpx;
      color: #999;
    }
  }

  .popup-body {
    .info-row {
      display: flex;
      padding: 16rpx 0;
      border-bottom: 1rpx solid #f0f0f0;

      .label {
        width: 140rpx;
        font-size: 28rpx;
        color: #666;
      }

      .value {
        flex: 1;
        font-size: 28rpx;
        color: #333;

        &.owned {
          color: #ff4d4f;
        }

        .qty {
          font-size: 36rpx;
          font-weight: 600;
          color: #1890ff;
        }
      }
    }
  }

  .popup-footer {
    margin-top: 30rpx;
    display: flex;
    gap: 16rpx;

    .btn-nav {
      flex: 1;
      height: 88rpx;
      background: #1890ff;
      color: #fff;
      font-size: 32rpx;
      border-radius: 44rpx;
      border: none;

      &::after {
        border: none;
      }
    }

    .btn-history {
      flex: 1;
      height: 88rpx;
      background: #fff;
      color: #1890ff;
      font-size: 32rpx;
      border-radius: 44rpx;
      border: 2rpx solid #1890ff;

      &::after {
        border: none;
      }
    }
  }
}
</style>
