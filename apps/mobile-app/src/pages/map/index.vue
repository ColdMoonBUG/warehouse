<template>
  <view class="map-page">
    <map
      id="storeMap"
      class="map-view"
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :scale="mapScale"
      :markers="markers"
      :show-location="true"
      :map-key="AMAP_KEY"
      @markertap="onMarkerTap"
    />

    <!-- 搜索栏 -->
    <view class="search-bar">
      <text class="search-text">门店地图</text>
    </view>

    <!-- 图例 -->
    <view class="legend">
      <view class="legend-title">近30天销量</view>
      <view class="legend-item">
        <view class="dot" style="background: #22c55e" />
        <text>低</text>
      </view>
      <view class="legend-item">
        <view class="dot" style="background: #eab308" />
        <text>中低</text>
      </view>
      <view class="legend-item">
        <view class="dot" style="background: #f97316" />
        <text>中高</text>
      </view>
      <view class="legend-item">
        <view class="dot" style="background: #ef4444" />
        <text>高</text>
      </view>
    </view>

    <!-- 门店信息弹窗 -->
    <view v-if="selectedStore" class="store-popup">
      <view class="popup-mask" @tap="selectedStore = null" />
      <view class="popup-content">
        <view class="popup-header">
          <text class="store-name">{{ selectedStore.name }}</text>
          <view class="close-btn" @tap="selectedStore = null">×</view>
        </view>
        <view class="popup-body">
          <view class="info-row">
            <text class="label">地址</text>
            <text class="value">{{ selectedStore.address || '-' }}</text>
          </view>
          <view class="info-row">
            <text class="label">30天销量</text>
            <text class="value">
              <text class="qty">{{ selectedStore.saleQty || 0 }}</text> 件
            </text>
          </view>
        </view>
        <view class="popup-footer">
          <button class="btn-nav" @tap="navigateToStore">导航到店</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getStores, getStoreSaleQty, getEmployees, getVisibleStoresForSession, hasAssignedStoresForEmployee, isSameEmployeeId } from '@/api'
import { AMAP_KEY } from '@/utils/config'
import type { Store, Employee } from '@/types'

interface StoreWithSale extends Store {
  saleQty: number
  color: string
  employeeName?: string
}

const userStore = useUserStore()

const mapCenter = ref({ latitude: 32.9987, longitude: 112.5292 })
const mapScale = ref(13)
const markers = ref<any[]>([])
const stores = ref<StoreWithSale[]>([])
const employees = ref<Employee[]>([])
const selectedStore = ref<StoreWithSale | null>(null)

function gradeColor(qty: number, max: number): string {
  if (max === 0) return '#22c55e'
  const pct = qty / max
  if (pct >= 0.75) return '#ef4444'
  if (pct >= 0.5) return '#f97316'
  if (pct >= 0.25) return '#eab308'
  return '#22c55e'
}

function createMarkerIcon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="12" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>
    <text x="15" y="20" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold">店</text>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

async function loadData() {
  const [storeList, saleQty, empList, loc] = await Promise.all([
    getStores(),
    getStoreSaleQty(30),
    getEmployees(),
    uni.getLocation({ type: 'gcj02' }).then(res => res).catch(() => null),
  ])
  if (loc && loc.latitude && loc.longitude) {
    mapCenter.value = { latitude: loc.latitude, longitude: loc.longitude }
  }

  employees.value = empList

  const maxQty = Math.max(...Object.values(saleQty), 1)

  const currentEmployeeId = userStore.currentUser?.employeeId
  const visibleStores = getVisibleStoresForSession(storeList, userStore.isAdmin, currentEmployeeId)
  if (!userStore.isAdmin && storeList.length > 0 && !hasAssignedStoresForEmployee(storeList, currentEmployeeId)) {
    uni.showToast({ title: '当前账户未绑定超市，已显示全部启用超市', icon: 'none' })
  }

  stores.value = visibleStores
    .filter(s => s.lat && s.lng)
    .map(s => {
      const qty = saleQty[s.id] || 0
      const color = gradeColor(qty, maxQty)
      const emp = employees.value.find(e => isSameEmployeeId(e.id, s.defaultEmployeeId))
      return {
        ...s,
        saleQty: qty,
        color,
        employeeName: emp?.name,
      }
    })

  markers.value = stores.value.map((s, i) => ({
    id: i,
    latitude: s.lat!,
    longitude: s.lng!,
    title: s.name,
    iconPath: createMarkerIcon(s.color),
    width: 30,
    height: 30,
    anchor: { x: 0.5, y: 0.5 },
    callout: {
      content: s.name,
      color: '#333',
      fontSize: 12,
      borderRadius: 4,
      padding: 6,
      display: 'BYCLICK',
    },
  }))
}

function onMarkerTap(e: any) {
  const markerId = e.markerId
  if (markerId !== undefined && stores.value[markerId]) {
    selectedStore.value = stores.value[markerId]
  }
}

function navigateToStore() {
  if (!selectedStore.value) return
  uni.openLocation({
    latitude: selectedStore.value.lat!,
    longitude: selectedStore.value.lng!,
    name: selectedStore.value.name,
    address: selectedStore.value.address || '',
    scale: 18,
  })
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadData()
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

  .search-text {
    font-size: 32rpx;
    font-weight: 600;
    color: #333;
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

    .store-name {
      font-size: 36rpx;
      font-weight: 600;
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

    .btn-nav {
      width: 100%;
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
  }
}
</style>
