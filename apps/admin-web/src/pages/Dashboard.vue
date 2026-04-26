<template>
  <div class="dashboard-page">
    <div class="summary-row">
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">活跃门店</div>
        <div class="summary-value">{{ activeStoreCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">已定位门店</div>
        <div class="summary-value">{{ positionedStoreCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">未定位门店</div>
        <div class="summary-value">{{ unpositionedStoreCount }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">近30天销量</div>
        <div class="summary-value">{{ totalSaleQty }}</div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <div class="summary-label">高销量门店</div>
        <div class="summary-value">{{ hotStoreCount }}</div>
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
import type { Account, Store } from '@/types'

const storesState = ref<Store[]>([])
const saleQtyState = ref<Record<string, number>>({})
const salespersonAccounts = ref<Account[]>([])

const activeStores = computed(() => storesState.value.filter((s) => s.status === 'active'))
const positionedStores = computed(() => activeStores.value.filter((s) => s.lat !== undefined && s.lat !== null && s.lng !== undefined && s.lng !== null))
const activeStoreCount = computed(() => activeStores.value.length)
const positionedStoreCount = computed(() => positionedStores.value.length)
const unpositionedStoreCount = computed(() => activeStoreCount.value - positionedStoreCount.value)
const totalSaleQty = computed(() => Object.values(saleQtyState.value).reduce((sum, qty) => sum + Number(qty || 0), 0))
const maxSaleQty = computed(() => Math.max(...positionedStores.value.map((s) => saleQtyState.value[s.id] || 0), 1))
const hotStoreCount = computed(() => positionedStores.value.filter((s) => (saleQtyState.value[s.id] || 0) >= maxSaleQty.value * 0.75).length)

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

function buildMarkerContent(name: string, color: string, size: number) {
  return `
    <div class="marker-wrap" style="transform:translateY(-6px)">
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
      <div>近30天销量：<span style="color:${color};font-weight:600">${qty}</span> 袋</div>
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
  for (const { marker, color, store } of markers) {
    marker.setContent(buildMarkerContent(store.name, color, size))
  }
}

function gradeColor(qty: number, max: number): string {
  if (max === 0) return '#22c55e'
  const pct = qty / max
  if (pct >= 0.75) return '#ef4444'
  if (pct >= 0.5) return '#f97316'
  if (pct >= 0.25) return '#eab308'
  return '#22c55e'
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

  markers = []
  for (const store of positionedStores.value) {
    const qty = saleQtyState.value[store.id] || 0
    const color = gradeColor(qty, maxSaleQty.value)
    const marker = new AMap.Marker({
      position: [store.lng!, store.lat!],
      content: buildMarkerContent(store.name, color, BASE_SIZE),
      offset: new AMap.Pixel(-BASE_SIZE, -BASE_SIZE),
    })
    marker.on('click', () => {
      if (!map || !infoWindow) return
      infoWindow.setContent(buildInfoWindowContent(store, qty, color))
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
  legendEl.innerHTML = '<b>近30天销量</b><br>' +
    '<span style="color:#22c55e">●</span> 低销量<br>' +
    '<span style="color:#eab308">●</span> 中低销量<br>' +
    '<span style="color:#f97316">●</span> 中高销量<br>' +
    '<span style="color:#ef4444">●</span> 高销量'
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
  min-height: 88px;
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
  margin-top: 4px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #111827;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
</style>
