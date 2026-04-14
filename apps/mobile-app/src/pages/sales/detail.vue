<template>
  <view class="detail-page">
    <view class="header">
      <text class="title">销单详情</text>
    </view>

    <view v-if="doc" class="content">
      <view class="card">
        <view class="row">
          <text class="label">单号</text>
          <text class="value">{{ doc.code }}</text>
        </view>
        <view class="row">
          <text class="label">日期</text>
          <text class="value">{{ doc.date }}</text>
        </view>
        <view class="row">
          <text class="label">超市</text>
          <text class="value">{{ storeName }}</text>
        </view>
        <view class="row">
          <text class="label">业务员</text>
          <text class="value">{{ salespersonName }}</text>
        </view>
      </view>

      <view class="card">
        <view class="card-title">商品明细 ({{ doc.lines.length }}种)</view>
        <view v-for="(line, idx) in doc.lines" :key="line.id" class="line">
          <text class="name"><text class="seq-no">{{ idx + 1 }}.</text> {{ getProductName(line.productId) }}</text>
          <text class="qty">{{ lineQtyText(line) }}</text>
          <text class="price">¥{{ line.price }}</text>
        </view>
      </view>

      <view class="summary">
        <text>品种: {{ doc.lines.length }}种 | 合计数量: {{ totalQty }}袋</text>
        <text>合计金额: ¥{{ totalAmount.toFixed(2) }}</text>
      </view>

      <view class="pay-type-section" v-if="showPayType">
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

      <button class="btn-print" @tap="previewPrint">预览并打印</button>
      <button class="btn-void" v-if="doc.status==='posted'" @tap="voidDoc">作废销单</button>
      <button class="btn-void-rebuild" v-if="doc.status==='posted'" @tap="voidAndRebuild">作废并重建</button>
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
              <text class="preview-sub-title">销 货 单  {{ payType === 'cash' ? '【现金】' : '【单子】' }}</text>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-section">
              <text class="preview-row">单号：{{ doc?.code }}</text>
              <text class="preview-row">日期：{{ doc?.date }}</text>
              <text class="preview-row">店铺：{{ storeName }}</text>
              <text class="preview-row">业务员：{{ salespersonName }}</text>
            </view>
            <view class="preview-divider"></view>
            <view class="preview-table-header">
              <text class="preview-col-seq">序</text>
              <text class="preview-col-name">商品</text>
              <text class="preview-col-barcode">条码</text>
              <text class="preview-col-qty">数量</text>
              <text class="preview-col-price">单价</text>
              <text class="preview-col-amount">金额</text>
            </view>
            <view v-for="(item, idx) in previewItems" :key="item.productId" class="preview-table-row">
              <text class="preview-col-seq">{{ idx + 1 }}</text>              <text class="preview-col-name">{{ item.name }}</text>
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
import { getSaleDetail, getStores, getSalespersonAccounts, getProducts, voidSale, isSameSalespersonId, getReturnDetail } from '@/api'
import type { SaleDoc, Store, Salesperson, Product, ReturnDoc } from '@/types'
import { getPageQueryParam, formatPackSummary, normalizeCount } from '@/utils'
import { buildSaleReceipt, printText, printSaleA4, printCombinedA4, checkPrinterConnected, navigateToPrinterSettings, getBluetoothPrinterLogs } from '@/utils/bluetooth-printer'
import { CANVAS_ID, estimateContentHeight, PAGE_WIDTH_DOTS } from '@/utils/canvas-print'

async function voidDoc() {
  if (!doc.value) return
  uni.showModal({
    title: '确认作废',
    content: '作废后库存将自动回滚，是否确认？',
    success: async (res) => {
      if (!res.confirm || !doc.value) return
      await voidSale(doc.value.id)
      uni.showToast({ title: '已作废', icon: 'success' })
      await loadDetail()
    },
  })
}

async function voidAndRebuild() {
  if (!doc.value) return
  uni.showModal({
    title: '作废并重建',
    content: '将作废此销单并跳转到创建页，保留本单商品数据作为新单基础。',
    confirmText: '确认',
    success: async (res) => {
      if (!res.confirm || !doc.value) return
      try {
        // 先保存预填数据
        const prefill = {
          storeId: doc.value.storeId,
          warehouseId: doc.value.warehouseId || '',
          lines: doc.value.lines.map(l => ({
            productId: l.productId,
            qty: l.qty,
            boxQty: l.boxQty || 0,
          })),
        }
        uni.setStorageSync('wh_sale_prefill', JSON.stringify(prefill))
        // 作废原单
        await voidSale(doc.value.id)
        uni.showToast({ title: '已作废，正在跳转...', icon: 'none' })
        setTimeout(() => {
          uni.redirectTo({ url: '/pages/sales/create?prefill=true' })
        }, 400)
      } catch (e: any) {
        uni.showToast({ title: e.message || '作废失败', icon: 'none' })
      }
    },
  })
}
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

const doc = ref<SaleDoc | null>(null)
const stores = ref<Store[]>([])
const salespersons = ref<Salesperson[]>([])
const products = ref<Product[]>([])
const docId = ref('')
const payType = ref<'cash' | 'card'>('card')
const showPayType = ref(true)
const showPreview = ref(false)
const printing = ref(false)
const canvasId = CANVAS_ID

const canvasHeightPx = computed(() => {
  if (!doc.value) return 2480
  return estimateContentHeight({
    type: 'sale',
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

const storeName = computed(() => {
  const s = stores.value.find(i => i.id === doc.value?.storeId)
  return s?.name || '-'
})

const salespersonName = computed(() => {
  const e = salespersons.value.find(i => isSameSalespersonId(i.salespersonId || i.id, doc.value?.salespersonId))
  return e?.displayName || '-'
})

const totalQty = computed(() => {
  if (!doc.value) return 0
  return doc.value.lines.reduce((s, l) => s + l.qty, 0)
})

const totalAmount = computed(() => {
  if (!doc.value) return 0
  return doc.value.lines.reduce((s, l) => s + l.qty * l.price, 0)
})

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

function getProductName(id: string) {
  return products.value.find(p => p.id === id)?.name || id
}

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
    const store = stores.value.find(s => s.id === doc.value?.storeId)
    // 如果销单关联了退单，合并打印
    if (doc.value.returnDocId) {
      const returnDoc = await getReturnDetail(doc.value.returnDocId)
      if (returnDoc) {
        await printCombinedA4(doc.value, returnDoc, store, salespersonName.value, products.value, payType.value)
      } else {
        await printSaleA4(doc.value, store, salespersonName.value, products.value, payType.value)
      }
    } else {
      await printSaleA4(doc.value, store, salespersonName.value, products.value, payType.value)
    }
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
    getSaleDetail(docId.value),
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
.detail-page {
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

.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;

  .row {
    display: flex;
    justify-content: space-between;
    padding: 10rpx 0;

    .label {
      color: #666;
    }

    .value {
      color: #333;
    }
  }
}

.card-title {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 16rpx;
}

.line {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;

  .name {
    color: #333;
  }

  .qty {
    color: #666;
  }

  .price {
    color: #333;
  }
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 10rpx;
  color: #333;
}

.pay-type-section {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.pay-type-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 600;
  margin-bottom: 16rpx;
  display: block;
}

.pay-type-options {
  display: flex;
  gap: 20rpx;
}

.pay-type-option {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  border-radius: 12rpx;
  background: #f0f0f0;
  color: #666;
  font-size: 28rpx;

  &.active {
    background: #1890ff;
    color: #fff;
  }
}

.btn-print {
  width: 100%;
  height: 88rpx;
  background: #1890ff;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-bottom: 16rpx;
}

.btn-void {
  width: 100%;
  height: 88rpx;
  background: #ff4d4f;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
  margin-bottom: 16rpx;
}

.btn-void-rebuild {
  width: 100%;
  height: 88rpx;
  background: #fff;
  color: #ff4d4f;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: 2rpx solid #ff4d4f;
}

.seq-no {
  color: #999;
  font-size: 26rpx;
  margin-right: 6rpx;
}

.empty {
  text-align: center;
  padding: 80rpx 0;
  color: #999;
}

.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-card {
  width: 90%;
  max-height: 80vh;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  border-bottom: 2rpx solid #eee;
}

.preview-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.preview-close {
  font-size: 36rpx;
  color: #999;
  padding: 0 12rpx;
}

.preview-scroll {
  flex: 1;
  max-height: 60vh;
}

.preview-content {
  padding: 24rpx;
}

.preview-section {
  margin-bottom: 16rpx;
}

.preview-main-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  text-align: center;
  display: block;
  margin-bottom: 8rpx;
}

.preview-sub-title {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  display: block;
}

.preview-row {
  font-size: 24rpx;
  color: #333;
  display: block;
  padding: 4rpx 0;
}

.preview-divider {
  height: 2rpx;
  background: #eee;
  margin: 12rpx 0;
}

.preview-table-header {
  display: flex;
  font-size: 22rpx;
  color: #999;
  padding: 8rpx 0;
  border-bottom: 2rpx solid #eee;
}

.preview-table-row {
  display: flex;
  font-size: 22rpx;
  color: #333;
  padding: 6rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.preview-col-seq { width: 60rpx; text-align: center; }
.preview-col-name { flex: 2; }
.preview-col-barcode { flex: 2; }
.preview-col-qty { flex: 1; text-align: right; }
.preview-col-price { flex: 1.5; text-align: right; }
.preview-col-amount { flex: 1.5; text-align: right; }

.preview-actions {
  padding: 20rpx 24rpx;
  border-top: 2rpx solid #eee;
  display: flex;
  gap: 16rpx;
}

.btn-confirm-print {
  flex: 1;
  height: 80rpx;
  background: #1890ff;
  color: #fff;
  font-size: 28rpx;
  border-radius: 40rpx;
  border: none;
}

.btn-cancel-print {
  flex: 1;
  height: 80rpx;
  background: #f5f5f5;
  color: #666;
  font-size: 28rpx;
  border-radius: 40rpx;
  border: none;
}

</style>