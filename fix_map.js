const fs = require('fs')
const path = 'apps/mobile-app/src/pages/map/index.vue'
let content = fs.readFileSync(path, 'utf8')

// Remove the viewport/region logic block and replace with simple full render
const markerFnStart = content.indexOf('  _cachedStores = builtStores\n  stores.value = builtStores\n  // 立即渲染视口内的，其他后台扩展\n  rebuildVisibleMarkers()\n}')
const onRegionEnd = content.indexOf('\nfunction isOwnedStoreItem')

if (markerFnStart === -1 || onRegionEnd === -1) {
  console.log('Pattern not found, markerFnStart:', markerFnStart, 'onRegionEnd:', onRegionEnd)
  process.exit(1)
}

const replacement = `  _cachedStores = builtStores
  _cachedMarkers = builtMarkers
  stores.value = builtStores
  markers.value = builtMarkers
  updateLocationMarker()
}

function onRegionChange(_e: any) { /* disabled */ }`

content = content.slice(0, markerFnStart) + replacement + content.slice(onRegionEnd)
fs.writeFileSync(path, content, 'utf8')
console.log('Done')
