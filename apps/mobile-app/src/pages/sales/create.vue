<template>
  <view class="create-page">
    <view class="header">
      <text class="title">{{ step === 1 ? '创建销单' : '销单预览' }}</text>
    </view>

    <view class="content" v-if="step === 1">
      <view v-if="pageLoading" class="section state-card">
        <text class="state-text">{{ stores.length || products.length || warehouses.length ? '基础资料已显示，正在后台刷新...' : '正在加载基础资料...' }}</text>
      </view>
      <view class="section">
        <text class="label">选择超市</text>
        <text class="section-tip">先选超市，再去选商品；不会操作时直接点这一行。</text>
        <view class="store-trigger" @tap="openStoreSelector">
          <view class="store-trigger-main">
            <text class="store-trigger-text" :class="{ placeholder: !selectedStore }">{{ selectedStore?.name || '请选择超市' }}</text>
            <text v-if="selectedStore && isOwnedStoreItem(selectedStore)" class="store-tag">我的店</text>
          </view>
          <text class="store-trigger-arrow">›</text>
        </view>
        <text v-if="selectedStore" class="store-history-link" @tap="goStoreHistory">查看历史销单 ›</text>
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
        <view class="section-header">
          <text class="label">选择商品</text>
          <text class="section-tip inline-tip">可先搜索，再点“快捷选择商品”。</text>
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
        <view class="summary-amounts">
          <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
          <text class="commission-text">本单预计提成: ¥{{ estimatedCommission.toFixed(2) }}</text>
        </view>
      </view>

      <view class="return-toggle">
        <text class="return-toggle-label">同时创建退单</text>
        <switch :checked="showReturnSection" @change="showReturnSection = $event.detail.value" color="#1890ff" />
      </view>

      <view v-if="showReturnSection" class="section return-section">
        <text class="label">退单商品</text>
        <view class="scan-row">
          <input v-model="returnKeyword" placeholder="输入条码或名称筛选退货商品" />
        </view>
        <picker
          mode="selector"
          :range="returnQuickPickOptions"
          range-key="name"
          :value="-1"
          :disabled="returnQuickPickOptions.length === 0"
          @change="onReturnQuickPickChange"
        >
          <view class="picker quick-picker" :class="{ disabled: returnQuickPickOptions.length === 0 }">
            <text>{{ returnQuickPickOptions.length ? '快捷选择退货商品' : '暂无可选商品' }}</text>
          </view>
        </picker>

        <view v-if="returnSelectedProducts.length === 0" class="empty">请选择退货商品</view>
        <view v-for="(p, idx) in returnSelectedProducts" :key="p.id" class="product-item">
          <view class="item-head">
            <view class="info">
              <text class="name"><text class="seq-no">{{ idx + 1 }}.</text> {{ p.name }}</text>
              <text class="price">¥{{ p.salePrice }}</text>
              <text class="package">{{ returnProductPackageSummary(p) }}</text>
            </view>
            <button class="btn-remove" @tap="toggleReturnSelect(p)">移除</button>
          </view>
          <view class="qty-grid">
            <view class="qty-field">
              <text class="qty-label">箱数</text>
              <input class="qty-input" v-model.number="returnQtyMap[p.id].boxQty" type="number" placeholder="0" @focus="onReturnQtyFocus(p.id, 'boxQty')" @blur="syncReturnQty(p.id)" />
            </view>
            <view class="qty-field">
              <text class="qty-label">袋数</text>
              <input class="qty-input" v-model.number="returnQtyMap[p.id].bagQty" type="number" placeholder="0" @focus="onReturnQtyFocus(p.id, 'bagQty')" @blur="syncReturnQty(p.id)" />
            </view>
          </view>
          <text class="qty-total">共 {{ returnQtyMap[p.id].qty }} 袋</text>
        </view>

        <view v-if="returnSelectedProducts.length" class="summary return-summary">
          <text>退货: {{ returnSelectedProducts.length }}种 | 合计: {{ returnTotalQty }}袋</text>
          <text>退货金额: ¥{{ returnTotalAmount.toFixed(2) }}</text>
        </view>
      </view>

      <view v-if="showReturnSection && returnTotalQty > 0" class="net-summary">
        <text>净额: ¥{{ (totalAmount - returnTotalAmount).toFixed(2) }}</text>
      </view>

      <view class="btn-group">
        <button class="btn-submit btn-primary" @tap="goPreview" :disabled="!canSubmit">
          生成销单
        </button>
      </view>

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

    <view class="content" v-if="step === 2">
      <view class="preview-banner">
        <text class="preview-banner-text">销单预览（尚未提交）</text>
      </view>

      <view class="card">
        <view class="row"><text class="label">超市</text><text class="value">{{ selectedStore?.name || '-' }}</text></view>
        <view class="row"><text class="label">车库</text><text class="value">{{ selectedWarehouse?.name || '-' }}</text></view>
        <view class="row"><text class="label">日期</text><text class="value">{{ previewDate }}</text></view>
        <view class="row"><text class="label">付款方式</text><text class="value">{{ payType === 'cash' ? '现金' : '单子' }}</text></view>
      </view>

      <view class="card">
        <view class="card-title-row">
          <text class="card-title">销售商品 ({{ selectedProducts.length }}种)</text>
        </view>
        <view v-for="(p, idx) in selectedProducts" :key="p.id" class="preview-line">
          <text class="preview-seq">{{ idx + 1 }}.</text>
          <text class="preview-name">{{ p.name }}</text>
          <text class="preview-qty">{{ qtyMap[p.id]?.qty || 0 }}袋</text>
          <text class="preview-price">¥{{ (normalizeCount(qtyMap[p.id]?.qty) * (p.salePrice || 0)).toFixed(2) }}</text>
        </view>
      </view>

      <view v-if="showReturnSection && returnSelectedProducts.length > 0" class="card">
        <view class="card-title-row">
          <text class="card-title return-title">退货商品 ({{ returnSelectedProducts.length }}种)</text>
        </view>
        <view v-for="(p, idx) in returnSelectedProducts" :key="p.id" class="preview-line">
          <text class="preview-seq">{{ idx + 1 }}.</text>
          <text class="preview-name">{{ p.name }}</text>
          <text class="preview-qty">{{ returnQtyMap[p.id]?.qty || 0 }}袋</text>
          <text class="preview-price">-¥{{ (normalizeCount(returnQtyMap[p.id]?.qty) * (p.salePrice || 0)).toFixed(2) }}</text>
        </view>
      </view>

      <view class="summary preview-summary">
        <text>品种: {{ selectedProducts.length }}种 | 合计: {{ totalQty }}袋</text>
        <view class="summary-amounts">
          <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
          <text v-if="showReturnSection && returnTotalQty > 0" class="return-amount-text">退货金额: -¥{{ returnTotalAmount.toFixed(2) }}</text>
          <text v-if="showReturnSection && returnTotalQty > 0" class="net-amount-text">净额: ¥{{ (totalAmount - returnTotalAmount).toFixed(2) }}</text>
          <text class="commission-text">预计提成: ¥{{ estimatedCommission.toFixed(2) }}</text>
        </view>
      </view>

      <view class="pay-type-section">
        <text class="pay-type-label">付款方式</text>
        <view class="pay-type-options">
          <view class="pay-type-option" :class="{ active: payType === 'card' }" @tap="payType = 'card'">
            <text>单子</text>
          </view>
          <view class="pay-type-option" :class="{ active: payType === 'cash' }" @tap="payType = 'cash'">
            <text>现金</text>
          </view>
        </view>
      </view>

      <view class="print-copies-section">
        <text class="print-copies-label">打印数量</text>
        <view class="print-copies-options">
          <view class="print-copies-option" :class="{ active: printCopies === 1 }" @tap="printCopies = 1"><text>1张</text></view>
          <view class="print-copies-option" :class="{ active: printCopies === 2 }" @tap="printCopies = 2"><text>2张</text></view>
          <view class="print-copies-option" :class="{ active: printCopies === 3 }" @tap="printCopies = 3"><text>3张</text></view>
        </view>
      </view>

      <view class="btn-group">
        <button class="btn-submit btn-primary" @tap="submitAndPrint" :disabled="submitting">
          {{ submitting ? '提交中...' : '确认并打印' }}
        </button>
        <button class="btn-submit btn-secondary" @tap="submitOnly" :disabled="submitting">
          确认不打印
        </button>
        <button class="btn-submit btn-gift" @tap="submitGift" :disabled="submitting">
          送老板试吃
        </button>
        <button class="btn-submit btn-back" @tap="goBackToEdit">
          返回修改
        </button>
      </view>
    </view>

    <!-- 隐藏的打印画布，用于Canvas绘制打印图像 -->
    <scroll-view scroll-x scroll-y style="width:0;height:0;overflow:hidden;">
      <canvas :canvas-id="canvasId" :style="{ width: canvasWidthPx + 'px', height: canvasHeightPx + 'px' }" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getStock, saveSale, postSale, linkSaleReturn, saveReturn, postReturn, isOwnedStore, isSameSalespersonId, getSessionSalespersonId, getWarehouseSalespersonId, getProductSaleQty, settleSale, getSaleDetail, getSalespersonDisplayName, getReturnDetail } from '@/api'
import type { Store, Product, SaleDoc, SaleLine, ReturnDoc, ReturnLine, Warehouse, StockItem } from '@/types'
import { genId, formatProductQuickPickLabel, formatProductPackageSummary, calcQty, deriveBagQty, normalizeCount, normalizeBoxPackQty, formatStockPreview, getProductStockQty, toStockQtyMap, COMMISSION_RATE, todayLocalDate, debounce } from '@/utils'
import { printSaleA4, printCombinedA4, checkPrinterConnected, navigateToPrinterSettings } from '@/utils/bluetooth-printer'
import { CANVAS_ID, PAGE_WIDTH_DOTS, estimateContentHeight } from '@/utils/canvas-print'
import { guardNetwork } from '@/utils/network'
import { requestCurrentLocation } from '@/utils/location'
import { haversineDistance, formatDistance } from '@/utils/geo'
import { stockPoller } from '@/utils/stock-sync'

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
const selectedWarehouse = ref<Warehouse | null>(null)
const storeSelectorVisible = ref(false)
const qtyMap = ref<Record<string, QtyInput>>({})
const keyword = ref('')
const vehicleStockMap = ref<Record<string, number>>({})
const mainStockMap = ref<Record<string, number>>({})
const stockLoading = ref(false)
const pageLoading = ref(false)
const payType = ref<'cash' | 'card'>('card')
const sortMode = ref<SortMode>('custom')
const step = ref<1 | 2>(1)
const submitting = ref(false)
const submittedResult = ref<{ saleDoc: SaleDoc; returnDoc: ReturnDoc | null } | null>(null)
const previewDate = ref('')
const printCopies = ref(1)
const productSaleQtyMap = ref<Record<string, number>>({})
const customSortOrder = ref<string[]>([])
const userLocation = ref<{ lat: number; lng: number } | null>(null)
const storeKeyword = ref('')
const addedProductOrder = ref(new Map<string, number>())
const showReturnSection = ref(false)
const returnQtyMap = ref<Record<string, QtyInput>>({})
const returnKeyword = ref('')

// 非响应式提交锁，防止快速连点导致的重复提交
let _submitLock = false

const canvasId = CANVAS_ID
const canvasWidthPx = PAGE_WIDTH_DOTS
const canvasHeightPx = computed(() => {
  const itemCount = selectedProducts.value.length + (showReturnSection.value ? returnSelectedProducts.value.length : 0)
  // 保持足够高度以容纳所有商品行
  return Math.max(2480, 800 + itemCount * 64)
})

const DRAFT_KEY = 'wh_sale_draft'
const DRAFT_TTL = 24 * 60 * 60 * 1000
const SORT_MODE_KEY = 'wh_sale_sort_mode'

// 后端草稿单 ID（创建后复用同一条记录，避免重复生成）
const autoDraftId = ref('')
interface SaleDraft {
  storeId: string
  warehouseId: string
  qtyMap: Record<string, { boxQty: number; bagQty: number; qty: number }>
  keyword: string
  savedAt: number
  showReturnSection?: boolean
  returnQtyMap?: Record<string, { boxQty: number; bagQty: number; qty: number }>
}

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
const sessionSalespersonId = computed(() => getSessionSalespersonId(userStore.currentUser))
const sortModeIndex = computed(() => sortModeOptions.findIndex(o => o.value === sortMode.value))
const currentSortLabel = computed(() => sortModeOptions.find(o => o.value === sortMode.value)?.label || '排序')

function onSortModeChange(e: any) {
  sortMode.value = sortModeOptions[Number(e.detail.value)]?.value || 'custom'
  try { uni.setStorageSync(SORT_MODE_KEY, sortMode.value) } catch { /* ignore */ }
}

// 排序模式持久化：读取上次选择
function loadSortMode() {
  try {
    const saved = uni.getStorageSync(SORT_MODE_KEY) as SortMode
    if (saved && sortModeOptions.some(o => o.value === saved)) {
      sortMode.value = saved
    }
  } catch { /* ignore */ }
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

function storeDistance(store: Store): string | null {
  if (!userLocation.value || !store.lat || !store.lng) return null
  const d = haversineDistance(userLocation.value.lat, userLocation.value.lng, store.lat, store.lng)
  return formatDistance(d)
}

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
        // 有自定义顺序的排在前面，都有则按顺序；都没有则保持原序
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

const selectedProducts = computed(() => {
  const selected = products.value.filter(p => !!qtyMap.value[p.id])
  const order = addedProductOrder.value
  return [...selected].sort((a, b) => {
    const oa = order.get(a.id) ?? 0
    const ob = order.get(b.id) ?? 0
    return ob - oa
  })
})

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

const returnFilteredProducts = computed(() => {
  const key = returnKeyword.value.trim().toLowerCase()
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

const returnQuickPickOptions = computed(() => returnFilteredProducts.value.map(p => ({
  id: p.id,
  name: formatProductQuickPickLabel(p, productStockPreview(p.id)),
})))

const returnSelectedProducts = computed(() => products.value.filter(p => !!returnQtyMap.value[p.id]))

const returnTotalQty = computed(() => {
  return Object.values(returnQtyMap.value).reduce((sum, item) => sum + normalizeCount(item.qty), 0)
})

const returnTotalAmount = computed(() => {
  let total = 0
  for (const p of returnSelectedProducts.value) {
    total += normalizeCount(returnQtyMap.value[p.id]?.qty) * (p.salePrice || 0)
  }
  return total
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

function toggleReturnSelect(p: Product) {
  if (returnQtyMap.value[p.id]) {
    delete returnQtyMap.value[p.id]
    returnQtyMap.value = { ...returnQtyMap.value }
    return
  }
  returnQtyMap.value[p.id] = createQtyInput(p.id)
  returnQtyMap.value = { ...returnQtyMap.value }
}

function syncReturnQty(productId: string) {
  const current = returnQtyMap.value[productId]
  if (!current) return
  current.boxQty = normalizeCount(current.boxQty)
  current.bagQty = normalizeCount(current.bagQty)
  current.qty = calcQty(current.boxQty, current.bagQty, productById(productId)?.boxQty)
}

function onReturnQtyFocus(productId: string, field: 'boxQty' | 'bagQty') {
  const current = returnQtyMap.value[productId]
  if (current && !current[field]) {
    current[field] = '' as any
    returnQtyMap.value = { ...returnQtyMap.value }
  }
}

function onReturnQuickPickChange(e: any) {
  const product = returnFilteredProducts.value[Number(e.detail.value)]
  if (!product) return
  toggleReturnSelect(product)
}

function returnProductPackageSummary(product: Product) {
  const current = returnQtyMap.value[product.id]
  return formatProductPackageSummary(product, current?.qty || 0, current?.boxQty || 0)
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
    addedProductOrder.value.delete(p.id)
    return
  }
  qtyMap.value[p.id] = createQtyInput(p.id)
  qtyMap.value = { ...qtyMap.value }
  addedProductOrder.value.set(p.id, Date.now())
}

function onQuickPickChange(e: any) {
  const product = filteredProducts.value[Number(e.detail.value)]
  if (!product) return
  toggleSelect(product)
}

function goPreview() {
  if (!canSubmit.value) return
  // 同步所有数量
  Object.keys(qtyMap.value).forEach(syncQty)
  if (showReturnSection.value) {
    Object.keys(returnQtyMap.value).forEach(syncReturnQty)
  }

  const zeroSaleProduct = selectedProducts.value.find(product => {
    const current = qtyMap.value[product.id]
    return !normalizeCount(current?.boxQty) && !normalizeCount(current?.bagQty) && !normalizeCount(current?.qty)
  })
  if (zeroSaleProduct) {
    uni.showToast({ title: `${zeroSaleProduct.name} 数量为0，请先修改`, icon: 'none' })
    return
  }

  if (showReturnSection.value) {
    const zeroReturnProduct = returnSelectedProducts.value.find(product => {
      const current = returnQtyMap.value[product.id]
      return !normalizeCount(current?.boxQty) && !normalizeCount(current?.bagQty) && !normalizeCount(current?.qty)
    })
    if (zeroReturnProduct) {
      uni.showToast({ title: `${zeroReturnProduct.name} 退货数量为0，请先修改`, icon: 'none' })
      return
    }
  }

  previewDate.value = todayLocalDate()
  step.value = 2
  // 滚动到顶部
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function goBackToEdit() {
  step.value = 1
  uni.pageScrollTo({ scrollTop: 0, duration: 0 })
}

function openStoreSelector() {
  storeSelectorVisible.value = true
  // 如果还没有定位信息，再次尝试获取
  if (!userLocation.value) {
    requestCurrentLocation()
      .then(loc => { userLocation.value = { lat: loc.latitude, lng: loc.longitude } })
      .catch(() => {})
  }
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

function goStoreHistory() {
  if (!selectedStore.value) return
  uni.navigateTo({
    url: `/pages/sales/store-history?storeId=${selectedStore.value.id}&storeName=${encodeURIComponent(selectedStore.value.name)}`,
  })
}

function onWarehouseChange(e: any) {
  selectedWarehouse.value = vehicleWarehouses.value[Number(e.detail.value)] || null
  syncStoresBySalesperson()
  refreshStockPreview()
  subscribeStockUpdates()
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

  // 异步加载销量数据（用于按销量排序）
  getProductSaleQty().then(map => { productSaleQtyMap.value = map }).catch(() => {})
  // 加载自定义排序和排序模式
  loadCustomSortOrder()
  loadSortMode()
  // 异步获取当前位置（用于超市距离排序）
  requestCurrentLocation().then(loc => { userLocation.value = { lat: loc.latitude, lng: loc.longitude } }).catch(() => {})
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

async function doSubmit(docType: 'sale' | 'gift' = 'sale'): Promise<{ saleDoc: SaleDoc; returnDoc: ReturnDoc | null } | null> {
  Object.keys(qtyMap.value).forEach(syncQty)
  if (showReturnSection.value) {
    Object.keys(returnQtyMap.value).forEach(syncReturnQty)
  }

  if (!currentStoreId()) {
    uni.showToast({ title: '请选择超市', icon: 'none' })
    return null
  }
  if (totalQty.value <= 0) {
    uni.showToast({ title: '请录入商品数量', icon: 'none' })
    return null
  }
  if (!ensureWarehouseReady()) {
    return null
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
    return null
  }

  const saleDraft = {
    ...(autoDraftId.value ? { id: autoDraftId.value } : {}),
    salespersonId: currentSalespersonId(),
    storeId: currentStoreId(),
    warehouseId: currentWarehouseId(),
    date: todayLocalDate(),
    status: 'draft',
    docType,
    lines,
  } as SaleDoc

  try {
    const savedSale = await saveSale(saleDraft)
    await postSale(savedSale.id)
    // 现金单直接标记已收款
    if (payType.value === 'cash') {
      await settleSale(savedSale.id)
    }

    const postedSale = await getSaleDetail(savedSale.id)
    if (!postedSale) throw new Error('销单保存后读取失败')
    postedSale.lines = lines

    let savedReturn: ReturnDoc | null = null
    let postedReturn: ReturnDoc | null = null
    if (showReturnSection.value && returnTotalQty.value > 0) {
      const returnLines: ReturnLine[] = returnSelectedProducts.value
        .map(p => ({
          id: genId(),
          productId: p.id,
          boxQty: normalizeCount(returnQtyMap.value[p.id]?.boxQty),
          qty: normalizeCount(returnQtyMap.value[p.id]?.qty),
          price: p.salePrice || 0,
        }))
        .filter(line => line.qty > 0)

      const returnDraft = {
        salespersonId: currentSalespersonId(),
        storeId: currentStoreId(),
        fromWarehouseId: currentWarehouseId(),
        returnType: 'vehicle_return',
        date: todayLocalDate(),
        status: 'draft',
        lines: returnLines,
      } as ReturnDoc

      savedReturn = await saveReturn(returnDraft, returnLines)
      await postReturn(savedReturn.id)
      postedReturn = await getReturnDetail(savedReturn.id)
      if (!postedReturn) throw new Error('退单保存后读取失败')
      postedReturn.lines = returnLines

      // 把退单ID写入销单（用专用接口，避免二次 saveSale 带来的明细重建问题）
      postedSale.returnDocId = savedReturn.id
      await linkSaleReturn(savedSale.id, savedReturn.id)
    }

    clearDraft()
    return { saleDoc: postedSale, returnDoc: postedReturn }
  } catch (e: any) {
    uni.showToast({ title: e.message || '生成失败', icon: 'none' })
    return null
  }
}

async function submitAndPrint() {
  if (_submitLock) return
  if (!(await guardNetwork('提交销单'))) return
  const printer = checkPrinterConnected()
  if (!printer) {
    uni.showModal({
      title: '未连接打印机',
      content: '请先到设置中的蓝牙打印页面连接打印机。',
      confirmText: '去连接',
      cancelText: '只确认',
      success: async (res) => {
        if (res.confirm) {
          navigateToPrinterSettings()
        } else {
          await submitOnly()
        }
      },
    })
    return
  }

  // 已提交过：只打印，不重复创建销单
  if (submittedResult.value) {
    const result = submittedResult.value
    try {
      const store = stores.value.find(s => s.id === result.saleDoc.storeId)
      const spId = currentSalespersonId()
      const spName = getSalespersonDisplayName(referenceStore.accounts, spId)
      const copies = Math.min(Math.max(printCopies.value, 1), 3)
      for (let i = 0; i < copies; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1500))
        if (result.returnDoc) {
          await printCombinedA4(result.saleDoc, result.returnDoc, store, spName, products.value, payType.value)
        } else {
          await printSaleA4(result.saleDoc, store, spName, products.value, payType.value)
        }
      }
      uni.showToast({ title: '重新打印成功', icon: 'success' })
    } catch (e: any) {
      uni.showToast({ title: `打印失败: ${e.message || ''}`, icon: 'none', duration: 3000 })
    }
    return
  }

  _submitLock = true
  submitting.value = true
  const result = await doSubmit()
  if (!result) {
    submitting.value = false
    _submitLock = false
    return
  }
  submittedResult.value = result

  try {
    const store = stores.value.find(s => s.id === result.saleDoc.storeId)
    const spId = currentSalespersonId()
    const spName = referenceStore.accounts.find(a => isSameSalespersonId(a.salespersonId || a.id, spId))?.displayName || '-'
    const copies = Math.min(Math.max(printCopies.value, 1), 3)
    for (let i = 0; i < copies; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1500))
      if (result.returnDoc) {
        await printCombinedA4(result.saleDoc, result.returnDoc, store, spName, products.value, payType.value)
      } else {
        await printSaleA4(result.saleDoc, store, spName, products.value, payType.value)
      }
    }
    uni.showToast({ title: copies > 1 ? `已打印${copies}张` : '已确认并打印', icon: 'success' })
  } catch (e: any) {
    uni.showToast({ title: `已确认，打印失败: ${e.message || ''}`, icon: 'none', duration: 3000 })
  }

  submitting.value = false
  setTimeout(() => {
    uni.redirectTo({ url: '/pages/sales/index' })
  }, 400)
}

async function submitOnly() {
  if (_submitLock) return
  if (submittedResult.value) {
    uni.showToast({ title: '该销单已提交', icon: 'none' })
    setTimeout(() => { uni.redirectTo({ url: '/pages/sales/index' }) }, 400)
    return
  }
  if (!(await guardNetwork('提交销单'))) return
  _submitLock = true
  submitting.value = true
  const result = await doSubmit()
  submitting.value = false
  _submitLock = false
  if (!result) return
  submittedResult.value = result
  uni.showToast({ title: '销单已确认', icon: 'success' })
  setTimeout(() => {
    uni.redirectTo({ url: '/pages/sales/index' })
  }, 400)
}

async function submitGift() {
  if (_submitLock) return
  if (!(await guardNetwork('提交赠送单'))) return
  // 计算按进价扣除的总额
  const giftDeduction = selectedProducts.value.reduce((sum, p) => {
    const qty = normalizeCount(qtyMap.value[p.id]?.qty)
    return sum + qty * (p.purchasePrice || 0)
  }, 0)
  uni.showModal({
    title: '送老板试吃',
    content: `赠送品按进价从工资扣除，本单将扣除 ¥${giftDeduction.toFixed(2)}。确认继续？`,
    success: async (res) => {
      if (!res.confirm) return
      _submitLock = true
      submitting.value = true
      const result = await doSubmit('gift')
      submitting.value = false
      _submitLock = false
      if (!result) return
      uni.showToast({ title: '赠送单已确认', icon: 'success' })
      setTimeout(() => {
        uni.redirectTo({ url: '/pages/sales/index' })
      }, 400)
    },
  })
}

// --- 草稿保存/恢复 ---
function saveDraftNow() {
  if (!selectedStore.value && !selectedWarehouse.value && Object.keys(qtyMap.value).length === 0) return
  const draft: SaleDraft = {
    storeId: selectedStore.value?.id || '',
    warehouseId: selectedWarehouse.value?.id || '',
    qtyMap: JSON.parse(JSON.stringify(qtyMap.value)),
    keyword: keyword.value,
    savedAt: Date.now(),
    showReturnSection: showReturnSection.value,
    returnQtyMap: showReturnSection.value ? JSON.parse(JSON.stringify(returnQtyMap.value)) : undefined,
  }
  uni.setStorageSync(DRAFT_KEY, JSON.stringify(draft))
}

const debouncedSaveDraft = debounce(saveDraftNow, 500)

// 自动同步草稿到后端（超市+至少一件商品时触发）
async function autoSaveDraftToServer() {
  if (!selectedStore.value) return
  const lines: SaleLine[] = selectedProducts.value
    .map(p => ({
      id: genId(),
      productId: p.id,
      boxQty: normalizeCount(qtyMap.value[p.id]?.boxQty),
      qty: normalizeCount(qtyMap.value[p.id]?.qty),
      price: p.salePrice || 0,
    }))
    .filter(line => line.qty > 0)
  if (lines.length === 0) return
  try {
    const draftDoc = {
      ...(autoDraftId.value ? { id: autoDraftId.value } : {}),
      salespersonId: currentSalespersonId(),
      storeId: currentStoreId(),
      warehouseId: currentWarehouseId(),
      date: todayLocalDate(),
      status: 'draft',
      docType: 'sale',
      lines,
    } as SaleDoc
    const saved = await saveSale(draftDoc)
    if (!autoDraftId.value) autoDraftId.value = saved.id
  } catch {
    // 草稿保存失败静默处理，不打扰用户
  }
}

const debouncedAutoSaveDraft = debounce(autoSaveDraftToServer, 1200)

function clearDraft() {
  uni.removeStorageSync(DRAFT_KEY)
  autoDraftId.value = ''
}

function tryRestoreDraft() {
  const raw = uni.getStorageSync(DRAFT_KEY)
  if (!raw) return
  try {
    const draft: SaleDraft = JSON.parse(raw)
    if (Date.now() - draft.savedAt > DRAFT_TTL) {
      clearDraft()
      return
    }
    uni.showModal({
      title: '发现未完成草稿',
      content: '是否恢复上次编辑的销单？',
      confirmText: '恢复',
      cancelText: '丢弃',
      success: (res) => {
        if (res.confirm) {
          if (draft.storeId) {
            selectedStore.value = stores.value.find(s => s.id === draft.storeId) || null
          }
          if (draft.warehouseId) {
            selectedWarehouse.value = warehouses.value.find(w => w.id === draft.warehouseId) || null
            refreshStockPreview()
          }
          if (draft.qtyMap) {
            qtyMap.value = draft.qtyMap
          }
          if (draft.keyword) {
            keyword.value = draft.keyword
          }
          if (draft.showReturnSection) {
            showReturnSection.value = true
          }
          if (draft.returnQtyMap && Object.keys(draft.returnQtyMap).length > 0) {
            returnQtyMap.value = draft.returnQtyMap
          }
        } else {
          clearDraft()
        }
      },
    })
  } catch {
    clearDraft()
  }
}

const prefillMode = ref(false)
let unsubscribeStock: (() => void) | null = null

function subscribeStockUpdates() {
  // 取消旧订阅
  if (unsubscribeStock) {
    unsubscribeStock()
    unsubscribeStock = null
  }
  const warehouseId = selectedWarehouse.value?.id
  if (!warehouseId) return
  unsubscribeStock = stockPoller.subscribe(warehouseId, (stockList) => {
    vehicleStockMap.value = toStockQtyMap(stockList)
  })
}

// 首次挂载由 onMounted 的 loadData 负责；后续每次回到本页都主动刷新一次
// 基础资料（店铺/商品/仓库），避免管理员新增商品后业务员看不到
let hasFirstLoaded = false

async function refreshReferenceOnShow() {
  try {
    await referenceStore.preloadCore(true)
    stores.value = [...referenceStore.stores]
    allStores.value = [...referenceStore.stores]
    products.value = [...referenceStore.products]
    warehouses.value = [...referenceStore.warehouses]
    syncStoresBySalesperson()
  } catch {
    // 网络失败时保留旧数据，不打扰业务员当前正在录单的流程
  }
}

onShow(() => {
  // 从排序页面返回时重新加载自定义排序
  loadCustomSortOrder()
  // 从其他页面返回时拉取最新商品/店铺/仓库
  if (hasFirstLoaded) {
    refreshReferenceOnShow()
  }
})

onLoad((query: any) => {
  if (query?.prefill === 'true') {
    prefillMode.value = true
  }
  if (query?.draftId) {
    autoDraftId.value = query.draftId
  }
})

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadData().then(() => {
    hasFirstLoaded = true
    if (prefillMode.value) {
      tryRestorePrefill()
    } else if (autoDraftId.value) {
      tryRestoreBackendDraft(autoDraftId.value)
    } else {
      tryRestoreDraft()
    }
    // 启动库存短轮询
    subscribeStockUpdates()
    // 启动草稿自动保存
    watch(
      [() => selectedStore.value?.id, () => selectedWarehouse.value?.id, qtyMap, keyword, showReturnSection, returnQtyMap],
      debouncedSaveDraft,
      { deep: true },
    )
    // 超市+商品都选了就同步草稿到后端（供历史记录显示）
    watch(
      [() => selectedStore.value?.id, qtyMap],
      () => {
        if (selectedStore.value && selectedProducts.value.length > 0) {
          debouncedAutoSaveDraft()
        }
      },
      { deep: true },
    )
  })
})

onUnmounted(() => {
  if (unsubscribeStock) {
    unsubscribeStock()
    unsubscribeStock = null
  }
})

// 从后端草稿恢复表单（从历史记录点击草稿单进入时）
async function tryRestoreBackendDraft(draftId: string) {
  try {
    const doc = await getSaleDetail(draftId)
    if (!doc || doc.status !== 'draft') return
    if (doc.storeId) {
      selectedStore.value = stores.value.find(s => s.id === doc.storeId) || null
    }
    if (doc.warehouseId) {
      selectedWarehouse.value = warehouses.value.find(w => w.id === doc.warehouseId) || null
      refreshStockPreview()
    }
    if (doc.lines && doc.lines.length > 0) {
      for (const line of doc.lines) {
        const boxQty = products.value.find(p => p.id === line.productId)?.boxQty || 1
        const boxes = boxQty > 1 ? Math.floor(line.qty / boxQty) : 0
        const bags = boxQty > 1 ? line.qty % boxQty : line.qty
        qtyMap.value[line.productId] = {
          boxQty: boxes,
          bagQty: bags,
          qty: line.qty,
        }
        if (!addedProductOrder.value.has(line.productId)) {
          addedProductOrder.value.set(line.productId, addedProductOrder.value.size)
        }
      }
    }
  } catch {
    // 静默失败，当作新建处理
  }
}

function tryRestorePrefill() {  const raw = uni.getStorageSync('wh_sale_prefill')
  if (!raw) return
  try {
    const data = JSON.parse(raw)
    if (data.storeId) {
      selectedStore.value = stores.value.find(s => s.id === data.storeId) || null
    }
    if (data.warehouseId) {
      selectedWarehouse.value = warehouses.value.find(w => w.id === data.warehouseId) || null
      refreshStockPreview()
    }
    if (data.lines) {
      const newQtyMap: Record<string, QtyInput> = {}
      for (const line of data.lines) {
        newQtyMap[line.productId] = createQtyInput(line.productId, line.qty, line.boxQty)
      }
      qtyMap.value = newQtyMap
    }
    // 恢复退单部分
    if (data.returnLines && data.returnLines.length > 0) {
      showReturnSection.value = true
      const newReturnQtyMap: Record<string, QtyInput> = {}
      for (const line of data.returnLines) {
        newReturnQtyMap[line.productId] = createQtyInput(line.productId, line.qty, line.boxQty)
      }
      returnQtyMap.value = newReturnQtyMap
    }
  } catch { /* ignore */ }
  uni.removeStorageSync('wh_sale_prefill')
}
</script>

<style lang="scss" scoped>
.create-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.section-tip {
  display: block;
  margin: 6rpx 0 12rpx;
  font-size: 22rpx;
  color: #8c8c8c;
  line-height: 1.6;
}

.inline-tip {
  margin: 0;
  text-align: right;
}

.store-trigger {
  border-width: 3rpx !important;
}

.picker.quick-picker,
.store-trigger,
.btn-submit,
.btn-create {
  box-shadow: 0 6rpx 14rpx rgba(24, 144, 255, 0.08);
}

.btn-submit.btn-primary {
  border: 2rpx solid #0f67d8;
}

.btn-submit.btn-secondary {
  border: 2rpx solid #bfbfbf;
}

.btn-submit.btn-gift {
  border: 2rpx solid #d48806;
}

.btn-submit.btn-back {
  border: 2rpx solid #d9d9d9;
}

.summary,
.return-summary,
.net-summary,
.preview-banner {
  border-width: 2rpx;
}

.pay-type-option,
.print-copies-option {
  border-width: 2rpx;
}

.pay-type-option.active,
.print-copies-option.active {
  box-shadow: 0 6rpx 12rpx rgba(24, 144, 255, 0.12);
}

.product-item {
  border-width: 2rpx !important;
}

.btn-remove,
.store-history-link,
.sort-manage,
.sort-trigger {
  font-weight: 700;
}

.stock-hint,
.stock-preview,
.qty-total,
.preview-banner-text,
.commission-text,
.return-amount-text,
.net-amount-text {
  font-weight: 600;
}

.label,
.field-label,
.qty-label,
.pay-type-label,
.print-copies-label,
.return-toggle-label,
.card-title {
  font-weight: 700;
}

.btn-settle,
.btn-detail {
  border-width: 2rpx;
}

.btn-detail {
  box-sizing: border-box;
}

.btn-settle {
  box-shadow: 0 6rpx 12rpx rgba(82, 196, 26, 0.14);
}

.btn-detail {
  box-shadow: 0 6rpx 12rpx rgba(24, 144, 255, 0.12);
}

@media (max-width: 480px) {
  .inline-tip {
    display: block;
    width: 100%;
    text-align: left;
    margin-top: 8rpx;
  }
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
  border: 2rpx solid #edf2f7;

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

  .store-history-link {
    display: inline-block;
    margin-top: 12rpx;
    font-size: 24rpx;
    color: #1890ff;
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

.section:nth-of-type(1) {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.section:nth-of-type(2) {
  border-color: #c7f0df;
  background: #f5fcf8;
}

.section:nth-of-type(3) {
  border-color: #ffe58f;
  background: #fffdf5;
}

.return-section {
  border-color: #ffccc7 !important;
  background: #fff8f7;
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
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-top: 10rpx;
}

.btn-primary {
  background: #1890ff;
}

.btn-secondary {
  background: #fff;
  color: #1890ff;
  border: 2rpx solid #1890ff;
}

.btn-gift {
  background: #fff;
  color: #fa8c16;
  border: 2rpx solid #fa8c16;
}

.btn-submit[disabled] {
  background: #b5d4ff;
  color: #fff;
  border-color: #b5d4ff;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.pay-type-section {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 10rpx;
  margin-bottom: 10rpx;
}

.pay-type-label {
  font-size: 28rpx;
  color: #666;
}

.pay-type-options {
  display: flex;
  gap: 12rpx;
}

.pay-type-option {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #ddd;
  font-size: 26rpx;
  color: #666;
}

.pay-type-option.active {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}

.seq-no {
  color: #999;
  font-size: 26rpx;
  margin-right: 6rpx;
}

.variety-count {
  color: #1890ff;
  font-size: 26rpx;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.sort-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.sort-manage {
  font-size: 24rpx;
  color: #fa8c16;
  padding: 8rpx 16rpx;
  border: 2rpx solid #fa8c16;
  border-radius: 999rpx;
  white-space: nowrap;
}

.sort-trigger {
  font-size: 24rpx;
  color: #1890ff;
  padding: 8rpx 16rpx;
  border: 2rpx solid #1890ff;
  border-radius: 999rpx;
  white-space: nowrap;
}

.btn-group {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.btn-submit {
  height: 96rpx;
}

.btn-primary {
  box-shadow: 0 10rpx 18rpx rgba(24, 144, 255, 0.16);
}

.btn-secondary,
.btn-gift,
.btn-back {
  box-sizing: border-box;
}

@media (max-width: 480px) {
  .section-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12rpx;
  }

  .sort-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (min-width: 481px) {
  .section-header {
    gap: 16rpx;
  }
}

.bottom-action-spacer {
  display: none;
}

.btn-settle,
.btn-detail {
  min-height: 72rpx;
}

.tab-desc {
  white-space: nowrap;
}

.tab-title {
  white-space: nowrap;
}

.range-chips {
  row-gap: 16rpx;
}

.pay-type-option,
.print-copies-option {
  min-width: 120rpx;
  text-align: center;
}

.store-trigger,
.picker.quick-picker,
.picker {
  min-height: 88rpx;
  box-sizing: border-box;
}

.search-input,
.scan-row input,
.store-search-input {
  min-height: 80rpx;
  box-sizing: border-box;
}

.date-box {
  white-space: nowrap;
}

.range-summary,
.section-tip,
.scan-hint,
.stock-hint {
  line-height: 1.7;
}

.guide-card {
  display: none;
}

.usage-tip {
  display: none;
}

.preview-banner {
  background: #f0f9ff;
  border-color: #91d5ff;
}

.preview-banner-text {
  color: #0050b3;
}

.summary,
.return-summary,
.net-summary {
  border-radius: 14rpx;
}

.summary {
  background: #f8fafc;
}

.return-summary {
  background: #fff7ed;
}

.net-summary {
  background: #f0fdf4;
}

.btn-create {
  height: 96rpx !important;
}

.pay-type-section,
.print-copies-section,
.return-toggle {
  border-radius: 16rpx;
}

.pay-type-section {
  background: #f8fbff;
}

.print-copies-section {
  background: #f8fafc;
}

.return-toggle {
  background: #fff7ed;
}

.section-tip.inline-tip {
  max-width: 320rpx;
}

.section:nth-of-type(3) .section-tip.inline-tip {
  color: #ad6800;
}

.section:nth-of-type(1) .section-tip {
  color: #1d4ed8;
}

.section:nth-of-type(2) .section-tip {
  color: #047857;
}

.section:nth-of-type(3) .section-tip {
  color: #ad6800;
}

.return-section .section-tip {
  color: #c2410c;
}

.store-history-link {
  white-space: nowrap;
}

.qty-total {
  color: #0f172a;
}

.stock-preview {
  line-height: 1.7;
}

.product-item {
  border-radius: 12rpx;
  padding: 18rpx 16rpx;
  background: #fff;
}

.product-item + .product-item {
  margin-top: 12rpx;
}

.product-item:last-child {
  margin-bottom: 0;
}

.summary-amounts text {
  text-align: right;
}

.btn-submit::after,
.btn-create::after {
  border: none;
}

.search-input,
.scan-row input,
.store-search-input,
.qty-input {
  font-size: 30rpx;
}

.sort-manage,
.sort-trigger,
.store-history-link,
.section-tip,
.range-summary,
.tab-desc {
  letter-spacing: 0.5rpx;
}

.return-toggle-label,
.pay-type-label,
.print-copies-label,
.label {
  color: #334155;
}

.section-header .label {
  margin-bottom: 0;
}

.selector-divider {
  display: none;
}

.helper-text {
  display: none;
}

.btn-group .btn-submit + .btn-submit {
  margin-top: 0;
}

.card .label,
.card .value {
  line-height: 1.7;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.seq-no {
  font-weight: 600;
}

@media (max-width: 480px) {
  .sort-manage,
  .sort-trigger {
    font-size: 22rpx;
  }
}

.important-divider {
  display: none;
}

.focus-ring {
  display: none;
}

.preview-summary {
  border: 2rpx solid #dbeafe;
}

.return-summary {
  border: 2rpx solid #fed7aa;
}

.net-summary {
  border: 2rpx solid #bbf7d0;
}

.range-bar,
.search-bar {
  margin-bottom: 18rpx;
}

.empty {
  line-height: 1.8;
}

.btn-back {
  color: #666;
}

.card .row + .row {
  border-top: 1rpx solid #f1f5f9;
}

.card .row {
  padding: 12rpx 0;
}

.preview-price,
.amount {
  font-weight: 700;
}

.code {
  line-height: 1.4;
}

.status,
.unsettled-tag,
.gift-tag {
  white-space: nowrap;
}

.summary.preview-summary {
  background: #f8fbff;
}

.range-bar,
.section,
.sale-card,
.card {
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.04);
}

.range-bar,
.search-bar .search-input,
.section,
.card,
.sale-card {
  border-width: 2rpx;
}

.search-bar .search-input {
  border-color: #dbe3ee;
}

.range-bar {
  border: 2rpx solid #dbe3ee;
}

.sale-card {
  border: 2rpx solid #edf2f7;
}

.tab.sale-tab,
.tab.return-tab,
.tab.unsettled-tab {
  transition: all .2s ease;
}

.sale-card .row {
  align-items: center;
}

.tab:not(.active) .tab-title {
  color: #475569;
}

.tab:not(.active) .tab-desc {
  color: #94a3b8;
}

.bottom-card-placeholder {
  display: none;
}

.create-page .header .title {
  letter-spacing: 1rpx;
}

.section-header .sort-actions .picker {
  margin-bottom: 0;
}

.section-header .sort-actions .sort-trigger,
.section-header .sort-actions .sort-manage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.return-toggle,
.pay-type-section,
.print-copies-section {
  padding: 18rpx 16rpx;
}

.net-summary,
.summary,
.return-summary {
  padding: 18rpx 16rpx;
}

.sale-card .amount,
.sale-card .qty,
.sale-card .date,
.sale-card .store {
  line-height: 1.6;
}

.section .scan-row input::placeholder,
.search-input::placeholder,
.store-search-input::placeholder,
.qty-input::placeholder {
  color: #94a3b8;
}

.pay-type-options,
.print-copies-options {
  flex-wrap: wrap;
}

.btn-submit,
.btn-create,
.btn-settle,
.btn-detail,
.btn-remove {
  touch-action: manipulation;
}

.preview-line {
  align-items: center;
}

.preview-name {
  line-height: 1.5;
}

.preview-qty,
.preview-price {
  white-space: nowrap;
}

.search-clear {
  border: 1rpx solid #e5e7eb;
}

.search-bar .search-input,
.range-bar,
.date-box,
.section,
.card,
.sale-card,
.product-item {
  box-sizing: border-box;
}

.range-chips .chip {
  font-weight: 700;
}

.return-section .label,
.return-section .card-title,
.return-section .return-toggle-label {
  color: #9a3412;
}

.section:nth-of-type(1) .label {
  color: #1d4ed8;
}

.section:nth-of-type(2) .label {
  color: #047857;
}

.section:nth-of-type(3) .label {
  color: #ad6800;
}

.range-bar .chip {
  border: 2rpx solid transparent;
}

.range-bar .chip.active {
  border-color: #1677ff;
}

.card {
  border: 2rpx solid #edf2f7;
}

.btn-settle,
.btn-detail,
.btn-create,
.btn-submit {
  font-weight: 700;
}

.tab.active .tab-desc {
  color: inherit;
}

.sort-actions {
  white-space: nowrap;
}

.sort-actions .picker {
  white-space: nowrap;
}

.inline-tip {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .inline-tip {
    white-space: normal;
  }
}

.legacy-hint {
  display: none;
}

.page-divider {
  display: none;
}

.micro-tip {
  display: none;
}

.helper-chip {
  display: none;
}

.focus-box {
  display: none;
}

.warn-box {
  display: none;
}

.info-box {
  display: none;
}

.prompt-box {
  display: none;
}

.subtle-note {
  display: none;
}

.row-guidance {
  display: none;
}

.soft-highlight {
  display: none;
}

.dense-border {
  display: none;
}

.visual-separator {
  display: none;
}

.hotspot {
  display: none;
}

.quick-helper {
  display: none;
}

.ui-helper {
  display: none;
}

.footer-accent {
  display: none;
}

.stack-note {
  display: none;
}

.card-accent {
  display: none;
}

.safe-gap {
  display: none;
}

.tap-aid {
  display: none;
}

.big-label {
  display: none;
}

.large-focus {
  display: none;
}

.hint-banner {
  display: none;
}

.visual-aid {
  display: none;
}

.scroll-note {
  display: none;
}

.priority-chip {
  display: none;
}

.status-chip {
  display: none;
}

.readability-fix {
  display: none;
}

.touch-padding {
  display: none;
}

.focus-guard {
  display: none;
}

contrast-boost {
  display: none;
}

.layout-bump {
  display: none;
}

.card-footnote {
  display: none;
}

area-accent {
  display: none;
}

section-guide {
  display: none;
}

field-guide {
  display: none;
}

summary-guide {
  display: none;
}

step-hint {
  display: none;
}

micro-copy {
  display: none;
}

toolbar-note {
  display: none;
}

area-title {
  display: none;
}

footer-note {
  display: none;
}

surface-boost {
  display: none;
}

tag-boost {
  display: none;
}

emphasis-boost {
  display: none;
}

feature-accent {
  display: none;
}

picker-note {
  display: none;
}

summary-note {
  display: none;
}

preview-note {
  display: none;
}

selection-note {
  display: none;
}

cta-boost {
  display: none;
}

visual-group {
  display: none;
}

layout-guide {
  display: none;
}

subsection-note {
  display: none;
}

nice-gap {
  display: none;
}

aging-friendly {
  display: none;
}

focus-friendly {
  display: none;
}

helper-friendly {
  display: none;
}

sort-friendly {
  display: none;
}

section-friendly {
  display: none;
}

button-friendly {
  display: none;
}

color-friendly {
  display: none;
}

visual-friendly {
  display: none;
}

usage-friendly {
  display: none;
}

elder-friendly {
  display: none;
}

.section-tip.inline-tip,
.sort-manage,
.sort-trigger,
.store-history-link {
  overflow: hidden;
  text-overflow: ellipsis;
}

.section-tip.inline-tip {
  text-align: right;
}

.section:nth-of-type(1) {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.section:nth-of-type(2) {
  border-color: #c7f0df;
  background: #f5fcf8;
}

.section:nth-of-type(3) {
  border-color: #ffe58f;
  background: #fffdf5;
}

.return-section {
  border-color: #ffccc7 !important;
  background: #fff8f7;
}

.preview-banner {
  background: #f0f9ff;
  border-color: #91d5ff;
}

.preview-banner-text {
  color: #0050b3;
}

.preview-summary {
  border: 2rpx solid #dbeafe;
}

.return-summary {
  border: 2rpx solid #fed7aa;
}

.net-summary {
  border: 2rpx solid #bbf7d0;
}

.range-bar,
.section,
.sale-card,
.card {
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.04);
}

.tab-desc,
.tab-title {
  white-space: nowrap;
}

.usage-tip,
.guide-card {
  display: none;
}

.btn-create {
  height: 96rpx !important;
}

.btn-settle,
.btn-detail {
  min-height: 72rpx;
}

.pay-type-option,
.print-copies-option {
  min-width: 120rpx;
  text-align: center;
}

.store-trigger,
.picker.quick-picker,
.picker {
  min-height: 88rpx;
  box-sizing: border-box;
}

.search-input,
.scan-row input,
.store-search-input {
  min-height: 80rpx;
  box-sizing: border-box;
}

.date-box {
  white-space: nowrap;
}

.range-summary,
.section-tip,
.scan-hint,
.stock-hint {
  line-height: 1.7;
}

.sort-actions,
.sort-actions .picker,
.sort-trigger,
.sort-manage {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .section-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12rpx;
  }

  .sort-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .inline-tip {
    display: block;
    width: 100%;
    text-align: left;
    margin-top: 8rpx;
    white-space: normal;
  }
}

@media (min-width: 481px) {
  .section-header {
    gap: 16rpx;
  }
}

.section:nth-of-type(1) .label { color: #1d4ed8; }
.section:nth-of-type(2) .label { color: #047857; }
.section:nth-of-type(3) .label { color: #ad6800; }
.section:nth-of-type(1) .section-tip { color: #1d4ed8; }
.section:nth-of-type(2) .section-tip { color: #047857; }
.section:nth-of-type(3) .section-tip { color: #ad6800; }
.return-section .section-tip { color: #c2410c; }
.section:nth-of-type(3) .section-tip.inline-tip { color: #ad6800; }
.store-history-link { white-space: nowrap; }
.btn-submit::after,
.btn-create::after,
.btn-settle::after,
.btn-detail::after,
.btn-remove::after { border: none; }

.qty-total,
.stock-preview,
.commission-text,
.return-amount-text,
.net-amount-text {
  font-weight: 600;
}

.btn-submit,
.btn-create,
.btn-settle,
.btn-detail,
.btn-remove,
.sort-manage,
.sort-trigger {
  font-weight: 700;
}

.product-item + .product-item {
  margin-top: 12rpx;
}

.summary,
.return-summary,
.net-summary,
.preview-banner,
.pay-type-section,
.print-copies-section,
.return-toggle {
  border-radius: 16rpx;
}

.pay-type-section { background: #f8fbff; }
.print-copies-section { background: #f8fafc; }
.return-toggle { background: #fff7ed; }

.sort-trigger,
.sort-manage {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card .row + .row {
  border-top: 1rpx solid #f1f5f9;
}

.card .row {
  padding: 12rpx 0;
}

.preview-price,
.amount {
  font-weight: 700;
}

.status,
.gift-tag {
  white-space: nowrap;
}

.product-item {
  border-radius: 12rpx;
  padding: 18rpx 16rpx;
  background: #fff;
}

.summary-amounts text {
  text-align: right;
}

.search-input::placeholder,
.scan-row input::placeholder,
.store-search-input::placeholder,
.qty-input::placeholder {
  color: #94a3b8;
}

.pay-type-options,
.print-copies-options {
  flex-wrap: wrap;
}

.search-clear {
  border: 1rpx solid #e5e7eb;
}

.section .scan-row input,
.store-search-input,
.qty-input {
  font-size: 30rpx;
}

.sort-manage,
.sort-trigger,
.store-history-link,
.section-tip,
.range-summary {
  letter-spacing: 0.5rpx;
}

.tab.active .tab-desc {
  color: inherit;
}

.tab:not(.active) .tab-title { color: #475569; }
.tab:not(.active) .tab-desc { color: #94a3b8; }

.btn-group {
  gap: 20rpx;
}

.btn-submit {
  height: 96rpx;
}

.btn-primary {
  box-shadow: 0 10rpx 18rpx rgba(24, 144, 255, 0.16);
}

.section-header .label {
  margin-bottom: 0;
}

.inline-tip {
  max-width: 320rpx;
}

.btn-back {
  color: #666;
}

.preview-summary {
  background: #f8fbff;
}

.range-bar,
.search-bar {
  margin-bottom: 18rpx;
}

.empty {
  line-height: 1.8;
}

.create-page .header .title {
  letter-spacing: 1rpx;
}

.sort-actions .picker {
  margin-bottom: 0;
}

.range-chips .chip {
  font-weight: 700;
}

.return-section .label {
  color: #9a3412;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.seq-no {
  font-weight: 600;
}

.range-bar,
.section,
.sale-card,
.card,
.search-bar .search-input,
.date-box,
.store-trigger,
.picker.quick-picker,
.picker {
  box-sizing: border-box;
}

.btn-settle {
  box-shadow: 0 6rpx 12rpx rgba(82, 196, 26, 0.14);
}

.btn-detail {
  box-shadow: 0 6rpx 12rpx rgba(24, 144, 255, 0.12);
}

.store-trigger,
.picker.quick-picker,
.btn-submit,
.btn-create {
  box-shadow: 0 6rpx 14rpx rgba(24, 144, 255, 0.08);
}

.product-item {
  border-width: 2rpx !important;
}

.summary,
.return-summary,
.net-summary,
.preview-banner,
.pay-type-option,
.print-copies-option,
.btn-settle,
.btn-detail {
  border-width: 2rpx;
}

.pay-type-option.active,
.print-copies-option.active {
  box-shadow: 0 6rpx 12rpx rgba(24, 144, 255, 0.12);
}

.btn-submit.btn-primary { border: 2rpx solid #0f67d8; }
.btn-submit.btn-secondary { border: 2rpx solid #bfbfbf; }
.btn-submit.btn-gift { border: 2rpx solid #d48806; }
.btn-submit.btn-back { border: 2rpx solid #d9d9d9; }

.tab {
  border-width: 3rpx;
  min-height: 132rpx;
}

.tab-title {
  font-size: 30rpx;
  font-weight: 700;
}

.tab-desc {
  margin-top: 8rpx;
  font-size: 22rpx;
}

.tab.sale-tab.active { box-shadow: 0 6rpx 16rpx rgba(20, 184, 166, 0.12); }
.tab.return-tab.active { box-shadow: 0 6rpx 16rpx rgba(249, 115, 22, 0.12); }
.tab.unsettled-tab.active { box-shadow: 0 6rpx 16rpx rgba(239, 68, 68, 0.12); }

.tab:not(.active) { box-shadow: 0 4rpx 10rpx rgba(15, 23, 42, 0.05); }

.pay-type-label,
.print-copies-label,
.return-toggle-label,
.label,
.field-label,
.qty-label,
.card-title {
  font-weight: 700;
}

.section-tip.inline-tip {
  margin: 0;
  text-align: right;
}

.store-trigger {
  border-width: 3rpx !important;
}

.section-tip {
  display: block;
  margin: 6rpx 0 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
}

.info .name,
.preview-name,
.store-trigger-text,
.store-option-name,
.code {
  line-height: 1.5;
}

.stock-preview,
.qty-total,
.preview-banner-text,
.commission-text,
.return-amount-text,
.net-amount-text {
  font-weight: 600;
}

.section:nth-of-type(1),
.section:nth-of-type(2),
.section:nth-of-type(3),
.return-section {
  border-radius: 16rpx;
}

.range-bar {
  border: 2rpx solid #dbe3ee;
}

.sale-card {
  border: 2rpx solid #edf2f7;
}

.card {
  border: 2rpx solid #edf2f7;
}

.range-summary,
.scan-hint,
.stock-hint,
.stock-preview,
.qty-total {
  line-height: 1.7;
}

.btn-detail {
  box-sizing: border-box;
}

.section:nth-of-type(3) .section-tip.inline-tip {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .section:nth-of-type(3) .section-tip.inline-tip {
    white-space: normal;
  }
}

.preview-line {
  align-items: center;
}

.preview-qty,
.preview-price {
  white-space: nowrap;
}

.section:nth-of-type(1) .label,
.section:nth-of-type(1) .section-tip { color: #1d4ed8; }
.section:nth-of-type(2) .label,
.section:nth-of-type(2) .section-tip { color: #047857; }
.section:nth-of-type(3) .label,
.section:nth-of-type(3) .section-tip { color: #ad6800; }
.return-section .section-tip { color: #c2410c; }
.return-section { border-color: #ffccc7 !important; background: #fff8f7; }
.section:nth-of-type(1) { border-color: #bfdbfe; background: #f8fbff; }
.section:nth-of-type(2) { border-color: #c7f0df; background: #f5fcf8; }
.section:nth-of-type(3) { border-color: #ffe58f; background: #fffdf5; }
.preview-banner { background: #f0f9ff; border-color: #91d5ff; }
.preview-banner-text { color: #0050b3; }
.preview-summary { border: 2rpx solid #dbeafe; background: #f8fbff; }
.return-summary { border: 2rpx solid #fed7aa; background: #fff7ed; }
.net-summary { border: 2rpx solid #bbf7d0; background: #f0fdf4; }
.pay-type-section { background: #f8fbff; }
.print-copies-section { background: #f8fafc; }
.return-toggle { background: #fff7ed; }
.btn-create { height: 96rpx !important; }
.btn-settle,
.btn-detail { min-height: 72rpx; }
.pay-type-option,
.print-copies-option { min-width: 120rpx; text-align: center; }
.store-trigger,
.picker.quick-picker,
.picker,
.scan-row input,
.store-search-input { min-height: 88rpx; }
.scan-row input,
.store-search-input,
.qty-input { font-size: 30rpx; }
.store-history-link,
.sort-manage,
.sort-trigger { font-weight: 700; }
.sort-actions,
.sort-actions .picker,
.sort-trigger,
.sort-manage { white-space: nowrap; }

@media (max-width: 480px) {
  .section-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12rpx;
  }
  .sort-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .section-tip.inline-tip {
    display: block;
    width: 100%;
    text-align: left;
    margin-top: 8rpx;
    white-space: normal;
  }
}

@media (min-width: 481px) {
  .section-header {
    gap: 16rpx;
  }
}
.store-search {
  margin-bottom: 16rpx;
}

.store-search-input {
  width: 100%;
  border: 2rpx solid #eee;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.store-distance {
  font-size: 22rpx;
  color: #1890ff;
  margin-left: auto;
  flex-shrink: 0;
}

.return-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 10rpx;
}

.return-toggle-label {
  font-size: 28rpx;
  color: #333;
}

.return-section {
  border: 2rpx solid #ff4d4f;
  border-radius: 16rpx;
}

.return-summary {
  color: #ff4d4f;
}

.net-summary {
  text-align: right;
  padding: 16rpx 10rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.preview-banner {
  background: #fffbe6;
  border: 2rpx solid #ffe58f;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
  text-align: center;
}

.preview-banner-text {
  font-size: 28rpx;
  color: #d48806;
  font-weight: 600;
}

.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.card .row {
  display: flex;
  justify-content: space-between;
  padding: 10rpx 0;
}

.card .label {
  color: #666;
  font-size: 28rpx;
}

.card .value {
  color: #333;
  font-size: 28rpx;
}

.card-title-row {
  margin-bottom: 16rpx;
}

.card-title {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
}

.return-title {
  color: #ff4d4f;
}

.preview-line {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.preview-line:last-child {
  border-bottom: none;
}

.preview-seq {
  width: 60rpx;
  color: #999;
  font-size: 26rpx;
}

.preview-name {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.preview-qty {
  width: 120rpx;
  text-align: right;
  font-size: 26rpx;
  color: #666;
}

.preview-price {
  width: 160rpx;
  text-align: right;
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.preview-summary {
  flex-direction: column;
  gap: 8rpx;
}

.return-amount-text {
  font-size: 26rpx;
  color: #ff4d4f;
}

.net-amount-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
}

.btn-back {
  background: #f5f5f5;
  color: #666;
  border: none;
}

.print-copies-section {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 10rpx;
  margin-bottom: 10rpx;
}

.print-copies-label {
  font-size: 28rpx;
  color: #666;
}

.print-copies-options {
  display: flex;
  gap: 12rpx;
}

.print-copies-option {
  padding: 10rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #ddd;
  font-size: 26rpx;
  color: #666;
}

.print-copies-option.active {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}
</style>
