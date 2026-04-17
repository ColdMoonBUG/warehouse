<template>
  <view class="gesture-page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">手势解锁</text>
      <view style="width: 60rpx" />
    </view>

    <view class="user-info">
      <view class="avatar">{{ displayName.charAt(0) }}</view>
      <text class="name">{{ displayName }}</text>
    </view>

    <view class="gesture-area">
      <text class="tip" :class="{ error: isError }">
        {{ tipText }}
      </text>

      <view
        class="gesture-panel"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <view class="dot-grid">
          <view
            v-for="i in 9"
            :key="i"
            class="dot"
            :class="{ active: selectedDots.includes(i), error: isError }"
          >
            <view class="dot-inner" />
          </view>
        </view>
        <canvas canvasId="gestureCanvas" class="gesture-canvas" />
      </view>
    </view>

    <view class="footer">
      <text class="link" @tap="goPassword">使用密码登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { loginByGesture } from '@/api'
import { useReferenceStore } from '@/store/reference'
import { applyRoleTabBar, switchToRoleHome } from '@/utils/tabbar'
import { onAccountLogin } from '@/utils/bluetooth-printer'

const userStore = useUserStore()
const referenceStore = useReferenceStore()

const username = ref('')
const displayName = ref('')
const accountId = ref('')
const hasGesture = ref(false)
const selectedDots = ref<number[]>([])
const isError = ref(false)
const tipText = ref('请绘制手势密码')

const PANEL_SIZE = 300
const dotPositions: { x: number; y: number }[] = []

let canvasCtx: any = null
let isDrawing = false
let panelRect: { left: number; top: number; width: number; height: number } | null = null

function initDotPositions() {
  const gap = PANEL_SIZE / 3
  dotPositions.length = 0
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3
    dotPositions.push({
      x: gap * col + gap / 2,
      y: gap * row + gap / 2,
    })
  }
}

function updatePanelRect() {
  uni.createSelectorQuery().select('.gesture-panel').boundingClientRect((rect: any) => {
    if (rect?.width && rect?.height) {
      panelRect = rect
    }
  }).exec()
}

function getTouchPoint(e: any) {
  const touch = e.touches?.[0] || e.changedTouches?.[0]
  if (!touch || !panelRect?.width || !panelRect?.height) return null

  const clientX = touch.clientX ?? touch.pageX ?? 0
  const clientY = touch.clientY ?? touch.pageY ?? 0

  return {
    x: ((clientX - panelRect.left) * PANEL_SIZE) / panelRect.width,
    y: ((clientY - panelRect.top) * PANEL_SIZE) / panelRect.height,
  }
}

function getHitDot(x: number, y: number): number | null {
  const threshold = 50
  for (let i = 0; i < 9; i++) {
    const pos = dotPositions[i]
    const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2)
    if (dist < threshold) {
      return i + 1
    }
  }
  return null
}

function drawLines() {
  if (!canvasCtx) return

  canvasCtx.clearRect(0, 0, PANEL_SIZE, PANEL_SIZE)
  if (selectedDots.value.length < 2) {
    canvasCtx.draw(false)
    return
  }

  canvasCtx.setStrokeStyle(isError.value ? '#ff4d4f' : '#1890ff')
  canvasCtx.setLineWidth(4)
  canvasCtx.setLineCap('round')
  canvasCtx.beginPath()

  const first = dotPositions[selectedDots.value[0] - 1]
  canvasCtx.moveTo(first.x, first.y)

  for (let i = 1; i < selectedDots.value.length; i++) {
    const pos = dotPositions[selectedDots.value[i] - 1]
    canvasCtx.lineTo(pos.x, pos.y)
  }

  canvasCtx.stroke()
  canvasCtx.draw(false)
}

function onTouchStart(e: any) {
  const point = getTouchPoint(e)
  if (!point) return

  const dot = getHitDot(point.x, point.y)
  if (dot) {
    isDrawing = true
    isError.value = false
    selectedDots.value = [dot]
    drawLines()
  }
}

function onTouchMove(e: any) {
  if (!isDrawing) return

  const point = getTouchPoint(e)
  if (!point) return

  const dot = getHitDot(point.x, point.y)
  if (dot && !selectedDots.value.includes(dot)) {
    selectedDots.value.push(dot)
    drawLines()
  }
}

async function onTouchEnd() {
  if (!isDrawing) return
  isDrawing = false

  if (selectedDots.value.length < 4) {
    isError.value = true
    tipText.value = '至少连接4个点'
    drawLines()
    setTimeout(resetGesture, 800)
    return
  }

  const gesture = selectedDots.value.join('-')

  try {
    const session = await loginByGesture(username.value, gesture)
    userStore.setSession(session)
    referenceStore.hydrate()
    void referenceStore.preloadCore(true).catch(() => {})
    if (session.role === 'admin') {
      void referenceStore.preloadAllAccounts(true).catch(() => {})
      void referenceStore.preloadSuppliers(true).catch(() => {})
    }
    onAccountLogin(session.displayName)
    uni.showToast({ title: '解锁成功', icon: 'success' })
    applyRoleTabBar()
    setTimeout(() => {
      switchToRoleHome()
    }, 500)
  } catch (e: any) {
    isError.value = true
    tipText.value = e.message || '手势密码错误'
    drawLines()
    setTimeout(resetGesture, 800)
  }
}

function resetGesture() {
  selectedDots.value = []
  isError.value = false
  tipText.value = '请绘制手势密码'
  canvasCtx?.clearRect(0, 0, PANEL_SIZE, PANEL_SIZE)
  canvasCtx?.draw(false)
}

function goBack() {
  uni.navigateBack()
}

function goPassword() {
  uni.redirectTo({
    url: `/pages/login/password?username=${username.value}&name=${encodeURIComponent(displayName.value)}&id=${accountId.value}&hasGesture=${hasGesture.value ? '1' : '0'}`,
  })
}

onLoad((query) => {
  if (query?.username) username.value = query.username
  if (query?.name) displayName.value = decodeURIComponent(query.name)
  if (query?.id) accountId.value = query.id
  hasGesture.value = query?.hasGesture === '1'
})

onMounted(() => {
  initDotPositions()
  canvasCtx = uni.createCanvasContext('gestureCanvas')
  updatePanelRect()
})
</script>

<style lang="scss" scoped>
.gesture-page {
  min-height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));

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
    font-size: 34rpx;
    font-weight: 500;
    color: #333;
  }
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0 20rpx;

  .avatar {
    width: 100rpx;
    height: 100rpx;
    border-radius: 50%;
    background: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: #fff;
    font-weight: bold;
    margin-bottom: 16rpx;
  }

  .name {
    font-size: 30rpx;
    color: #333;
    font-weight: 500;
  }
}

.gesture-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 40rpx;

  .tip {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 40rpx;

    &.error {
      color: #ff4d4f;
    }
  }
}

.gesture-panel {
  position: relative;
  width: 300px;
  height: 300px;
}

.dot-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: 100%;
  height: 100%;
}

.dot {
  display: flex;
  align-items: center;
  justify-content: center;

  .dot-inner {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ddd;
    transition: all 0.15s;
  }

  &.active .dot-inner {
    background: #1890ff;
    transform: scale(1.3);
    box-shadow: 0 0 10px rgba(24, 144, 255, 0.5);
  }

  &.error .dot-inner {
    background: #ff4d4f;
    box-shadow: 0 0 10px rgba(255, 77, 79, 0.5);
  }
}

.gesture-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 300px;
  height: 300px;
  pointer-events: none;
}

.footer {
  padding: 40rpx;
  text-align: center;

  .link {
    font-size: 28rpx;
    color: #1890ff;
  }
}
</style>
