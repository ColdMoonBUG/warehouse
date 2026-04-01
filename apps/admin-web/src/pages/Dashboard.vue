<template>
  <div class="dashboard-map">
    <div id="map" style="width:100%;height:100%" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { getStores } from '@/api/store'
import { getStoreSaleQty } from '@/api/sale'
import type { Store } from '@/types'

let map: any = null
let legendEl: HTMLDivElement | null = null
let infoWindow: any = null
let markers: Array<{ marker: any; color: string }> = []
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

function refreshMarkerIcons(AMap: any) {
  const zoom = map?.getZoom?.() ?? BASE_ZOOM
  const size = sizeForZoom(zoom)
  for (const { marker, color } of markers) {
    marker.setIcon(storeIcon(AMap, color, size))
    marker.setOffset(new AMap.Pixel(-size / 2, -size / 2))
  }
}

// 按30天销量分4级：绿-黄-橙-红（销量从低到高）
function gradeColor(qty: number, max: number): string {
  if (max === 0) return '#22c55e'
  const pct = qty / max
  if (pct >= 0.75) return '#ef4444' // 红：TOP销量
  if (pct >= 0.5) return '#f97316' // 橙
  if (pct >= 0.25) return '#eab308' // 黄
  return '#22c55e' // 绿：销量最低
}

function storeIcon(AMap: any, color: string, size: number = 18) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="0.9" stroke="#fff" stroke-width="2"/>
    <text x="12" y="16" text-anchor="middle" font-size="11" fill="#fff" font-family="sans-serif" font-weight="bold">店</text>
  </svg>`
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  return new AMap.Icon({
    image: url,
    imageSize: new AMap.Size(size, size)
  })
}

function cleanupMap() {
  if (zoomListener && map?.off) {
    map.off('zoomend', zoomListener)
  }
  zoomListener = null
  if (legendEl) legendEl.remove()
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
    zoom: 13,
    center: [112.5292, 32.9987],
    resizeEnable: true
  })
  if (destroyed || token !== initToken) {
    currentMap.destroy?.()
    return
  }

  map = currentMap
  infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -18) })

  zoomListener = () => refreshMarkerIcons(AMap)
  map.on('zoomend', zoomListener)

  const [stores, saleQty] = await Promise.all([getStores(), Promise.resolve(getStoreSaleQty(30))])
  if (destroyed || token !== initToken || map !== currentMap) {
    if (map === currentMap) map = null
    currentMap.destroy?.()
    return
  }

  const pinned = stores.filter((s: Store) => s.lat && s.lng && s.status === 'active')
  const maxQty = Math.max(...pinned.map((s: Store) => saleQty[s.id] || 0), 1)

  markers = []
  for (const s of pinned) {
    const qty = saleQty[s.id] || 0
    const color = gradeColor(qty, maxQty)
    const icon = storeIcon(AMap, color, BASE_SIZE)
    const marker = new AMap.Marker({
      position: [s.lng!, s.lat!],
      icon,
      offset: new AMap.Pixel(-BASE_SIZE / 2, -BASE_SIZE / 2)
    })
    const grade = color === '#ef4444' ? '红(高)' : color === '#f97316' ? '橙(中高)' : color === '#eab308' ? '黄(中低)' : '绿(低)'
    const html = `<b>${s.name}</b><br>${s.address || ''}<br>近30天销量：${qty}件 <span style="color:${color}">●</span>${grade}`
    marker.on('click', () => {
      if (!map || !infoWindow) return
      infoWindow.setContent(html)
      infoWindow.open(map, marker.getPosition())
    })
    if (destroyed || token !== initToken || map !== currentMap) return
    map.add(marker)
    markers.push({ marker, color })
  }

  refreshMarkerIcons(AMap)
  if (destroyed || token !== initToken || map !== currentMap) return

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
.dashboard-map {
  width: 100%;
  height: calc(100vh - 56px - 41px - 32px);
  min-height: 400px;
}
</style>
