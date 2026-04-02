<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '入库单详情' : '新增入库单' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="section">
        <text class="label">供应商</text>
        <picker mode="selector" :range="suppliers" range-key="name" @change="onSupplierChange">
          <view class="picker"><text>{{ supplierName || '请选择供应商' }}</text></view>
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
              <input class="field-box input-box" v-model.number="l.price" type="number" placeholder="请输入单价" />
            </view>
          </view>
          <text v-if="lineSummary(l)" class="field-tip">{{ lineSummary(l) }}</text>
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
import { useUserStore } from '@/store/user'
import { getInboundDetail, saveInbound, postInbound, voidInbound, getSuppliers, getProducts, getSupplierDetail, getProductDetail } from '@/api'
import type { InboundDoc, InboundLine, Supplier, Product } from '@/types'
import { formatDate, getPageQueryParam, calcQty, deriveBagQty, normalizeBoxPackQty, normalizeCount, formatProductPackageSummary } from '@/utils'

type FormLine = InboundLine & { bagQty?: number }

const userStore = useUserStore()
const suppliers = ref<Supplier[]>([])
const products = ref<Product[]>([])
const lines = ref<FormLine[]>([])
const form = ref<Partial<InboundDoc>>({ date: formatDate(new Date(), 'YYYY-MM-DD'), status: 'draft' })
const queryId = ref('')

const supplierName = computed(() => suppliers.value.find(s => s.id === form.value.supplierId)?.name || '')

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
    mfgDate: line?.mfgDate,
    expDate: line?.expDate,
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

function toSubmitLine(line: FormLine): InboundLine {
  syncLineQty(line)
  return {
    id: line.id,
    productId: line.productId,
    mfgDate: line.mfgDate,
    expDate: line.expDate,
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

async function ensureSupplierLoaded(id?: string) {
  if (!id || suppliers.value.some(s => s.id === id)) return
  const supplier = await getSupplierDetail(id)
  if (supplier) suppliers.value = [...suppliers.value, supplier]
}

async function ensureProductsLoaded(ids: string[]) {
  const missingIds = [...new Set(ids)].filter(id => id && !products.value.some(p => p.id === id))
  if (!missingIds.length) return
  const missingProducts = await Promise.all(missingIds.map(id => getProductDetail(id)))
  products.value = [...products.value, ...(missingProducts.filter(Boolean) as Product[])]
}

async function applyDoc(doc: InboundDoc) {
  form.value = { ...doc }
  await Promise.all([
    ensureSupplierLoaded(doc.supplierId),
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

function onSupplierChange(e: any) {
  const idx = Number(e.detail.value)
  form.value.supplierId = suppliers.value[idx]?.id
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
  const doc = await getInboundDetail(id)
  if (!doc) return
  await applyDoc(doc)
}

async function save() {
  if (!form.value.supplierId) {
    uni.showToast({ title: '请选择供应商', icon: 'none' })
    return
  }
  if (lines.value.length === 0) {
    uni.showToast({ title: '请添加明细', icon: 'none' })
    return
  }
  const submitLines = lines.value.map(toSubmitLine)
  await saveInbound(form.value as InboundDoc, submitLines)
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

async function post() {
  if (!form.value.id) return
  await postInbound(form.value.id)
  const doc = await getInboundDetail(form.value.id)
  if (doc) await applyDoc(doc)
  uni.showToast({ title: '已过账', icon: 'success' })
}

async function voidDoc() {
  if (!form.value.id) return
  await voidInbound(form.value.id)
  const doc = await getInboundDetail(form.value.id)
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
  const [sup, pros] = await Promise.all([getSuppliers(), getProducts()])
  suppliers.value = sup
  products.value = pros
  if (queryId.value) await loadEdit(queryId.value)
  if (lines.value.length === 0) addLine()
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
input { font-size:28rpx; margin-bottom: 10rpx; }
.btn-delete { min-width:108rpx; height:60rpx; padding:0 20rpx; background:#fff1f0; color:#ff4d4f; border-radius:999rpx; font-size:24rpx; line-height:60rpx; border:none; }
.btn-delete::after { border:none; }
.btn-add-line { width:100%; height:80rpx; background:#eef6ff; color:#1890ff; border-radius:12rpx; font-size:28rpx; border:2rpx dashed #b5d4ff; }
.btn-add-line::after { border:none; }
.actions { display:flex; gap:12rpx; }
.btn { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:30rpx; border:none; }
.btn.ghost { background:#f0f0f0; color:#333; }
.btn.danger { background:#ff4d4f; }
</style>
