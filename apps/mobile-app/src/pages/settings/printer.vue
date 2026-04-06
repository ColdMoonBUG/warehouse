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
        <button class="btn primary" :disabled="testing" @tap="printTest">
          {{ testing ? '正在打印...' : '打印测试页' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { clearSavedPrinter, getSavedPrinter, listPairedPrinters, openBluetoothSettings, printTestPage, savePrinter } from '@/utils/bluetooth-printer'
import type { BluetoothPrinterDevice } from '@/types'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const loading = ref(false)
const testing = ref(false)
const errorText = ref('')
const devices = ref<BluetoothPrinterDevice[]>([])
const selectedPrinter = ref<BluetoothPrinterDevice | null>(getSavedPrinter())

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
  }
}

function selectPrinter(device: BluetoothPrinterDevice) {
  savePrinter(device)
  selectedPrinter.value = device
  uni.showToast({ title: `已选择：${device.name}`, icon: 'none' })
}

function clearPrinter() {
  clearSavedPrinter()
  selectedPrinter.value = null
  uni.showToast({ title: '已清除打印机', icon: 'none' })
}

function openSystemBluetooth() {
  try {
    openBluetoothSettings()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '无法打开蓝牙设置', icon: 'none' })
  }
}

async function printTest() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  testing.value = true
  try {
    await printTestPage(selectedPrinter.value)
    uni.showToast({ title: '测试页已发送', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '测试打印失败', icon: 'none' })
  } finally {
    testing.value = false
  }
}

onShow(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
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
.empty {
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

.btn {
  flex: 1;
  height: 84rpx;
  border-radius: 42rpx;
  border: none;
  font-size: 28rpx;
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

.error {
  color: #dc2626;
}
</style>
