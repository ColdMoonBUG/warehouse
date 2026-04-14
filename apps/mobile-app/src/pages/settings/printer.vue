<template>
  <view class="printer-page">
    <view class="header">
      <text class="title">蓝牙打印</text>
      <text class="subtitle">BLE 连接 · 账户绑定 · 自动重连</text>
    </view>

    <view class="content">
      <!-- 账户绑定 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">账户绑定</text>
        </view>
        <view v-if="accountLabel" class="bind-info">
          <text class="bind-label">当前账户: {{ accountLabel }}</text>
          <view v-if="boundPrinter" class="bind-device">
            <text class="bind-device-name">已绑定: {{ boundPrinter.name }}</text>
            <text class="bind-device-id">{{ boundPrinter.deviceId }}</text>
          </view>
          <text v-else class="bind-none">未绑定打印机（请扫描后选择设备绑定）</text>
          <view class="row-btns" style="margin-top:12rpx">
            <button class="btn btn-ghost" v-if="boundPrinter" @tap="handleUnbind">解除绑定</button>
          </view>
        </view>
        <view v-else class="empty">管理员账户无需绑定打印机</view>
      </view>

      <!-- 当前打印机 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">当前打印机</text>
          <text class="action" @tap="scanDevices">扫描</text>
        </view>
        <view v-if="currentPrinter" class="printer-info">
          <text class="printer-name">{{ currentPrinter.name }}</text>
          <text class="printer-id">{{ currentPrinter.deviceId }}</text>
        </view>
        <view v-else class="empty">暂未选择打印机</view>
        <view class="row-btns">
          <button class="btn" :disabled="!currentPrinter || connecting" @tap="testConnect">
            {{ connecting ? '连接中...' : '连接测试' }}
          </button>
          <button class="btn" :disabled="!currentPrinter || connecting || printing" @tap="handlePrintTest">
            {{ printing ? '打印中...' : '打印测试页' }}
          </button>
        </view>
        <view class="row-btns" style="margin-top:12rpx">
          <button class="btn btn-ghost" :disabled="!currentPrinter" @tap="clearPrinter">清除</button>
          <button class="btn btn-ghost" @tap="disconnectPrinter">断开</button>
        </view>
        <view v-if="statusText" class="status" :class="statusType">{{ statusText }}</view>
      </view>

      <!-- 设备列表 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">附近 BLE 设备</text>
        </view>
        <view v-if="scanning" class="empty">扫描中...</view>
        <view v-else-if="devices.length === 0" class="empty">未发现设备</view>
        <view
          v-for="device in devices"
          :key="device.deviceId"
          class="device-item"
          :class="{ active: device.deviceId === currentPrinter?.deviceId }"
        >
          <view class="device-main" @tap="selectDevice(device)">
            <text class="device-name">{{ device.name || '未知设备' }}</text>
            <text class="device-id">RSSI {{ device.RSSI || '-' }}</text>
          </view>
          <button v-if="accountLabel" class="btn-bind" @tap.stop="handleBindDevice(device)">绑定</button>
        </view>
      </view>

      <!-- 预设设备参数 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">预设设备参数</text>
        </view>
        <view v-for="(info, label) in presetPrinters" :key="label" class="preset-item">
          <text class="preset-label">{{ label }}</text>
          <text class="preset-value">{{ info.name || '待配置' }} {{ info.mac || '' }}</text>
        </view>
      </view>

      <!-- 运行日志 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">运行日志</text>
          <text class="action" @tap="clearLogs">清空</text>
        </view>
        <view v-if="logs.length === 0" class="empty">暂无日志</view>
        <view v-for="log in logs" :key="log.id" class="log-item" :class="log.level">
          <text class="log-time">{{ log.createdAt }}</text>
          <text class="log-msg">{{ log.message }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  listNearbyPrinters,
  getSavedPrinter,
  savePrinter,
  clearSavedPrinter,
  printTestPage as doPrintTest,
  testConnection,
  disconnectPrinter as _disconnectPrinter,
  getBluetoothPrinterLogs,
  clearBluetoothPrinterLogs,
  appendLog,
  getBoundPrinter,
  bindPrinterToAccount,
  unbindPrinterFromAccount,
  getCurrentAccountLabel,
  PRESET_PRINTERS,
} from '@/utils/bluetooth-printer'
import type { PrinterDevice, PrinterLog } from '@/utils/bluetooth-printer'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const currentPrinter = ref<PrinterDevice | null>(getSavedPrinter())
const devices = ref<PrinterDevice[]>([])
const scanning = ref(false)
const printing = ref(false)
const connecting = ref(false)
const logs = ref<PrinterLog[]>(getBluetoothPrinterLogs())
const statusText = ref('')
const statusType = ref<'info' | 'warn' | 'error'>('info')
const accountLabel = ref('')
const boundPrinter = ref<PrinterDevice | null>(null)
const presetPrinters = PRESET_PRINTERS

let refreshTimer: ReturnType<typeof setInterval> | null = null

function refreshLogs() {
  logs.value = getBluetoothPrinterLogs()
}

function setStatus(msg: string, type: 'info' | 'warn' | 'error' = 'info') {
  statusText.value = msg
  statusType.value = type
}

async function scanDevices() {
  if (scanning.value) return
  scanning.value = true
  devices.value = []
  setStatus('')
  try {
    appendLog('info', '开始扫描 BLE 设备...')
    const found = await listNearbyPrinters()
    devices.value = found
    if (found.length === 0) {
      appendLog('warn', '未发现 BLE 设备，请确认打印机已开机')
    } else {
      appendLog('info', `发现 ${found.length} 个设备`)
    }
  } catch (e: any) {
    appendLog('error', `扫描失败：${e?.message || e}`)
  } finally {
    scanning.value = false
    refreshLogs()
  }
}

async function selectDevice(device: PrinterDevice) {
  savePrinter(device)
  currentPrinter.value = device
  setStatus(`已选择：${device.name}，点击"连接测试"验证连通性`)
  appendLog('info', `选择设备：${device.name} (${device.deviceId})`)
}

async function handleBindDevice(device: PrinterDevice) {
  // 先连接测试
  connecting.value = true
  setStatus(`正在连接测试 ${device.name}...`)
  try {
    const ok = await testConnection(device.deviceId)
    if (!ok) {
      setStatus('连接测试失败，无法绑定', 'error')
      connecting.value = false
      refreshLogs()
      return
    }
  } catch (e: any) {
    setStatus(`连接失败: ${e?.message || e}`, 'error')
    connecting.value = false
    refreshLogs()
    return
  }
  connecting.value = false

  // 连接成功，执行绑定
  const ok = bindPrinterToAccount(device)
  if (ok) {
    boundPrinter.value = getBoundPrinter()
    currentPrinter.value = device
    setStatus(`已绑定到 ${accountLabel.value}: ${device.name}`, 'info')
    uni.showToast({ title: '绑定成功', icon: 'success' })
  } else {
    setStatus('绑定失败：当前账户不支持绑定', 'error')
  }
  refreshLogs()
}

function handleUnbind() {
  uni.showModal({
    title: '解除绑定',
    content: `确认解除 ${accountLabel.value} 的打印机绑定？`,
    success: (res) => {
      if (!res.confirm) return
      unbindPrinterFromAccount()
      boundPrinter.value = getBoundPrinter()
      setStatus('已解除绑定')
      refreshLogs()
    },
  })
}

function refreshBindInfo() {
  accountLabel.value = getCurrentAccountLabel()
  boundPrinter.value = getBoundPrinter()
}

async function testConnect() {
  if (!currentPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  connecting.value = true
  setStatus('连接中...')
  try {
    const ok = await testConnection(currentPrinter.value.deviceId)
    if (ok) {
      setStatus('连接成功 ✓', 'info')
      uni.showToast({ title: '连接成功', icon: 'success' })
    } else {
      setStatus('连接失败', 'error')
    }
  } catch (e: any) {
    setStatus(`失败：${e?.message || e}`, 'error')
  } finally {
    connecting.value = false
    refreshLogs()
  }
}

async function disconnectPrinter() {
  try {
    await _disconnectPrinter()
    setStatus('已断开')
    appendLog('info', '已断开蓝牙连接')
  } catch (e: any) {
    appendLog('error', `断开失败：${e?.message || e}`)
  }
  refreshLogs()
}

async function handlePrintTest() {
  if (!currentPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  printing.value = true
  setStatus('')
  try {
    appendLog('info', `开始打印测试页：${currentPrinter.value.name}`)
    await doPrintTest(currentPrinter.value)
    appendLog('info', '打印指令已发送')
    setStatus('打印成功', 'info')
    uni.showToast({ title: '打印成功', icon: 'success' })
  } catch (e: any) {
    appendLog('error', `打印失败：${e?.message || e}`)
    setStatus(`失败：${e?.message || e}`, 'error')
    uni.showToast({ title: e?.message || '打印失败', icon: 'none' })
  } finally {
    printing.value = false
    refreshLogs()
  }
}

function clearPrinter() {
  clearSavedPrinter()
  currentPrinter.value = null
  setStatus('')
  appendLog('info', '已清除打印机选择')
}

function clearLogs() {
  clearBluetoothPrinterLogs()
  refreshLogs()
}

onMounted(() => {
  refreshTimer = setInterval(refreshLogs, 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

onShow(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  currentPrinter.value = getSavedPrinter()
  refreshBindInfo()
  refreshLogs()
})
</script>

<style lang="scss" scoped>
.printer-page {
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
    display: block;
  }

  .subtitle {
    font-size: 24rpx;
    color: #999;
    margin-top: 4rpx;
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
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.action {
  font-size: 28rpx;
  color: #1890ff;
}

.printer-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  margin-bottom: 16rpx;
}

.printer-name {
  font-size: 32rpx;
  font-weight: 500;
  color: #1f2937;
}

.printer-id {
  font-size: 22rpx;
  color: #94a3b8;
  word-break: break-all;
}

.row-btns {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.btn {
  flex: 1;
  height: 80rpx;
  background: #1890ff;
  color: #fff;
  font-size: 28rpx;
  border-radius: 40rpx;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-ghost {
  background: #f0f0f0;
  color: #666;
}

.status {
  font-size: 24rpx;
  margin-top: 12rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;

  &.info {
    background: #f0f9ff;
    color: #1890ff;
  }

  &.warn {
    background: #fffbeb;
    color: #d97706;
  }

  &.error {
    background: #fef2f2;
    color: #dc2626;
  }
}

.empty {
  color: #94a3b8;
  font-size: 26rpx;
  text-align: center;
  padding: 20rpx 0;
}

.bind-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.bind-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.bind-device {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding: 12rpx 16rpx;
  background: #f0f9ff;
  border-radius: 12rpx;
}

.bind-device-name {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: 500;
}

.bind-device-id {
  font-size: 22rpx;
  color: #94a3b8;
}

.bind-none {
  font-size: 24rpx;
  color: #d97706;
}

.device-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;

  &:last-child {
    border-bottom: none;
  }

  &.active .device-name {
    color: #1890ff;
  }
}

.device-main {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 0;
}

.btn-bind {
  height: 56rpx;
  padding: 0 24rpx;
  background: #52c41a;
  color: #fff;
  font-size: 24rpx;
  border-radius: 28rpx;
  border: none;
  line-height: 56rpx;
  margin-left: 16rpx;
  flex-shrink: 0;
}

.btn-bind::after {
  border: none;
}

.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f1f5f9;

  &:last-child {
    border-bottom: none;
  }
}

.preset-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.preset-value {
  font-size: 24rpx;
  color: #94a3b8;
}

.device-name {
  font-size: 28rpx;
  color: #1f2937;
  font-weight: 500;
}

.device-id {
  font-size: 22rpx;
  color: #94a3b8;
}

.log-item {
  padding: 10rpx 0;
  border-bottom: 1rpx solid #f1f5f9;

  &:last-child {
    border-bottom: none;
  }

  .log-time {
    font-size: 22rpx;
    color: #94a3b8;
    margin-right: 12rpx;
  }

  .log-msg {
    font-size: 24rpx;
    color: #334155;
  }

  &.error .log-msg {
    color: #dc2626;
  }

  &.warn .log-msg {
    color: #d97706;
  }
}
</style>
