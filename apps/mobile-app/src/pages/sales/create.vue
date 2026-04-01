<template>
  <view class="create-page">
    <view class="header">
      <text class="title">创建销单</text>
    </view>

    <view class="content">
      <view class="section">
        <text class="label">选择超市</text>
        <view v-if="showStoreFallbackHint" class="hint">当前账户未绑定超市，已显示全部启用超市</view>
        <picker
          mode="selector"
          :range="storeOptions"
          range-key="name"
          @change="onStoreChange"
        >
          <view class="picker">
            <text>{{ selectedStore?.name || '请选择超市' }}</text>
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
        <view v-if="!quickPickEnabled" class="empty">
          {{ keyword ? '当前筛选下暂无商品' : '暂无可选商品' }}
        </view>
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

      <button class="btn-submit" @tap="submitSale" :disabled="!canSubmit">
        生成销单
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { getStores, getProducts, getWarehouses, saveSale, postSale, getVisibleStoresForSession, hasAssignedStoresForEmployee, isSameEmployeeId } from '@/api'
import type { Store, Product, SaleDoc, SaleLine, Warehouse } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary } from '@/utils'

const userStore = useUserStore()

const stores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const selectedStore = ref<Store | null>(null)
const selectedWarehouse = ref<Warehouse | null>(null)
const qtyMap = ref<Record<string, number>>({})
const keyword = ref('')

const storeOptions = computed(() => stores.value)
const vehicleWarehouses = computed(() => warehouses.value.filter(w => w.type === 'vehicle'))
const showStoreFallbackHint = computed(() => {
  if (userStore.isAdmin) return false
  const employeeId = currentEmployeeId()
  return stores.value.length > 0 && !hasAssignedStoresForEmployee(stores.value, employeeId)
})

const totalQty = computed(() => {
  return Object.values(qtyMap.value).reduce((sum, n) => sum + n, 0)
})

const totalAmount = computed(() => {
  let total = 0
  for (const p of products.value) {
    const qty = qtyMap.value[p.id] || 0
    total += qty * (p.salePrice || 0)
  }
  return total
})

const mainWarehouse = computed(() => warehouses.value.find(w => w.type === 'main') || null)
function ensureMainWarehouse() {
  if (!mainWarehouse.value) {
    uni.showToast({ title: '主仓库未配置', icon: 'none' })
    return false
  }
  return true
}

function ensureWarehouseReady() {
  if (userStore.isAdmin) return ensureMainWarehouse()
  if (!selectedWarehouse.value) {
    uni.showToast({ title: '请选择车库', icon: 'none' })
    return false
  }
  return true
}

function currentWarehouseId() {
  return userStore.isAdmin ? (mainWarehouse.value?.id || '') : (selectedWarehouse.value?.id || '')
}

function currentEmployeeId() {
  return userStore.currentUser?.employeeId || ''
}

function currentStoreId() {
  return selectedStore.value?.id || ''
}

function shouldSubmit() {
  return currentStoreId() && totalQty.value > 0 && ensureWarehouseReady()
}

const canSubmit = computed(() => shouldSubmit())

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

function incQty(id: string) {
  qtyMap.value[id] = (qtyMap.value[id] || 0) + 1
}

function decQty(id: string) {
  const cur = qtyMap.value[id] || 0
  qtyMap.value[id] = cur > 0 ? cur - 1 : 0
}

function onStoreChange(e: any) {
  const idx = Number(e.detail.value)
  selectedStore.value = stores.value[idx] || null
}

async function loadData() {
  const [storeList, productList, whs] = await Promise.all([
    getStores(),
    getProducts(),
    getWarehouses(),
  ])

  const employeeId = currentEmployeeId()
  stores.value = getVisibleStoresForSession(storeList, userStore.isAdmin, employeeId)
  products.value = productList
  warehouses.value = whs

  if (!userStore.isAdmin && !selectedWarehouse.value) {
    if (employeeId) {
      selectedWarehouse.value = vehicleWarehouses.value.find(w => isSameEmployeeId(w.employeeId, employeeId)) || null
    }
    if (!selectedWarehouse.value) {
      selectedWarehouse.value = vehicleWarehouses.value[0] || null
    }
  }
}

async function submitSale() {
  if (!shouldSubmit()) {
    uni.showToast({ title: '请选择超市并添加商品', icon: 'none' })
    return
  }

  const lines: SaleLine[] = products.value
    .filter(p => (qtyMap.value[p.id] || 0) > 0)
    .map(p => ({
      id: genId(),
      productId: p.id,
      qty: qtyMap.value[p.id],
      price: p.salePrice || 0,
    }))

  const draft = {
    employeeId: currentEmployeeId(),
    storeId: currentStoreId(),
    warehouseId: currentWarehouseId(),
    date: new Date().toISOString().slice(0, 10),
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
  .scan-btn {
    padding: 0 20rpx;
    height: 72rpx;
    background: #1890ff;
    color: #fff;
    border-radius: 12rpx;
    font-size: 26rpx;
    line-height: 72rpx;
  }
  .scan-btn::after { border: none; }
  .scan-hint { color: #94a3b8; font-size: 22rpx; }
  .hint { color: #f59e0b; font-size: 22rpx; margin-bottom: 12rpx; }
}

.product-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f0f0f0;

  .info {
    display: flex;
    flex-direction: column;

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
    }
  }

  .qty {
    display: flex;
    align-items: center;

    .btn {
      width: 56rpx;
      height: 56rpx;
      border-radius: 8rpx;
      background: #1890ff;
      color: #fff;
      font-size: 28rpx;
      line-height: 56rpx;
      text-align: center;
      padding: 0;
    }

    .num {
      width: 60rpx;
      text-align: center;
      font-size: 28rpx;
    }
  }
}

.product-item:last-child {
  border-bottom: none;
}

.empty {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 20rpx 10rpx;
  color: #333;
  font-size: 28rpx;
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
