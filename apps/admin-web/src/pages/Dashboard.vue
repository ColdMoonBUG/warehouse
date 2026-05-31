<template>
  <div class="dashboard-page">
    <div class="summary-row">
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">总门店</div>
        <div class="summary-value">{{ filterLabel === '' ? activeStoreCount : filteredStoreCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">已定位</div>
        <div class="summary-value">{{ positionedStoreCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">近30天销量</div>
        <div class="summary-value">{{ totalSaleQty }}</div>
      </el-card>
      <el-card
        shadow="hover"
        class="summary-card filter-card-btn"
        :class="{ active: filterLabel === '大车' }"
        @click="toggleFilter('大车')"
      >
        <div class="summary-label">大车门店</div>
        <div class="summary-value">{{ storeCountBySp('大车') }}</div>
      </el-card>
      <el-card
        shadow="hover"
        class="summary-card filter-card-btn"
        :class="{ active: filterLabel === '小车' }"
        @click="toggleFilter('小车')"
      >
        <div class="summary-label">小车门店</div>
        <div class="summary-value">{{ storeCountBySp('小车') }}</div>
      </el-card>
      <el-card
        shadow="hover"
        class="summary-card filter-card-btn"
        :class="{ active: filterLabel === '三车' }"
        @click="toggleFilter('三车')"
      >
        <div class="summary-label">三车门店</div>
        <div class="summary-value">{{ storeCountBySp('三车') }}</div>
      </el-card>
    </div>

    <div class="dashboard-map">
      <div id="map" style="width:100%;height:100%" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getSalespersonAccounts } from '@/api/auth'
import { getStoreSaleQty } from '@/api/sale'
import { getStores } from '@/api/store'
import request from '@/utils/request'
import type { Account, Store } from '@/types'

const storesState = ref<Store[]>([])
const saleQtyState = ref<Record<string, number>>({})
const salespersonAccounts = ref<Account[]>([])
const filterLabel = ref<string>('')  // '' = 全部，'大车'/'小车'/'三车' = 高亮对应业务员

const activeStores = computed(() => storesState.value.filter((s) => s.status === 'active'))
const positionedStores = computed(() => activeStores.value.filter((s) => s.lat !== undefined && s.lat !== null && s.lng !== undefined && s.lng !== null))
const activeStoreCount = computed(() => activeStores.value.length)
const positionedStoreCount = computed(() => positionedStores.value.length)
const unpositionedStoreCount = computed(() => activeStoreCount.value - positionedStoreCount.value)
const totalSaleQty = computed(() => Object.values(saleQtyState.value).reduce((sum, qty) => sum + Number(qty || 0), 0))
const maxSaleQty = computed(() => Math.max(...positionedStores.value.map((s) => saleQtyState.value[s.id] || 0), 1))
const hotStoreCount = computed(() => positionedStores.value.filter((s) => (saleQtyState.value[s.id] || 0) >= maxSaleQty.value * 0.75).length)

function spIdByLabel(label: string): string {
  return salespersonAccounts.value.find(a => a.displayName === label)?.id || ''
}

function storeCountBySp(label: string): number {
  const spId = spIdByLabel(label)
  if (!spId) return 0
  return activeStores.value.filter(s => s.salespersonId === spId).length
}

const filteredStoreCount = computed(() => {
  if (!filterLabel.value) return activeStoreCount.value
  return storeCountBySp(filterLabel.value)
})

function toggleFilter(label: string) {
  filterLabel.value = filterLabel.value === label ? '' : label
  refreshMarkerContent()
}

function salespersonName(id?: string) {
  if (!id) return '-'
  return salespersonAccounts.value.find(account => account.id === id)?.displayName || id
}

function scaleText(scale?: number) {
  return ({ 1: '小店', 2: '中店', 3: '大店', 4: '超大店' } as Record<number, string>)[scale || 1] || '小店'
}

function statusText(status?: string) {
  return status === 'active' ? '启用' : '停用'
}

function buildMarkerContent(name: string, color: string, size: number, opacity = 1) {
  return `
    <div class="marker-wrap" style="transform:translateY(-6px);opacity:${opacity}">
      <div class="marker-dot" style="background:${color};width:${size}px;height:${size}px;line-height:${size}px">店</div>
      <div class="marker-name">${name}</div>
    </div>
  `
}

function buildInfoWindowContent(store: Store, qty: number, color: string) {
  return `
    <div style="line-height:1.8;min-width:220px">
      <div style="font-weight:700;font-size:14px">${store.name}</div>
      <div>编码：${store.code || '-'}</div>
      <div>地址：${store.address || '-'}</div>
      <div>业务员：${salespersonName(store.salespersonId)}</div>
      <div>规模：${scaleText(store.scale)}</div>
      <div>状态：${statusText(store.status)}</div>
      <div>本月净销售：<span style="color:${color};font-weight:600">${qty}</span> 袋</div>
    </div>
  `
}

let map: any = null
let legendEl: HTMLDivElement | null = null
let infoWindow: any = null
let markers: Array<{ marker: any; color: string; store: Store }> = []
let zoomListener: (() => void) | null = null
let destroyed = false
let initToken = 0

const BASE_ZOOM = 13
const BASE_SIZE = 20
const MIN_SIZE = 14
const MAX_SIZE = 36

function sizeForZoom(zoom: number) {
  const size = BASE_SIZE + (zoom - BASE_ZOOM) * 2
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, size))
}

function refreshMarkerContent() {
  const zoom = map?.getZoom?.() ?? BASE_ZOOM
  const size = sizeForZoom(zoom)
  const spId = filterLabel.value ? spIdByLabel(filterLabel.value) : ''
  for (const { marker, color, store } of markers) {
    const isHighlight = !spId || store.salespersonId === spId
    marker.setContent(buildMarkerContent(store.name, color, size, isHighlight ? 1 : 0.2))
  }
}

function gradeColorByRank(rank: number): string {
  // rank 从1开始，按净销售袋数排名
  if (rank <= 50) return '#ef4444'    // 前50名：红
  if (rank <= 200) return '#eab308'   // 50-200名：黄
  if (rank <= 300) return '#1890ff'   // 200-300名：蓝
  return '#22c55e'                    // 300以后：绿
}

function cleanupMap() {
  if (zoomListener && map?.off) {
    map.off('zoomend', zoomListener)
  }
  zoomListener = null
  legendEl?.remove()
  legendEl = null
  markers = []
  infoWindow = null
  map?.destroy?.()
  map = null
}

async function initMap() {
  const token = ++initToken
  const load = (window as any).__loadAMap
  if (load) await load()
  if (destroyed || token !== initToken) return

  const AMap = (window as any).AMap
  const container = document.getElementById('map')
  if (!AMap || !container) return

  cleanupMap()

  const currentMap = new AMap.Map(container, {
    zoom: BASE_ZOOM,
    center: [112.5292, 32.9987],
    resizeEnable: true,
  })
  if (destroyed || token !== initToken) {
    currentMap.destroy?.()
    return
  }

  map = currentMap
  infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -18) })
  zoomListener = () => refreshMarkerContent()
  map.on('zoomend', zoomListener)

  const [stores, saleQty, accounts] = await Promise.all([
    getStores(),
    Promise.resolve(getStoreSaleQty(30)),
    getSalespersonAccounts(),
  ])
  storesState.value = stores
  saleQtyState.value = saleQty
  salespersonAccounts.value = accounts

  if (destroyed || token !== initToken || map !== currentMap) {
    if (map === currentMap) map = null
    currentMap.destroy?.()
    return
  }

  // 获取本月净销售袋数（销售-退货）
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const today = now.toISOString().slice(0, 10)
  let netQtyMap: Record<string, number> = {}
  try {
    const res = await request.get('/sale/storeNetQty', { params: { startDate: monthStart, endDate: today } })
    netQtyMap = res.data || {}
  } catch { /* 接口失败降级为空 */ }

  // 按净销售袋数排名
  const storeNetList = positionedStores.value
    .map(s => ({ id: s.id, net: netQtyMap[s.id] || 0 }))
    .sort((a, b) => b.net - a.net)
  const rankMap: Record<string, number> = {}
  storeNetList.forEach((item, idx) => { rankMap[item.id] = idx + 1 })

  markers = []
  for (const store of positionedStores.value) {
    const qty = saleQtyState.value[store.id] || 0
    const rank = rankMap[store.id] || 9999
    const color = gradeColorByRank(rank)
    const marker = new AMap.Marker({
      position: [store.lng!, store.lat!],
      content: buildMarkerContent(store.name, color, BASE_SIZE, 1),
      offset: new AMap.Pixel(-BASE_SIZE, -BASE_SIZE),
    })
    marker.on('click', () => {
      if (!map || !infoWindow) return
      const netQty = netQtyMap[store.id] || 0
      infoWindow.setContent(buildInfoWindowContent(store, netQty, color))
      infoWindow.open(map, marker.getPosition())
    })
    map.add(marker)
    markers.push({ marker, color, store })
  }

  if (markers.length) {
    map.setFitView(markers.map(item => item.marker), false, [60, 60, 60, 60])
  }
  refreshMarkerContent()

  legendEl = document.createElement('div')
  legendEl.style.cssText = 'background:#fff;padding:8px 12px;border-radius:8px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.15)'
  legendEl.innerHTML = '<b>本月净销售排名</b><br>' +
    '<span style="color:#ef4444">●</span> 前50名<br>' +
    '<span style="color:#eab308">●</span> 50-200名<br>' +
    '<span style="color:#1890ff">●</span> 200-300名<br>' +
    '<span style="color:#22c55e">●</span> 300名以后'
  map.getContainer().appendChild(legendEl)
}

onMounted(() => {
  destroyed = false
  initMap()
})

onBeforeUnmount(() => {
  destroyed = true
  initToken += 1
  cleanupMap()
})
</script>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.summary-card {
  min-height: 72px;
}
.filter-card-btn {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.filter-card-btn:hover {
  border-color: #409eff;
}
.filter-card-btn.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64,158,255,0.3);
}
.filter-card-btn.active .summary-label {
  color: #409eff;
}
.filter-card-btn.active .summary-value {
  color: #409eff;
}
.summary-label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}
.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}
.dashboard-map {
  width: 100%;
  height: calc(100vh - 56px - 41px - 132px);
  min-height: 420px;
}
@media (max-width: 768px) {
  .dashboard-map {
    height: calc(100vh - 56px - 41px - 220px);
  }
}
</style>

<style>
.amap-marker .marker-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.amap-marker .marker-dot {
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.amap-marker .marker-name {
  margin-top: 2px;
  padding: 1px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #111827;
  font-size: 9px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
</style>
