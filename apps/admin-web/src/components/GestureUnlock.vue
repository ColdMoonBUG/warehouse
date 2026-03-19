<template>
  <div class="gesture-wrap">
    <p class="gesture-hint">{{ hint }}</p>
    <canvas ref="canvas" class="gesture-canvas"
      @pointerdown="onStart" @pointermove="onMove" @pointerup="onEnd" @pointercancel="onEnd"
    />
    <el-button v-if="showReset" link class="reset-btn" @click="reset">重新绘制</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ hint?: string; showReset?: boolean; minPoints?: number }>()
const emit = defineEmits<{ (e: 'complete', pattern: string): void }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const hint = ref(props.hint || '请绘制手势密码')

const SIZE = 3
const RADIUS = 28
const HIT_RADIUS = RADIUS * 1.2
let ctx: CanvasRenderingContext2D | null = null
let points: number[] = []
let active = false
let cw = 0, ch = 0

interface Dot { x: number; y: number; idx: number }
let dots: Dot[] = []

function initCanvas() {
  const c = canvas.value!
  cw = c.offsetWidth
  ch = c.offsetHeight
  c.width = cw
  c.height = ch
  ctx = c.getContext('2d')!
  const pad = cw * 0.15
  const step = (cw - pad * 2) / (SIZE - 1)
  dots = []
  for (let r = 0; r < SIZE; r++) {
    for (let c2 = 0; c2 < SIZE; c2++) {
      dots.push({ x: pad + c2 * step, y: pad + r * step, idx: r * SIZE + c2 })
    }
  }
  draw()
}

function draw(mx?: number, my?: number) {
  if (!ctx) return
  ctx.clearRect(0, 0, cw, ch)
  // lines
  if (points.length > 1) {
    ctx.beginPath()
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    const first = dots[points[0]]
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(dots[points[i]].x, dots[points[i]].y)
    if (mx !== undefined && my !== undefined) ctx.lineTo(mx, my)
    ctx.stroke()
  }
  // dots
  dots.forEach(d => {
    const sel = points.includes(d.idx)
    ctx!.beginPath()
    ctx!.arc(d.x, d.y, RADIUS * 0.38, 0, Math.PI * 2)
    ctx!.fillStyle = sel ? '#60a5fa' : 'rgba(148,163,184,0.5)'
    ctx!.fill()
    if (sel) {
      ctx!.beginPath()
      ctx!.arc(d.x, d.y, RADIUS * 0.7, 0, Math.PI * 2)
      ctx!.strokeStyle = '#60a5fa44'
      ctx!.lineWidth = 2
      ctx!.stroke()
    }
  })
}

function getPos(e: PointerEvent | MouseEvent | TouchEvent): [number, number] {
  const c = canvas.value!
  const rect = c.getBoundingClientRect()
  const src = 'touches' in e ? e.touches[0] : e
  return [src.clientX - rect.left, src.clientY - rect.top]
}

function hitDot(x: number, y: number): number {
  return dots.findIndex(d => Math.hypot(d.x - x, d.y - y) < HIT_RADIUS)
}

function onStart(e: PointerEvent | MouseEvent | TouchEvent) {
  active = true
  points = []
  if ('pointerId' in e) (e.target as Element).setPointerCapture(e.pointerId)
  const [x, y] = getPos(e)
  const idx = hitDot(x, y)
  if (idx >= 0) points.push(idx)
  draw(x, y)
}

function onMove(e: PointerEvent | MouseEvent | TouchEvent) {
  if (!active) return
  const [x, y] = getPos(e)
  const idx = hitDot(x, y)
  if (idx >= 0 && !points.includes(idx)) points.push(idx)
  draw(x, y)
}

function onEnd(e?: PointerEvent | MouseEvent | TouchEvent) {
  if (!active) return
  active = false
  if (e && 'pointerId' in e) (e.target as Element).releasePointerCapture(e.pointerId)
  draw()
  const min = props.minPoints || 4
  if (points.length >= min) {
    emit('complete', points.map(p => p + 1).join('-'))
  } else {
    hint.value = `至少连接${min}个点`
    setTimeout(() => { hint.value = props.hint || '请绘制手势密码'; reset() }, 1200)
  }
}

function reset() { points = []; draw() }

const ro = new ResizeObserver(initCanvas)
onMounted(() => { initCanvas(); if (canvas.value) ro.observe(canvas.value) })
onBeforeUnmount(() => ro.disconnect())

defineExpose({ reset })
</script>

<style scoped>
.gesture-wrap { display:flex; flex-direction:column; align-items:center; gap:12px; }
.gesture-hint { color:#94a3b8; font-size:14px; margin:0; }
.gesture-canvas { width:260px; height:260px; cursor:pointer; touch-action:none; }
.reset-btn { color:#94a3b8; font-size:12px; }
</style>
