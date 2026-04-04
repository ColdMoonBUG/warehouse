<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '出库单详情' : '新增出库单' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view v-if="pageLoading" class="section state-card">
        <text class="field-tip state-text">{{ salespersons.length || products.length || warehouses.length ? '基础资料已显示，正在后台刷新...' : '正在加载基础资料...' }}</text>
      </view>

      <view class="section">
        <text class="label">业务员</text>
        <picker mode="selector" :range="salespersons" range-key="displayName" @change="onSalespersonChange">
          <view class="picker"><text>{{ salespersonName || '请选择业务员' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">出库仓库</text>
        <picker mode="selector" :range="warehouses" range-key="name" @change="onWarehouseChange">
          <view class="picker"><text>{{ warehouseName || '请选择仓库' }}</text></view>
        </picker>
        <text v-if="form.warehouseId || targetVehicleWarehouse" class="field-tip stock-hint">{{ stockHint }}</text>
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
        <view class="line-card" v-for="(l, i) in lines" :key="i">
          <view class="line-head">
            <text class="line-title">明细 {{ i + 1 }}</text>
            <button class="btn-delete" @tap="removeLine(i)">删除</button>
          </view>
          <view class="field">
            <text class="field-label">商品</text>
            <picker mode="selector" :range="products" range-key="name" @change="(e)=>onProductChange(e,i)">
              <view class="field-box picker-box"><text>{{ productName(l.productId) || '请选择商品' }}</text></view>
            </picker>
          </view>
          <view class="field-grid field-grid-triple">
            <view class="field">
              <text class="field-label">箱数</text>
              <input class="field-box input-box" v-model.number="l.boxQty" type="number" placeholder="0" @blur="syncLineQty(l)" />
            </view>
            <view class="field">
              <text class="field-label">袋数</text>
              <input class="field-box input-box" v-model.number="l.bagQty" type="number" placeholder="0" @blur="syncLineQty(l)" />
            </view>
            <view class="field">
              <text class="field-label">单价</text>
              <input class="field-box input-box" v-model.number="l.price" type="number" placeholder="请输入单价" @blur="syncLineQty(l)" />
            </view>
          </view>
          <text v-if="lineSummary(l)" class="field-tip">{{ lineSummary(l) }}</text>
          <text v-if="lineStockPreview(l.productId)" class="field-tip stock-preview">{{ lineStockPreview(l.productId) }}</text>
        </view>
        <button class="btn-add-line" @tap="addLine">+ 添加一行</button>
      </view>

      <view class="actions">
        <button class="btn" @tap="save">保存</button>
        <button class="btn ghost" :disabled="!form.id || form.status!=='draft'" @tap="post">过账</button>
        <button class="btn danger" :disabled="!form.id || form.status!=='posted'" @tap="voidDoc">作废</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useReferenceStore } from '@/store/reference'
import { getOutboundDetail, saveOutbound, postOutbound, voidOutbound, getStock, getProductDetail, isSameSalespersonId } from '@/api'
import type { OutboundDoc, OutboundLine, Product, Warehouse, Salesperson, StockItem } from '@/types'
import { formatDate, getPageQueryParam, calcQty, deriveBagQty, normalizeBoxPackQty, normalizeCount, formatProductPackageSummary, formatStockPreview, getProductStockQty, toStockQtyMap } from '@/utils'

type FormLine = OutboundLine & { bagQty?: number }

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const salespersons = ref<Salesperson[]>([])
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])
const lines = ref<FormLine[]>([])
const form = ref<Partial<OutboundDoc>>({ date: formatDate(new Date(), 'YYYY-MM-DD'), status: 'draft' })
const queryId = ref('')
const sourceStockMap = ref<Record<string, number>>({})
const targetStockMap = ref<Record<string, number>>({})
const stockLoading = ref(false)
const pageLoading = ref(false)

const salespersonName = computed(() => salespersons.value.find(item => isSameSalespersonId(item.salespersonId || item.id, form.value.salespersonId))?.displayName || '')
const warehouseName = computed(() => warehouses.value.find(w => w.id === form.value.warehouseId)?.name || '')
const targetVehicleWarehouse = computed(() => {
  const salespersonId = form.value.salespersonId
  if (!salespersonId) return null
  return warehouses.value.find(w => w.type === 'vehicle' && isSameSalespersonId(w.salespersonId, salespersonId)) || null
})
const stockHint = computed(() => {
  if (stockLoading.value) return '库存加载中'
  return targetVehicleWarehouse.value ? '已显示出库仓和车库库存' : '已显示出库仓库存'
})

function productById(id: string) {
  return products.value.find(p => p.id === id)
}

function productPackQty(productId: string) {
  return normalizeBoxPackQty(productById(productId)?.boxQty)
}

function normalizeLine(line?: Partial<FormLine>): FormLine {
  const productId = line?.productId || ''
  const boxQty = normalizeCount(line?.boxQty)
  const qty = normalizeCount(line?.qty)
  const bagQty = deriveBagQty(qty, boxQty, productPackQty(productId))
  return {
    id: line?.id || '',
    productId,
    boxQty,
    bagQty,
    qty,
    price: Number(line?.price || 0),
  }
}

function syncLineQty(line: FormLine) {
  line.boxQty = normalizeCount(line.boxQty)
  line.bagQty = normalizeCount(line.bagQty)
  line.qty = calcQty(line.boxQty, line.bagQty, productPackQty(line.productId))
}

function toSubmitLine(line: FormLine): OutboundLine {
  syncLineQty(line)
  return {
    id: line.id,
    productId: line.productId,
    boxQty: normalizeCount(line.boxQty),
    qty: normalizeCount(line.qty),
    price: Number(line.price || 0),
  }
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
    { label: '出库仓', qty: getProductStockQty(sourceStockMap.value, productId), hidden: !form.value.warehouseId },
    { label: '车库', qty: getProductStockQty(targetStockMap.value, productId), hidden: !targetVehicleWarehouse.value },
  ])
}

async function refreshStockPreview() {
  if (!form.value.warehouseId && !targetVehicleWarehouse.value) {
    sourceStockMap.value = {}
    targetStockMap.value = {}
    return
  }
  stockLoading.value = true
  try {
    const requests: Array<Promise<StockItem[]>> = []
    if (form.value.warehouseId) requests.push(getStock(form.value.warehouseId))
    if (targetVehicleWarehouse.value && targetVehicleWarehouse.value.id !== form.value.warehouseId) {
      requests.push(getStock(targetVehicleWarehouse.value.id))
    }
    const [sourceStock = [], targetStock = []] = await Promise.all(requests)
    sourceStockMap.value = toStockQtyMap(sourceStock)
    targetStockMap.value = targetVehicleWarehouse.value?.id === form.value.warehouseId
      ? { ...sourceStockMap.value }
      : toStockQtyMap(targetStock)
  } finally {
    stockLoading.value = false
  }
}

async function ensureSalespersonLoaded(id?: string) {
  if (!id || salespersons.value.some(item => isSameSalespersonId(item.salespersonId || item.id, id))) return
  const list = await getSalespersonAccounts(true)
  const salesperson = list.find(item => isSameSalespersonId(item.salespersonId || item.id, id))
  if (salesperson) salespersons.value = [...salespersons.value, salesperson]
}

async function ensureProductsLoaded(ids: string[]) {
  const missingIds = [...new Set(ids)].filter(id => id && !products.value.some(p => p.id === id))
  if (!missingIds.length) return
  const missingProducts = await Promise.all(missingIds.map(id => getProductDetail(id)))
  products.value = [...products.value, ...(missingProducts.filter(Boolean) as Product[])]
}

async function applyDoc(doc: OutboundDoc) {
  form.value = { ...doc }
  await Promise.all([
    ensureSalespersonLoaded(doc.salespersonId),
    ensureProductsLoaded((doc.lines || []).map(line => line.productId)),
  ])
  lines.value = (doc.lines || []).map(line => normalizeLine(line))
}

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function addLine() {
  lines.value.push(normalizeLine({ id: '', productId: '', qty: 0, price: 0, boxQty: 0 }))
}

function removeLine(i: number) {
  lines.value.splice(i, 1)
}

function onSalespersonChange(e: any) {
  const idx = Number(e.detail.value)
  const salesperson = salespersons.value[idx]
  form.value.salespersonId = salesperson?.salespersonId || salesperson?.id || ''
  refreshStockPreview()
}

function onWarehouseChange(e: any) {
  const idx = Number(e.detail.value)
  form.value.warehouseId = warehouses.value[idx]?.id
  refreshStockPreview()
}

function onProductChange(e: any, i: number) {
  const idx = Number(e.detail.value)
  lines.value[i].productId = products.value[idx]?.id || ''
  syncLineQty(lines.value[i])
}

function productName(id: string) {
  return productById(id)?.name || ''
}

async function loadEdit(id: string) {
  const doc = await getOutboundDetail(id)
  if (!doc) return
  await applyDoc(doc)
}

async function save() {
  if (!form.value.salespersonId || !form.value.warehouseId) {
    uni.showToast({ title: '请选择业务员与仓库', icon: 'none' })
    return
  }
  if (lines.value.length === 0) {
    uni.showToast({ title: '请添加明细', icon: 'none' })
    return
  }
  const submitLines = lines.value.map(toSubmitLine)
  await saveOutbound(form.value as OutboundDoc, submitLines)
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

async function post() {
  if (!form.value.id) return
  await postOutbound(form.value.id)
  const doc = await getOutboundDetail(form.value.id)
  if (doc) await applyDoc(doc)
  uni.showToast({ title: '已过账', icon: 'success' })
}

async function voidDoc() {
  if (!form.value.id) return
  await voidOutbound(form.value.id)
  const doc = await getOutboundDetail(form.value.id)
  if (doc) await applyDoc(doc)
  uni.showToast({ title: '已作废', icon: 'success' })
}

function goBack() {
  uni.navigateBack()
}

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  if (!guard()) return

  referenceStore.hydrate()
  salespersons.value = [...referenceStore.allSalespersons]
  warehouses.value = [...referenceStore.warehouses]
  products.value = [...referenceStore.products]

  pageLoading.value = true
  try {
    await Promise.all([
      referenceStore.preloadCore(),
      referenceStore.preloadAllAccounts(),
    ])
    salespersons.value = [...referenceStore.allSalespersons]
    warehouses.value = [...referenceStore.warehouses]
    products.value = [...referenceStore.products]
  } catch (e: any) {
    salespersons.value = [...referenceStore.allSalespersons]
    warehouses.value = [...referenceStore.warehouses]
    products.value = [...referenceStore.products]
    if (salespersons.value.length || warehouses.value.length || products.value.length) {
      uni.showToast({ title: '基础资料刷新失败，已显示缓存', icon: 'none' })
    } else {
      uni.showToast({ title: e.message || '基础资料加载失败', icon: 'none' })
    }
  } finally {
    pageLoading.value = false
  }

  if (queryId.value) await loadEdit(queryId.value)
  if (lines.value.length === 0) addLine()
  await refreshStockPreview()
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
.stock-hint,
.stock-preview,
.state-text { color:#1890ff; }
.btn-delete { min-width:108rpx; height:60rpx; padding:0 20rpx; background:#fff1f0; color:#ff4d4f; border-radius:999rpx; font-size:24rpx; line-height:60rpx; border:none; }
.btn-add-line { width:100%; height:80rpx; background:#eef6ff; color:#1890ff; border-radius:12rpx; font-size:28rpx; border:2rpx dashed #b5d4ff; }
.btn-add-line::after { border:none; }
.actions { display:flex; gap:12rpx; }
.btn { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:30rpx; border:none; }
.btn.ghost { background:#f0f0f0; color:#333; }
.btn.danger { background:#ff4d4f; }
</style>
