<template>
  <view class="pick-page">
    <view class="map-wrap">
      <map
        id="pickMap"
        class="map-view"
        :latitude="center.latitude"
        :longitude="center.longitude"
        :scale="scale"
        :show-location="true"
        :markers="markers"
        :map-key="AMAP_KEY"
        @regionchange="onRegionChange"
        @tap="onMapTap"
      ></map>
      <view class="pin">●</view>
    </view>

    <view class="panel">
      <view class="search-row">
        <input v-model="keyword" placeholder="搜索店名/地址" @confirm="searchByKeyword" />
        <button class="btn" @tap="searchByKeyword">搜索</button>
      </view>

      <view class="diagnostic-card">
        <view class="diagnostic-row">
          <text class="diagnostic-label">检索方式</text>
          <text class="diagnostic-value">{{ diagnostics.mode }}</text>
        </view>
        <view v-if="diagnostics.keyword" class="diagnostic-row">
          <text class="diagnostic-label">关键词</text>
          <text class="diagnostic-value">{{ diagnostics.keyword }}</text>
        </view>
        <view class="diagnostic-row">
          <text class="diagnostic-label">中心点</text>
          <text class="diagnostic-value">{{ diagnostics.centerText }}</text>
        </view>
        <view class="diagnostic-row">
          <text class="diagnostic-label">结果数</text>
          <text class="diagnostic-value">{{ diagnostics.resultCount }}</text>
        </view>
        <view v-if="diagnostics.amapStatus || diagnostics.info" class="diagnostic-row">
          <text class="diagnostic-label">返回状态</text>
          <text class="diagnostic-value">
            {{ diagnostics.amapStatus || '-' }}
            <text v-if="diagnostics.info"> / {{ diagnostics.info }}</text>
            <text v-if="diagnostics.infocode">（{{ diagnostics.infocode }}）</text>
          </text>
        </view>
      </view>

      <view class="poi-list">
        <view v-if="loading" class="loading">正在加载附近门店...</view>
        <view v-else-if="pois.length === 0" class="empty" :class="{ error: statusIsError }">
          {{ statusText || '暂无可选地点' }}
        </view>
        <view
          v-for="(p, i) in pois"
          :key="p.id || i"
          class="poi-item"
          :class="{ active: isSelectedPoi(p) }"
          @tap="selectPoi(p)"
        >
          <view class="name-row">
            <view class="name">{{ p.name }}</view>
            <text v-if="isSelectedPoi(p)" class="tag">已选</text>
          </view>
          <view class="addr">{{ p.address || '-' }}</view>
        </view>
      </view>

      <view v-if="selected" class="selected-tip">
        当前已选：{{ selected.name }}<text v-if="selected.address">（{{ selected.address }}）</text>
      </view>
      <button class="btn-confirm" :disabled="!selected" @tap="confirm">
        {{ selected ? '确认选择该地点' : '确认选择' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AMAP_KEY, AMAP_WEB_KEY } from '@/utils/config'

interface PoiItem {
  id?: string
  name: string
  address?: string
  location: string
}

interface SearchDiagnostics {
  mode: string
  keyword: string
  centerText: string
  resultCount: number
  amapStatus: string
  info: string
  infocode: string
}

const keyword = ref('')
const center = ref({ latitude: 32.9987, longitude: 112.5292 })
const scale = ref(16)
const loading = ref(false)
const pois = ref<PoiItem[]>([])
const selected = ref<PoiItem | null>(null)
const markers = ref<any[]>([])
const statusText = ref('')
const statusIsError = ref(false)
const diagnostics = ref<SearchDiagnostics>({
  mode: '附近地点',
  keyword: '',
  centerText: '112.529200, 32.998700',
  resultCount: 0,
  amapStatus: '',
  info: '',
  infocode: '',
})
let lastCenterAt = 0
let ignoreNextRegionChange = false

function currentCenterText() {
  return `${center.value.longitude.toFixed(6)}, ${center.value.latitude.toFixed(6)}`
}

function setStatus(message = '', isError = false) {
  statusText.value = message
  statusIsError.value = isError
}

function resetSelection() {
  selected.value = null
}

function isSelectedPoi(poi: PoiItem) {
  return !!selected.value && selected.value.location === poi.location && selected.value.name === poi.name
}

function updateDiagnostics(mode: string, keywordText: string, resultCount: number, data?: any, errorInfo = '') {
  diagnostics.value = {
    mode,
    keyword: keywordText,
    centerText: currentCenterText(),
    resultCount,
    amapStatus: errorInfo ? '请求失败' : String(data?.status || ''),
    info: errorInfo || data?.info || '',
    infocode: data?.infocode || '',
  }
}

function mapPois(data: any): PoiItem[] {
  return (data?.pois || [])
    .filter((p: any) => p?.location && p?.name)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      location: p.location,
    }))
}

function buildPoiSearchMessage(data: any, fallback: string) {
  if (String(data?.status || '') === '0') {
    const suffix = data?.infocode ? `（${data.infocode}）` : ''
    return `${data?.info || '地点检索失败，请检查高德 Web 服务配置'}${suffix}`
  }
  return fallback
}

function setCenter(lat: number, lng: number) {
  center.value = { latitude: lat, longitude: lng }
  markers.value = [{ id: 1, latitude: lat, longitude: lng }]
  ignoreNextRegionChange = true
  diagnostics.value = {
    ...diagnostics.value,
    centerText: currentCenterText(),
  }
}

async function fetchPois(mode: string, keywordText: string, url: string, emptyText: string, requestFailText: string) {
  loading.value = true
  resetSelection()
  setStatus('')
  try {
    const res: any = await uni.request({ url, method: 'GET' })
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      pois.value = []
      updateDiagnostics(mode, keywordText, 0, undefined, `HTTP ${res?.statusCode || '请求失败'}`)
      setStatus(requestFailText, true)
      uni.showToast({ title: requestFailText, icon: 'none' })
      return
    }

    const data = res.data || {}
    const nextPois = mapPois(data)
    pois.value = nextPois
    updateDiagnostics(mode, keywordText, nextPois.length, data)

    if (String(data?.status || '') !== '1') {
      const message = buildPoiSearchMessage(data, requestFailText)
      setStatus(message, true)
      uni.showToast({ title: '地点检索异常', icon: 'none' })
      return
    }

    setStatus(nextPois.length ? '' : emptyText, false)
  } catch (e: any) {
    pois.value = []
    updateDiagnostics(mode, keywordText, 0, undefined, e?.errMsg || e?.message || requestFailText)
    setStatus(requestFailText, true)
    uni.showToast({ title: requestFailText, icon: 'none' })
  } finally {
    loading.value = false
  }
}

function onRegionChange(e: any) {
  if (e.type === 'end' && e.detail?.centerLocation) {
    if (ignoreNextRegionChange) {
      ignoreNextRegionChange = false
      return
    }
    const now = Date.now()
    if (now - lastCenterAt < 800) return
    lastCenterAt = now
    const { latitude, longitude } = e.detail.centerLocation
    setCenter(latitude, longitude)
    loadAround()
  }
}

function onMapTap(e: any) {
  if (e.detail?.latitude && e.detail?.longitude) {
    ignoreNextRegionChange = false
    setCenter(e.detail.latitude, e.detail.longitude)
    resetSelection()
    loadAround()
  }
}

async function loadAround() {
  const loc = `${center.value.longitude},${center.value.latitude}`
  const url = `https://restapi.amap.com/v3/place/around?key=${AMAP_WEB_KEY}&location=${loc}&radius=1000&extensions=all`
  await fetchPois('附近地点', '', url, '附近暂无可选地点', '地点加载失败，请稍后重试')
}

async function searchByKeyword() {
  const kw = keyword.value.trim()
  if (!kw) {
    loadAround()
    return
  }
  const loc = `${center.value.longitude},${center.value.latitude}`
  const url = `https://restapi.amap.com/v3/place/text?key=${AMAP_WEB_KEY}&keywords=${encodeURIComponent(kw)}&location=${loc}&citylimit=true&extensions=all`
  await fetchPois('关键词搜索', kw, url, '未找到匹配地点', '搜索失败，请稍后重试')
}

function selectPoi(p: PoiItem) {
  selected.value = p
  setStatus('')
  if (p.location) {
    const [lng, lat] = p.location.split(',').map(Number)
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setCenter(lat, lng)
    }
  }
}

function confirm() {
  if (!selected.value) return
  const [lng, lat] = selected.value.location.split(',').map(Number)
  const eventChannel = (getCurrentPages() as any).slice(-1)[0]?.getOpenerEventChannel?.()
  eventChannel?.emit('picked', {
    name: selected.value.name,
    address: selected.value.address,
    lat,
    lng,
  })
  uni.navigateBack()
}

onMounted(async () => {
  diagnostics.value = {
    ...diagnostics.value,
    centerText: currentCenterText(),
  }
  try {
    const loc: any = await uni.getLocation({ type: 'gcj02' })
    if (loc?.latitude && loc?.longitude) {
      setCenter(loc.latitude, loc.longitude)
    }
  } catch {
    uni.showToast({ title: '定位失败，已使用默认位置', icon: 'none' })
  }
  await loadAround()
})
</script>

<style lang="scss" scoped>
.pick-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.map-wrap {
  position: relative;
  height: 50vh;
}

.map-view {
  width: 100%;
  height: 100%;
}

.pin {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -100%);
  font-size: 36rpx;
  color: #ff4d4f;
}

.panel {
  flex: 1;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  margin-top: -20rpx;
  padding: 20rpx 24rpx 30rpx;
  display: flex;
  flex-direction: column;
}

.search-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
  margin-bottom: 16rpx;

  input {
    flex: 1;
    border: 1rpx solid #eee;
    border-radius: 12rpx;
    padding: 16rpx;
    font-size: 28rpx;
  }

  .btn {
    height: 68rpx;
    padding: 0 24rpx;
    background: #1890ff;
    color: #fff;
    border-radius: 34rpx;
    font-size: 26rpx;
  }
}

.diagnostic-card {
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background: #f8fafc;
}

.diagnostic-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.diagnostic-row:last-child {
  margin-bottom: 0;
}

.diagnostic-label {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #64748b;
}

.diagnostic-value {
  flex: 1;
  text-align: right;
  font-size: 22rpx;
  color: #334155;
  word-break: break-all;
}

.poi-list {
  flex: 1;
  overflow: auto;
}

.poi-item {
  padding: 16rpx;
  margin-bottom: 12rpx;
  border: 1rpx solid #f0f0f0;
  border-radius: 12rpx;

  &.active {
    background: #eff6ff;
    border-color: #91caff;
  }

  .name-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12rpx;
  }

  .name {
    font-size: 30rpx;
    color: #333;
  }

  .tag {
    padding: 4rpx 12rpx;
    border-radius: 999rpx;
    font-size: 22rpx;
    color: #2563eb;
    background: #dbeafe;
  }

  .addr {
    font-size: 24rpx;
    color: #999;
    margin-top: 6rpx;
  }
}

.loading,
.empty {
  text-align: center;
  color: #999;
  padding: 20rpx 0;
  font-size: 24rpx;
}

.empty.error {
  color: #ef4444;
}

.selected-tip {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #1890ff;
}

.btn-confirm {
  margin-top: 16rpx;
  height: 88rpx;
  background: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  border: none;

  &:disabled {
    opacity: 0.5;
  }
}
</style>
