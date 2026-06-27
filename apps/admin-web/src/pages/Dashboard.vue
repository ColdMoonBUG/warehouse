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

    <!-- 合并模式提示条 -->
    <div v-if="mergeMode" class="merge-bar">
      <span>合并模式：已选择 <b>{{ mergeSource?.name }}</b>，请点击目标门店完成合并</span>
      <el-button size="small" @click="exitMergeMode">取消</el-button>
    </div>

    <div class="dashboard-map">
      <div id="map" style="width:100%;height:100%" />
    </div>

    <!-- 快捷编辑弹窗 -->
    <el-dialog v-model="editDlg" title="快捷编辑门店" width="420px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="editForm.address" />
        </el-form-item>
        <el-form-item label="业务归属">
          <el-select v-model="editForm.salespersonId" clearable placeholder="请选择" style="width:100%">
            <el-option v-for="a in salespersonAccounts" :key="a.id" :label="a.displayName" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="规模">
          <el-select v-model="editForm.scale" style="width:100%">
            <el-option :value="1" label="小店" />
            <el-option :value="2" label="中店" />
            <el-option :value="3" label="大店" />
            <el-option :value="4" label="超大店" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 合并确认弹窗 -->
    <el-dialog v-model="mergeDlg" title="确认合并门店" width="460px">
      <p style="color:#606266;line-height:1.8">
        将 <b>{{ mergeSource?.name }}</b> 合并到 <b>{{ mergeTarget?.name }}</b>，
        合并后「{{ mergeSource?.name }}」将被删除，其历史销单归属到目标门店。
      </p>
      <template #footer>
        <el-button @click="mergeDlg = false; exitMergeMode()">取消</el-button>
        <el-button type="warning" :loading="merging" @click="doMerge">确认合并</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalespersonAccounts } from '@/api/auth'
import { getStoreSaleQty } from '@/api/sale'
import { getStores, saveStore, mergeStore } from '@/api/store'
import request from '@/utils/request'
import type { Account, Store } from '@/types'

const storesState = ref<Store[]>([])
const saleQtyState = ref<Record<string, number>>({})
const salespersonAccounts = ref<Account[]>([])
const filterLabel = ref<string>('')

const activeStores = computed(() => storesState.value.filter((s) => s.status === 'active'))
const positionedStores = computed(() => activeStores.value.filter((s) => s.lat !== undefined && s.lat !== null && s.lng !== undefined && s.lng !== null))
const activeStoreCount = computed(() => activeStores.value.length)
const positionedStoreCount = computed(() => positionedStores.value.length)
const totalSaleQty = computed(() => Object.values(saleQtyState.value).reduce((sum, qty) => sum + Number(qty || 0), 0))
const maxSaleQty = computed(() => Math.max(...positionedStores.value.map((s) => saleQtyState.value[s.id] || 0), 1))

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

// --- 快捷编辑 ---
const editDlg = ref(false)
const editSaving = ref(false)
const editForm = ref<Partial<Store>>({})

function openEdit(store: Store) {
  editForm.value = { ...store }
  editDlg.value = true
  if (infoWindow) infoWindow.close()
}

async function saveEdit() {
  if (!editForm.value.name) {
    ElMessage.warning('名称不能为空')
    return
  }
  editSaving.value = true
  try {
    await saveStore(editForm.value as any)
    ElMessage.success('保存成功')
    editDlg.value = false
    reloadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    editSaving.value = false
  }
}

// --- 合并模式 ---
const mergeMode = ref(false)
const mergeSource = ref<Store | null>(null)
const mergeTarget = ref<Store | null>(null)
const mergeDlg = ref(false)
const merging = ref(false)

function enterMergeMode(store: Store) {
  mergeSource.value = store
  mergeMode.value = true
  if (infoWindow) infoWindow.close()
  refreshMarkerContent()
}

function exitMergeMode() {
  mergeMode.value = false
  mergeSource.value = null
  mergeTarget.value = null
  refreshMarkerContent()
}

function onMarkerClickInMergeMode(store: Store) {
  if (store.id === mergeSource.value?.id) return
  mergeTarget.value = store
  mergeDlg.value = true
}

async function doMerge() {
  if (!mergeSource.value || !mergeTarget.value) return
  merging.value = true
  try {
    await mergeStore(mergeSource.value.id, mergeTarget.value.id)
    ElMessage.success('合并成功')
    mergeDlg.value = false
    exitMergeMode()
    reloadData()
  } catch (e: any) {
    ElMessage.error(e?.message || '合并失败')
  } finally {
    merging.value = false
  }
}

// --- InfoWindow with action buttons ---
function buildMarkerContent(name: string, color: string, size: number, opacity = 1, highlight = false) {
  const border = highlight ? 'border:3px solid #ff6600;' : ''
  return `
    <div class="marker-wrap" style="transform:translateY(-6px);opacity:${opacity}">
      <div class="marker-dot" style="background:${color};width:${size}px;height:${size}px;line-height:${size}px;${border}">${highlight ? '源' : '店'}</div>
      <div class="marker-name">${name}</div>
    </div>
  `
}

function buildInfoWindowContent(store: Store, qty: number, color: string) {
  return `
    <div style="line-height:1.8;min-width:230px;font-size:13px">
      <div style="font-weight:700;font-size:15px;color:#1e293b;margin-bottom:4px">${store.name}</div>
      <div style="color:#64748b">编码：${store.code || '-'}</div>
      <div style="color:#64748b">地址：${store.address || '-'}</div>
      <div style="color:#334155">业务员：<b>${salespersonName(store.salespersonId)}</b></div>
      <div style="color:#64748b">规模：${scaleText(store.scale)}</div>
      <div style="color:#64748b">状态：${statusText(store.status)}</div>
      <div style="margin-top:4px;color:#334155">总净销售：<span style="color:${color};font-weight:700;font-size:14px">${qty}</span> 袋</div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button onclick="window.__dashEdit('${store.id}')" style="padding:5px 14px;border:1px solid #2563eb;color:#2563eb;background:#eff6ff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500">编辑</button>
        <button onclick="window.__dashMerge('${store.id}')" style="padding:5px 14px;border:1px solid #d97706;color:#d97706;background:#fffbeb;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500">合并</button>
      </div>
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
let netQtyMap: Record<string, number> = {}

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
    const isMergeSource = mergeMode.value && store.id === mergeSource.value?.id
    marker.setContent(buildMarkerContent(
      store.name,
      isMergeSource ? '#ff6600' : color,
      size,
      isHighlight ? 1 : 0.2,
      isMergeSource
    ))
  }
}

function gradeColorByRank(rank: number): string {
  if (rank <= 50) return '#dc2626'
  if (rank <= 200) return '#d97706'
  if (rank <= 300) return '#2563eb'
  return '#059669'
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

function findStoreById(id: string): Store | undefined {
  return storesState.value.find(s => s.id === id)
}

async function reloadData() {
  const [stores, saleQty, accounts] = await Promise.all([
    getStores(),
    Promise.resolve(getStoreSaleQty(30)),
    getSalespersonAccounts(),
  ])
  storesState.value = stores
  saleQtyState.value = saleQty
  salespersonAccounts.value = accounts
  rebuildMarkers()
}

async function rebuildMarkers() {
  if (!map) return
  const AMap = (window as any).AMap
  if (!AMap) return

  for (const { marker } of markers) {
    map.remove(marker)
  }
  markers = []

  try {
    const res = await request.get('/sale/storeNetQty')
    netQtyMap = res.data || {}
  } catch { /* ignore */ }

  const storeNetList = positionedStores.value
    .map(s => ({ id: s.id, net: netQtyMap[s.id] || 0 }))
    .sort((a, b) => b.net - a.net)
  const rankMap: Record<string, number> = {}
  storeNetList.forEach((item, idx) => { rankMap[item.id] = idx + 1 })

  for (const store of positionedStores.value) {
    const rank = rankMap[store.id] || 9999
    const color = gradeColorByRank(rank)
    const marker = new AMap.Marker({
      position: [store.lng!, store.lat!],
      content: buildMarkerContent(store.name, color, BASE_SIZE, 1),
      offset: new AMap.Pixel(-BASE_SIZE, -BASE_SIZE),
    })
    marker.on('click', () => handleMarkerClick(store, color))
    map.add(marker)
    markers.push({ marker, color, store })
  }
  refreshMarkerContent()
}

function handleMarkerClick(store: Store, color: string) {
  if (!map || !infoWindow) return
  if (mergeMode.value) {
    onMarkerClickInMergeMode(store)
    return
  }
  const netQty = netQtyMap[store.id] || 0
  infoWindow.setContent(buildInfoWindowContent(store, netQty, color))
  infoWindow.open(map, [store.lng!, store.lat!])
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

  try {
    const res = await request.get('/sale/storeNetQty')
    netQtyMap = res.data || {}
  } catch { /* ignore */ }

  const storeNetList = positionedStores.value
    .map(s => ({ id: s.id, net: netQtyMap[s.id] || 0 }))
    .sort((a, b) => b.net - a.net)
  const rankMap: Record<string, number> = {}
  storeNetList.forEach((item, idx) => { rankMap[item.id] = idx + 1 })

  markers = []
  for (const store of positionedStores.value) {
    const rank = rankMap[store.id] || 9999
    const color = gradeColorByRank(rank)
    const marker = new AMap.Marker({
      position: [store.lng!, store.lat!],
      content: buildMarkerContent(store.name, color, BASE_SIZE, 1),
      offset: new AMap.Pixel(-BASE_SIZE, -BASE_SIZE),
    })
    marker.on('click', () => handleMarkerClick(store, color))
    map.add(marker)
    markers.push({ marker, color, store })
  }

  if (markers.length) {
    map.setFitView(markers.map(item => item.marker), false, [60, 60, 60, 60])
  }
  refreshMarkerContent()

  legendEl = document.createElement('div')
  legendEl.style.cssText = 'background:#fff;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.8;box-shadow:0 2px 12px rgba(0,0,0,0.18);border:1px solid #e2e8f0'
  legendEl.innerHTML = '<b>总净销售排名</b><br>' +
    '<span style="color:#dc2626">&#9679;</span> 前50名<br>' +
    '<span style="color:#d97706">&#9679;</span> 50-200名<br>' +
    '<span style="color:#2563eb">&#9679;</span> 200-300名<br>' +
    '<span style="color:#059669">&#9679;</span> 300名以后'
  map.getContainer().appendChild(legendEl)
}

// 全局回调：InfoWindow 按钮调用
function setupGlobalHandlers() {
  ;(window as any).__dashEdit = (storeId: string) => {
    const store = findStoreById(storeId)
    if (store) openEdit(store)
  }
  ;(window as any).__dashMerge = (storeId: string) => {
    const store = findStoreById(storeId)
    if (store) enterMergeMode(store)
  }
}

function teardownGlobalHandlers() {
  delete (window as any).__dashEdit
  delete (window as any).__dashMerge
}

onMounted(() => {
  destroyed = false
  setupGlobalHandlers()
  initMap()
})

onBeforeUnmount(() => {
  destroyed = true
  initToken += 1
  teardownGlobalHandlers()
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
  color: #64748b;
  margin-bottom: 8px;
}
.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
}
.merge-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #fffbeb;
  border: 1px solid #d97706;
  border-radius: 6px;
  color: #92400e;
  font-size: 14px;
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
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.08);
}
.amap-marker .marker-name {
  margin-top: 2px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.98);
  color: #1e293b;
  font-size: 10px;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
  letter-spacing: 0.2px;
}
</style>
