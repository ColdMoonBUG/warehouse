<template>
  <view class="sort-page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">商品排序</text>
      <text class="save-btn" @tap="saveAndBack">保存</text>
    </view>

    <view class="hint">长按拖拽调整顺序，排在前面的商品在创建销单时优先显示</view>

    <scroll-view :scroll-y="draggingIndex < 0" class="list">
      <view
        v-for="(item, index) in sortedList"
        :key="item.id"
        class="sort-item"
        :class="{ dragging: draggingIndex === index, 'drag-over': dragOverIndex === index }"
        @longpress="onLongPress(index)"
        @touchmove="onTouchMove($event, index)"
        @touchend="onTouchEnd"
      >
        <view class="drag-handle">≡</view>
        <view class="item-info">
          <text class="item-seq">{{ index + 1 }}</text>
          <text class="item-name">{{ item.name }}</text>
          <text class="item-price">¥{{ item.salePrice }}</text>
        </view>
        <view class="item-actions">
          <text v-if="index > 0" class="action-btn" @tap.stop="moveToTop(index)">置顶</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReferenceStore } from '@/store/reference'
import { getSessionSalespersonId } from '@/api'
import type { Product } from '@/types'

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const sortedList = ref<Product[]>([])
const draggingIndex = ref(-1)
const dragOverIndex = ref(-1)
let startY = 0
let itemHeight = 0

function getSortKey() {
  const spId = getSessionSalespersonId(userStore.currentUser) || 'default'
  return `wh_product_sort_${spId}`
}

function loadSavedOrder(): string[] {
  try {
    const raw = uni.getStorageSync(getSortKey())
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveOrder() {
  const ids = sortedList.value.map(p => p.id)
  uni.setStorageSync(getSortKey(), JSON.stringify(ids))
}

function applyOrder(products: Product[]) {
  const savedIds = loadSavedOrder()
  if (!savedIds.length) {
    sortedList.value = [...products]
    return
  }
  const idSet = new Set(products.map(p => p.id))
  const ordered: Product[] = []
  const productMap = new Map(products.map(p => [p.id, p]))

  // 按保存的顺序排列
  for (const id of savedIds) {
    const p = productMap.get(id)
    if (p) {
      ordered.push(p)
      idSet.delete(id)
    }
  }
  // 追加新商品（未在保存顺序中的）
  for (const p of products) {
    if (idSet.has(p.id)) {
      ordered.push(p)
    }
  }
  sortedList.value = ordered
}

function moveToTop(index: number) {
  if (index <= 0) return
  const item = sortedList.value.splice(index, 1)[0]
  sortedList.value.unshift(item)
}

function onLongPress(index: number) {
  draggingIndex.value = index
  uni.vibrateShort({ type: 'light' })
}

function onTouchMove(e: any, index: number) {
  if (draggingIndex.value < 0) return
  const touch = e.touches?.[0] || e.changedTouches?.[0]
  if (!touch) return

  if (!startY) {
    startY = touch.clientY
    // 估算每个 item 高度（约 100rpx ≈ 50px）
    itemHeight = 50
  }

  const deltaY = touch.clientY - startY
  const offset = Math.round(deltaY / itemHeight)
  const targetIndex = Math.max(0, Math.min(sortedList.value.length - 1, draggingIndex.value + offset))
  dragOverIndex.value = targetIndex
}

function onTouchEnd() {
  if (draggingIndex.value >= 0 && dragOverIndex.value >= 0 && draggingIndex.value !== dragOverIndex.value) {
    const item = sortedList.value.splice(draggingIndex.value, 1)[0]
    sortedList.value.splice(dragOverIndex.value, 0, item)
  }
  draggingIndex.value = -1
  dragOverIndex.value = -1
  startY = 0
}

function goBack() {
  uni.navigateBack()
}

function saveAndBack() {
  saveOrder()
  uni.showToast({ title: '排序已保存', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 300)
}

onMounted(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  referenceStore.hydrate()
  const products = referenceStore.products.filter(p => p.status === 'active')
  applyOrder(products)
})
</script>

<style lang="scss" scoped>
.sort-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));
}

.back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  color: #333;
}

.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
}

.save-btn {
  font-size: 28rpx;
  color: #1890ff;
  padding: 10rpx 20rpx;
}

.hint {
  padding: 20rpx 30rpx;
  font-size: 24rpx;
  color: #999;
}

.list {
  padding: 0 30rpx;
  flex: 1;
  height: calc(100vh - 200rpx - var(--status-bar-height, 0));
}

.sort-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: #fff;
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  margin-bottom: 8rpx;
  transition: transform 0.15s, box-shadow 0.15s;
}

.sort-item.dragging {
  opacity: 0.6;
  transform: scale(1.02);
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);
}

.sort-item.drag-over {
  border-top: 4rpx solid #1890ff;
}

.drag-handle {
  font-size: 36rpx;
  color: #ccc;
  width: 48rpx;
  text-align: center;
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.item-seq {
  font-size: 24rpx;
  color: #999;
  width: 48rpx;
  flex-shrink: 0;
}

.item-name {
  font-size: 28rpx;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-price {
  font-size: 24rpx;
  color: #999;
  flex-shrink: 0;
}

.item-actions {
  flex-shrink: 0;
}

.action-btn {
  font-size: 24rpx;
  color: #1890ff;
  padding: 8rpx 16rpx;
  border: 2rpx solid #1890ff;
  border-radius: 999rpx;
}
</style>
