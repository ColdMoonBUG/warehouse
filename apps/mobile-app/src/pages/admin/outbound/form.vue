<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '出库单详情' : '新增出库单' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view v-if="pageLoading" class="section state-card">
        <text class="field-tip state-text">{{ warehouses.length || products.length ? '基础资料已显示，正在后台刷新...' : '正在加载基础资料...' }}</text>
      </view>

      <view class="section">
        <text class="label">调出仓库</text>
        <picker mode="selector" :range="warehouses" range-key="name" @change="onFromWhChange">
          <view class="picker"><text>{{ fromWhName || '请选择调出仓库' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">调入仓库</text>
        <picker mode="selector" :range="toWarehouses" range-key="name" @change="onToWhChange">
          <view class="picker"><text>{{ toWhName || '请选择调入仓库' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">日期</text>
        <input v-model="form.date" placeholder="YYYY-MM-DD" />
      </view>
      <view class="section">
        <text class="label">备注</text>
        <input v-model="form.remark" placeholder="备注" />
      </view>

      <view class="section">
        <text class="label">商品明细</text>
        <text v-if="fromWarehouse" class="field-tip stock-hint">{{ stockHint }}</text>
        <view class="selector-toolbar">
          <input v-model="keyword" class="search-input" placeholder="搜索商品名称/编码/条码" />
          <picker mode="selector" :range="sortModeOptions" range-key="label" :value="sortModeIndex" @change="onSortModeChange">
            <view class="picker sort-picker"><text>{{ currentSortLabel }}</text></view>
          </picker>
        </view>
        <view class="field quick-pick-field">
          <text class="field-label">快捷选品</text>
          <picker mode="selector" :range="productsWithStock" range-key="displayName" :value="quickPickIndex" :disabled="!quickPickEnabled" @change="onQuickPickChange">
            <view class="field-box picker-box" :class="{ disabled: !quickPickEnabled }"><text>{{ quickPickText }}</text></view>
          </picker>
          <text v-if="!quickPickEnabled" class="field-tip">{{ keyword ? '当前筛选下暂无商品' : '暂无可选商品' }}</text>
        </view>
        <view class="line-card" v-for="(line, index) in lines" :key="index">
          <view class="line-head">
            <text class="line-title">明细 {{ index + 1 }}</text>
            <button class="btn-delete" @tap="removeLine(index)">删除</button>
          </view>
          <view class="field">
            <text class="field-label">商品</text>
            <picker mode="selector" :range="productsWithStock" range-key="displayName" @change="(e) => onProductChange(e, index)">
              <view class="field-box picker-box"><text>{{ productName(line.productId) || '请选择商品' }}</text></view>
            </picker>
          </view>
          <view class="field-grid field-grid-triple">
            <view class="field">
              <text class="field-label">箱数</text>
              <input class="field-box input-box" v-model.number="line.boxQty" type="number" placeholder="0" @blur="syncLineQty(line); triggerAutoSave()" />
            </view>
            <view class="field">
              <text class="field-label">袋数</text>
              <input class="field-box input-box" v-model.number="line.bagQty" type="number" placeholder="0" @blur="syncLineQty(line); triggerAutoSave()" />
            </view>
            <view class="field">
              <text class="field-label">总袋数</text>
              <input class="field-box input-box" v-model.number="line.qty" type="number" placeholder="0" @blur="onQtyChange(line); triggerAutoSave()" />
            </view>
          </view>
          <text v-if="lineSummary(line)" class="field-tip">{{ lineSummary(line) }}</text>
          <text v-if="lineStockPreview(line.productId)" class="field-tip stock-preview">{{ lineStockPreview(line.productId) }}</text>
        </view>
        <button class="btn-add-line" @tap="addLine">+ 添加一行</button>
      </view>

      <view class="actions">
        <button class="btn ghost" :disabled="!form.id || form.status !== 'draft'" @tap="post">过账</button>
        <button class="btn danger" :disabled="!form.id || form.status !== 'posted'" @tap="voidDoc">作废</button>
        <button v-if="form.id && form.status === 'posted'" class="btn warning" @tap="voidAndRebuild">作废重建</button>
        <button class="btn print" :disabled="!form.id || form.status !== 'posted'" @tap="printDoc">打印</button>
      </view>
    </view>
  </view>

  <!-- 打印用隐藏画布 -->
  <scroll-view scroll-x scroll-y style="width:0;height:0;overflow:hidden;">
    <canvas :canvas-id="CANVAS_ID" :style="{ width: PAGE_WIDTH_DOTS + 'px', height: '3508px' }" />
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onLoad, onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getTransferDetail, saveTransfer, postTransfer, voidTransfer, getStock, getProductDetail } from '@/api'
import type { TransferDoc, TransferLine, Product, Warehouse } from '@/types'
import { genId, formatDate, getPageQueryParam, calcQty, deriveBagQty, normalizeBoxPackQty, normalizeCount, formatProductPackageSummary, formatStockPreview, getProductStockQty, toStockQtyMap, formatProductQuickPickLabel } from '@/utils'
import { guardNetwork, serverReachable } from '@/utils/network'
import { printTransferA4, checkPrinterConnected, navigateToPrinterSettings } from '@/utils/bluetooth-printer'
import { CANVAS_ID, PAGE_WIDTH_DOTS } from '@/utils/canvas-print'

type FormLine = TransferLine & { bagQty?: number }
type SortMode = 'custom' | 'stock-desc' | 'name-asc'

const SORT_MODE_KEY = 'wh_admin_outbound_sort_mode'
const CUSTOM_SORT_KEY = 'wh_product_sort_admin_outbound'

const sortModeOptions = [
  { label: '自定义排序', value: 'custom' as SortMode },
  { label: '库存优先', value: 'stock-desc' as SortMode },
  { label: '名称排序', value: 'name-asc' as SortMode },
]

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])
const keyword = ref('')
const sortMode = ref<SortMode>('stock-desc')
const customSortIds = ref<string[]>([])
const lines = ref<FormLine[]>([])
const form = ref<Partial<TransferDoc>>({ fromWarehouseId: 'main', date: formatDate(new Date(), 'YYYY-MM-DD'), status: 'draft' })
const queryId = ref('')
const sourceStockMap = ref<Record<string, number>>({})
const stockLoading = ref(false)
const pageLoading = ref(false)
const activeDraftId = ref('')

interface OutboundDraftPayload {
  version: 1
  savedAt: number
  draftId: string
  form: Partial<TransferDoc>
  lines: FormLine[]
  keyword: string
  sortMode: SortMode
  customSortIds: string[]
}

const OUTBOUND_DRAFT_STORAGE_KEY = 'wh_admin_outbound_draft'
const OUTBOUND_DRAFT_VERSION: OutboundDraftPayload['version'] = 1

let draftHydrating = false
let serverSyncTimer: ReturnType<typeof setTimeout> | null = null
let serverSyncInFlight = false
let serverSyncQueued = false
let lastSyncedSignature = ''

const fromWhName = computed(() => warehouses.value.find(w => w.id === form.value.fromWarehouseId)?.name || '')
const toWhName = computed(() => warehouses.value.find(w => w.id === form.value.toWarehouseId)?.name || '')
const fromWarehouse = computed(() => warehouses.value.find(w => w.id === form.value.fromWarehouseId) || null)
// 调入仓库排除已选的调出仓
const toWarehouses = computed(() => warehouses.value.filter(w => w.id !== form.value.fromWarehouseId))
const stockHint = computed(() => {
  if (stockLoading.value) return '库存加载中'
  return fromWarehouse.value ? `${fromWhName.value}库存已加载` : ''
})

const currentSortLabel = computed(() => sortModeOptions.find(option => option.value === sortMode.value)?.label || '排序')
const sortModeIndex = computed(() => sortModeOptions.findIndex(option => option.value === sortMode.value))

function getDraftOwnerScope() {
  return userStore.currentUser?.accountId || userStore.currentUser?.username || 'guest'
}

function getDraftStorageKey() {
  return `${OUTBOUND_DRAFT_STORAGE_KEY}:${getDraftOwnerScope()}:current`
}

function ensureDraftId() {
  if (!activeDraftId.value) {
    activeDraftId.value = genId()
  }
  return activeDraftId.value
}

function hasMeaningfulDraftContent() {
  const today = formatDate(new Date(), 'YYYY-MM-DD')
  if (activeDraftId.value || form.value.id) return true
  if (form.value.fromWarehouseId && form.value.fromWarehouseId !== 'main') return true
  if (form.value.toWarehouseId) return true
  if ((form.value.date || '') !== today) return true
  if (form.value.remark) return true
  if (keyword.value.trim()) return true
  return lines.value.some(line => {
    return !!line.productId || normalizeCount(line.boxQty) > 0 || normalizeCount(line.bagQty) > 0 || normalizeCount(line.qty) > 0
  })
}

function buildDraftPayload(): OutboundDraftPayload | null {
  if (form.value.status && form.value.status !== 'draft') return null
  if (!hasMeaningfulDraftContent()) return null
  const draftId = ensureDraftId()
  return {
    version: OUTBOUND_DRAFT_VERSION,
    savedAt: Date.now(),
    draftId,
    form: {
      ...form.value,
      id: form.value.id || '',
      status: form.value.status || 'draft',
    },
    lines: lines.value.map(line => ({
      id: line.id || '',
      productId: line.productId || '',
      boxQty: normalizeCount(line.boxQty),
      bagQty: normalizeCount(line.bagQty),
      qty: normalizeCount(line.qty),
    })),
    keyword: keyword.value,
    sortMode: sortMode.value,
    customSortIds: [...customSortIds.value],
  }
}

function clearDraftCache() {
  try {
    uni.removeStorageSync(getDraftStorageKey())
  } catch {
    // ignore
  }
  activeDraftId.value = ''
  lastSyncedSignature = ''
  if (serverSyncTimer) {
    clearTimeout(serverSyncTimer)
    serverSyncTimer = null
  }
  serverSyncQueued = false
  serverSyncInFlight = false
}

function persistDraftLocally() {
  if (draftHydrating) return
  const payload = buildDraftPayload()
  if (!payload) {
    clearDraftCache()
    return
  }
  try {
    uni.setStorageSync(getDraftStorageKey(), JSON.stringify(payload))
  } catch (e) {
    console.error('[outbound] 本地草稿保存失败:', e)
  }
}

function draftSignature(payload: OutboundDraftPayload) {
  return JSON.stringify({
    draftId: payload.draftId,
    fromWarehouseId: payload.form.fromWarehouseId || '',
    toWarehouseId: payload.form.toWarehouseId || '',
    date: payload.form.date || '',
    remark: payload.form.remark || '',
    status: payload.form.status || 'draft',
    keyword: payload.keyword || '',
    sortMode: payload.sortMode,
    customSortIds: payload.customSortIds,
    lines: payload.lines.map(line => ({
      id: line.id || '',
      productId: line.productId || '',
      boxQty: normalizeCount(line.boxQty),
      bagQty: normalizeCount(line.bagQty),
      qty: normalizeCount(line.qty),
    })),
  })
}

function scheduleServerSync() {
  if (draftHydrating) return
  if (serverSyncTimer) {
    clearTimeout(serverSyncTimer)
  }
  serverSyncTimer = setTimeout(() => {
    serverSyncTimer = null
    void syncDraftToServer()
  }, 700)
}

async function syncDraftToServer(): Promise<boolean> {
  if (serverSyncInFlight) {
    serverSyncQueued = true
    return false
  }
  if (serverReachable.value === false) {
    return false
  }

  const payload = buildDraftPayload()
  if (!payload) return false
  if (!payload.form.fromWarehouseId || !payload.form.toWarehouseId) return false
  if (payload.form.fromWarehouseId === payload.form.toWarehouseId) return false

  const submitLines = payload.lines.map(line => toSubmitLine(line))
  if (!submitLines.some(line => line.productId)) return false

  const signature = draftSignature(payload)
  if (signature === lastSyncedSignature) return true

  serverSyncInFlight = true
  try {
    const serverDoc = {
      id: payload.draftId,
      code: payload.form.code || '',
      fromWarehouseId: payload.form.fromWarehouseId || '',
      toWarehouseId: payload.form.toWarehouseId || '',
      date: payload.form.date || formatDate(new Date(), 'YYYY-MM-DD'),
      remark: payload.form.remark || '',
      status: 'draft',
      lines: [],
    }
    const saved = await saveTransfer({ ...serverDoc, lines: submitLines } as TransferDoc, submitLines)

    if (saved?.id) {
      form.value = {
        ...form.value,
        id: saved.id,
        code: saved.code || form.value.code || '',
      }
      activeDraftId.value = saved.id
    }

    lastSyncedSignature = signature
    persistDraftLocally()
    return true
  } catch (e) {
    console.warn('[outbound] 草稿同步失败，保留本地缓存:', e)
    return false
  } finally {
    serverSyncInFlight = false
    if (serverSyncQueued) {
      serverSyncQueued = false
      void syncDraftToServer()
    }
  }
}

function triggerAutoSave() {
  persistDraftLocally()
  scheduleServerSync()
}

function productById(id: string) {
  return products.value.find(product => product.id === id)
}

function productPackQty(productId: string) {
  return normalizeBoxPackQty(productById(productId)?.boxQty)
}

function normalizeLine(line?: Partial<FormLine>): FormLine {
  const productId = line?.productId || ''
  const boxQty = normalizeCount(line?.boxQty)
  const qty = normalizeCount(line?.qty)
  const bagQty = deriveBagQty(qty, boxQty, productPackQty(productId))
  return { id: line?.id || '', productId, boxQty, bagQty, qty }
}

function syncLineQty(line: FormLine) {
  line.boxQty = normalizeCount(line.boxQty)
  line.bagQty = normalizeCount(line.bagQty)
  line.qty = calcQty(line.boxQty, line.bagQty, productPackQty(line.productId))
}

function onQtyChange(line: FormLine) {
  line.qty = Math.max(0, Math.floor(Number(line.qty) || 0))
  const pack = productPackQty(line.productId)
  line.boxQty = Math.floor(line.qty / pack)
  line.bagQty = line.qty - line.boxQty * pack
}

function toSubmitLine(line: FormLine): TransferLine {
  syncLineQty(line)
  return { id: line.id, productId: line.productId, boxQty: normalizeCount(line.boxQty), qty: normalizeCount(line.qty) }
}

function lineSummary(line: FormLine) {
  const product = productById(line.productId)
  if (!product) return ''
  const boxQty = normalizeCount(line.boxQty)
  const bagQty = normalizeCount(line.bagQty)
  const qty = calcQty(boxQty, bagQty, product.boxQty)
  return formatProductPackageSummary(product, qty, boxQty)
}

function lineStockPreview(productId?: string) {
  return formatStockPreview([
    { label: '调出仓', qty: getProductStockQty(sourceStockMap.value, productId), hidden: !fromWarehouse.value },
  ])
}

async function refreshStockPreview() {
  const warehouseId = form.value.fromWarehouseId
  if (!warehouseId) { sourceStockMap.value = {}; return }
  
  stockLoading.value = true
  try {
    const stockList = await getStock(warehouseId)
    sourceStockMap.value = toStockQtyMap(stockList)
  } catch (e: any) {
    console.error('[outbound] 加载库存失败:', e)
    sourceStockMap.value = {}
    // 如果主仓库加载失败，尝试重新加载
    if (warehouseId === 'main') {
      uni.showToast({ title: '主仓库库存加载失败，请稍后重试', icon: 'none' })
    }
  } finally {
    stockLoading.value = false
  }
}

async function ensureProductsLoaded(ids: string[]) {
  const missingIds = [...new Set(ids)].filter(id => id && !products.value.some(product => product.id === id))
  if (!missingIds.length) return
  const missingProducts = await Promise.all(missingIds.map(id => getProductDetail(id)))
  products.value = [...products.value, ...(missingProducts.filter(Boolean) as Product[])]
}

async function applyDoc(doc: TransferDoc) {
  activeDraftId.value = doc.id || activeDraftId.value
  form.value = { ...doc }
  await ensureProductsLoaded((doc.lines || []).map(line => line.productId))
  lines.value = (doc.lines || []).map(line => normalizeLine(line))
  if (doc.status !== 'draft') {
    clearDraftCache()
  }
}

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function compareByCustomSort(left: Product, right: Product) {
  const leftIndex = customSortIds.value.indexOf(left.id)
  const rightIndex = customSortIds.value.indexOf(right.id)
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
  if (leftIndex >= 0) return -1
  if (rightIndex >= 0) return 1
  return left.name.localeCompare(right.name, 'zh-CN')
}

const filteredProducts = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  const list = products.value.filter(product => {
    if (!key) return true
    return [product.name, product.code, product.barcode].some(value => (value || '').toLowerCase().includes(key))
  })

  if (sortMode.value === 'name-asc') {
    return [...list].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }

  if (sortMode.value === 'stock-desc') {
    const stockMap = sourceStockMap.value
    return [...list].sort((left, right) => {
      const leftStock = stockMap[left.id] || 0
      const rightStock = stockMap[right.id] || 0
      if (leftStock === rightStock) return left.name.localeCompare(right.name, 'zh-CN')
      return rightStock - leftStock
    })
  }

  return [...list].sort(compareByCustomSort)
})

const productsWithStock = computed(() => {
  const stockMap = sourceStockMap.value
  return filteredProducts.value.map(product => {
    const stock = stockMap[product.id] || 0
    const displayName = formatProductQuickPickLabel(product, stock, product.boxQty)
    return { ...product, displayName }
  })
})

const quickPickEnabled = computed(() => productsWithStock.value.length > 0)
const quickPickIndex = computed(() => -1)
const quickPickText = computed(() => {
  if (!quickPickEnabled.value) return keyword.value ? '当前筛选下暂无商品' : '暂无可选商品'
  return '快捷选择商品'
})

function loadSortPreference() {
  try {
    const savedMode = uni.getStorageSync(SORT_MODE_KEY)
    if (savedMode && sortModeOptions.some(option => option.value === savedMode)) {
      sortMode.value = savedMode as SortMode
    }
  } catch {
    // ignore
  }
  try {
    const savedIds = uni.getStorageSync(CUSTOM_SORT_KEY)
    customSortIds.value = Array.isArray(savedIds) ? savedIds : []
  } catch {
    customSortIds.value = []
  }
}

function onSortModeChange(e: any) {
  sortMode.value = sortModeOptions[Number(e.detail.value)]?.value || 'custom'
  try {
    uni.setStorageSync(SORT_MODE_KEY, sortMode.value)
  } catch {
    // ignore
  }
}

function addLine(productId: string = '') {
  const nextLine = normalizeLine({ id: '', productId, qty: 0, boxQty: 0 })
  if (productId) {
    syncLineQty(nextLine)
    lines.value.unshift(nextLine)
  } else {
    lines.value.push(nextLine)
  }
  triggerAutoSave()
}

function removeLine(index: number) {
  lines.value.splice(index, 1)
  triggerAutoSave()
}

function onFromWhChange(e: any) {
  const index = Number(e.detail.value)
  form.value.fromWarehouseId = warehouses.value[index]?.id || ''
  // 如果调入仓和新选调出仓相同，清空调入仓
  if (form.value.toWarehouseId === form.value.fromWarehouseId) {
    form.value.toWarehouseId = ''
  }
  // 立即加载新仓库的库存
  uni.showLoading({ title: '加载库存中...' })
  refreshStockPreview().finally(() => {
    uni.hideLoading()
  })
  triggerAutoSave()
}

function onToWhChange(e: any) {
  const index = Number(e.detail.value)
  form.value.toWarehouseId = toWarehouses.value[index]?.id || ''
  triggerAutoSave()
}

function onProductChange(e: any, index: number) {
  const productIndex = Number(e.detail.value)
  lines.value[index].productId = productsWithStock.value[productIndex]?.id || ''
  syncLineQty(lines.value[index])
  if (index !== 0) {
    const [moved] = lines.value.splice(index, 1)
    lines.value.unshift(moved)
  }
  triggerAutoSave()
}

function onQuickPickChange(e: any) {
  const productIndex = Number(e.detail.value)
  const productId = productsWithStock.value[productIndex]?.id || ''
  if (!productId) return
  addLine(productId)
}

function productName(id: string) {
  return productById(id)?.name || ''
}

function restoreDraftFromStorage(expectedDraftId = '') {
  try {
    const raw = uni.getStorageSync(getDraftStorageKey())
    if (!raw) return false
    const payload = JSON.parse(raw) as OutboundDraftPayload
    if (!payload || payload.version !== OUTBOUND_DRAFT_VERSION) return false
    if (payload.form?.status && payload.form.status !== 'draft') {
      clearDraftCache()
      return false
    }
    const draftId = payload.draftId || payload.form?.id || ''
    if (expectedDraftId && draftId !== expectedDraftId && payload.form?.id !== expectedDraftId) {
      return false
    }

    draftHydrating = true
    activeDraftId.value = draftId || expectedDraftId || ''
    form.value = {
      ...form.value,
      ...payload.form,
      id: payload.form?.id || payload.draftId || '',
      status: payload.form?.status || 'draft',
    }
    keyword.value = payload.keyword || ''
    if (sortModeOptions.some(option => option.value === payload.sortMode)) {
      sortMode.value = payload.sortMode
    }
    customSortIds.value = Array.isArray(payload.customSortIds) ? [...payload.customSortIds] : []
    lines.value = Array.isArray(payload.lines) ? payload.lines.map(line => normalizeLine(line)) : []
    return true
  } catch (e) {
    console.warn('[outbound] 读取本地草稿失败:', e)
    clearDraftCache()
    return false
  } finally {
    draftHydrating = false
  }
}

async function loadEdit(id: string) {
  if (restoreDraftFromStorage(id)) return
  const doc = await getTransferDetail(id)
  if (doc) {
    await applyDoc(doc)
    if (doc.status === 'draft') {
      persistDraftLocally()
    }
  }
}

async function post() {
  if (!(await guardNetwork('过账出库单'))) return
  persistDraftLocally()
  if (!form.value.fromWarehouseId || !form.value.toWarehouseId) {
    uni.showToast({ title: '请选择调出和调入仓库', icon: 'none' })
    return
  }
  if (form.value.fromWarehouseId === form.value.toWarehouseId) {
    uni.showToast({ title: '调出仓库和调入仓库不能相同', icon: 'none' })
    return
  }
  // 校验是否有商品明细
  const validLines = lines.value.filter(l => l.productId)
  if (validLines.length === 0) {
    uni.showToast({ title: '请添加商品明细', icon: 'none' })
    return
  }
  // 校验商品数量是否都大于0
  const zeroQtyLines = validLines.filter(l => !l.qty || l.qty <= 0)
  if (zeroQtyLines.length > 0) {
    const names = zeroQtyLines.map(l => productName(l.productId)).filter(Boolean).join('、')
    uni.showToast({ title: `商品数量不能为0：${names || '部分商品'}`, icon: 'none', duration: 3000 })
    return
  }
  // 校验库存是否充足
  for (const line of validLines) {
    const stock = sourceStockMap.value[line.productId] || 0
    if (stock < (line.qty || 0)) {
      const name = productName(line.productId) || line.productId
      uni.showModal({
        title: '库存不足',
        content: `商品「${name}」调出仓库存不足（当前: ${stock}袋，需: ${line.qty}袋）`,
        showCancel: false,
      })
      return
    }
  }

  if (!(await syncDraftToServer())) {
    uni.showToast({ title: '草稿尚未同步到服务器，请稍后重试', icon: 'none' })
    return
  }
  if (!form.value.id) {
    uni.showToast({ title: '请先保存单据', icon: 'none' })
    return
  }
  
  uni.showLoading({ title: '正在过账...' })
  try {
    await postTransfer(form.value.id)
    const doc = await getTransferDetail(form.value.id).catch(() => null)
    if (doc) {
      await applyDoc(doc)
    } else {
      form.value = { ...form.value, status: 'posted' }
      clearDraftCache()
    }
    uni.hideLoading()
    uni.showToast({ title: '已过账', icon: 'success' })
  } catch (e: any) {
    uni.hideLoading()
    const msg = e?.message || '过账失败'
    uni.showModal({
      title: '过账失败',
      content: msg,
      showCancel: false,
    })
  }
}

async function voidDoc() {
  if (!form.value.id) return
  if (!(await guardNetwork('作废出库单'))) return
  uni.showModal({
    title: '确认作废',
    content: '作废后库存将自动反冲，此操作不可撤销。',
    confirmText: '确认作废',
    confirmColor: '#ff4d4f',
    success: async (res) => {
      if (!res.confirm) return
      await voidTransfer(form.value.id!)
      const doc = await getTransferDetail(form.value.id!).catch(() => null)
      if (doc) {
        await applyDoc(doc)
      } else {
        form.value = { ...form.value, status: 'voided' }
        clearDraftCache()
      }
      uni.showToast({ title: '已作废', icon: 'success' })
    },
  })
}

async function voidAndRebuild() {
  if (!form.value.id) return
  if (!(await guardNetwork('作废并重建出库单'))) return
  uni.showModal({
    title: '作废并重建',
    content: '将作废当前单据（库存反冲），并以相同内容新建一张草稿单，方便修改后重新过账。',
    confirmText: '确认',
    success: async (res) => {
      if (!res.confirm) return
      const oldFrom = form.value.fromWarehouseId
      const oldTo = form.value.toWarehouseId
      const oldRemark = form.value.remark
      const oldCode = form.value.code
      const oldLines = lines.value.map(l => ({ id: '', productId: l.productId, boxQty: l.boxQty || 0, qty: l.qty || 0 }))
      await voidTransfer(form.value.id!)
      uni.showToast({ title: '原单已作废，正在创建草稿…', icon: 'none' })
      try {
        const newDoc = {
          fromWarehouseId: oldFrom,
          toWarehouseId: oldTo,
          date: formatDate(new Date(), 'YYYY-MM-DD'),
          remark: oldRemark ? `[重建自${oldCode}] ${oldRemark}` : `[重建自${oldCode}]`,
          status: 'draft',
          lines: [],
        } as any
        const saved = await saveTransfer(newDoc, oldLines as any)
        if (saved) {
          await applyDoc(saved as any)
          uni.showToast({ title: '草稿已创建，请确认后过账', icon: 'success' })
        }
      } catch (e: any) {
        uni.showToast({ title: `创建草稿失败: ${e.message || ''}`, icon: 'none' })
      }
    },
  })
}

async function printDoc() {
  if (!form.value.id) return
  const printer = checkPrinterConnected()
  if (!printer) {
    uni.showModal({
      title: '未连接打印机',
      content: '请先到设置中的蓝牙打印页面连接打印机。',
      confirmText: '去连接',
      success: (res) => { if (res.confirm) navigateToPrinterSettings() },
    })
    return
  }
  try {
    uni.showLoading({ title: '打印中...' })
    const fromName = fromWhName.value || form.value.fromWarehouseId || '-'
    const toName = toWhName.value || form.value.toWarehouseId || '-'
    // 用当前页面显示的顺序打印，不重新从后端拉（避免顺序乱）
    const docWithCurrentLines = { ...form.value, lines: lines.value.map(toSubmitLine) } as any
    await printTransferA4(docWithCurrentLines, fromName, toName, products.value)
    uni.hideLoading()
    uni.showToast({ title: '打印指令已发送', icon: 'success' })
  } catch (e: any) {
    uni.hideLoading()
    uni.showToast({ title: `打印失败: ${e.message || ''}`, icon: 'none', duration: 3000 })
  }
}

function goBack() {
  persistDraftLocally()
  uni.navigateBack()
}

function flushDraftState() {
  persistDraftLocally()
  if (serverSyncTimer) {
    clearTimeout(serverSyncTimer)
    serverSyncTimer = null
  }
}

watch(
  [form, lines, keyword, sortMode, customSortIds],
  () => {
    if (draftHydrating) return
    triggerAutoSave()
  },
  { deep: true }
)

watch(serverReachable, (reachable) => {
  if (reachable && !draftHydrating && hasMeaningfulDraftContent()) {
    scheduleServerSync()
  }
})

onShow(() => {
  if (!draftHydrating && hasMeaningfulDraftContent()) {
    triggerAutoSave()
  }
})

onHide(() => {
  flushDraftState()
})

onUnload(() => {
  flushDraftState()
})

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  if (!guard()) return
  referenceStore.hydrate()
  warehouses.value = [...referenceStore.warehouses]
  products.value = [...referenceStore.products]
  loadSortPreference()

  pageLoading.value = true
  try {
    await referenceStore.preloadCore()
    warehouses.value = [...referenceStore.warehouses]
    products.value = [...referenceStore.products]
  } catch {
    warehouses.value = [...referenceStore.warehouses]
    products.value = [...referenceStore.products]
  } finally {
    pageLoading.value = false
  }

  if (queryId.value) {
    await loadEdit(queryId.value)
  } else {
    restoreDraftFromStorage()
  }
  
  // 加载库存时增加重试机制
  const maxRetries = 3
  for (let i = 0; i < maxRetries; i++) {
    try {
      await refreshStockPreview()
      break // 成功则跳出循环
    } catch (e) {
      if (i === maxRetries - 1) {
        console.error('[outbound] 库存加载失败，重试结束')
        uni.showToast({ title: '库存加载失败，请稍后重试', icon: 'none' })
      } else {
        console.log(`[outbound] 库存加载失败，第${i + 1}次重试`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))) // 指数退避
      }
    }
  }
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.section { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.label { display:block; font-size:26rpx; color:#666; margin-bottom:10rpx; }
.picker { padding: 16rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:28rpx; margin-bottom: 12rpx; background:#fff; }
.selector-toolbar { display:flex; gap:16rpx; align-items:center; margin:16rpx 0; }
.search-input { flex:1; min-height:80rpx; padding:0 20rpx; border:2rpx solid #dbe3ee; border-radius:12rpx; background:#fff; font-size:28rpx; color:#333; }
.sort-picker { min-width:220rpx; margin-bottom:0; }
.quick-pick-field { margin-bottom:16rpx; }
.field-box.disabled { color:#999; background:#f7f7f7; }
.line-card { background:#f8fafc; border:2rpx solid #eef2f7; border-radius:16rpx; padding:20rpx; margin-bottom:20rpx; }
.line-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16rpx; }
.line-title { font-size:26rpx; font-weight:600; color:#333; }
.field { margin-bottom:16rpx; }
.field:last-child { margin-bottom:0; }
.field-label { display:block; font-size:24rpx; color:#666; margin-bottom:10rpx; }
.field-grid { display:flex; flex-wrap:wrap; gap:16rpx; }
.field-grid .field { flex:1; min-width:200rpx; }
.field-grid-triple .field { min-width:180rpx; }
.field-box { width:100%; min-height:80rpx; box-sizing:border-box; background:#fff; border:2rpx solid #dbe3ee; border-radius:12rpx; padding:0 20rpx; font-size:28rpx; color:#333; display:flex; align-items:center; }
.picker-box text { width:100%; color:#333; }
.input-box { display:block; padding:0 20rpx; line-height:80rpx; margin-bottom:0; }
.field-tip { display:block; margin-top:4rpx; font-size:22rpx; color:#64748b; }
.state-card { text-align:center; }
input { font-size:28rpx; margin-bottom: 10rpx; }
.stock-hint, .stock-preview, .state-text { color:#1890ff; }
.btn-delete { min-width:108rpx; height:60rpx; padding:0 20rpx; background:#fff1f0; color:#ff4d4f; border-radius:999rpx; font-size:24rpx; line-height:60rpx; border:none; }
.btn-add-line { width:100%; height:80rpx; background:#eef6ff; color:#1890ff; border-radius:12rpx; font-size:28rpx; border:2rpx dashed #b5d4ff; }
.btn-add-line::after { border:none; }
.actions { display:flex; gap:12rpx; }
.btn { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:30rpx; border:none; }
.btn.ghost { background:#f0f0f0; color:#333; }
.btn.danger { background:#ff4d4f; }
.btn.print { background:#52c41a; }
</style>
