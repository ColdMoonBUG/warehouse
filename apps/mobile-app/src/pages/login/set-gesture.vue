<template>
  <view class="set-gesture-page">
    <view class="header">
      <view class="back" @tap="skip">跳过</view>
      <text class="title">设置手势密码</text>
      <view style="width: 60rpx" />
    </view>

    <view class="gesture-area">
      <text class="tip" :class="{ error: isError }">
        {{ tipText }}
      </text>

      <view class="gesture-panel" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
        <view class="dot-grid">
          <view
            v-for="i in 9"
            :key="i"
            class="dot"
            :class="{
              active: selectedDots.includes(i),
              error: isError,
            }"
          >
            <view class="dot-inner" />
          </view>
        </view>
        <canvas canvasId="gestureCanvas2" class="gesture-canvas" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { setGesture } from '@/api'
import { applyRoleTabBar, switchToRoleHome } from '@/utils/tabbar'

const userStore = useUserStore()

const username = ref('')
const displayName = ref('')
const accountId = ref('')
const selectedDots = ref<number[]>([])
const isError = ref(false)
const tipText = ref('请绘制手势密码')
const isFirstDraw = true
const firstGesture = ref('')

let canvasCtx: any = null
let isDrawing = false

const dotPositions: { x: number; y: number }[] = []

function initDotPositions() {
  const size = 300
  const gap = size / 3
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

  const ctx = canvasCtx
  ctx.clearRect(0, 0, 300, 300)

  if (selectedDots.value.length < 2) {
    ctx.draw(false)
    return
  }

  ctx.setStrokeStyle(isError.value ? '#ff4d4f' : '#1890ff')
  ctx.setLineWidth(4)
  ctx.setLineCap('round')
  ctx.beginPath()

  const first = dotPositions[selectedDots.value[0] - 1]
  ctx.moveTo(first.x, first.y)

  for (let i = 1; i < selectedDots.value.length; i++) {
    const pos = dotPositions[selectedDots.value[i] - 1]
    ctx.lineTo(pos.x, pos.y)
  }

  ctx.stroke()
  ctx.draw(false)
}

function onTouchStart(e: any) {
  const touch = e.touches[0]
  const rect = e.currentTarget.getBoundingClientRect?.() || { left: 0, top: 0 }
  const x = touch.clientX - rect.left
  const y = touch.clientY - rect.top

  const dot = getHitDot(x, y)
  if (dot) {
    isDrawing = true
    isError.value = false
    selectedDots.value = [dot]
    drawLines()
  }
}

function onTouchMove(e: any) {
  if (!isDrawing) return

  const touch = e.touches[0]
  const rect = e.currentTarget.getBoundingClientRect?.() || { left: 0, top: 0 }
  const x = touch.clientX - rect.left
  const y = touch.clientY - rect.top

  const dot = getHitDot(x, y)
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

  if (firstGesture.value) {
    // 第二次绘制，验证
    if (gesture === firstGesture.value) {
      // 设置成功
      if (!accountId.value) {
        uni.showToast({ title: '账户信息缺失', icon: 'none' })
        return
      }
      try {
        await setGesture(accountId.value, gesture)
        uni.showToast({ title: '设置成功', icon: 'success' })
        applyRoleTabBar()
        setTimeout(() => {
          switchToRoleHome()
        }, 500)
      } catch (e: any) {
        uni.showToast({ title: e.message || '设置失败', icon: 'none' })
      }
    } else {
      isError.value = true
      tipText.value = '两次密码不一致，请重新绘制'
      drawLines()
      firstGesture.value = ''
      setTimeout(resetGesture, 800)
    }
  } else {
    // 第一次绘制
    firstGesture.value = gesture
    tipText.value = '请再次绘制确认'
    resetGesture()
  }
}

function resetGesture() {
  selectedDots.value = []
  isError.value = false
  if (!firstGesture.value) {
    tipText.value = '请绘制手势密码'
  }
  canvasCtx?.clearRect(0, 0, 300, 300)
  canvasCtx?.draw(false)
}

function skip() {
  applyRoleTabBar()
  switchToRoleHome()
}

onLoad((query) => {
  if (query?.username) username.value = query.username
  if (query?.name) displayName.value = decodeURIComponent(query.name)
  if (query?.id) accountId.value = query.id
})

onMounted(() => {
  initDotPositions()
  canvasCtx = uni.createCanvasContext('gestureCanvas2')
})
</script>

<style lang="scss" scoped>
.set-gesture-page {
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
    font-size: 28rpx;
    color: #1890ff;
  }

  .title {
    font-size: 34rpx;
    font-weight: 500;
    color: #333;
  }
}

.gesture-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 80rpx;

  .tip {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 60rpx;

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
</style>
