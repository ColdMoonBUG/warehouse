<template>
  <view class="create-page">
    <view class="header">
      <text class="title">创建退货单</text>
    </view>

    <view class="content">
      <view v-if="pageLoading" class="section state-card">
        <text class="state-text">{{ stores.length || products.length || warehouses.length ? '基础资料已显示，正在后台刷新...' : '正在加载基础资料...' }}</text>
      </view>

      <view class="section">
        <text class="label">退货类型</text>
        <picker mode="selector" :range="typeOptions" range-key="label" @change="onTypeChange">
          <view class="picker"><text>{{ typeLabel }}</text></view>
        </picker>
      </view>

      <view class="section" v-if="returnType === 'vehicle_return'">
        <text class="label">选择超市</text>
        <view class="store-trigger" @tap="openStoreSelector">
          <view class="store-trigger-main">
            <text class="store-trigger-text" :class="{ placeholder: !selectedStore }">{{ selectedStore?.name || '请选择超市' }}</text>
            <text v-if="selectedStore && isOwnedStoreItem(selectedStore)" class="store-tag">我的店</text>
          </view>
          <text class="store-trigger-arrow">›</text>
        </view>
      </view>

      <view class="section">
        <text class="label">退回车库</text>
        <picker mode="selector" :range="vehicleWarehouses" range-key="name" @change="onFromWarehouseChange">
          <view class="picker"><text>{{ fromWarehouse?.name || '请选择车库' }}</text></view>
        </picker>
      </view>

      <view class="section" v-if="returnType==='warehouse_return'">
        <text class="label">退货仓库</text>
        <picker mode="selector" :range="returnWarehouses" range-key="name" @change="onToWarehouseChange">
          <view class="picker"><text>{{ toWarehouse?.name || '请选择退货仓库' }}</text></view>
        </picker>
      </view>

      <view class="section">
        <view class="section-header">
          <text class="label">选择商品</text>
          <view class="sort-actions">
            <text class="sort-manage" @tap="goProductSort">管理排序</text>
            <picker mode="selector" :range="sortModeOptions" range-key="label" :value="sortModeIndex" @change="onSortModeChange">
              <text class="sort-trigger">{{ currentSortLabel }} ▾</text>
            </picker>
          </view>
        </view>
        <view class="scan-row">
          <input v-model="keyword" placeholder="输入条码或名称筛选" />
        </view>
        <picker mode="selector" :range="quickPickOptions" range-key="name" :value="quickPickIndex" :disabled="!quickPickEnabled" @change="onQuickPickChange">
          <view class="picker quick-picker" :class="{ disabled: !quickPickEnabled }"><text>{{ quickPickText }}</text></view>
        </picker>
        <view class="scan-hint" v-if="keyword">已按关键词筛选</view>
        <view v-if="quickPickEnabled && fromWarehouse" class="stock-hint">{{ quickPickStockHint }}</view>
        <view v-if="!quickPickEnabled" class="empty">{{ keyword ? '当前筛选下暂无商品' : '暂无可选商品' }}</view>
      </view>

      <view class="section">
        <text class="label">已选商品 <text v-if="selectedProducts.length" class="variety-count">({{ selectedProducts.length }}种)</text></text>
        <view v-if="selectedProducts.length === 0" class="empty">请先选择商品</view>
        <view v-for="(p, idx) in selectedProducts" :key="p.id" class="product-item">
          <view class="item-head">
            <view class="info">
              <text class="name"><text class="seq-no">{{ idx + 1 }}.</text> {{ p.name }}</text>
              <text class="price">¥{{ p.salePrice }}</text>
              <text class="barcode" v-if="p.barcode">条码: {{ p.barcode }}</text>
              <text class="package">{{ productPackageSummary(p) }}</text>
              <text v-if="productStockPreview(p.id)" class="stock-preview">{{ productStockPreview(p.id) }}</text>
            </view>
            <button class="btn-remove" @tap="toggleSelect(p)">移除</button>
          </view>
          <view class="qty-grid">
            <view class="qty-field">
              <text class="qty-label">箱数</text>
              <input class="qty-input" v-model.number="qtyMap[p.id].boxQty" type="number" placeholder="0" @focus="onQtyFocus(p.id, 'boxQty')" @blur="syncQty(p.id)" />
            </view>
            <view class="qty-field">
              <text class="qty-label">袋数</text>
              <input class="qty-input" v-model.number="qtyMap[p.id].bagQty" type="number" placeholder="0" @focus="onQtyFocus(p.id, 'bagQty')" @blur="syncQty(p.id)" />
            </view>
          </view>
          <text class="qty-total">共 {{ qtyMap[p.id].qty }} 袋</text>
        </view>
      </view>

      <view class="summary">
        <text>品种: {{ selectedProducts.length }}种 | 合计数量: {{ totalQty }}袋</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <button class="btn-submit" @tap="submit" :disabled="!canSubmit">生成退货单</button>

      <view v-if="storeSelectorVisible" class="store-popup">
        <view class="store-popup-mask" @tap="closeStoreSelector" />
        <view class="store-popup-panel">
          <view class="store-popup-header">
            <text class="store-popup-title">选择超市</text>
            <text class="store-popup-close" @tap="closeStoreSelector">×</text>
          </view>
          <view class="store-search">
            <input v-model="storeKeyword" placeholder="搜索超市名称/地址" class="store-search-input" />
          </view>
          <scroll-view scroll-y class="store-popup-list">
            <view
              v-for="store in storeOptions"
              :key="store.id"
              class="store-option"
              :class="{ active: selectedStore?.id === store.id }"
              @tap="selectStore(store)"
            >
              <view class="store-option-main">
                <text class="store-option-name" :class="{ owned: isOwnedStoreItem(store) }">{{ store.name }}</text>
                <text v-if="isOwnedStoreItem(store)" class="store-tag">我的店</text>
                <text v-if="storeDistance(store)" class="store-distance">{{ storeDistance(store) }}</text>
              </view>
              <text v-if="store.address" class="store-option-address">{{ store.address }}</text>
            </view>
            <view v-if="storeOptions.length === 0" class="empty">暂无可选超市</view>
          </scroll-view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getStock, saveReturn, postReturn, isOwnedStore, isSameSalespersonId, getSessionSalespersonId, getWarehouseSalespersonId, getProductSaleQty } from '@/api'
import type { Store, Product, Warehouse, ReturnDoc, ReturnLine, StockItem } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary, calcQty, deriveBagQty, normalizeCount, normalizeBoxPackQty, formatStockPreview, getProductStockQty, toStockQtyMap, todayLocalDate } from '@/utils'
import { requestCurrentLocation } from '@/utils/location'
import { haversineDistance, formatDistance } from '@/utils/geo'

type SortMode = 'custom' | 'sales_desc' | 'stock_desc' | 'name_asc' | 'price_asc'
const sortModeOptions = [
  { label: '自定义排序', value: 'custom' as SortMode },
  { label: '按销量(好卖优先)', value: 'sales_desc' as SortMode },
  { label: '按库存(多的优先)', value: 'stock_desc' as SortMode },
  { label: '按名称', value: 'name_asc' as SortMode },
  { label: '按价格(低到高)', value: 'price_asc' as SortMode },
]

interface QtyInput {
  boxQty: number
  bagQty: number
  qty: number
}

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const stores = ref<Store[]>([])
const allStores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const selectedStore = ref<Store | null>(null)
const storeSelectorVisible = ref(false)
const qtyMap = ref<Record<string, QtyInput>>({})
const returnType = ref<'vehicle_return'|'warehouse_return'>('vehicle_return')
const fromWarehouse = ref<Warehouse | null>(null)
const toWarehouse = ref<Warehouse | null>(null)
const keyword = ref('')
const vehicleStockMap = ref<Record<string, number>>({})
const mainStockMap = ref<Record<string, number>>({})
const stockLoading = ref(false)
const pageLoading = ref(false)
const userLocation = ref<{ lat: number; lng: number } | null>(null)
const storeKeyword = ref('')
const sortMode = ref<SortMode>('custom')
const customSortOrder = ref<string[]>([])
const productSaleQtyMap = ref<Record<string, number>>({})

function onTypeChange(e: any) {
  returnType.value = typeOptions[Number(e.detail.value)]?.value as any
  if (returnType.value !== 'warehouse_return') {
    toWarehouse.value = null
  } else {
    selectedStore.value = null
    if (!toWarehouse.value) {
      toWarehouse.value = returnWarehouses.value[0] || null
    }
  }
  refreshStockPreview()
}

const typeOptions = [
  { label: '车库退货', value: 'vehicle_return' },
  { label: '退货回仓', value: 'warehouse_return' }
]
const typeLabel = computed(() => typeOptions.find(t => t.value === returnType.value)?.label || '车库退货')

const storeOptions = computed(() => {
  let list = stores.value
  const kw = storeKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(s => {
      const name = (s.name || '').toLowerCase()
      const addr = (s.address || '').toLowerCase()
      return name.includes(kw) || addr.includes(kw)
    })
  }
  if (userLocation.value) {
    const { lat, lng } = userLocation.value
    return [...list].sort((a, b) => {
      const da = (a.lat && a.lng) ? haversineDistance(lat, lng, a.lat, a.lng) : Infinity
      const db = (b.lat && b.lng) ? haversineDistance(lat, lng, b.lat, b.lng) : Infinity
      return da - db
    })
  }
  return list
})

function storeDistance(store: Store): string | null {
  if (!userLocation.value || !store.lat || !store.lng) return null
  const d = haversineDistance(userLocation.value.lat, userLocation.value.lng, store.lat, store.lng)
  return formatDistance(d)
}

const sortModeIndex = computed(() => sortModeOptions.findIndex(o => o.value === sortMode.value))
const currentSortLabel = computed(() => sortModeOptions.find(o => o.value === sortMode.value)?.label || '排序')

function onSortModeChange(e: any) {
  sortMode.value = sortModeOptions[Number(e.detail.value)]?.value || 'custom'
}

function loadCustomSortOrder() {
  const spId = getSessionSalespersonId(userStore.currentUser) || 'default'
  try {
    const raw = uni.getStorageSync(`wh_product_sort_${spId}`)
    customSortOrder.value = raw ? JSON.parse(raw) : []
  } catch {
    customSortOrder.value = []
  }
}

function goProductSort() {
  uni.navigateTo({ url: '/pages/sales/product-sort' })
}

const sessionSalespersonId = computed(() => getSessionSalespersonId(userStore.currentUser))
const vehicleWarehouses = computed(() => {
  const list = warehouses.value.filter(w => w.type === 'vehicle')
  if (userStore.isAdmin) return list
  if (!sessionSalespersonId.value) return list
  return list.filter(w => isSameSalespersonId(w.salespersonId, sessionSalespersonId.value))
})
const mainWarehouse = computed(() => warehouses.value.find(w => w.type === 'main') || null)
const returnWarehouses = computed(() => warehouses.value.filter(w => w.type === 'main'))
const effectiveSalespersonId = computed(() => {
  return sessionSalespersonId.value || getWarehouseSalespersonId(fromWarehouse.value)
})

const filteredProducts = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  let list = products.value
  if (key) {
    list = list.filter(p => {
      const name = (p.name || '').toLowerCase()
      const code = (p.barcode || '').toLowerCase()
      return name.includes(key) || code.includes(key)
    })
  }
  const sm = vehicleStockMap.value
  const salesMap = productSaleQtyMap.value
  const mode = sortMode.value
  return [...list].sort((a, b) => {
    const sa = sm[a.id] || 0, sb = sm[b.id] || 0
    if (sa > 0 && sb === 0) return -1
    if (sa === 0 && sb > 0) return 1
    switch (mode) {
      case 'custom': {
        const order = customSortOrder.value
        const ia = order.indexOf(a.id)
        const ib = order.indexOf(b.id)
        if (ia >= 0 && ib >= 0) return ia - ib
        if (ia >= 0) return -1
        if (ib >= 0) return 1
        return 0
      }
      case 'sales_desc': {
        const qa = salesMap[a.id] || 0, qb = salesMap[b.id] || 0
        return qb - qa || sb - sa
      }
      case 'stock_desc':
        return sb - sa
      case 'name_asc':
        return (a.name || '').localeCompare(b.name || '', 'zh')
      case 'price_asc':
        return (a.salePrice || 0) - (b.salePrice || 0)
      default:
        return sb - sa
    }
  })
})

const quickPickOptions = computed(() => filteredProducts.value.map(product => ({
  id: product.id,
  name: formatProductQuickPickLabel(product, productStockPreview(product.id)),
})))

const quickPickEnabled = computed(() => quickPickOptions.value.length > 0)
const quickPickIndex = computed(() => -1)
const quickPickText = computed(() => {
  if (!quickPickEnabled.value) return keyword.value ? '当前筛选下无可选商品' : '暂无可选商品'
  return keyword.value ? '快捷选择筛选结果商品' : '快捷选择商品'
})
const quickPickStockHint = computed(() => {
  if (stockLoading.value) return '库存加载中'
  return mainWarehouse.value ? '列表已显示车库和总仓库存' : '列表已显示车库库存'
})

const selectedProducts = computed(() => products.value.filter(p => !!qtyMap.value[p.id]))

const totalQty = computed(() => Object.values(qtyMap.value).reduce((sum, item) => sum + normalizeCount(item.qty), 0))
const totalAmount = computed(() => {
  let total = 0
  for (const p of selectedProducts.value) {
    total += normalizeCount(qtyMap.value[p.id]?.qty) * (p.salePrice || 0)
  }
  return total
})
const canSubmit = computed(() => {
  if (totalQty.value <= 0 || !fromWarehouse.value) return false
  if (returnType.value === 'vehicle_return') return !!selectedStore.value
  if (returnType.value === 'warehouse_return') return !!toWarehouse.value
  return true
})
function currentSalespersonId() {
  return effectiveSalespersonId.value
}

function productById(id: string) {
  return products.value.find(p => p.id === id)
}

function createQtyInput(productId: string, qty = 0, boxQty = 0): QtyInput {
  const packQty = normalizeBoxPackQty(productById(productId)?.boxQty)
  const safeBoxQty = normalizeCount(boxQty)
  const safeQty = normalizeCount(qty)
  return {
    boxQty: safeBoxQty,
    bagQty: deriveBagQty(safeQty, safeBoxQty, packQty),
    qty: safeQty,
  }
}

function syncQty(productId: string) {
  const current = qtyMap.value[productId]
  if (!current) return
  current.boxQty = normalizeCount(current.boxQty)
  current.bagQty = normalizeCount(current.bagQty)
  current.qty = calcQty(current.boxQty, current.bagQty, productById(productId)?.boxQty)
}

function onQtyFocus(productId: string, field: 'boxQty' | 'bagQty') {
  const current = qtyMap.value[productId]
  if (current && !current[field]) {
    current[field] = '' as any
    qtyMap.value = { ...qtyMap.value }
  }
}

function productPackageSummary(product: Product) {
  const current = qtyMap.value[product.id]
  return formatProductPackageSummary(product, current?.qty || 0, current?.boxQty || 0)
}

function productStockPreview(productId: string) {
  return formatStockPreview([
    { label: '车库', qty: getProductStockQty(vehicleStockMap.value, productId), hidden: !fromWarehouse.value },
    { label: '总仓', qty: getProductStockQty(mainStockMap.value, productId), hidden: !mainWarehouse.value },
  ])
}

async function refreshStockPreview() {
  if (!fromWarehouse.value && !mainWarehouse.value) {
    vehicleStockMap.value = {}
    mainStockMap.value = {}
    return
  }
  stockLoading.value = true
  try {
    const requests: Array<Promise<StockItem[]>> = []
    if (fromWarehouse.value) requests.push(getStock(fromWarehouse.value.id))
    if (mainWarehouse.value && mainWarehouse.value.id !== fromWarehouse.value?.id) {
      requests.push(getStock(mainWarehouse.value.id))
    }
    const [vehicleStock = [], mainStock = []] = await Promise.all(requests)
    vehicleStockMap.value = toStockQtyMap(vehicleStock)
    mainStockMap.value = fromWarehouse.value?.id === mainWarehouse.value?.id
      ? { ...vehicleStockMap.value }
      : toStockQtyMap(mainStock)
  } finally {
    stockLoading.value = false
  }
}

function isSelected(id: string) {
  return !!qtyMap.value[id]
}

function toggleSelect(p: Product) {
  if (isSelected(p.id)) {
    delete qtyMap.value[p.id]
    qtyMap.value = { ...qtyMap.value }
    return
  }
  qtyMap.value[p.id] = createQtyInput(p.id)
  qtyMap.value = { ...qtyMap.value }
}

function onQuickPickChange(e: any) {
  const product = filteredProducts.value[Number(e.detail.value)]
  if (!product) return
  toggleSelect(product)
}

function openStoreSelector() {
  storeSelectorVisible.value = true
}

function closeStoreSelector() {
  storeSelectorVisible.value = false
}

function selectStore(store: Store) {
  selectedStore.value = store
  closeStoreSelector()
}

function isOwnedStoreItem(store?: Store | null) {
  return isOwnedStore(store, currentSalespersonId())
}

function onFromWarehouseChange(e: any) {
  fromWarehouse.value = vehicleWarehouses.value[Number(e.detail.value)] || null
  syncStoresBySalesperson()
  refreshStockPreview()
}

function onToWarehouseChange(e: any) {
  toWarehouse.value = returnWarehouses.value[Number(e.detail.value)] || null
  refreshStockPreview()
}

function syncStoresBySalesperson() {
  stores.value = [...allStores.value]
  if (!selectedStore.value) return
  if (stores.value.some(store => store.id === selectedStore.value?.id)) return
  selectedStore.value = stores.value[0] || null
}

async function loadData() {
  referenceStore.hydrate()
  stores.value = [...referenceStore.stores]
  allStores.value = [...referenceStore.stores]
  products.value = [...referenceStore.products]
  warehouses.value = [...referenceStore.warehouses]

  const salespersonId = getSessionSalespersonId(userStore.currentUser)
  if (!fromWarehouse.value) {
    if (salespersonId) {
      fromWarehouse.value = vehicleWarehouses.value.find(w => isSameSalespersonId(w.salespersonId, salespersonId)) || null
    }
    if (!fromWarehouse.value) {
      fromWarehouse.value = vehicleWarehouses.value[0] || null
    }
  }
  syncStoresBySalesperson()
  if (!toWarehouse.value) {
    toWarehouse.value = returnWarehouses.value[0] || null
  }

  pageLoading.value = true
  try {
    await referenceStore.preloadCore(true)
    stores.value = [...referenceStore.stores]
    allStores.value = [...referenceStore.stores]
    products.value = [...referenceStore.products]
    warehouses.value = [...referenceStore.warehouses]

    if (!fromWarehouse.value) {
      if (salespersonId) {
        fromWarehouse.value = vehicleWarehouses.value.find(w => isSameSalespersonId(w.salespersonId, salespersonId)) || null
      }
      if (!fromWarehouse.value) {
        fromWarehouse.value = vehicleWarehouses.value[0] || null
      }
    }

    syncStoresBySalesperson()
    if (!toWarehouse.value) {
      toWarehouse.value = returnWarehouses.value[0] || null
    }
  } catch (e: any) {
    stores.value = [...referenceStore.stores]
    allStores.value = [...referenceStore.stores]
    products.value = [...referenceStore.products]
    warehouses.value = [...referenceStore.warehouses]
    syncStoresBySalesperson()
    if (!toWarehouse.value) {
      toWarehouse.value = returnWarehouses.value[0] || null
    }
    if (stores.value.length || products.value.length || warehouses.value.length) {
      uni.showToast({ title: '基础资料刷新失败，已显示缓存', icon: 'none' })
    } else {
      uni.showToast({ title: e.message || '基础资料加载失败', icon: 'none' })
    }
  } finally {
    pageLoading.value = false
  }

  await refreshStockPreview()

  // 异步获取当前位置（用于超市距离排序）
  requestCurrentLocation().then(loc => { userLocation.value = { lat: loc.latitude, lng: loc.longitude } }).catch(() => {})
  // 异步加载销量数据（用于按销量排序）
  getProductSaleQty().then(map => { productSaleQtyMap.value = map }).catch(() => {})
  // 加载自定义排序
  loadCustomSortOrder()
}

async function submit() {
  Object.keys(qtyMap.value).forEach(syncQty)

  if (!canSubmit.value) {
    uni.showToast({ title: '请完善信息', icon: 'none' })
    return
  }
  if (returnType.value === 'vehicle_return' && !selectedStore.value) {
    uni.showToast({ title: '请选择超市', icon: 'none' })
    return
  }

  const lines: ReturnLine[] = selectedProducts.value
    .map(p => ({
      id: genId(),
      productId: p.id,
      boxQty: normalizeCount(qtyMap.value[p.id]?.boxQty),
      qty: normalizeCount(qtyMap.value[p.id]?.qty),
      price: p.salePrice || 0,
    }))
    .filter(line => line.qty > 0)

  if (!fromWarehouse.value) {
    uni.showToast({ title: '请选择退回车库', icon: 'none' })
    return
  }
  if (returnType.value === 'warehouse_return' && !toWarehouse.value) {
    uni.showToast({ title: '请选择退货仓库', icon: 'none' })
    return
  }

  const draft = {
    salespersonId: currentSalespersonId(),
    storeId: selectedStore.value?.id || '',
    date: todayLocalDate(),
    status: 'draft',
    returnType: returnType.value,
    fromWarehouseId: fromWarehouse.value?.id || '',
    toWarehouseId: returnType.value === 'warehouse_return' ? (toWarehouse.value?.id || '') : undefined,
    lines,
  } as ReturnDoc

  try {
    const saved = await saveReturn(draft, draft.lines)
    await postReturn(saved.id)
    uni.showToast({ title: '退货单已生成', icon: 'success' })
    setTimeout(() => {
      uni.navigateTo({ url: `/pages/return/detail?id=${saved.id}` })
    }, 400)
  } catch (e: any) {
    uni.showToast({ title: e.message || '生成失败', icon: 'none' })
  }
}

onShow(() => {
  // 从排序页面返回时重新加载自定义排序
  loadCustomSortOrder()
})

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadData()
})
</script>

<style lang="scss" scoped>
.create-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.section { background: #fff; padding: 24rpx; border-radius: 16rpx; margin-bottom: 20rpx; }
.label { display:block; font-size: 28rpx; color:#666; margin-bottom:16rpx; }
.picker { padding: 20rpx; border: 2rpx solid #eee; border-radius: 12rpx; font-size: 30rpx; }
.store-trigger { display:flex; align-items:center; justify-content:space-between; gap:16rpx; padding:20rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:30rpx; }
.store-trigger-main { display:flex; align-items:center; gap:12rpx; min-width:0; flex:1; }
.store-trigger-text { color:#333; flex:1; }
.store-trigger-text.placeholder { color:#999; }
.store-trigger-arrow { color:#999; font-size:32rpx; }
.scan-row { display:flex; gap:12rpx; margin-bottom:12rpx; }
.scan-row input { flex:1; border:2rpx solid #eee; border-radius:12rpx; padding:12rpx 16rpx; font-size:28rpx; }
.quick-picker { margin-bottom: 12rpx; }
.quick-picker.disabled { color:#c0c4cc; background:#f5f7fa; }
.scan-hint { color:#94a3b8; font-size:22rpx; }
.stock-hint { color:#64748b; font-size:22rpx; margin-bottom:12rpx; }
.state-card { text-align:center; }
.state-text { font-size:26rpx; color:#64748b; }
.product-item { padding: 18rpx 0; border-bottom: 2rpx solid #f0f0f0; }
.product-item:last-child { border-bottom:none; }
.item-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16rpx; }
.info { display:flex; flex-direction:column; flex:1; }
.name { font-size: 30rpx; color:#333; }
.price { font-size: 24rpx; color:#999; }
.barcode { font-size: 22rpx; color:#94a3b8; }
.package { font-size: 22rpx; color:#64748b; margin-top:4rpx; }
.stock-preview { font-size: 22rpx; color:#1890ff; margin-top:4rpx; }
.btn-remove::after { border:none; }
.qty-grid { display:flex; gap:16rpx; margin-top:16rpx; }
.qty-field { flex:1; }
.qty-label { display:block; font-size:24rpx; color:#666; margin-bottom:10rpx; }
.qty-input { width:100%; min-height:80rpx; box-sizing:border-box; border:2rpx solid #dbe3ee; border-radius:12rpx; padding:0 20rpx; font-size:28rpx; background:#fff; }
.qty-total { display:block; margin-top:12rpx; font-size:24rpx; color:#475569; }
.summary { display:flex; justify-content:space-between; padding: 10rpx; color:#333; }
.store-tag { display:inline-flex; align-items:center; justify-content:center; min-width:88rpx; height:40rpx; padding:0 14rpx; border-radius:999rpx; background:#fff1f0; color:#ff4d4f; font-size:22rpx; }
.store-popup { position:fixed; inset:0; z-index:100; }
.store-popup-mask { position:absolute; inset:0; background:rgba(0, 0, 0, 0.35); }
.store-popup-panel { position:absolute; left:0; right:0; bottom:0; max-height:70vh; background:#fff; border-radius:32rpx 32rpx 0 0; padding:32rpx 30rpx calc(32rpx + env(safe-area-inset-bottom)); }
.store-popup-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20rpx; }
.store-popup-title { font-size:34rpx; font-weight:600; color:#333; }
.store-popup-close { font-size:44rpx; color:#999; line-height:1; }
.store-popup-list { max-height:54vh; }
.store-option { padding:22rpx 0; border-bottom:2rpx solid #f0f0f0; }
.store-option:last-child { border-bottom:none; }
.store-option.active .store-option-name { font-weight:600; }
.store-option-main { display:flex; align-items:center; gap:12rpx; }
.store-option-name { flex:1; font-size:30rpx; color:#333; }
.store-option-name.owned { color:#ff4d4f; }
.store-option-address { display:block; margin-top:8rpx; font-size:22rpx; color:#94a3b8; }
.store-search { margin-bottom:16rpx; }
.store-search-input { width:100%; border:2rpx solid #eee; border-radius:12rpx; padding:16rpx 20rpx; font-size:28rpx; box-sizing:border-box; }
.store-distance { font-size:22rpx; color:#1890ff; margin-left:auto; flex-shrink:0; }
.btn-submit { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.btn-submit::after { border:none; }
.section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16rpx; }
.sort-actions { display:flex; align-items:center; gap:12rpx; }
.sort-manage { font-size:24rpx; color:#fa8c16; padding:6rpx 16rpx; border:2rpx solid #fa8c16; border-radius:999rpx; }
.sort-trigger { font-size:24rpx; color:#1890ff; padding:6rpx 16rpx; border:2rpx solid #1890ff; border-radius:999rpx; }
.empty { text-align:center; padding: 20rpx 0; color:#999; }
</style>
