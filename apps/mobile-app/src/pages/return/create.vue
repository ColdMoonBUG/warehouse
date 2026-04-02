<template>
  <view class="create-page">
    <view class="header">
      <text class="title">创建退货单</text>
    </view>

    <view class="content">
      <view class="section">
        <text class="label">退货类型</text>
        <picker mode="selector" :range="typeOptions" range-key="label" @change="onTypeChange">
          <view class="picker"><text>{{ typeLabel }}</text></view>
        </picker>
      </view>

      <view class="section">
        <text class="label">选择超市</text>
        <view v-if="showStoreFallbackHint" class="hint">当前账户未绑定超市，已显示全部启用超市</view>
        <picker mode="selector" :range="storeOptions" range-key="name" @change="onStoreChange">
          <view class="picker"><text>{{ selectedStore?.name || '请选择超市' }}</text></view>
        </picker>
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
        <text class="label">选择商品</text>
        <view class="scan-row">
          <input v-model="keyword" placeholder="输入条码或名称筛选" />
        </view>
        <picker mode="selector" :range="quickPickOptions" range-key="name" :value="quickPickIndex" :disabled="!quickPickEnabled" @change="onQuickPickChange">
          <view class="picker quick-picker" :class="{ disabled: !quickPickEnabled }"><text>{{ quickPickText }}</text></view>
        </picker>
        <view class="scan-hint" v-if="keyword">已按关键词筛选</view>
        <view v-if="!quickPickEnabled" class="empty">{{ keyword ? '当前筛选下暂无商品' : '暂无可选商品' }}</view>
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
            </view>
            <button class="btn-remove" @tap="toggleSelect(p)">移除</button>
          </view>
          <view class="qty-grid">
            <view class="qty-field">
              <text class="qty-label">箱数</text>
              <input class="qty-input" v-model.number="qtyMap[p.id].boxQty" type="number" placeholder="0" @blur="syncQty(p.id)" />
            </view>
            <view class="qty-field">
              <text class="qty-label">袋数</text>
              <input class="qty-input" v-model.number="qtyMap[p.id].bagQty" type="number" placeholder="0" @blur="syncQty(p.id)" />
            </view>
          </view>
          <text class="qty-total">共 {{ qtyMap[p.id].qty }} 袋</text>
        </view>
      </view>

      <view class="summary">
        <text>合计数量: {{ totalQty }}袋</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <button class="btn-submit" @tap="submit" :disabled="!canSubmit">生成退货单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { getStores, getProducts, getWarehouses, saveReturn, postReturn, getVisibleStoresForSalesperson, hasAssignedStoresForSalesperson, isSameSalespersonId, getSessionSalespersonId, getWarehouseSalespersonId } from '@/api'
import type { Store, Product, Warehouse, ReturnDoc, ReturnLine } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary, calcQty, deriveBagQty, normalizeCount, normalizeBoxPackQty } from '@/utils'

interface QtyInput {
  boxQty: number
  bagQty: number
  qty: number
}

const userStore = useUserStore()
const stores = ref<Store[]>([])
const allStores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const selectedStore = ref<Store | null>(null)
const qtyMap = ref<Record<string, QtyInput>>({})
const returnType = ref<'vehicle_return'|'warehouse_return'>('vehicle_return')
const fromWarehouse = ref<Warehouse | null>(null)
const toWarehouse = ref<Warehouse | null>(null)
const keyword = ref('')

function onTypeChange(e: any) {
  returnType.value = typeOptions[Number(e.detail.value)]?.value as any
  if (returnType.value !== 'warehouse_return') {
    toWarehouse.value = null
  } else if (!toWarehouse.value) {
    toWarehouse.value = returnWarehouses.value[0] || null
  }
}

const typeOptions = [
  { label: '车库退货', value: 'vehicle_return' },
  { label: '退货回仓', value: 'warehouse_return' }
]
const typeLabel = computed(() => typeOptions.find(t => t.value === returnType.value)?.label || '车库退货')

const storeOptions = computed(() => stores.value)
const sessionSalespersonId = computed(() => getSessionSalespersonId(userStore.currentUser))
const vehicleWarehouses = computed(() => {
  const list = warehouses.value.filter(w => w.type === 'vehicle')
  if (userStore.isAdmin) return list
  if (!sessionSalespersonId.value) return list
  return list.filter(w => isSameSalespersonId(w.salespersonId, sessionSalespersonId.value))
})
const returnWarehouses = computed(() => warehouses.value.filter(w => w.type === 'return'))
const effectiveSalespersonId = computed(() => {
  return getWarehouseSalespersonId(fromWarehouse.value) || sessionSalespersonId.value
})

const showStoreFallbackHint = computed(() => {
  if (userStore.isAdmin) return false
  const salespersonId = effectiveSalespersonId.value
  return stores.value.length > 0 && !hasAssignedStoresForSalesperson(allStores.value, salespersonId)
})

const filteredProducts = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return products.value
  return products.value.filter(p => {
    const name = (p.name || '').toLowerCase()
    const code = (p.barcode || '').toLowerCase()
    return name.includes(key) || code.includes(key)
  })
})

const quickPickOptions = computed(() => filteredProducts.value.map(product => ({
  id: product.id,
  name: formatProductQuickPickLabel(product),
})))

const quickPickEnabled = computed(() => quickPickOptions.value.length > 0)
const quickPickIndex = computed(() => -1)
const quickPickText = computed(() => {
  if (!quickPickEnabled.value) return keyword.value ? '当前筛选下无可选商品' : '暂无可选商品'
  return keyword.value ? '快捷选择筛选结果商品' : '快捷选择商品'
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
  if (!selectedStore.value || totalQty.value <= 0 || !fromWarehouse.value) return false
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

function productPackageSummary(product: Product) {
  const current = qtyMap.value[product.id]
  return formatProductPackageSummary(product, current?.qty || 0, current?.boxQty || 0)
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

function onStoreChange(e: any) { selectedStore.value = stores.value[Number(e.detail.value)] || null }
function onFromWarehouseChange(e: any) {
  fromWarehouse.value = vehicleWarehouses.value[Number(e.detail.value)] || null
  syncStoresBySalesperson()
}
function onToWarehouseChange(e: any) { toWarehouse.value = returnWarehouses.value[Number(e.detail.value)] || null }

function syncStoresBySalesperson() {
  const visibleStores = userStore.isAdmin
    ? allStores.value
    : getVisibleStoresForSalesperson(allStores.value, currentSalespersonId())
  stores.value = visibleStores
  if (!selectedStore.value) return
  if (visibleStores.some(store => store.id === selectedStore.value?.id)) return
  selectedStore.value = visibleStores[0] || null
}

async function loadData() {
  const [storeList, productList, whs] = await Promise.all([getStores(), getProducts(), getWarehouses()])
  const salespersonId = getSessionSalespersonId(userStore.currentUser)
  allStores.value = storeList
  products.value = productList
  warehouses.value = whs

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
}

async function submit() {
  Object.keys(qtyMap.value).forEach(syncQty)

  if (!canSubmit.value || !selectedStore.value) {
    uni.showToast({ title: '请完善信息', icon: 'none' })
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
    storeId: selectedStore.value.id,
    date: new Date().toISOString().slice(0, 10),
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
.scan-row { display:flex; gap:12rpx; margin-bottom:12rpx; }
.scan-row input { flex:1; border:2rpx solid #eee; border-radius:12rpx; padding:12rpx 16rpx; font-size:28rpx; }
.quick-picker { margin-bottom: 12rpx; }
.quick-picker.disabled { color:#c0c4cc; background:#f5f7fa; }
.scan-hint { color:#94a3b8; font-size:22rpx; }
.hint { color:#f59e0b; font-size:22rpx; margin-bottom:12rpx; }
.product-item { padding: 18rpx 0; border-bottom: 2rpx solid #f0f0f0; }
.product-item:last-child { border-bottom:none; }
.item-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16rpx; }
.info { display:flex; flex-direction:column; flex:1; }
.name { font-size: 30rpx; color:#333; }
.price { font-size: 24rpx; color:#999; }
.barcode { font-size: 22rpx; color:#94a3b8; }
.package { font-size: 22rpx; color:#64748b; margin-top:4rpx; }
.btn-remove { min-width:108rpx; height:56rpx; padding:0 20rpx; background:#fff1f0; color:#ff4d4f; border-radius:999rpx; font-size:24rpx; line-height:56rpx; border:none; }
.btn-remove::after { border:none; }
.qty-grid { display:flex; gap:16rpx; margin-top:16rpx; }
.qty-field { flex:1; }
.qty-label { display:block; font-size:24rpx; color:#666; margin-bottom:10rpx; }
.qty-input { width:100%; min-height:80rpx; box-sizing:border-box; border:2rpx solid #dbe3ee; border-radius:12rpx; padding:0 20rpx; font-size:28rpx; background:#fff; }
.qty-total { display:block; margin-top:12rpx; font-size:24rpx; color:#475569; }
.summary { display:flex; justify-content:space-between; padding: 10rpx; color:#333; }
.btn-submit { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.btn-submit::after { border:none; }
.empty { text-align:center; padding: 20rpx 0; color:#999; }
</style>
