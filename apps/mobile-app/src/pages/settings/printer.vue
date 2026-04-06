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
            <text class="card-title">连接协议</text>
            <text class="card-sub">M9 优先选 SPP，再试 RFCOMM Channel 3</text>
          </view>
        </view>
        <picker mode="selector" :range="transportOptions" range-key="label" :value="transportIndex" @change="onTransportChange">
          <view class="picker">
            <text>{{ selectedTransport?.label || '请选择连接协议' }}</text>
          </view>
        </picker>
        <view v-if="selectedTransport" class="strategy-desc">{{ selectedTransport.description }}</view>
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
          <button class="btn ghost" :disabled="officialHandshaking" @tap="runOfficialHandshake">
            {{ officialHandshaking ? '握手中...' : '官方 M9 握手' }}
          </button>
          <button class="btn ghost" :disabled="connectingSweep" @tap="runConnectionSweep">
            {{ connectingSweep ? '连接爆破中...' : '爆破连接' }}
          </button>
          <button class="btn ghost" :disabled="classicTesting" @tap="runClassicSuite">
            {{ classicTesting ? '爆破中...' : '爆破 M9 协议' }}
          </button>
          <button class="btn ghost" :disabled="inspecting" @tap="inspectBle">
            {{ inspecting ? '正在探测 BLE...' : '探测 BLE 服务' }}
          </button>
        </view>
        <view class="handshake-tip">
          <text class="device-meta">按官方顺序发送 10040A → 1F010700 → 浓度初始化 → 0A → 1F0106，并记录回包。</text>
        </view>
        <view class="classic-case-list">
          <text class="ble-selected-title">M9 爆破清单</text>
          <view v-for="item in classicCompatibilityCases" :key="item.id" class="classic-case-item">
            <text class="device-meta">{{ item.label }} · {{ item.protocol }}：{{ item.description }}</text>
            <button class="mini-btn" :disabled="classicTesting || singleCaseTestingId === item.id" @tap="runSingleCase(item.id)">
              {{ singleCaseTestingId === item.id ? '发送中...' : '单测' }}
            </button>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card-head">
          <text class="card-title">BLE 诊断</text>
          <text class="card-action" @tap="scanBleDevices">扫描</text>
        </view>
        <view class="card-sub ble-sub">适用于 MT688 一类 BLE 打印机，可查看服务、特征并做探测读写。</view>
        <view v-if="bleLoading" class="empty">正在扫描 BLE 设备...</view>
        <view v-else-if="bleErrorText" class="empty error">{{ bleErrorText }}</view>
        <view v-else-if="bleDevices.length === 0" class="empty">暂无 BLE 设备</view>
        <view v-for="item in bleDevices" :key="item.deviceId" class="ble-device-item" @tap="selectBleDevice(item)">
          <view class="device-main">
            <text class="device-name">{{ item.name }}</text>
            <text class="device-address">{{ item.deviceId }}</text>
            <text class="device-meta">RSSI {{ item.RSSI }}<text v-if="item.localName"> · {{ item.localName }}</text></text>
          </view>
          <text v-if="selectedBleDeviceId === item.deviceId" class="device-tag">当前</text>
        </view>
        <view v-if="selectedBleDevice" class="ble-actions">
          <button class="btn ghost" :disabled="probingBle" @tap="probeBle">{{ probingBle ? '探测中...' : '读取服务/特征' }}</button>
          <button class="btn ghost" :disabled="disconnectingBle" @tap="disconnectBle">{{ disconnectingBle ? '断开中...' : '断开 BLE' }}</button>
        </view>
        <view v-if="selectedBleDevice" class="ble-selected">
          <text class="ble-selected-title">当前 BLE 设备</text>
          <text class="device-name">{{ selectedBleDevice.name }}</text>
          <text class="device-address">{{ selectedBleDevice.deviceId }}</text>
        </view>
        <view v-if="bleProbeResult" class="ble-services">
          <view class="service-item" v-for="service in bleProbeResult.services" :key="service.uuid">
            <view class="service-head">
              <text class="service-title">服务 {{ service.uuid }}</text>
              <text class="service-tag" v-if="service.isPrimary">主服务</text>
            </view>
            <view v-if="service.characteristics.length === 0" class="empty">暂无特征</view>
            <view v-for="characteristic in service.characteristics" :key="`${service.uuid}_${characteristic.uuid}`" class="characteristic-item">
              <text class="characteristic-id">{{ characteristic.uuid }}</text>
              <text class="characteristic-props">{{ formatCharacteristicProperties(characteristic.properties) }}</text>
              <view class="characteristic-actions">
                <button class="mini-btn" :disabled="bleActionBusy" @tap.stop="toggleNotify(characteristic)">{{ characteristic.properties.notify || characteristic.properties.indicate ? '通知' : '无通知' }}</button>
                <button class="mini-btn" :disabled="bleActionBusy || !characteristic.properties.read" @tap.stop="readCharacteristic(characteristic)">读取</button>
                <button class="mini-btn" :disabled="bleActionBusy || !(characteristic.properties.write || characteristic.properties.writeNoResponse)" @tap.stop="useCharacteristic(characteristic)">写入目标</button>
              </view>
            </view>
          </view>
        </view>
        <view v-if="bleWriteTarget" class="ble-write-panel">
          <text class="ble-selected-title">写入调试</text>
          <text class="device-address">服务 {{ bleWriteTarget.serviceId }}</text>
          <text class="device-address">特征 {{ bleWriteTarget.uuid }}</text>
          <picker mode="selector" :range="bleWriteModeOptions" :value="bleWriteModeIndex" @change="onBleWriteModeChange">
            <view class="picker">
              <text>写入格式：{{ bleWriteMode === 'hex' ? 'HEX' : '文本' }}</text>
            </view>
          </picker>
          <textarea v-model="bleWritePayload" class="ble-textarea" :placeholder="bleWriteMode === 'hex' ? '例如：1B40' : '输入测试文本或命令'" />
          <view class="ble-actions">
            <button class="btn primary" :disabled="bleActionBusy || !bleWritePayload.trim()" @tap="writeCharacteristic">发送探测包</button>
            <button class="btn ghost" :disabled="bleActionBusy" @tap="runCompatibilitySuite">一键兼容测试</button>
          </view>
          <view class="ble-case-list">
            <text class="ble-selected-title">兼容测试清单</text>
            <text v-for="item in bleCompatibilityCases" :key="item.id" class="device-meta">{{ item.label }}：{{ item.writeMode === 'hex' ? item.payload : JSON.stringify(item.payload) }}</text>
          </view>
          <view class="ble-log-file">
            <text class="ble-selected-title">日志文件</text>
            <text class="device-meta">{{ logFilePath }}</text>
          </view>
          <view v-if="bleLastValue" class="ble-last-value">
            <text class="ble-selected-title">最近返回</text>
            <text class="device-meta">HEX {{ bleLastValue.hex || '-' }}</text>
            <text class="device-meta">文本 {{ bleLastValue.text || '-' }}</text>
          </view>
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
  disconnectBlePrinterDevice,
  getBleCompatibilityCases,
  getBluetoothPrinterLogFilePath,
  getBluetoothPrinterLogs,
  getClassicCompatibilityCases,
  getPrinterTransportOptions,
  getPrinterTransportStrategies,
  getSavedPrinter,
  getSavedPrinterTransportId,
  getSavedPrinterTransportStrategyId,
  inspectBlePrinter,
  listBlePrinterDiagnosticsDevices,
  listPairedPrinters,
  openBluetoothSettings,
  probeBlePrinterDevice,
  printTestPage,
  readBlePrinterCharacteristic,
  runBlePrinterCompatibilitySuite,
  runClassicPrinterCompatibilitySuite,
  runOfficialM9Handshake,
  runPrinterConnectionSweep,
  runSingleClassicCompatibilityCase,
  savePrinter,
  savePrinterTransportId,
  savePrinterTransportStrategy,
  setBlePrinterCharacteristicNotify,
  writeBlePrinterCharacteristic,
} from '@/utils/bluetooth-printer'
import type {
  BluetoothBleCharacteristic,
  BluetoothBleCompatibilityCase,
  BluetoothBleDevice,
  BluetoothBleProbeResult,
  BluetoothBleValueResult,
  BluetoothBleWriteMode,
  BluetoothClassicCompatibilityCase,
  BluetoothPrinterDevice,
  BluetoothPrinterRuntimeLog,
  BluetoothPrinterStrategyOption,
  BluetoothPrinterTransportOption,
} from '@/utils/bluetooth-printer'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const loading = ref(false)
const testing = ref(false)
const officialHandshaking = ref(false)
const classicTesting = ref(false)
const singleCaseTestingId = ref('')
const connectingSweep = ref(false)
const inspecting = ref(false)
const probingBle = ref(false)
const bleLoading = ref(false)
const bleActionBusy = ref(false)
const disconnectingBle = ref(false)
const errorText = ref('')
const bleErrorText = ref('')
const devices = ref<BluetoothPrinterDevice[]>([])
const bleDevices = ref<BluetoothBleDevice[]>([])
const selectedPrinter = ref<BluetoothPrinterDevice | null>(getSavedPrinter())
const selectedBleDeviceId = ref('')
const bleProbeResult = ref<BluetoothBleProbeResult | null>(null)
const bleWriteTarget = ref<BluetoothBleCharacteristic | null>(null)
const bleWritePayload = ref('')
const bleWriteMode = ref<BluetoothBleWriteMode>('text')
const bleLastValue = ref<BluetoothBleValueResult | null>(null)
const bleCompatibilityCases = ref<BluetoothBleCompatibilityCase[]>(getBleCompatibilityCases())
const classicCompatibilityCases = ref<BluetoothClassicCompatibilityCase[]>(getClassicCompatibilityCases())
const logFilePath = getBluetoothPrinterLogFilePath()
const transportOptions = ref<BluetoothPrinterTransportOption[]>(getPrinterTransportOptions())
const selectedTransportId = ref(getSavedPrinterTransportId())
const strategyOptions = ref<BluetoothPrinterStrategyOption[]>(getPrinterTransportStrategies())
const selectedStrategyId = ref(getSavedPrinterTransportStrategyId())
const logs = ref<BluetoothPrinterRuntimeLog[]>(getBluetoothPrinterLogs())

const transportIndex = computed(() => {
  const index = transportOptions.value.findIndex(item => item.id === selectedTransportId.value)
  return index >= 0 ? index : 0
})

const strategyIndex = computed(() => {
  const index = strategyOptions.value.findIndex(item => item.id === selectedStrategyId.value)
  return index >= 0 ? index : 0
})

const selectedTransport = computed(() => transportOptions.value[transportIndex.value] || null)
const selectedStrategy = computed(() => strategyOptions.value[strategyIndex.value] || null)
const selectedBleDevice = computed(() => bleDevices.value.find(item => item.deviceId === selectedBleDeviceId.value) || null)
const bleWriteModeOptions = ['文本', 'HEX']
const bleWriteModeIndex = computed(() => bleWriteMode.value === 'hex' ? 1 : 0)

function refreshLogs() {
  logs.value = getBluetoothPrinterLogs()
}

function resetBleProbeState() {
  bleProbeResult.value = null
  bleWriteTarget.value = null
  bleWritePayload.value = ''
  bleLastValue.value = null
}

function formatCharacteristicProperties(properties: BluetoothBleCharacteristic['properties']) {
  const labels: string[] = []
  if (properties.read) labels.push('read')
  if (properties.write) labels.push('write')
  if (properties.writeNoResponse) labels.push('writeNoRsp')
  if (properties.notify) labels.push('notify')
  if (properties.indicate) labels.push('indicate')
  return labels.join(' · ') || 'unknown'
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

async function scanBleDevices() {
  bleLoading.value = true
  bleErrorText.value = ''
  try {
    bleDevices.value = await listBlePrinterDiagnosticsDevices()
    if (selectedBleDeviceId.value && !bleDevices.value.some(item => item.deviceId === selectedBleDeviceId.value)) {
      selectedBleDeviceId.value = ''
      resetBleProbeState()
    }
  } catch (error: any) {
    bleDevices.value = []
    bleErrorText.value = error?.message || 'BLE 设备扫描失败'
  } finally {
    bleLoading.value = false
    refreshLogs()
  }
}

function selectPrinter(device: BluetoothPrinterDevice) {
  savePrinter(device)
  selectedPrinter.value = device
  refreshLogs()
  uni.showToast({ title: `已选择：${device.name}`, icon: 'none' })
}

function selectBleDevice(device: BluetoothBleDevice) {
  selectedBleDeviceId.value = device.deviceId
  resetBleProbeState()
  uni.showToast({ title: `已选择 BLE：${device.name}`, icon: 'none' })
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

function onTransportChange(e: any) {
  const next = transportOptions.value[Number(e.detail.value)]
  if (!next) return
  savePrinterTransportId(next.id)
  selectedTransportId.value = next.id
  refreshLogs()
  uni.showToast({ title: `协议：${next.label}`, icon: 'none' })
}

function clearLogs() {
  clearBluetoothPrinterLogs()
  refreshLogs()
}

function onBleWriteModeChange(e: any) {
  bleWriteMode.value = Number(e.detail.value) === 1 ? 'hex' : 'text'
}

function useCharacteristic(characteristic: BluetoothBleCharacteristic) {
  bleWriteTarget.value = characteristic
  bleWritePayload.value = bleWriteMode.value === 'hex' ? '1B40' : 'STATUS?'
  bleLastValue.value = null
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

async function runClassicSuite() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  classicTesting.value = true
  try {
    await runClassicPrinterCompatibilitySuite(selectedPrinter.value)
    refreshLogs()
    uni.showToast({ title: 'M9 爆破已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || 'M9 爆破失败', icon: 'none' })
  } finally {
    classicTesting.value = false
  }
}

async function runOfficialHandshake() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  officialHandshaking.value = true
  try {
    const reply = await runOfficialM9Handshake(selectedPrinter.value)
    refreshLogs()
    uni.showToast({ title: reply?.hex?.includes('1F010506') ? '已收到 ACK' : '握手已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '官方握手失败', icon: 'none' })
  } finally {
    officialHandshaking.value = false
  }
}

async function runConnectionSweep() {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  connectingSweep.value = true
  try {
    const result = await runPrinterConnectionSweep(selectedPrinter.value)
    selectedTransportId.value = result
    refreshLogs()
    uni.showToast({ title: `连接成功：${result}`, icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '连接爆破失败', icon: 'none' })
  } finally {
    connectingSweep.value = false
  }
}

async function runSingleCase(caseId: string) {
  if (!selectedPrinter.value) {
    uni.showToast({ title: '请先选择打印机', icon: 'none' })
    return
  }
  singleCaseTestingId.value = caseId
  try {
    await runSingleClassicCompatibilityCase({
      caseId,
      device: selectedPrinter.value,
    })
    refreshLogs()
    uni.showToast({ title: '单项已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '单项测试失败', icon: 'none' })
  } finally {
    singleCaseTestingId.value = ''
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

async function probeBle() {
  if (!selectedBleDeviceId.value) {
    uni.showToast({ title: '请先选择 BLE 设备', icon: 'none' })
    return
  }
  probingBle.value = true
  bleActionBusy.value = true
  try {
    bleProbeResult.value = await probeBlePrinterDevice(selectedBleDeviceId.value)
    const firstWritable = bleProbeResult.value.services
      .flatMap(service => service.characteristics)
      .find(item => item.properties.write || item.properties.writeNoResponse)
    bleWriteTarget.value = firstWritable || null
    if (firstWritable && !bleWritePayload.value.trim()) {
      bleWritePayload.value = 'STATUS?'
    }
    refreshLogs()
    uni.showToast({ title: 'BLE 探测完成', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || 'BLE 探测失败', icon: 'none' })
  } finally {
    probingBle.value = false
    bleActionBusy.value = false
  }
}

async function toggleNotify(characteristic: BluetoothBleCharacteristic) {
  if (!selectedBleDeviceId.value) return
  if (!(characteristic.properties.notify || characteristic.properties.indicate)) {
    uni.showToast({ title: '该特征不支持通知', icon: 'none' })
    return
  }
  bleActionBusy.value = true
  try {
    await setBlePrinterCharacteristicNotify({
      deviceId: selectedBleDeviceId.value,
      serviceId: characteristic.serviceId,
      characteristicId: characteristic.uuid,
      enabled: true,
    })
    refreshLogs()
    uni.showToast({ title: '通知已启用', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '通知启用失败', icon: 'none' })
  } finally {
    bleActionBusy.value = false
  }
}

async function readCharacteristic(characteristic: BluetoothBleCharacteristic) {
  if (!selectedBleDeviceId.value) return
  bleActionBusy.value = true
  try {
    bleLastValue.value = await readBlePrinterCharacteristic({
      deviceId: selectedBleDeviceId.value,
      serviceId: characteristic.serviceId,
      characteristicId: characteristic.uuid,
    })
    refreshLogs()
    uni.showToast({ title: '读取完成', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '读取失败', icon: 'none' })
  } finally {
    bleActionBusy.value = false
  }
}

async function writeCharacteristic() {
  if (!selectedBleDeviceId.value || !bleWriteTarget.value) {
    uni.showToast({ title: '请先选择写入特征', icon: 'none' })
    return
  }
  bleActionBusy.value = true
  try {
    bleLastValue.value = await writeBlePrinterCharacteristic({
      deviceId: selectedBleDeviceId.value,
      serviceId: bleWriteTarget.value.serviceId,
      characteristicId: bleWriteTarget.value.uuid,
      payload: bleWritePayload.value,
      writeMode: bleWriteMode.value,
    })
    refreshLogs()
    uni.showToast({ title: '探测包已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '写入失败', icon: 'none' })
  } finally {
    bleActionBusy.value = false
  }
}

async function runCompatibilitySuite() {
  if (!selectedBleDeviceId.value || !bleWriteTarget.value) {
    uni.showToast({ title: '请先选择写入特征', icon: 'none' })
    return
  }
  bleActionBusy.value = true
  try {
    await runBlePrinterCompatibilitySuite({
      deviceId: selectedBleDeviceId.value,
      serviceId: bleWriteTarget.value.serviceId,
      characteristicId: bleWriteTarget.value.uuid,
    })
    refreshLogs()
    uni.showToast({ title: '兼容测试已发送', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || '兼容测试失败', icon: 'none' })
  } finally {
    bleActionBusy.value = false
  }
}

async function disconnectBle() {
  if (!selectedBleDeviceId.value) return
  disconnectingBle.value = true
  try {
    await disconnectBlePrinterDevice(selectedBleDeviceId.value)
    refreshLogs()
    uni.showToast({ title: 'BLE 已断开', icon: 'success' })
  } catch (error: any) {
    refreshLogs()
    uni.showToast({ title: error?.message || 'BLE 断开失败', icon: 'none' })
  } finally {
    disconnectingBle.value = false
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
  transportOptions.value = getPrinterTransportOptions()
  selectedTransportId.value = getSavedPrinterTransportId()
  refreshLogs()
  await loadDevices()
  await scanBleDevices()
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

.ble-sub,
.device-meta,
.characteristic-props,
.characteristic-id,
.service-tag {
  font-size: 22rpx;
  color: #64748b;
}

.ble-device-item,
.service-item,
.characteristic-item,
.ble-write-panel,
.ble-selected,
.ble-last-value {
  border-top: 2rpx solid #f1f5f9;
  padding-top: 18rpx;
  margin-top: 18rpx;
}

.ble-actions,
.characteristic-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
  flex-wrap: wrap;
}

.ble-selected-title,
.service-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2937;
  display: block;
  margin-bottom: 8rpx;
}

.service-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
}

.characteristic-actions {
  margin-top: 12rpx;
}

.mini-btn {
  min-width: 120rpx;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 20rpx;
  border-radius: 32rpx;
  border: none;
  background: #eff6ff;
  color: #2563eb;
  font-size: 24rpx;
}

.ble-case-list,
.ble-log-file,
.classic-case-list,
.handshake-tip {
  border-top: 2rpx solid #f1f5f9;
  padding-top: 18rpx;
  margin-top: 18rpx;
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
