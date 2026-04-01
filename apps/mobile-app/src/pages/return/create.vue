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
          <view class="info">
            <text class="name">{{ p.name }}</text>
            <text class="price">¥{{ p.salePrice }}</text>
            <text class="barcode" v-if="p.barcode">条码: {{ p.barcode }}</text>
            <text class="package" v-if="productPackageSummary(p)">{{ productPackageSummary(p) }}</text>
          </view>
          <view class="qty">
            <button class="btn" @tap="decQty(p.id)">-</button>
            <text class="num">{{ qtyMap[p.id] || 0 }}</text>
            <button class="btn" @tap="incQty(p.id)">+</button>
          </view>
        </view>
      </view>

      <view class="summary">
        <text>合计数量: {{ totalQty }}</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <button class="btn-submit" @tap="submit" :disabled="!canSubmit">生成退货单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { getStores, getProducts, getWarehouses, saveReturn, postReturn, getVisibleStoresForSession, hasAssignedStoresForEmployee, isSameEmployeeId } from '@/api'
import type { Store, Product, Warehouse, ReturnDoc, ReturnLine } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary } from '@/utils'

const userStore = useUserStore()
const stores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const selectedStore = ref<Store | null>(null)
const qtyMap = ref<Record<string, number>>({})
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
const vehicleWarehouses = computed(() => warehouses.value.filter(w => w.type === 'vehicle'))
const returnWarehouses = computed(() => warehouses.value.filter(w => w.type === 'return'))

const showStoreFallbackHint = computed(() => {
  if (userStore.isAdmin) return false
  const employeeId = userStore.currentUser?.employeeId
  return stores.value.length > 0 && !hasAssignedStoresForEmployee(stores.value, employeeId)
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

const selectedProducts = computed(() => products.value.filter(p => (qtyMap.value[p.id] || 0) > 0))

function productPackageSummary(product: Product) {
  return formatProductPackageSummary(product, qtyMap.value[product.id] || 0)
}

const totalQty = computed(() => Object.values(qtyMap.value).reduce((sum, n) => sum + n, 0))
const totalAmount = computed(() => {
  let total = 0
  for (const p of products.value) {
    const qty = qtyMap.value[p.id] || 0
    total += qty * (p.salePrice || 0)
  }
  return total
})
const canSubmit = computed(() => !!selectedStore.value && totalQty.value > 0 && !!fromWarehouse.value && (returnType.value !== 'warehouse_return' || !!toWarehouse.value))

function incQty(id: string) { qtyMap.value[id] = (qtyMap.value[id] || 0) + 1 }
function decQty(id: string) { const cur = qtyMap.value[id] || 0; qtyMap.value[id] = cur > 0 ? cur - 1 : 0 }

function isSelected(id: string) {
  return (qtyMap.value[id] || 0) > 0
}

function toggleSelect(p: Product) {
  if (isSelected(p.id)) {
    qtyMap.value[p.id] = 0
    return
  }
  qtyMap.value[p.id] = 1
}

function onQuickPickChange(e: any) {
  const product = filteredProducts.value[Number(e.detail.value)]
  if (!product) return
  toggleSelect(product)
}

function onStoreChange(e: any) { selectedStore.value = stores.value[Number(e.detail.value)] || null }
function onFromWarehouseChange(e: any) { fromWarehouse.value = vehicleWarehouses.value[Number(e.detail.value)] || null }
function onToWarehouseChange(e: any) { toWarehouse.value = returnWarehouses.value[Number(e.detail.value)] || null }

async function loadData() {
  const [storeList, productList, whs] = await Promise.all([getStores(), getProducts(), getWarehouses()])
  const currentEmployeeId = userStore.currentUser?.employeeId
  stores.value = getVisibleStoresForSession(storeList, userStore.isAdmin, currentEmployeeId)
  products.value = productList
  warehouses.value = whs

  if (!fromWarehouse.value) {
    if (currentEmployeeId) {
      fromWarehouse.value = vehicleWarehouses.value.find(w => isSameEmployeeId(w.employeeId, currentEmployeeId)) || null
    }
    if (!fromWarehouse.value) {
      fromWarehouse.value = vehicleWarehouses.value[0] || null
    }
  }

  if (!toWarehouse.value) {
    toWarehouse.value = returnWarehouses.value[0] || null
  }
}

async function submit() {
  if (!canSubmit.value || !selectedStore.value) {
    uni.showToast({ title: '请完善信息', icon: 'none' })
    return
  }
  const lines: ReturnLine[] = products.value
    .filter(p => (qtyMap.value[p.id] || 0) > 0)
    .map(p => ({ id: genId(), productId: p.id, qty: qtyMap.value[p.id], price: p.salePrice }))

  // 退货类型切换后，如果未选仓库则提示
  if (!fromWarehouse.value) {
    uni.showToast({ title: '请选择退回车库', icon: 'none' })
    return
  }
  if (returnType.value === 'warehouse_return' && !toWarehouse.value) {
    uni.showToast({ title: '请选择退货仓库', icon: 'none' })
    return
  }

  const draft = {
    employeeId: userStore.currentUser?.employeeId || '',
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
.select-btn { padding:0 20rpx; height:72rpx; background:#1890ff; color:#fff; border-radius:12rpx; font-size:26rpx; line-height:72rpx; }
.select-btn::after { border:none; }
.product-item { display:flex; align-items:center; justify-content:space-between; padding: 16rpx 0; border-bottom: 2rpx solid #f0f0f0; }
.info { display:flex; flex-direction:column; }
.name { font-size: 30rpx; color:#333; }
.price { font-size: 24rpx; color:#999; }
.barcode { font-size: 22rpx; color:#94a3b8; }
.package { font-size: 22rpx; color:#64748b; }
.qty { display:flex; align-items:center; }
.btn { width:56rpx; height:56rpx; border-radius: 8rpx; background:#1890ff; color:#fff; font-size:28rpx; line-height:56rpx; text-align:center; padding:0; }
.num { width:60rpx; text-align:center; font-size:28rpx; }
.summary { display:flex; justify-content:space-between; padding: 10rpx; color:#333; }
.btn-submit { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.btn-submit::after { border:none; }
.empty { text-align:center; padding: 20rpx 0; color:#999; }
</style>
