<template>
  <view class="printer-page">
    <view class="header">
      <text class="title">蓝牙打印</text>
    </view>

    <view class="content">
      <view class="card">
        <view class="card-head">
          <text class="card-title">当前打印机</text>
          <text class="card-action" @tap="loadDevices">刷新</text>
        </view>
        <view v-if="selectedPrinter" class="printer-current">
          <text class="printer-name">{{ selectedPrinter.name }}</text>
          <text class="printer-address">{{ selectedPrinter.address }}</text>
        </view>
        <view v-else class="empty">暂未选择打印机</view>
        <view class="actions">
          <button class="btn ghost" @tap="openSystemBluetooth">系统蓝牙设置</button>
          <button class="btn danger" @tap="clearPrinter">清除选择</button>
        </view>
      </view>

      <view class="card">
        <view class="card-head">
          <view>
            <text class="card-title">兼容策略</text>
            <text class="card-sub">打印失败时可切换不同编码和命令方案</text>
          </view>
        </view>
        <picker mode="selector" :range="strategyOptions" range-key="label" :value="strategyIndex" @change="onStrategyChange">
          <view class="picker">
            <text>{{ selectedStrategy?.label || '请选择兼容策略' }}</text>
          </view>
        </picker>
        <view v-if="selectedStrategy" class="strategy-desc">{{ selectedStrategy.description }}</view>
      </view>

      <view class="card">
        <view class="card-head">
          <text class="card-title">已配对设备</text>
          <text class="card-sub">先在系统蓝牙里完成配对，再回这里选择</text>
        </view>
        <view v-if="loading" class="empty">正在读取蓝牙设备...</view>
        <view v-else-if="errorText" class="empty error">{{ errorText }}</view>
        <view v-else-if="devices.length === 0" class="empty">暂无已配对设备</view>
        <view v-for="item in devices" :key="item.address" class="device-item" @tap="selectPrinter(item)">
          <view class="device-main">
            <text class="device-name">{{ item.name }}</text>
            <text class="device-address">{{ item.address }}</text>
          </view>
          <text v-if="selectedPrinter?.address === item.address" class="device-tag">当前</text>
        </view>
      </view>

      <view class="card">
        <view class="card-head">
          <text class="card-title">调试</text>
          <text class="card-sub">先打印测试页，确认蓝牙链路正常</text>
        </view>
        <view class="debug-actions">
          <button class="btn primary" :disabled="testing" @tap="printTest">
            {{ testing ? '正在打印...' : '打印测试页' }}
          </button>
          <button class="btn ghost" :disabled="inspecting" @tap="inspectBle">
            {{ inspecting ? '正在探测 BLE...' : '探测 BLE 服务' }}
          </button>
        </view>
      </view>

      <view class="card">
        <view class="card-head">
          <text class="card-title">运行日志</text>
          <text class="card-action" @tap="clearLogs">清空</text>
        </view>
        <view v-if="logs.length === 0" class="empty">暂无调试日志</view>
        <view v-for="item in logs" :key="item.id" class="log-item">
          <view class="log-head">
            <text class="log-time">{{ item.createdAt }}</text>
            <text class="log-level" :class="item.level">{{ levelText(item.level) }}</text>
          </view>
          <text class="log-message">{{ item.message }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  clearBluetoothPrinterLogs,
  clearSavedPrinter,
  getBluetoothPrinterLogs,
  getPrinterTransportStrategies,
  getSavedPrinter,
  getSavedPrinterTransportStrategyId,
  inspectBlePrinter,
  listPairedPrinters,
  openBluetoothSettings,
  printTestPage,
  savePrinter,
  savePrinterTransportStrategy,
} from '@/utils/bluetooth-printer'
import type { BluetoothPrinterDevice, BluetoothPrinterRuntimeLog, BluetoothPrinterStrategyOption } from '@/utils/bluetooth-printer'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const loading = ref(false)
const testing = ref(false)
const inspecting = ref(false)
const errorText = ref('')
const devices = ref<BluetoothPrinterDevice[]>([])
const selectedPrinter = ref<BluetoothPrinterDevice | null>(getSavedPrinter())
const strategyOptions = ref<BluetoothPrinterStrategyOption[]>(getPrinterTransportStrategies())
const selectedStrategyId = ref(getSavedPrinterTransportStrategyId())
const logs = ref<BluetoothPrinterRuntimeLog[]>(getBluetoothPrinterLogs())

const strategyIndex = computed(() => {
  const index = strategyOptions.value.findIndex(item => item.id === selectedStrategyId.value)
  return index >= 0 ? index : 0
})

const selectedStrategy = computed(() => strategyOptions.value[strategyIndex.value] || null)

function refreshLogs() {
  logs.value = getBluetoothPrinterLogs()
}

async function loadDevices() {
  loading.value = true
  errorText.value = ''
  try {
    devices.value = await listPairedPrinters()
    selectedPrinter.value = getSavedPrinter()
  } catch (error: any) {
    devices.value = []
    errorText.value = error?.message || '蓝牙设备读取失败'
  } finally {
    loading.value = false
    refreshLogs()
  }
}

function selectPrinter(device: BluetoothPrinterDevice) {
  savePrinter(device)
  selectedPrinter.value = device
  refreshLogs()
  uni.showToast({ title: `已选择：${device.name}`, icon: 'none' })
}

function clearPrinter() {
  clearSavedPrinter()
  selectedPrinter.value = null
  refreshLogs()
  uni.showToast({ title: '已清除打印机', icon: 'none' })
}

function openSystemBluetooth() {
  try {
    openBluetoothSettings()
    refreshLogs()
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '无法打开蓝牙设置', icon: 'none' })
  }
}

function onStrategyChange(e: any) {
  const next = strategyOptions.value[Number(e.detail.value)]
  if (!next) return
  savePrinterTransportStrategy(next.id)
  selectedStrategyId.value = next.id
  refreshLogs()
  uni.showToast({ title: `已切换：${next.label}`, icon: 'none' })
}

function clearLogs() {
  clearBluetoothPrinterLogs()
  refreshLogs()
}

function levelText(level: BluetoothPrinterRuntimeLog['level']) {
  if (level === 'error') return '错误'
  if (level === 'warn') return '警告'
  return '信息'
}

async function printTest() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  testing.value = true
  try {
    await printTestPage(selectedPrinter.value)
    refreshLogs()
    uni.showToast({ title: '测试页已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '测试打印失败', icon: 'none' })
  } finally {
    testing.value = false
  }
}

async function inspectBle() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  inspecting.value = true
  try {
    await inspectBlePrinter(selectedPrinter.value)
    refreshLogs()
    uni.showToast({ title: 'BLE 服务已探测', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || 'BLE 探测失败', icon: 'none' })
  } finally {
    inspecting.value = false
  }
}

onShow(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  strategyOptions.value = getPrinterTransportStrategies()
  selectedStrategyId.value = getSavedPrinterTransportStrategyId()
  refreshLogs()
  await loadDevices()
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
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.card-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.card-sub,
.card-action,
.printer-address,
.device-address,
.empty,
.strategy-desc,
.log-time {
  font-size: 24rpx;
  color: #94a3b8;
}

.card-action {
  color: #1890ff;
}

.printer-current,
.device-main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.printer-name,
.device-name {
  font-size: 28rpx;
  color: #1f2937;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.picker {
  padding: 20rpx;
  border: 2rpx solid #eee;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2937;
}

.strategy-desc {
  display: block;
  margin-top: 14rpx;
}

.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f1f5f9;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.device-tag {
  color: #dc2626;
  font-size: 24rpx;
  font-weight: 600;
}

.debug-actions {
  display: flex;
  gap: 16rpx;
}

.primary {
  width: 100%;
  background: #1890ff;
  color: #fff;
}

.ghost {
  background: #eff6ff;
  color: #1890ff;
}

.danger {
  background: #fef2f2;
  color: #dc2626;
}

.error,
.log-level.error {
  color: #dc2626;
}

.log-level.warn {
  color: #d97706;
}

.log-level.info {
  color: #2563eb;
}

.log-item {
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f1f5f9;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.log-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 10rpx;
}

.log-level {
  font-size: 22rpx;
  font-weight: 600;
}

.log-message {
  font-size: 26rpx;
  color: #334155;
  line-height: 1.5;
}
</style>
