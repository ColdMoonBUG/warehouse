<template>
  <view class="create-page">
    <view class="header">
      <text class="title">创建销单</text>
    </view>

    <view class="content">
      <view v-if="pageLoading" class="section state-card">
        <text class="state-text">{{ stores.length || products.length || warehouses.length ? '基础资料已显示，正在后台刷新...' : '正在加载基础资料...' }}</text>
      </view>

      <view class="section">
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
        <text class="label">选择车库</text>
        <picker mode="selector" :range="vehicleWarehouses" range-key="name" @change="onWarehouseChange">
          <view class="picker">
            <text>{{ selectedWarehouse?.name || '请选择车库' }}</text>
          </view>
        </picker>
      </view>

      <view class="section">
        <text class="label">选择商品</text>
        <view class="scan-row">
          <input v-model="keyword" placeholder="输入条码或名称筛选" />
        </view>
        <picker
          mode="selector"
          :range="quickPickOptions"
          range-key="name"
          :value="quickPickIndex"
          :disabled="!quickPickEnabled"
          @change="onQuickPickChange"
        >
          <view class="picker quick-picker" :class="{ disabled: !quickPickEnabled }">
            <text>{{ quickPickText }}</text>
          </view>
        </picker>
        <view class="scan-hint" v-if="keyword">已按关键词筛选</view>
        <view v-if="quickPickEnabled && selectedWarehouse" class="stock-hint">{{ quickPickStockHint }}</view>
        <view v-if="!quickPickEnabled" class="empty">
          {{ keyword ? '当前筛选下暂无商品' : '暂无可选商品' }}
        </view>
      </view>

      <view class="section">
        <text class="label">已选商品</text>
        <view v-if="selectedProducts.length === 0" class="empty">请先选择商品</view>
        <view v-for="p in selectedProducts" :key="p.id" class="product-item">
          <view class="item-head">
            <view class="info">
              <text class="name">{{ p.name }}</text>
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
        <text>合计数量: {{ totalQty }}袋</text>
        <view class="summary-amounts">
          <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
          <text class="commission-text">本单预计提成: ¥{{ estimatedCommission.toFixed(2) }}</text>
        </view>
      </view>

      <button class="btn-submit" @tap="submitSale" :disabled="!canSubmit">
        生成销单
      </button>

      <view v-if="storeSelectorVisible" class="store-popup">
        <view class="store-popup-mask" @tap="closeStoreSelector" />
        <view class="store-popup-panel">
          <view class="store-popup-header">
            <text class="store-popup-title">选择超市</text>
            <text class="store-popup-close" @tap="closeStoreSelector">×</text>
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
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getStock, saveSale, postSale, isOwnedStore, isSameSalespersonId, getSessionSalespersonId, getWarehouseSalespersonId } from '@/api'
import type { Store, Product, SaleDoc, SaleLine, Warehouse, StockItem } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary, calcQty, deriveBagQty, normalizeCount, normalizeBoxPackQty, formatStockPreview, getProductStockQty, toStockQtyMap, COMMISSION_RATE, todayLocalDate } from '@/utils'

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
const selectedWarehouse = ref<Warehouse | null>(null)
const storeSelectorVisible = ref(false)
const qtyMap = ref<Record<string, QtyInput>>({})
const keyword = ref('')
const vehicleStockMap = ref<Record<string, number>>({})
const mainStockMap = ref<Record<string, number>>({})
const stockLoading = ref(false)
const pageLoading = ref(false)

const storeOptions = computed(() => stores.value)
const sessionSalespersonId = computed(() => getSessionSalespersonId(userStore.currentUser))
const vehicleWarehouses = computed(() => {
  const list = warehouses.value.filter(w => w.type === 'vehicle')
  if (userStore.isAdmin) return list
  if (!sessionSalespersonId.value) return list
  return list.filter(w => isSameSalespersonId(w.salespersonId, sessionSalespersonId.value))
})
const effectiveSalespersonId = computed(() => {
  return sessionSalespersonId.value || getWarehouseSalespersonId(selectedWarehouse.value)
})
const estimatedCommission = computed(() => Number((totalAmount.value * COMMISSION_RATE).toFixed(2)))
const mainWarehouse = computed(() => warehouses.value.find(w => w.type === 'main') || null)

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
  return [...list].sort((a, b) => {
    const sa = sm[a.id] || 0, sb = sm[b.id] || 0
    if (sa > 0 && sb === 0) return -1
    if (sa === 0 && sb > 0) return 1
    return sb - sa
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

const totalQty = computed(() => {
  return Object.values(qtyMap.value).reduce((sum, item) => sum + normalizeCount(item.qty), 0)
})

const totalAmount = computed(() => {
  let total = 0
  for (const p of selectedProducts.value) {
    total += normalizeCount(qtyMap.value[p.id]?.qty) * (p.salePrice || 0)
  }
  return total
})

const canSubmit = computed(() => {
  return !!currentStoreId() && totalQty.value > 0 && !!currentWarehouseId()
})

function currentSalespersonId() {
  return effectiveSalespersonId.value
}

function currentStoreId() {
  return selectedStore.value?.id || ''
}

function currentWarehouseId() {
  return selectedWarehouse.value?.id || ''
}

function ensureWarehouseReady() {
  if (!selectedWarehouse.value) {
    uni.showToast({ title: '请选择车库', icon: 'none' })
    return false
  }
  return true
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
    { label: '车库', qty: getProductStockQty(vehicleStockMap.value, productId), hidden: !selectedWarehouse.value },
    { label: '总仓', qty: getProductStockQty(mainStockMap.value, productId), hidden: !mainWarehouse.value },
  ])
}

async function refreshStockPreview() {
  if (!selectedWarehouse.value && !mainWarehouse.value) {
    vehicleStockMap.value = {}
    mainStockMap.value = {}
    return
  }
  stockLoading.value = true
  try {
    const requests: Array<Promise<StockItem[]>> = []
    if (selectedWarehouse.value) requests.push(getStock(selectedWarehouse.value.id))
    if (mainWarehouse.value && mainWarehouse.value.id !== selectedWarehouse.value?.id) {
      requests.push(getStock(mainWarehouse.value.id))
    }
    const [vehicleStock = [], mainStock = []] = await Promise.all(requests)
    vehicleStockMap.value = toStockQtyMap(vehicleStock)
    mainStockMap.value = selectedWarehouse.value?.id === mainWarehouse.value?.id
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

function onWarehouseChange(e: any) {
  selectedWarehouse.value = vehicleWarehouses.value[Number(e.detail.value)] || null
  syncStoresBySalesperson()
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
  if (!selectedWarehouse.value) {
    if (salespersonId) {
      selectedWarehouse.value = vehicleWarehouses.value.find(w => isSameSalespersonId(w.salespersonId, salespersonId)) || null
    }
    if (!selectedWarehouse.value) {
      selectedWarehouse.value = vehicleWarehouses.value[0] || null
    }
  }
  syncStoresBySalesperson()

  pageLoading.value = true
  try {
    await referenceStore.preloadCore(true)
    stores.value = [...referenceStore.stores]
    allStores.value = [...referenceStore.stores]
    products.value = [...referenceStore.products]
    warehouses.value = [...referenceStore.warehouses]

    if (!selectedWarehouse.value) {
      if (salespersonId) {
        selectedWarehouse.value = vehicleWarehouses.value.find(w => isSameSalespersonId(w.salespersonId, salespersonId)) || null
      }
      if (!selectedWarehouse.value) {
        selectedWarehouse.value = vehicleWarehouses.value[0] || null
      }
    }

    syncStoresBySalesperson()
  } catch (e: any) {
    stores.value = [...referenceStore.stores]
    allStores.value = [...referenceStore.stores]
    products.value = [...referenceStore.products]
    warehouses.value = [...referenceStore.warehouses]
    syncStoresBySalesperson()
    if (stores.value.length || products.value.length || warehouses.value.length) {
      uni.showToast({ title: '基础资料刷新失败，已显示缓存', icon: 'none' })
    } else {
      uni.showToast({ title: e.message || '基础资料加载失败', icon: 'none' })
    }
  } finally {
    pageLoading.value = false
  }

  await refreshStockPreview()
}

async function validateStockBeforeSubmit(lines: SaleLine[]) {
  const warehouseId = currentWarehouseId()
  if (!warehouseId) return true
  const stockList = await getStock(warehouseId)
  const stockMap = new Map(stockList.map(item => [item.productId, item.qty || 0]))
  const requiredMap = new Map<string, number>()
  for (const line of lines) {
    if (!line.productId) continue
    requiredMap.set(line.productId, (requiredMap.get(line.productId) || 0) + (line.qty || 0))
  }
  for (const [productId, requiredQty] of requiredMap.entries()) {
    const currentQty = stockMap.get(productId) || 0
    if (currentQty >= requiredQty) continue
    const productName = productById(productId)?.name || productId
    uni.showToast({ title: `${productName}库存不足`, icon: 'none' })
    return false
  }
  return true
}

async function submitSale() {
  Object.keys(qtyMap.value).forEach(syncQty)

  if (!currentStoreId()) {
    uni.showToast({ title: '请选择超市', icon: 'none' })
    return
  }
  if (totalQty.value <= 0) {
    uni.showToast({ title: '请录入商品数量', icon: 'none' })
    return
  }
  if (!ensureWarehouseReady()) {
    return
  }

  const lines: SaleLine[] = selectedProducts.value
    .map(p => ({
      id: genId(),
      productId: p.id,
      boxQty: normalizeCount(qtyMap.value[p.id]?.boxQty),
      qty: normalizeCount(qtyMap.value[p.id]?.qty),
      price: p.salePrice || 0,
    }))
    .filter(line => line.qty > 0)

  if (!(await validateStockBeforeSubmit(lines))) {
    return
  }

  const draft = {
    salespersonId: currentSalespersonId(),
    storeId: currentStoreId(),
    warehouseId: currentWarehouseId(),
    date: todayLocalDate(),
    status: 'draft',
    lines,
  } as SaleDoc

  try {
    const saved = await saveSale(draft)
    await postSale(saved.id)
    uni.showToast({ title: '销单已生成', icon: 'success' })
    setTimeout(() => {
      uni.navigateTo({ url: `/pages/sales/detail?id=${saved.id}` })
    }, 400)
  } catch (e: any) {
    uni.showToast({ title: e.message || '生成失败', icon: 'none' })
  }
}

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
.create-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #fff;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));

  .title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
  }
}

.content {
  padding: 30rpx;
}

.section {
  background: #fff;
  padding: 24rpx;
  border-radius: 16rpx;
  margin-bottom: 20rpx;

  .label {
    display: block;
    font-size: 28rpx;
    color: #666;
    margin-bottom: 16rpx;
  }

  .picker {
    padding: 20rpx;
    border: 2rpx solid #eee;
    border-radius: 12rpx;
    font-size: 30rpx;
  }

  .store-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    padding: 20rpx;
    border: 2rpx solid #eee;
    border-radius: 12rpx;
    font-size: 30rpx;
  }

  .store-trigger-main {
    display: flex;
    align-items: center;
    gap: 12rpx;
    min-width: 0;
    flex: 1;
  }

  .store-trigger-text {
    color: #333;
    flex: 1;
  }

  .store-trigger-text.placeholder {
    color: #999;
  }

  .store-trigger-arrow {
    color: #999;
    font-size: 32rpx;
  }

  .scan-row {
    display: flex;
    gap: 12rpx;
    margin-bottom: 12rpx;
  }
  .scan-row input {
    flex: 1;
    border: 2rpx solid #eee;
    border-radius: 12rpx;
    padding: 12rpx 16rpx;
    font-size: 28rpx;
  }
  .quick-picker {
    margin-bottom: 12rpx;
  }
  .quick-picker.disabled {
    color: #c0c4cc;
    background: #f5f7fa;
  }
  .scan-hint { color: #94a3b8; font-size: 22rpx; }
  .stock-hint { color: #64748b; font-size: 22rpx; margin-bottom: 12rpx; }
}

.store-tag {
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

.state-card {
  text-align: center;
}

.state-text {
  font-size: 26rpx;
  color: #64748b;
}

.product-item {
  padding: 18rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
}

.product-item:last-child {
  border-bottom: none;
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
}

.info {
  display: flex;
  flex-direction: column;
  flex: 1;

  .name {
    font-size: 30rpx;
    color: #333;
  }

  .price {
    font-size: 24rpx;
    color: #999;
  }

  .barcode {
    font-size: 22rpx;
    color: #94a3b8;
  }

  .package {
    font-size: 22rpx;
    color: #64748b;
    margin-top: 4rpx;
  }

  .stock-preview {
    font-size: 22rpx;
    color: #1890ff;
    margin-top: 4rpx;
  }
}

.btn-remove {
  min-width: 108rpx;
  height: 56rpx;
  padding: 0 20rpx;
  background: #fff1f0;
  color: #ff4d4f;
  border-radius: 999rpx;
  font-size: 24rpx;
  line-height: 56rpx;
  border: none;
}

.btn-remove::after {
  border: none;
}

.qty-grid {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}

.qty-field {
  flex: 1;
}

.qty-label {
  display: block;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 10rpx;
}

.qty-input {
  width: 100%;
  min-height: 80rpx;
  box-sizing: border-box;
  border: 2rpx solid #dbe3ee;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  background: #fff;
}

.qty-total {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #475569;
}

.empty {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
}

.summary {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16rpx;
  padding: 20rpx 10rpx;
  color: #333;
  font-size: 28rpx;
}

.summary-amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.commission-text {
  font-size: 24rpx;
  color: #ff4d4f;
}

.store-popup {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.store-popup-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}

.store-popup-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70vh;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 30rpx calc(32rpx + env(safe-area-inset-bottom));
}

.store-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.store-popup-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #333;
}

.store-popup-close {
  font-size: 44rpx;
  color: #999;
  line-height: 1;
}

.store-popup-list {
  max-height: 54vh;
}

.store-option {
  padding: 22rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
}

.store-option:last-child {
  border-bottom: none;
}

.store-option.active .store-option-name {
  font-weight: 600;
}

.store-option-main {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.store-option-name {
  flex: 1;
  font-size: 30rpx;
  color: #333;
}

.store-option-name.owned {
  color: #ff4d4f;
}

.store-option-address {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #94a3b8;
}

.btn-submit {
  width: 100%;
  height: 88rpx;
  background: #1890ff;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-top: 10rpx;
}

.btn-submit[disabled] {
  background: #b5d4ff;
}
</style>
