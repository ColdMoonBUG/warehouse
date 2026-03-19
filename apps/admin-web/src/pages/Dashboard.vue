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

async function initMap() {
  const load = (window as any).__loadAMap
  if (load) await load()
  const AMap = (window as any).AMap

  map = new AMap.Map('map', {
    zoom: 13,
    center: [112.5292, 32.9987],
    resizeEnable: true
  })

  infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -18) })

  const [stores, saleQty] = await Promise.all([getStores(), Promise.resolve(getStoreSaleQty(30))])
  const pinned = stores.filter((s: Store) => s.lat && s.lng && s.status === 'active')
  const maxQty = Math.max(...pinned.map((s: Store) => saleQty[s.id] || 0), 1)

  for (const s of pinned) {
    const qty = saleQty[s.id] || 0
    const color = gradeColor(qty, maxQty)
    const icon = storeIcon(AMap, color, 20)
    const marker = new AMap.Marker({
      position: [s.lng!, s.lat!],
      icon,
      offset: new AMap.Pixel(-10, -10)
    })
    const grade = color === '#ef4444' ? '红(高)' : color === '#f97316' ? '橙(中高)' : color === '#eab308' ? '黄(中低)' : '绿(低)'
    const html = `<b>${s.name}</b><br>${s.address || ''}<br>近30天销量：${qty}件 <span style="color:${color}">●</span>${grade}`
    marker.on('click', () => {
      infoWindow.setContent(html)
      infoWindow.open(map, marker.getPosition())
    })
    map.add(marker)
  }

  legendEl = document.createElement('div')
  legendEl.style.cssText = 'background:#fff;padding:8px 12px;border-radius:8px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.15)'
  legendEl.innerHTML = '<b>近30天销量</b><br>' +
    '<span style="color:#22c55e">●</span> 低销量<br>' +
    '<span style="color:#eab308">●</span> 中低销量<br>' +
    '<span style="color:#f97316">●</span> 中高销量<br>' +
    '<span style="color:#ef4444">●</span> 高销量'
  map.getContainer().appendChild(legendEl)
}

onMounted(initMap)
onBeforeUnmount(() => {
  if (legendEl) legendEl.remove()
  map?.destroy()
  map = null
})
</script>

<style scoped>
.dashboard-map {
  width: 100%;
  height: calc(100vh - 56px - 41px - 32px);
  min-height: 400px;
}
</style>
