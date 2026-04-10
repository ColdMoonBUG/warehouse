<template>
  <view class="detail-page">
    <view class="header">
      <text class="title">退货单详情</text>
    </view>

    <view v-if="doc" class="content">
      <view class="card">
        <view class="row"><text class="label">单号</text><text class="value">{{ doc.code }}</text></view>
        <view class="row"><text class="label">日期</text><text class="value">{{ doc.date }}</text></view>
        <view class="row"><text class="label">超市</text><text class="value">{{ storeName }}</text></view>
        <view class="row"><text class="label">业务员</text><text class="value">{{ salespersonName }}</text></view>
        <view class="row"><text class="label">类型</text><text class="value">{{ typeText }}</text></view>
      </view>

      <view class="card">
        <view class="card-title">商品明细</view>
        <view v-for="line in doc.lines" :key="line.id" class="line">
          <text class="name">{{ getProductName(line.productId) }}</text>
          <text class="qty">{{ lineQtyText(line) }}</text>
          <text class="price">¥{{ line.price }}</text>
        </view>
      </view>

      <view class="summary">
        <text>合计数量: {{ totalQty }}袋</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <button class="btn-print" @tap="previewPrint">预览并打印</button>
      <button class="btn-void" v-if="doc.status==='posted'" @tap="voidDoc">作废退货单</button>
    </view>

    <view v-else class="empty">加载中...</view>

    <view v-if="showPreview" class="preview-overlay" @tap="showPreview = false">
      <view class="preview-card" @tap.stop>
        <view class="preview-header">
          <text class="preview-title">打印预览</text>
          <text class="preview-close" @tap="showPreview = false">✕</text>
        </view>
        <scroll-view scroll-y class="preview-scroll">
          <view class="preview-content">
            <view class="preview-section">
              <text class="preview-main-title">车销系统</text>
              <text class="preview-sub-title">退 货 单</text>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-section">
              <text class="preview-row">单号：{{ doc?.code }}</text>
              <text class="preview-row">日期：{{ doc?.date }}</text>
              <text class="preview-row">店铺：{{ storeName }}</text>
              <text class="preview-row">业务员：{{ salespersonName }}</text>
              <text class="preview-row">类型：{{ typeText }}</text>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-table-header">
              <text class="preview-col-name">商品</text>
              <text class="preview-col-barcode">条码</text>
              <text class="preview-col-qty">数量</text>
              <text class="preview-col-price">单价</text>
              <text class="preview-col-amount">金额</text>
            </view>
            <view v-for="item in previewItems" :key="item.productId" class="preview-table-row">
              <text class="preview-col-name">{{ item.name }}</text>
              <text class="preview-col-barcode">{{ item.barcode || '-' }}</text>
              <text class="preview-col-qty">{{ item.qty }}</text>
              <text class="preview-col-price">¥{{ item.price.toFixed(2) }}</text>
              <text class="preview-col-amount">¥{{ item.amount.toFixed(2) }}</text>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-section">
              <text class="preview-row">合计数量：{{ totalQty }}袋</text>
              <text class="preview-row">合计金额：¥{{ totalAmount.toFixed(2) }}</text>
              <text v-if="doc?.remark" class="preview-row">备注：{{ doc.remark }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="preview-actions">
          <button class="btn-confirm-print" :disabled="printing" @tap="confirmPrint">
            {{ printing ? '打印中...' : '确认打印' }}
          </button>
          <button class="btn-cancel-print" @tap="showPreview = false">取消</button>
        </view>
      </view>
    </view>

    <scroll-view scroll-x scroll-y style="width:0;height:0;">
      <canvas :canvas-id="canvasId" :style="{ width: PAGE_WIDTH_DOTS + 'px', height: canvasHeightPx + 'px' }" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getReturnDetail, getStores, getSalespersonAccounts, getProducts, voidReturn, isSameSalespersonId } from '@/api'
import type { ReturnDoc, Store, Salesperson, Product } from '@/types'
import { getPageQueryParam, formatPackSummary, normalizeCount } from '@/utils'
import { buildReturnReceipt, printText, printReturnA4, checkPrinterConnected, navigateToPrinterSettings, getBluetoothPrinterLogs } from '@/utils/bluetooth-printer'
import { CANVAS_ID, estimateContentHeight, PAGE_WIDTH_DOTS } from '@/utils/canvas-print'

async function voidDoc() {
  if (!doc.value) return
  await voidReturn(doc.value.id)
  uni.showToast({ title: '已作废', icon: 'success' })
  await loadDetail()
}
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const doc = ref<ReturnDoc | null>(null)
const stores = ref<Store[]>([])
const salespersons = ref<Salesperson[]>([])
const products = ref<Product[]>([])
const docId = ref('')
const showPreview = ref(false)
const printing = ref(false)
const canvasId = CANVAS_ID

const canvasHeightPx = computed(() => {
  if (!doc.value) return 2480
  return estimateContentHeight({
    type: 'return',
    code: doc.value.code,
    date: doc.value.date,
    storeName: '',
    salespersonName: '',
    items: doc.value.lines,
    totalQty: 0,
    totalAmount: 0,
    payType: 'card',
    remark: doc.value.remark,
  })
})

const storeName = computed(() => stores.value.find(i => i.id === doc.value?.storeId)?.name || '-')
const salespersonName = computed(() => salespersons.value.find(i => isSameSalespersonId(i.salespersonId || i.id, doc.value?.salespersonId))?.displayName || '-')
const typeText = computed(() => doc.value?.returnType === 'warehouse_return' ? '回仓' : '车库退货')
const totalQty = computed(() => doc.value ? doc.value.lines.reduce((s, l) => s + l.qty, 0) : 0)
const totalAmount = computed(() => doc.value ? doc.value.lines.reduce((s, l) => s + l.qty * l.price, 0) : 0)

const previewItems = computed(() => {
  if (!doc.value) return []
  return doc.value.lines.map((line) => {
    const product = products.value.find(p => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
    }
  })
})

function getProductName(id: string) { return products.value.find(p => p.id === id)?.name || id }
function lineQtyText(line: { productId: string; qty: number; boxQty?: number }) {
  const product = products.value.find(p => p.id === line.productId)
  const packQty = product?.boxQty
  return formatPackSummary(normalizeCount(line.qty), normalizeCount(line.boxQty), packQty)
}

function previewPrint() {
  if (!doc.value) return
  const printer = checkPrinterConnected()
  if (!printer) {
    uni.showModal({
      title: '未连接打印机',
      content: '请先到设置中的蓝牙打印页面连接打印机，然后再打印。',
      confirmText: '去连接',
      success: (res) => {
        if (res.confirm) {
          navigateToPrinterSettings()
        }
      },
    })
    return
  }
  showPreview.value = true
}

async function confirmPrint() {
  if (!doc.value) return
  printing.value = true
  try {
    await printReturnA4(doc.value, stores.value.find(s => s.id === doc.value?.storeId), salespersonName.value, products.value)
    uni.showToast({ title: '打印指令已发送', icon: 'success' })
    showPreview.value = false
  } catch (error: any) {
    const message = error?.message || '打印失败'
    if (message.includes('请先在蓝牙打印页面选择打印机') || message.includes('未连接') || message.includes('蓝牙')) {
      uni.showModal({
        title: '打印失败',
        content: `${message}\n\n请检查：\n1. 打印机是否开机\n2. 蓝牙是否已连接\n3. 到蓝牙打印页面重新连接`,
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            navigateToPrinterSettings()
          }
        },
      })
    } else {
      uni.showToast({ title: message, icon: 'none', duration: 3000 })
    }
    const logs = getBluetoothPrinterLogs()
    const lastLogs = logs.slice(0, 5).map((l: any) => `[${l.level}] ${l.message}`).join('\n')
    console.error('[A4打印] 错误详情：', message, '\n最近日志：\n', lastLogs)
  } finally {
    printing.value = false
  }
}

async function loadDetail() {
  if (!docId.value) return
  const [detail, storeList, salespersonList, productList] = await Promise.all([
    getReturnDetail(docId.value),
    getStores(),
    getSalespersonAccounts(),
    getProducts(),
  ])
  doc.value = detail
  stores.value = storeList
  salespersons.value = salespersonList
  products.value = productList
}

onLoad((query) => {
  docId.value = query?.id || getPageQueryParam('id')
})

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  loadDetail()
})
</script>

<style lang="scss" scoped>
.detail-page { min-height: 100vh; background: #f5f5f5; }
.header { background: #fff; padding: 20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height, 0)); }
.title { font-size: 36rpx; font-weight: 600; color: #333; }
.content { padding: 30rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.row { display:flex; justify-content: space-between; padding: 10rpx 0; }
.label { color: #666; }
.value { color: #333; }
.card-title { font-size: 28rpx; color: #666; margin-bottom: 16rpx; }
.line { display:flex; justify-content: space-between; padding: 8rpx 0; }
.name { color: #333; }
.qty { color: #666; }
.price { color: #333; }
.summary { display:flex; justify-content: space-between; padding: 10rpx; color:#333; }
.btn-print { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; margin-bottom:16rpx; }
.btn-void { width:100%; height:88rpx; background:#ff4d4f; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.empty { text-align:center; padding:80rpx 0; color:#999; }

.preview-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:999; display:flex; align-items:center; justify-content:center; }
.preview-card { width:90%; max-height:80vh; background:#fff; border-radius:16rpx; overflow:hidden; display:flex; flex-direction:column; }
.preview-header { display:flex; justify-content:space-between; align-items:center; padding:24rpx; border-bottom:2rpx solid #eee; }
.preview-title { font-size:32rpx; font-weight:600; color:#333; }
.preview-close { font-size:36rpx; color:#999; padding:0 12rpx; }
.preview-scroll { flex:1; max-height:60vh; }
.preview-content { padding:24rpx; }
.preview-section { margin-bottom:16rpx; }
.preview-main-title { font-size:32rpx; font-weight:600; color:#333; text-align:center; display:block; margin-bottom:8rpx; }
.preview-sub-title { font-size:26rpx; color:#666; text-align:center; display:block; }
.preview-row { font-size:24rpx; color:#333; display:block; padding:4rpx 0; }
.preview-divider { height:2rpx; background:#eee; margin:12rpx 0; }
.preview-table-header { display:flex; font-size:22rpx; color:#999; padding:8rpx 0; border-bottom:2rpx solid #eee; }
.preview-table-row { display:flex; font-size:22rpx; color:#333; padding:6rpx 0; border-bottom:1rpx solid #f5f5f5; }
.preview-col-name { flex:2; }
.preview-col-barcode { flex:2; }
.preview-col-qty { flex:1; text-align:right; }
.preview-col-price { flex:1.5; text-align:right; }
.preview-col-amount { flex:1.5; text-align:right; }
.preview-actions { padding:20rpx 24rpx; border-top:2rpx solid #eee; display:flex; gap:16rpx; }
.btn-confirm-print { flex:1; height:80rpx; background:#1890ff; color:#fff; font-size:28rpx; border-radius:40rpx; border:none; }
.btn-cancel-print { flex:1; height:80rpx; background:#f5f5f5; color:#666; font-size:28rpx; border-radius:40rpx; border:none; }
</style>