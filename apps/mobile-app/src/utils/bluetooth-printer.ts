import type { Product, ReturnDoc, SaleDoc } from '@/types'
import { formatDate, formatPackSummary, normalizeCount } from '@/utils'

export interface BluetoothPrinterDevice {
  name: string
  address: string
}

export interface BluetoothPrinterRuntimeLog {
  id: string
  createdAt: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface BluetoothPrinterStrategyOption {
  id: string
  label: string
  description: string
}

export interface BluetoothPrinterTransportOption {
  id: string
  label: string
  description: string
}

export type BluetoothBleWriteMode = 'text' | 'hex'

export interface BluetoothBleDevice {
  deviceId: string
  name: string
  localName: string
  RSSI: number
  advertisServiceUUIDs: string[]
}

export interface BluetoothBleCharacteristicProperties {
  read: boolean
  write: boolean
  writeNoResponse: boolean
  notify: boolean
  indicate: boolean
}

export interface BluetoothBleCharacteristic {
  serviceId: string
  uuid: string
  properties: BluetoothBleCharacteristicProperties
}

export interface BluetoothBleService {
  uuid: string
  isPrimary: boolean
  characteristics: BluetoothBleCharacteristic[]
}

export interface BluetoothBleProbeResult {
  device: BluetoothBleDevice
  services: BluetoothBleService[]
}

export interface BluetoothBleValueResult {
  hex: string
  text: string
}

export interface BluetoothBleCompatibilityCase {
  id: string
  label: string
  writeMode: BluetoothBleWriteMode
  payload: string
}

export type BluetoothClassicWriteMode = 'text' | 'hex'

export interface BluetoothClassicCompatibilityCase {
  id: string
  label: string
  protocol: 'plain-text' | 'escpos' | 'tspl' | 'cpcl' | 'zpl' | 'epl'
  writeMode: BluetoothClassicWriteMode
  payload: string
  description: string
  waitAfterMs?: number
}

export interface BluetoothClassicReadResult {
  hex: string
  text: string
  length: number
}

interface BluetoothPrinterStrategy extends BluetoothPrinterStrategyOption {
  encoding: 'GB18030' | 'GBK' | 'GB2312'
  lineEnding: '\r\n' | '\n'
  tailFeedCount: number
  chunkDelay: number
  blankDelay: number
  connectDelay: number
  initCommands: number[][]
}

interface BleValueWaiter {
  reject: (error: Error) => void
  resolve: (value: BluetoothBleValueResult) => void
  timer: ReturnType<typeof setTimeout>
}

const STORAGE_KEY = 'mobile_bluetooth_printer_v1'
const STRATEGY_STORAGE_KEY = 'mobile_bluetooth_printer_strategy_v1'
const TRANSPORT_STORAGE_KEY = 'mobile_bluetooth_printer_transport_v1'
const LOG_STORAGE_KEY = 'mobile_bluetooth_printer_logs_v1'
const LOG_LIMIT = 400
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB'
const DEFAULT_BLE_SCAN_MS = 4000
const DEFAULT_BLE_MTU = 180
const DEFAULT_BLE_VALUE_TIMEOUT = 3000
const DEFAULT_CLASSIC_READ_TIMEOUT = 1200
const DEFAULT_CLASSIC_HANDSHAKE_GAP = 220
const OFFICIAL_STATUS_ACK = '1F010506'
const OFFICIAL_DENSITY_NORMAL = '1B401FFD0101101FFD01023C1FFD0103011FFD0104021FFD0105021FFD010600'
const OFFICIAL_STATUS_QUERY = '1F0106'
const OFFICIAL_DEVICE_INFO_ALL = '10040A'
const OFFICIAL_WAKE_COMMAND = '1F010700'
const OFFICIAL_NEWLINE_G = '0A'
const CLASSIC_COMPATIBILITY_CASES: BluetoothClassicCompatibilityCase[] = [
  {
    id: 'official-device-info-all',
    label: '官方查询 ALL',
    protocol: 'plain-text',
    writeMode: 'hex',
    payload: '10040A',
    description: '官方设备信息查询包，查询 paper/bat/ver/all',
    waitAfterMs: 320,
  },
  {
    id: 'official-density-normal',
    label: '官方浓度 NORMAL',
    protocol: 'plain-text',
    writeMode: 'hex',
    payload: '1B401FFD0101101FFD01023C1FFD0103011FFD0104021FFD0105021FFD010600',
    description: '官方常见初始化和浓度配置串',
    waitAfterMs: 260,
  },
  {
    id: 'official-newline-g',
    label: '官方换行 G组',
    protocol: 'plain-text',
    writeMode: 'hex',
    payload: '0A',
    description: 'M9/M10 这类 G 组机型常见单换行收尾',
    waitAfterMs: 200,
  },
  {
    id: 'official-status-query',
    label: '官方状态查询',
    protocol: 'plain-text',
    writeMode: 'hex',
    payload: '1F0106',
    description: '官方打印后状态查询，期望收到 ACK 或文本状态包',
    waitAfterMs: 360,
  },
  {
    id: 'plain-test',
    label: '纯文本 TEST',
    protocol: 'plain-text',
    writeMode: 'text',
    payload: 'TEST\r\n\r\n',
    description: '最小串口文本，验证设备是否接受裸文本',
  },
  {
    id: 'json-test',
    label: 'JSON TEST',
    protocol: 'plain-text',
    writeMode: 'text',
    payload: '{"cmd":"print","text":"TEST"}\n',
    description: '尝试命中抓包里出现过的 7B22 ({") 结构化起始',
  },
  {
    id: 'device-info',
    label: '设备信息命令',
    protocol: 'plain-text',
    writeMode: 'text',
    payload: '{"cmd":"device_info"}\n',
    description: '尝试触发厂商 app 中的设备信息查询链路',
  },
  {
    id: 'escpos-init-test',
    label: 'ESC/POS 初始化+TEST',
    protocol: 'escpos',
    writeMode: 'hex',
    payload: '1B401B6100544553540D0A0D0A',
    description: '标准 ESC/POS 初始化后打印 TEST',
  },
  {
    id: 'escpos-cut-test',
    label: 'ESC/POS 初始化+走纸',
    protocol: 'escpos',
    writeMode: 'hex',
    payload: '1B400A0A0A1D5600',
    description: '只发初始化、走纸、切纸，确认是否为小票机协议',
  },
  {
    id: 'tspl-text',
    label: 'TSPL 文本标签',
    protocol: 'tspl',
    writeMode: 'text',
    payload: 'SIZE 40 mm,30 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nDIRECTION 1\r\nCLS\r\nTEXT 20,20,"TSS24.BF2",0,1,1,"TEST"\r\nPRINT 1,1\r\n',
    description: '按常见标签机 TSPL 命令打印一张 TEST 标签',
    waitAfterMs: 900,
  },
  {
    id: 'tspl-text-rotated',
    label: 'TSPL 方向切换',
    protocol: 'tspl',
    writeMode: 'text',
    payload: 'SIZE 40 mm,30 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 12\r\nDIRECTION 0\r\nCLS\r\nTEXT 20,20,"TSS24.BF2",0,1,1,"TEST"\r\nPRINT 1,1\r\n',
    description: '切换方向和浓度，覆盖纸张方向/浓度兼容性',
    waitAfterMs: 900,
  },
  {
    id: 'cpcl-text',
    label: 'CPCL 文本标签',
    protocol: 'cpcl',
    writeMode: 'text',
    payload: '! 0 200 200 240 1\r\nTEXT 4 0 30 40 TEST\r\nFORM\r\nPRINT\r\n',
    description: '尝试 CPCL 指令链路',
    waitAfterMs: 900,
  },
  {
    id: 'zpl-text',
    label: 'ZPL 文本标签',
    protocol: 'zpl',
    writeMode: 'text',
    payload: '^XA^PW400^LL240^FO30,30^A0N,40,40^FDTEST^FS^XZ',
    description: '尝试 ZPL 指令链路',
    waitAfterMs: 900,
  },
  {
    id: 'epl-text',
    label: 'EPL 文本标签',
    protocol: 'epl',
    writeMode: 'text',
    payload: 'N\nA30,30,0,4,1,1,N,"TEST"\nP1\n',
    description: '尝试 EPL 指令链路',
    waitAfterMs: 900,
  },
]
const BLE_COMPATIBILITY_CASES: BluetoothBleCompatibilityCase[] = [
  { id: 'esc-init', label: 'ESC 初始化', writeMode: 'hex', payload: '1B40' },
  { id: 'esc-init-feed-lf', label: 'ESC 初始化+LF', writeMode: 'hex', payload: '1B400A0A' },
  { id: 'esc-init-feed-crlf', label: 'ESC 初始化+CRLF', writeMode: 'hex', payload: '1B400D0A0D0A' },
  { id: 'cut-command', label: '切纸指令', writeMode: 'hex', payload: '1D5600' },
  { id: 'status-text', label: 'ASCII STATUS?', writeMode: 'text', payload: 'STATUS?' },
  { id: 'test-text', label: 'ASCII TEST', writeMode: 'text', payload: 'TEST\n' },
  { id: 'hex-test', label: 'TEST 十六进制', writeMode: 'hex', payload: '544553540A' },
]

const connectedBleDeviceIds = new Set<string>()
const bleValueWaiters = new Map<string, BleValueWaiter>()
const bleLastValues = new Map<string, BluetoothBleValueResult>()
let bleListenersRegistered = false

const PRINTER_STRATEGIES: BluetoothPrinterStrategy[] = [
  {
    id: 'escpos-gb18030-crlf',
    label: 'ESC/POS · GB18030 · CRLF',
    description: '全量初始化，适合大多数中文打印机',
    encoding: 'GB18030',
    lineEnding: '\r\n',
    tailFeedCount: 3,
    chunkDelay: 40,
    blankDelay: 80,
    connectDelay: 140,
    initCommands: [
      [0x1b, 0x40],
      [0x1b, 0x32],
      [0x1b, 0x4d, 0x00],
      [0x1d, 0x21, 0x00],
      [0x1b, 0x61, 0x00],
    ],
  },
  {
    id: 'escpos-gbk-crlf',
    label: 'ESC/POS · GBK · CRLF',
    description: '兼容较老中文固件和常见热敏机',
    encoding: 'GBK',
    lineEnding: '\r\n',
    tailFeedCount: 4,
    chunkDelay: 55,
    blankDelay: 90,
    connectDelay: 180,
    initCommands: [
      [0x1b, 0x40],
      [0x1b, 0x33, 0x20],
      [0x1b, 0x61, 0x00],
    ],
  },
  {
    id: 'basic-gb2312-lf',
    label: '基础文本 · GB2312 · LF',
    description: '尽量少发控制命令，适合只接收简单文本的模块',
    encoding: 'GB2312',
    lineEnding: '\n',
    tailFeedCount: 4,
    chunkDelay: 70,
    blankDelay: 110,
    connectDelay: 220,
    initCommands: [
      [0x1b, 0x40],
    ],
  },
  {
    id: 'plain-gbk-crlf',
    label: '直写文本 · GBK · CRLF',
    description: '跳过初始化命令，适合对 ESC/POS 兼容性差的桥接设备',
    encoding: 'GBK',
    lineEnding: '\r\n',
    tailFeedCount: 5,
    chunkDelay: 85,
    blankDelay: 120,
    connectDelay: 260,
    initCommands: [],
  },
]

const TRANSPORT_OPTIONS: BluetoothPrinterTransportOption[] = [
  {
    id: 'secure-spp-uuid',
    label: 'SPP 安全连接',
    description: '标准 createRfcommSocketToServiceRecord，优先用于 M9',
  },
  {
    id: 'insecure-spp-uuid',
    label: 'SPP 非安全连接',
    description: '标准 SPP 非安全连接，兼容部分旧设备',
  },
  {
    id: 'secure-channel-3',
    label: 'RFCOMM 通道3',
    description: '按抓包里的 Channel 3 直连',
  },
  {
    id: 'insecure-channel-3',
    label: 'RFCOMM 通道3 非安全',
    description: '按 Channel 3 非安全直连',
  },
  {
    id: 'secure-channel-1',
    label: 'RFCOMM 通道1',
    description: '旧设备常见兜底通道',
  },
  {
    id: 'insecure-channel-1',
    label: 'RFCOMM 通道1 非安全',
    description: '旧设备常见兜底通道的非安全连接',
  },
]

function getPlus() {
  return (globalThis as any).plus
}

function isAndroidApp() {
  const plusApi = getPlus()
  return !!plusApi && plusApi.os?.name === 'Android'
}

function ensureAndroidApp() {
  if (!isAndroidApp()) {
    throw new Error('当前仅支持 Android 真机蓝牙打印')
  }
  return getPlus()
}

function getSdkInt() {
  const plusApi = ensureAndroidApp()
  const Version = plusApi.android.importClass('android.os.Build$VERSION')
  return Number(Version.SDK_INT || 0)
}

function getBluetoothAdapter() {
  const plusApi = ensureAndroidApp()
  const BluetoothAdapter = plusApi.android.importClass('android.bluetooth.BluetoothAdapter')
  const adapter = BluetoothAdapter.getDefaultAdapter()
  if (!adapter) {
    throw new Error('当前设备不支持蓝牙')
  }
  return { plusApi, adapter }
}

function formatPrinterName(name?: string) {
  return name?.trim() || '未命名设备'
}

function normalizePrinter(device?: Partial<BluetoothPrinterDevice> | null) {
  if (!device?.address) return null
  return {
    name: formatPrinterName(device.name),
    address: String(device.address),
  }
}

function readLogs() {
  try {
    const raw = uni.getStorageSync(LOG_STORAGE_KEY)
    if (!raw) return [] as BluetoothPrinterRuntimeLog[]
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed as BluetoothPrinterRuntimeLog[] : []
  } catch {
    return []
  }
}

function writeLogs(logs: BluetoothPrinterRuntimeLog[]) {
  try {
    uni.setStorageSync(LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, LOG_LIMIT)))
  } catch {
    // ignore log persistence failures
  }
}

function stringifyLogLine(entry: BluetoothPrinterRuntimeLog) {
  return `[${entry.createdAt}] [${entry.level.toUpperCase()}] ${entry.message}`
}

function writeConsoleLog(entry: BluetoothPrinterRuntimeLog) {
  const line = `[BT-PRINTER] ${stringifyLogLine(entry)}`
  if (entry.level === 'error') {
    console.error(line)
    return
  }
  if (entry.level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

async function appendLogFile(entry: BluetoothPrinterRuntimeLog) {
  const plusApi = getPlus()
  if (!plusApi?.io) return

  await new Promise<void>((resolve) => {
    plusApi.io.requestFileSystem(plusApi.io.PRIVATE_DOC, (fs: any) => {
      fs.root.getFile('bluetooth-printer.log', { create: true }, (fileEntry: any) => {
        fileEntry.createWriter((writer: any) => {
          const previousLength = Number(writer.length || 0)
          writer.seek(previousLength)
          writer.onwrite = () => resolve()
          writer.onerror = () => resolve()
          writer.write(`${stringifyLogLine(entry)}\n`)
        }, () => resolve())
      }, () => resolve())
    }, () => resolve())
  })
}

function appendLog(level: BluetoothPrinterRuntimeLog['level'], message: string) {
  const next: BluetoothPrinterRuntimeLog = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'),
    level,
    message,
  }
  writeLogs([next, ...readLogs()])
  writeConsoleLog(next)
  void appendLogFile(next)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getErrorMessage(error: any, fallback = '未知错误') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.errMsg || error.message || fallback
}

function normalizeBleError(error: any, fallback = 'BLE 操作失败') {
  const message = getErrorMessage(error, fallback)
  if (message.includes('10000') || /not\s+init/i.test(message)) return '蓝牙适配器未初始化'
  if (message.includes('10001') || /not\s+available/i.test(message)) return '蓝牙不可用，请先打开手机蓝牙'
  if (message.includes('10003') || /connection\s+fail/i.test(message)) return '连接 BLE 设备失败'
  if (message.includes('10012')) return '连接超时，请让设备靠近手机后重试'
  return message
}

function callUniApi<T>(executor: (handlers: { fail: (error: any) => void; success: (result: any) => void }) => void) {
  return new Promise<T>((resolve, reject) => {
    try {
      executor({
        success: (result: any) => resolve(result as T),
        fail: (error: any) => reject(error),
      })
    } catch (error) {
      reject(error)
    }
  })
}

function getUniBluetooth() {
  return uni as any
}

function normalizeDeviceId(value?: string) {
  return String(value || '').trim().toLowerCase()
}

function normalizeBleUuid(value?: string) {
  return String(value || '').trim().toLowerCase()
}

function normalizeBleDevice(device: any): BluetoothBleDevice | null {
  const deviceId = String(device?.deviceId || '').trim()
  if (!deviceId) return null
  const localName = String(device?.localName || '').trim()
  const name = String(device?.name || '').trim() || localName || deviceId
  return {
    deviceId,
    name,
    localName,
    RSSI: Number(device?.RSSI || 0),
    advertisServiceUUIDs: Array.isArray(device?.advertisServiceUUIDs)
      ? device.advertisServiceUUIDs.map((item: any) => String(item)).filter(Boolean)
      : [],
  }
}

function normalizeBleCharacteristicProperties(properties: any): BluetoothBleCharacteristicProperties {
  return {
    read: !!properties?.read,
    write: !!properties?.write,
    writeNoResponse: !!properties?.writeNoResponse,
    notify: !!properties?.notify,
    indicate: !!properties?.indicate,
  }
}

function getBleCharacteristicKey(deviceId: string, serviceId: string, characteristicId: string) {
  return `${deviceId}::${serviceId}::${characteristicId}`
}

function toByteArray(value: any) {
  if (!value) return [] as number[]
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  if (Array.isArray(value)) return value.map(item => Number(item) & 0xff)
  try {
    return Array.from(new Uint8Array(value))
  } catch {
    return []
  }
}

function bytesToHex(bytes: number[]) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

function bytesToText(bytes: number[]) {
  if (bytes.length === 0) return ''
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    }
  } catch {
    // ignore and fall back
  }
  try {
    return decodeURIComponent(bytes.map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''))
  } catch {
    return bytes
      .map(byte => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('')
  }
}

function normalizeBleValue(value: any): BluetoothBleValueResult {
  const bytes = toByteArray(value)
  return {
    hex: bytesToHex(bytes),
    text: bytesToText(bytes),
  }
}

function textToArrayBuffer(text: string) {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text).buffer
    }
  } catch {
    // ignore and fall back
  }
  const encoded = encodeURIComponent(text)
  const bytes: number[] = []
  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index]
    if (char === '%') {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16))
      index += 2
      continue
    }
    bytes.push(char.charCodeAt(0))
  }
  return new Uint8Array(bytes).buffer
}

function hexToArrayBuffer(value: string) {
  const normalized = value.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (!normalized) {
    throw new Error('请输入十六进制探测包')
  }
  if (normalized.length % 2 !== 0) {
    throw new Error('十六进制探测包长度必须为偶数')
  }
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes.buffer
}

function truncateText(value: string, limit = 48) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function summarizeBleValue(value: BluetoothBleValueResult) {
  const parts = [] as string[]
  if (value.hex) parts.push(`HEX ${truncateText(value.hex, 54)}`)
  if (value.text) parts.push(`文本 ${truncateText(value.text.replace(/\s+/g, ' '), 28)}`)
  return parts.join(' · ') || '空数据'
}

function shortUuid(uuid: string) {
  return uuid.length > 18 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid
}

function rejectBleWaitersByDevice(deviceId: string, reason: string) {
  for (const [key, waiter] of bleValueWaiters.entries()) {
    if (!key.startsWith(`${deviceId}::`)) continue
    clearTimeout(waiter.timer)
    bleValueWaiters.delete(key)
    waiter.reject(new Error(reason))
  }
}

function clearBleWaiter(key: string, error?: Error) {
  const waiter = bleValueWaiters.get(key)
  if (!waiter) return
  clearTimeout(waiter.timer)
  bleValueWaiters.delete(key)
  if (error) waiter.reject(error)
}

function waitForBleValue(deviceId: string, serviceId: string, characteristicId: string, timeout = DEFAULT_BLE_VALUE_TIMEOUT) {
  const key = getBleCharacteristicKey(deviceId, serviceId, characteristicId)
  clearBleWaiter(key)
  return new Promise<BluetoothBleValueResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      bleValueWaiters.delete(key)
      reject(new Error('等待 BLE 特征值返回超时'))
    }, timeout)
    bleValueWaiters.set(key, { resolve, reject, timer })
  })
}

function ensureBleListenersRegistered() {
  if (bleListenersRegistered) return
  bleListenersRegistered = true

  uni.onBLEConnectionStateChange((result: any) => {
    const deviceId = String(result?.deviceId || '').trim()
    if (!deviceId) return
    if (result?.connected) {
      connectedBleDeviceIds.add(deviceId)
      appendLog('info', `BLE连接状态：已连接 ${deviceId}`)
      return
    }
    connectedBleDeviceIds.delete(deviceId)
    rejectBleWaitersByDevice(deviceId, 'BLE 连接已断开')
    appendLog('warn', `BLE连接状态：已断开 ${deviceId}`)
  })

  uni.onBLECharacteristicValueChange((result: any) => {
    const deviceId = String(result?.deviceId || '').trim()
    const serviceId = String(result?.serviceId || '').trim()
    const characteristicId = String(result?.characteristicId || '').trim()
    if (!deviceId || !serviceId || !characteristicId) return
    const key = getBleCharacteristicKey(deviceId, serviceId, characteristicId)
    const value = normalizeBleValue(result?.value)
    bleLastValues.set(key, value)
    appendLog('info', `BLE特征更新 ${shortUuid(serviceId)} / ${shortUuid(characteristicId)}：${summarizeBleValue(value)}`)
    const waiter = bleValueWaiters.get(key)
    if (!waiter) return
    clearTimeout(waiter.timer)
    bleValueWaiters.delete(key)
    waiter.resolve(value)
  })
}

async function openBleAdapter() {
  await ensureBluetoothEnabled()
  ensureBleListenersRegistered()
  const uniApi = getUniBluetooth()
  await new Promise<void>((resolve, reject) => {
    uniApi.openBluetoothAdapter({
      success: () => {
        appendLog('info', 'BLE 适配器已打开')
        resolve()
      },
      fail: (error: any) => {
        const message = normalizeBleError(error, 'BLE 适配器打开失败')
        if (/already/i.test(message)) {
          appendLog('info', 'BLE 适配器已打开')
          resolve()
          return
        }
        appendLog('warn', `BLE 适配器打开失败：${message}`)
        reject(new Error(message))
      },
    })
  })
}

async function startBleDiscovery(scanMs = DEFAULT_BLE_SCAN_MS) {
  await stopBleDiscovery()
  const uniApi = getUniBluetooth()
  appendLog('info', `开始扫描附近 BLE 设备，持续 ${scanMs}ms`)
  await new Promise<void>((resolve, reject) => {
    uniApi.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      interval: 0,
      success: () => resolve(),
      fail: (error: any) => {
        const message = normalizeBleError(error, 'BLE 扫描启动失败')
        if (/already/i.test(message)) {
          resolve()
          return
        }
        appendLog('warn', `BLE 扫描启动失败：${message}`)
        reject(new Error(message))
      },
    })
  })
  await sleep(scanMs)
}

async function stopBleDiscovery() {
  const uniApi = getUniBluetooth()
  await new Promise<void>((resolve) => {
    uniApi.stopBluetoothDevicesDiscovery({
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
}

async function getBleDiscoveredPrinters() {
  const uniApi = getUniBluetooth()
  const result = await new Promise<any>((resolve, reject) => {
    uniApi.getBluetoothDevices({
      success: resolve,
      fail: (error: any) => reject(new Error(normalizeBleError(error, '读取 BLE 设备失败'))),
    })
  })

  const seen = new Set<string>()
  const devices = (result?.devices || []).map((item: any) => {
    const normalized = normalizeBleDevice(item)
    if (!normalized) return null
    return {
      name: normalized.name,
      address: normalized.deviceId,
    }
  }).filter((item: BluetoothPrinterDevice | null): item is BluetoothPrinterDevice => {
    if (!item) return false
    const key = normalizeDeviceId(item.address)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  appendLog('info', `BLE 扫描到 ${devices.length} 台设备`)
  return devices as BluetoothPrinterDevice[]
}

async function createBleConnection(deviceId: string) {
  const uniApi = getUniBluetooth()
  appendLog('info', `尝试建立 BLE 连接：${deviceId}`)
  await new Promise<void>((resolve, reject) => {
    uniApi.createBLEConnection({
      deviceId,
      timeout: 12000,
      success: () => resolve(),
      fail: (error: any) => {
        const rawMessage = getErrorMessage(error, 'BLE 连接失败')
        if (/already/i.test(rawMessage)) {
          resolve()
          return
        }
        reject(new Error(normalizeBleError(error, 'BLE 连接失败')))
      },
    })
  })
  connectedBleDeviceIds.add(deviceId)
  appendLog('info', `BLE 连接已建立：${deviceId}`)
  try {
    await new Promise<void>((resolve, reject) => {
      uniApi.setBLEMTU({
        deviceId,
        mtu: DEFAULT_BLE_MTU,
        success: () => resolve(),
        fail: (error: any) => reject(new Error(normalizeBleError(error, '设置 BLE MTU 失败'))),
      })
    })
    appendLog('info', `BLE MTU 已设置：${DEFAULT_BLE_MTU}`)
  } catch (error: any) {
    appendLog('warn', `BLE MTU 设置失败：${getErrorMessage(error)}`)
  }
}

async function closeBleConnection(deviceId: string) {
  const uniApi = getUniBluetooth()
  await new Promise<void>((resolve) => {
    uniApi.closeBLEConnection({
      deviceId,
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
  connectedBleDeviceIds.delete(deviceId)
  rejectBleWaitersByDevice(deviceId, 'BLE 连接已手动断开')
  appendLog('info', `已断开 BLE 设备：${deviceId}`)
}

async function getBleDeviceServices(deviceId: string) {
  const uniApi = getUniBluetooth()
  const result = await new Promise<any>((resolve, reject) => {
    uniApi.getBLEDeviceServices({
      deviceId,
      success: resolve,
      fail: (error: any) => reject(new Error(normalizeBleError(error, '读取 BLE 服务失败'))),
    })
  })
  return Array.isArray(result?.services) ? result.services : []
}

async function getBleDeviceCharacteristics(deviceId: string, serviceId: string) {
  const uniApi = getUniBluetooth()
  const result = await new Promise<any>((resolve, reject) => {
    uniApi.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: resolve,
      fail: (error: any) => reject(new Error(normalizeBleError(error, '读取 BLE 特征失败'))),
    })
  })
  return Array.isArray(result?.characteristics) ? result.characteristics : []
}

function describeBleProperties(properties: any) {
  const labels: string[] = []
  if (properties?.read) labels.push('read')
  if (properties?.write) labels.push('write')
  if (properties?.writeNoResponse) labels.push('writeNoRsp')
  if (properties?.notify) labels.push('notify')
  if (properties?.indicate) labels.push('indicate')
  return labels.length > 0 ? labels : ['unknown']
}

function isBleWriteCandidate(characteristic: any) {
  const uuid = normalizeBleUuid(characteristic?.uuid || characteristic?.characteristicId)
  const properties = characteristic?.properties || {}
  return !!(properties.write || properties.writeNoResponse) || uuid.startsWith('49535343')
}

function isBleNotifyCandidate(characteristic: any) {
  const properties = characteristic?.properties || {}
  return !!(properties.notify || properties.indicate) || normalizeBleUuid(characteristic?.uuid || characteristic?.characteristicId).startsWith('49535343')
}

async function getBleDeviceSnapshot(deviceId: string) {
  try {
    const result = await callUniApi<{ devices?: any[] }>((handlers) => {
      uni.getBluetoothDevices({
        success: handlers.success,
        fail: handlers.fail,
      })
    })
    const device = (result?.devices || []).map(normalizeBleDevice).find(item => item?.deviceId === deviceId)
    if (device) return device
  } catch {
    // ignore lookup failures
  }
  return {
    deviceId,
    name: deviceId,
    localName: '',
    RSSI: 0,
    advertisServiceUUIDs: [],
  } as BluetoothBleDevice
}

async function resolveBleDeviceId(target: BluetoothPrinterDevice) {
  const devices = await listNearbyBlePrinters()
  const targetId = normalizeDeviceId(target.address)
  const exact = devices.find(item => normalizeDeviceId(item.address) === targetId)
  if (exact) {
    appendLog('info', `BLE 已匹配设备：${exact.name} (${exact.address})`)
    return exact.address
  }

  const byName = devices.find(item => item.name === target.name)
  if (byName) {
    appendLog('info', `BLE 按名称匹配设备：${byName.name} (${byName.address})`)
    return byName.address
  }

  appendLog('warn', `BLE 扫描未直接匹配 ${target.name}，改用已保存地址 ${target.address}`)
  return target.address
}

function getStrategyById(id?: string | null) {
  return PRINTER_STRATEGIES.find(item => item.id === id) || PRINTER_STRATEGIES[0]
}

function getTransportOptionById(id?: string | null) {
  return TRANSPORT_OPTIONS.find(item => item.id === id) || TRANSPORT_OPTIONS[0]
}

function buildStrategyOrder(preferredId?: string | null) {
  const preferred = getStrategyById(preferredId)
  return [preferred, ...PRINTER_STRATEGIES.filter(item => item.id !== preferred.id)]
}

function toPrinterBytes(text: string, encoding: BluetoothPrinterStrategy['encoding']) {
  const plusApi = ensureAndroidApp()
  const javaString = plusApi.android.newObject('java.lang.String', text)
  return plusApi.android.invoke(javaString, 'getBytes', encoding)
}

function arrayBufferToByteArray(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value)).map(item => item & 0xff)
}

function bytesToJavaByteArray(bytes: number[]) {
  const plusApi = ensureAndroidApp()
  const byteArray = plusApi.android.newObject('byte[]', bytes.length)
  bytes.forEach((byte, index) => {
    byteArray[index] = byte > 127 ? byte - 256 : byte
  })
  return byteArray
}

async function writeRawBytes(outputStream: any, bytes: number[], delay = 0) {
  const plusApi = ensureAndroidApp()
  if (bytes.length === 0) return
  const byteArray = bytesToJavaByteArray(bytes)
  plusApi.android.invoke(outputStream, 'write', byteArray, 0, bytes.length)
  plusApi.android.invoke(outputStream, 'flush')
  if (delay > 0) {
    await sleep(delay)
  }
}

function formatRawPayloadForLog(payload: string, writeMode: BluetoothClassicWriteMode) {
  if (writeMode === 'hex') {
    return payload.replace(/\s+/g, ' ').trim()
  }
  return JSON.stringify(payload)
}

function summarizeClassicRead(value: BluetoothClassicReadResult) {
  const parts = [`${value.length}字节`]
  if (value.hex) parts.push(`HEX ${truncateText(value.hex, 72)}`)
  if (value.text) parts.push(`文本 ${truncateText(value.text.replace(/\s+/g, ' '), 40)}`)
  return parts.join(' · ')
}

function normalizeClassicRead(bytes: number[]): BluetoothClassicReadResult {
  return {
    hex: bytesToHex(bytes).replace(/\s+/g, ''),
    text: bytesToText(bytes),
    length: bytes.length,
  }
}

async function readClassicInput(inputStream: any, timeoutMs = DEFAULT_CLASSIC_READ_TIMEOUT) {
  if (!inputStream) {
    return null
  }
  const plusApi = ensureAndroidApp()
  const startedAt = Date.now()
  let availableAtRead = 0

  while (Date.now() - startedAt < timeoutMs) {
    try {
      availableAtRead = Number(plusApi.android.invoke(inputStream, 'available') || 0)
    } catch {
      availableAtRead = 0
    }
    if (availableAtRead > 0) break
    await sleep(60)
  }

  if (availableAtRead <= 0) {
    return null
  }

  const byteArray = plusApi.android.newObject('byte[]', Math.max(availableAtRead, 256))
  const readLength = Number(plusApi.android.invoke(inputStream, 'read', byteArray) || 0)
  if (readLength <= 0) {
    return null
  }

  const bytes: number[] = []
  for (let index = 0; index < readLength; index += 1) {
    bytes.push((Number(byteArray[index]) + 256) % 256)
  }
  return normalizeClassicRead(bytes)
}

async function logClassicReply(inputStream: any, context: string, timeoutMs = DEFAULT_CLASSIC_READ_TIMEOUT) {
  const result = await readClassicInput(inputStream, timeoutMs)
  if (!result) {
    appendLog('warn', `${context}：未读到设备回包`)
    return null
  }
  const ackTag = result.hex.toUpperCase().includes(OFFICIAL_STATUS_ACK) ? ' · 命中 ACK' : ''
  appendLog('info', `${context}：${summarizeClassicRead(result)}${ackTag}`)
  return result
}

function getClassicCompatibilityCaseById(id?: string | null) {
  return CLASSIC_COMPATIBILITY_CASES.find(item => item.id === id) || CLASSIC_COMPATIBILITY_CASES[0]
}

async function requestBluetoothPermissions() {
  const plusApi = ensureAndroidApp()
  const sdkInt = getSdkInt()
  const permissions = sdkInt >= 31
    ? ['android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN']
    : ['android.permission.ACCESS_FINE_LOCATION']

  appendLog('info', `申请蓝牙权限：${permissions.join(', ')}`)
  await new Promise<void>((resolve, reject) => {
    plusApi.android.requestPermissions(
      permissions,
      (result: any) => {
        const denied = [...(result?.deniedAlways || []), ...(result?.deniedPresent || [])]
        if (denied.length > 0) {
          appendLog('warn', `蓝牙权限被拒绝：${denied.join(', ')}`)
          reject(new Error('蓝牙权限未授予，请到系统设置中允许蓝牙权限'))
          return
        }
        appendLog('info', '蓝牙权限已就绪')
        resolve()
      },
      () => {
        appendLog('error', '蓝牙权限申请失败')
        reject(new Error('蓝牙权限申请失败'))
      },
    )
  })
}

async function ensureBluetoothEnabled() {
  await requestBluetoothPermissions()
  const { plusApi, adapter } = getBluetoothAdapter()
  const enabled = !!plusApi.android.invoke(adapter, 'isEnabled')
  if (!enabled) {
    appendLog('warn', '蓝牙未开启')
    throw new Error('蓝牙未开启，请先打开手机蓝牙')
  }
  appendLog('info', '蓝牙适配器已开启')
  return { plusApi, adapter }
}

function safeClose(target: any) {
  if (!target) return
  const plusApi = getPlus()
  if (!plusApi?.android) return
  try {
    plusApi.android.invoke(target, 'close')
  } catch {
    // ignore
  }
}

async function writeCommand(outputStream: any, command: number[], delay: number) {
  const plusApi = ensureAndroidApp()
  for (const byte of command) {
    plusApi.android.invoke(outputStream, 'write', byte)
  }
  plusApi.android.invoke(outputStream, 'flush')
  await sleep(delay)
}

async function initializePrinter(outputStream: any, strategy: BluetoothPrinterStrategy) {
  if (strategy.initCommands.length === 0) {
    appendLog('info', `策略 ${strategy.label} 跳过初始化命令`)
    return
  }
  appendLog('info', `策略 ${strategy.label} 发送 ${strategy.initCommands.length} 组初始化命令`)
  for (const command of strategy.initCommands) {
    await writeCommand(outputStream, command, strategy.chunkDelay)
  }
}

function buildPrintChunks(text: string, strategy: BluetoothPrinterStrategy) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const chunks = normalized.split('\n').map(line => `${line}${strategy.lineEnding}`)
  for (let i = 0; i < strategy.tailFeedCount; i += 1) {
    chunks.push(strategy.lineEnding)
  }
  return chunks
}

async function writeTextWithPacing(outputStream: any, text: string, strategy: BluetoothPrinterStrategy) {
  const plusApi = ensureAndroidApp()
  const chunks = buildPrintChunks(text, strategy)
  appendLog('info', `策略 ${strategy.label} 开始发送 ${chunks.length} 个数据块，编码 ${strategy.encoding}`)

  for (const chunk of chunks) {
    const bytes = toPrinterBytes(chunk, strategy.encoding)
    plusApi.android.invoke(outputStream, 'write', bytes, 0, bytes.length)
    plusApi.android.invoke(outputStream, 'flush')
    await sleep(chunk === strategy.lineEnding ? strategy.blankDelay : strategy.chunkDelay)
  }
}

async function sendClassicPayload(
  outputStream: any,
  payload: string,
  writeMode: BluetoothClassicWriteMode,
  strategy: BluetoothPrinterStrategy,
  waitAfterMs?: number,
) {
  const plusApi = ensureAndroidApp()
  if (writeMode === 'hex') {
    const bytes = arrayBufferToByteArray(hexToArrayBuffer(payload))
    await writeRawBytes(outputStream, bytes, waitAfterMs || strategy.chunkDelay)
    return
  }
  const bytes = toPrinterBytes(payload, strategy.encoding)
  plusApi.android.invoke(outputStream, 'write', bytes, 0, bytes.length)
  plusApi.android.invoke(outputStream, 'flush')
  await sleep(waitAfterMs || strategy.chunkDelay)
}

async function sendOfficialHandshakeStep(options: {
  inputStream: any
  label: string
  outputStream: any
  payload: string
  readTimeoutMs?: number
  strategy: BluetoothPrinterStrategy
  waitAfterMs?: number
}) {
  appendLog('info', `${options.label} 发送：${options.payload}`)
  await sendClassicPayload(options.outputStream, options.payload, 'hex', options.strategy, options.waitAfterMs)
  return logClassicReply(options.inputStream, `${options.label} 回包`, options.readTimeoutMs || DEFAULT_CLASSIC_READ_TIMEOUT)
}

export function getSavedPrinter() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return null
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return normalizePrinter(parsed)
  } catch {
    return null
  }
}

export function savePrinter(device: BluetoothPrinterDevice) {
  const normalized = normalizePrinter(device)
  if (!normalized) return
  uni.setStorageSync(STORAGE_KEY, JSON.stringify(normalized))
  appendLog('info', `已选择打印机：${normalized.name} (${normalized.address})`)
}

export function clearSavedPrinter() {
  uni.removeStorageSync(STORAGE_KEY)
  appendLog('info', '已清除已选打印机')
}

export function getBluetoothPrinterLogs() {
  return readLogs()
}

export function clearBluetoothPrinterLogs() {
  writeLogs([])
}

export function getBluetoothPrinterLogFilePath() {
  return '_doc/bluetooth-printer.log'
}

export function getBleCompatibilityCases() {
  return BLE_COMPATIBILITY_CASES.map(item => ({ ...item }))
}

export function getClassicCompatibilityCases() {
  return CLASSIC_COMPATIBILITY_CASES.map(item => ({ ...item }))
}

export function getPrinterTransportOptions(): BluetoothPrinterTransportOption[] {
  return TRANSPORT_OPTIONS.map(item => ({ ...item }))
}

export function getSavedPrinterTransportId() {
  try {
    const raw = uni.getStorageSync(TRANSPORT_STORAGE_KEY)
    return typeof raw === 'string' && raw ? getTransportOptionById(raw).id : TRANSPORT_OPTIONS[0].id
  } catch {
    return TRANSPORT_OPTIONS[0].id
  }
}

export function savePrinterTransportId(transportId: string) {
  const transport = getTransportOptionById(transportId)
  uni.setStorageSync(TRANSPORT_STORAGE_KEY, transport.id)
  appendLog('info', `已切换连接协议：${transport.label}`)
}

export async function listNearbyBlePrinters() {
  await ensureBluetoothEnabled()
  await openBleAdapter()
  await startBleDiscovery(1800)
  const devices = await getBleDiscoveredPrinters()
  await stopBleDiscovery()
  return devices.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

export async function listBlePrinterDiagnosticsDevices(scanMs = DEFAULT_BLE_SCAN_MS) {
  await ensureBluetoothEnabled()
  await openBleAdapter()
  await startBleDiscovery(scanMs)
  const result = await callUniApi<{ devices?: any[] }>((handlers) => {
    uni.getBluetoothDevices({
      success: handlers.success,
      fail: handlers.fail,
    })
  })
  await stopBleDiscovery()

  const deduped = new Map<string, BluetoothBleDevice>()
  for (const raw of result?.devices || []) {
    const device = normalizeBleDevice(raw)
    if (!device) continue
    const existing = deduped.get(device.deviceId)
    if (!existing || device.RSSI > existing.RSSI) {
      deduped.set(device.deviceId, device)
    }
  }

  const devices = Array.from(deduped.values()).sort((left, right) => {
    const leftNamed = left.name !== left.deviceId
    const rightNamed = right.name !== right.deviceId
    if (leftNamed !== rightNamed) return leftNamed ? -1 : 1
    if (left.RSSI !== right.RSSI) return right.RSSI - left.RSSI
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

  appendLog('info', `BLE诊断扫描完成，共发现 ${devices.length} 台设备`)
  return devices
}

export async function inspectBlePrinter(device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const deviceId = await resolveBleDeviceId(target)
  appendLog('info', `BLE 探测目标：${target.name}，保存地址 ${target.address}，实际连接 ${deviceId}`)
  await openBleAdapter()
  await createBleConnection(deviceId)

  try {
    const services = (await getBleDeviceServices(deviceId))
      .map((service: any) => ({
        ...service,
        _serviceId: String(service?.uuid || service?.serviceId || ''),
      }))
      .sort((a, b) => a._serviceId.localeCompare(b._serviceId))

    appendLog('info', `BLE 服务数量：${services.length}`)
    for (const service of services) {
      const serviceId = service._serviceId
      appendLog('info', `BLE 服务：${serviceId}${service?.isPrimary ? ' · primary' : ''}`)
      const characteristics = (await getBleDeviceCharacteristics(deviceId, serviceId))
        .map((characteristic: any) => ({
          ...characteristic,
          _characteristicId: String(characteristic?.uuid || characteristic?.characteristicId || ''),
        }))
        .sort((a, b) => a._characteristicId.localeCompare(b._characteristicId))

      appendLog('info', `特征数量：${characteristics.length}`)
      for (const characteristic of characteristics) {
        const characteristicId = characteristic._characteristicId
        const tags = describeBleProperties(characteristic?.properties)
        const candidate = isBleWriteCandidate(characteristic) ? ' · 候选写入特征' : ''
        appendLog('info', `特征：${characteristicId} · ${tags.join(', ')}${candidate}`)
      }
    }
  } finally {
    await closeBleConnection(deviceId)
  }
}

export async function probeBlePrinterDevice(deviceId: string) {
  await openBleAdapter()
  await createBleConnection(deviceId)
  const device = await getBleDeviceSnapshot(deviceId)

  try {
    const servicesResult = await callUniApi<{ services?: any[] }>((handlers) => {
      uni.getBLEDeviceServices({
        deviceId,
        success: handlers.success,
        fail: handlers.fail,
      })
    })

    const services: BluetoothBleService[] = []
    for (const service of servicesResult?.services || []) {
      const serviceId = String(service?.uuid || service?.serviceId || '')
      if (!serviceId) continue
      const characteristicsResult = await callUniApi<{ characteristics?: any[] }>((handlers) => {
        uni.getBLEDeviceCharacteristics({
          deviceId,
          serviceId,
          success: handlers.success,
          fail: handlers.fail,
        })
      })
      const characteristics = (characteristicsResult?.characteristics || []).map((characteristic: any) => ({
        serviceId,
        uuid: String(characteristic?.uuid || characteristic?.characteristicId || ''),
        properties: normalizeBleCharacteristicProperties(characteristic?.properties),
      })).filter(item => item.uuid)
      services.push({
        uuid: serviceId,
        isPrimary: !!service?.isPrimary,
        characteristics,
      })
      appendLog('info', `BLE服务 ${shortUuid(serviceId)} 含 ${characteristics.length} 个特征`)
    }

    appendLog('info', `BLE探测完成：${device.name}，共 ${services.length} 个服务`)
    return { device, services } as BluetoothBleProbeResult
  } catch (error: any) {
    const message = normalizeBleError(error, '探测 BLE 服务失败')
    appendLog('error', `BLE探测失败 ${device.name}：${message}`)
    throw new Error(message)
  }
}

export async function disconnectBlePrinterDevice(deviceId: string) {
  await closeBleConnection(deviceId)
}

export async function setBlePrinterCharacteristicNotify(options: { characteristicId: string; deviceId: string; enabled: boolean; serviceId: string }) {
  await openBleAdapter()
  await createBleConnection(options.deviceId)
  const actionText = options.enabled ? '启用' : '停用'
  try {
    await callUniApi<void>((handlers) => {
      uni.notifyBLECharacteristicValueChange({
        deviceId: options.deviceId,
        serviceId: options.serviceId,
        characteristicId: options.characteristicId,
        state: options.enabled,
        success: handlers.success,
        fail: handlers.fail,
      })
    })
    appendLog('info', `BLE通知${actionText}成功 ${shortUuid(options.serviceId)} / ${shortUuid(options.characteristicId)}`)
  } catch (error: any) {
    const message = normalizeBleError(error, `BLE通知${actionText}失败`)
    appendLog('error', `BLE通知${actionText}失败 ${shortUuid(options.characteristicId)}：${message}`)
    throw new Error(message)
  }
}

export async function readBlePrinterCharacteristic(options: { characteristicId: string; deviceId: string; serviceId: string }) {
  await openBleAdapter()
  await createBleConnection(options.deviceId)
  const key = getBleCharacteristicKey(options.deviceId, options.serviceId, options.characteristicId)
  const waiter = waitForBleValue(options.deviceId, options.serviceId, options.characteristicId)
  appendLog('info', `开始读取 BLE 特征 ${shortUuid(options.serviceId)} / ${shortUuid(options.characteristicId)}`)

  try {
    await callUniApi<void>((handlers) => {
      uni.readBLECharacteristicValue({
        deviceId: options.deviceId,
        serviceId: options.serviceId,
        characteristicId: options.characteristicId,
        success: handlers.success,
        fail: handlers.fail,
      })
    })
  } catch (error: any) {
    const message = normalizeBleError(error, '读取 BLE 特征失败')
    clearBleWaiter(key, new Error(message))
    appendLog('error', `BLE读取失败 ${shortUuid(options.characteristicId)}：${message}`)
    throw new Error(message)
  }

  try {
    const value = await waiter
    appendLog('info', `BLE读取完成 ${shortUuid(options.characteristicId)}：${summarizeBleValue(value)}`)
    return value
  } catch (error: any) {
    const lastValue = bleLastValues.get(key)
    if (lastValue) {
      appendLog('info', `BLE读取返回缓存值 ${shortUuid(options.characteristicId)}：${summarizeBleValue(lastValue)}`)
      return lastValue
    }
    appendLog('warn', `BLE读取等待超时 ${shortUuid(options.characteristicId)}：${getErrorMessage(error, '未知错误')}`)
    throw error instanceof Error ? error : new Error(getErrorMessage(error, '读取 BLE 特征失败'))
  }
}

export async function writeBlePrinterCharacteristic(options: {
  characteristicId: string
  deviceId: string
  payload: string
  serviceId: string
  writeMode: BluetoothBleWriteMode
}) {
  await openBleAdapter()
  await createBleConnection(options.deviceId)
  const value = options.writeMode === 'hex' ? hexToArrayBuffer(options.payload) : textToArrayBuffer(options.payload)
  const preview = normalizeBleValue(value)
  appendLog('info', `开始写入 BLE 特征 ${shortUuid(options.serviceId)} / ${shortUuid(options.characteristicId)}：${summarizeBleValue(preview)}`)

  try {
    await callUniApi<void>((handlers) => {
      uni.writeBLECharacteristicValue({
        deviceId: options.deviceId,
        serviceId: options.serviceId,
        characteristicId: options.characteristicId,
        value: value as any,
        success: handlers.success,
        fail: handlers.fail,
      })
    })
    appendLog('info', `BLE写入完成 ${shortUuid(options.characteristicId)}：${summarizeBleValue(preview)}`)
    return preview
  } catch (error: any) {
    const message = normalizeBleError(error, '写入 BLE 特征失败')
    appendLog('error', `BLE写入失败 ${shortUuid(options.characteristicId)}：${message}`)
    throw new Error(message)
  }
}

export async function runBlePrinterCompatibilitySuite(options: { characteristicId: string; deviceId: string; serviceId: string }) {
  const results: Array<{ caseId: string; ok: boolean; message: string }> = []
  appendLog('info', `开始 BLE 兼容测试，共 ${BLE_COMPATIBILITY_CASES.length} 组`)

  for (const testCase of BLE_COMPATIBILITY_CASES) {
    try {
      appendLog('info', `兼容测试：${testCase.label}`)
      const value = await writeBlePrinterCharacteristic({
        deviceId: options.deviceId,
        serviceId: options.serviceId,
        characteristicId: options.characteristicId,
        payload: testCase.payload,
        writeMode: testCase.writeMode,
      })
      results.push({ caseId: testCase.id, ok: true, message: summarizeBleValue(value) })
      await sleep(500)
    } catch (error: any) {
      const message = getErrorMessage(error, '写入失败')
      appendLog('warn', `兼容测试失败：${testCase.label} - ${message}`)
      results.push({ caseId: testCase.id, ok: false, message })
      await sleep(300)
    }
  }

  appendLog('info', 'BLE 兼容测试完成，请结合设备反应与日志判断有效负载')
  return results
}

export async function runClassicPrinterCompatibilitySuite(device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const strategyOrder = buildStrategyOrder(getSavedPrinterTransportStrategyId())
  let lastError: any = null

  for (const strategy of strategyOrder) {
    let socket: any = null
    let outputStream: any = null
    let inputStream: any = null
    try {
      appendLog('info', `开始经典蓝牙兼容测试：${target.name}，策略 ${strategy.label}，共 ${CLASSIC_COMPATIBILITY_CASES.length} 组`)
      socket = await openPrinterSocket(target, strategy)
      const plusApi = ensureAndroidApp()
      outputStream = plusApi.android.invoke(socket, 'getOutputStream')
      inputStream = plusApi.android.invoke(socket, 'getInputStream')

      for (const testCase of CLASSIC_COMPATIBILITY_CASES) {
        appendLog('info', `经典兼容测试：${testCase.label} · ${testCase.protocol} · ${testCase.description}`)
        appendLog('info', `经典兼容测试载荷：${formatRawPayloadForLog(testCase.payload, testCase.writeMode)}`)
        await sendClassicPayload(outputStream, testCase.payload, testCase.writeMode, strategy, testCase.waitAfterMs)
        if (inputStream) {
          await logClassicReply(inputStream, `经典兼容测试回包 ${testCase.label}`, Math.max(testCase.waitAfterMs || 0, DEFAULT_CLASSIC_READ_TIMEOUT))
        }
      }

      await sleep(strategy.connectDelay)
      savePrinter(target)
      savePrinterTransportStrategy(strategy.id)
      appendLog('info', `经典蓝牙兼容测试完成：${target.name}，策略 ${strategy.label}`)
      return
    } catch (error: any) {
      lastError = error
      appendLog('warn', `经典蓝牙兼容测试失败 ${strategy.label}：${error?.message || '未知错误'}`)
    } finally {
      safeClose(inputStream)
      safeClose(outputStream)
      safeClose(socket)
    }
  }

  appendLog('error', `经典蓝牙兼容测试失败：${target.name}，${lastError?.message || '未知错误'}`)
  throw new Error(lastError?.message || `兼容测试失败：${formatPrinterName(target.name)}`)
}

export async function runSingleClassicCompatibilityCase(options: {
  caseId: string
  device?: BluetoothPrinterDevice | null
}) {
  const target = normalizePrinter(options.device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const strategy = getStrategyById(getSavedPrinterTransportStrategyId())
  const testCase = getClassicCompatibilityCaseById(options.caseId)
  let socket: any = null
  let outputStream: any = null
  let inputStream: any = null

  try {
    appendLog('info', `开始单项测试：${testCase.label} · ${testCase.protocol} · ${testCase.description}`)
    socket = await openPrinterSocket(target, strategy)
    const plusApi = ensureAndroidApp()
    outputStream = plusApi.android.invoke(socket, 'getOutputStream')
    inputStream = plusApi.android.invoke(socket, 'getInputStream')
    appendLog('info', `单项测试载荷：${formatRawPayloadForLog(testCase.payload, testCase.writeMode)}`)
    await sendClassicPayload(outputStream, testCase.payload, testCase.writeMode, strategy, testCase.waitAfterMs)
    if (inputStream) {
      await logClassicReply(inputStream, `单项测试回包 ${testCase.label}`, Math.max(testCase.waitAfterMs || 0, DEFAULT_CLASSIC_READ_TIMEOUT))
    }
    appendLog('info', `单项测试完成：${testCase.label}`)
    return testCase.id
  } finally {
    safeClose(inputStream)
    safeClose(outputStream)
    safeClose(socket)
  }
}

export async function runOfficialM9Handshake(device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const strategy = getStrategyById(getSavedPrinterTransportStrategyId())
  let socket: any = null
  let outputStream: any = null
  let inputStream: any = null

  try {
    appendLog('info', `开始官方 M9 握手：${target.name}`)
    socket = await openPrinterSocket(target, strategy)
    const plusApi = ensureAndroidApp()
    outputStream = plusApi.android.invoke(socket, 'getOutputStream')
    inputStream = plusApi.android.invoke(socket, 'getInputStream')

    if (!inputStream) {
      appendLog('warn', '当前连接未拿到 InputStream，回包日志可能缺失')
    }

    await sendOfficialHandshakeStep({
      inputStream,
      label: '官方查询 ALL',
      outputStream,
      payload: OFFICIAL_DEVICE_INFO_ALL,
      strategy,
      waitAfterMs: DEFAULT_CLASSIC_HANDSHAKE_GAP,
      readTimeoutMs: 1500,
    })

    await sendOfficialHandshakeStep({
      inputStream,
      label: '官方唤醒命令',
      outputStream,
      payload: OFFICIAL_WAKE_COMMAND,
      strategy,
      waitAfterMs: DEFAULT_CLASSIC_HANDSHAKE_GAP,
      readTimeoutMs: 900,
    })

    await sendOfficialHandshakeStep({
      inputStream,
      label: '官方浓度 NORMAL',
      outputStream,
      payload: OFFICIAL_DENSITY_NORMAL,
      strategy,
      waitAfterMs: DEFAULT_CLASSIC_HANDSHAKE_GAP,
      readTimeoutMs: 900,
    })

    await sendOfficialHandshakeStep({
      inputStream,
      label: '官方换行 G组',
      outputStream,
      payload: OFFICIAL_NEWLINE_G,
      strategy,
      waitAfterMs: DEFAULT_CLASSIC_HANDSHAKE_GAP,
      readTimeoutMs: 900,
    })

    const statusReply = await sendOfficialHandshakeStep({
      inputStream,
      label: '官方状态查询',
      outputStream,
      payload: OFFICIAL_STATUS_QUERY,
      strategy,
      waitAfterMs: DEFAULT_CLASSIC_HANDSHAKE_GAP,
      readTimeoutMs: 1800,
    })

    savePrinter(target)
    if (statusReply?.hex?.toUpperCase().includes(OFFICIAL_STATUS_ACK)) {
      appendLog('info', '官方 M9 握手完成：收到 ACK，可继续测试主打印帧')
    } else {
      appendLog('warn', '官方 M9 握手完成：未命中 ACK，请结合蓝灯状态和日志继续判断')
    }
    return statusReply
  } finally {
    safeClose(inputStream)
    safeClose(outputStream)
    safeClose(socket)
  }
}

export function getPrinterTransportStrategies(): BluetoothPrinterStrategyOption[] {
  return PRINTER_STRATEGIES.map(({ id, label, description }) => ({ id, label, description }))
}

export function getSavedPrinterTransportStrategyId() {
  try {
    const raw = uni.getStorageSync(STRATEGY_STORAGE_KEY)
    return typeof raw === 'string' && raw ? getStrategyById(raw).id : PRINTER_STRATEGIES[0].id
  } catch {
    return PRINTER_STRATEGIES[0].id
  }
}

export function savePrinterTransportStrategy(strategyId: string) {
  const strategy = getStrategyById(strategyId)
  uni.setStorageSync(STRATEGY_STORAGE_KEY, strategy.id)
  appendLog('info', `已切换兼容策略：${strategy.label}`)
}

export async function runPrinterConnectionSweep(device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const strategy = getStrategyById(getSavedPrinterTransportStrategyId())
  const UUID = ensureAndroidApp().android.importClass('java.util.UUID')
  const uuid = UUID.fromString(SPP_UUID)
  const { plusApi, adapter } = await ensureBluetoothEnabled()
  plusApi.android.invoke(adapter, 'cancelDiscovery')
  const remoteDevice = plusApi.android.invoke(adapter, 'getRemoteDevice', target.address)
  const factories = buildSocketFactories(plusApi, remoteDevice, uuid)

  appendLog('info', `开始连接爆破：${target.name}，共 ${factories.length} 组`)

  for (const factory of factories) {
    let socket: any = null
    try {
      appendLog('info', `连接爆破：尝试 ${factory.label}`)
      socket = factory.create()
      plusApi.android.invoke(socket, 'connect')
      await sleep(strategy.connectDelay)
      appendLog('info', `连接爆破成功：${factory.label}`)
      savePrinterTransportId(factory.label)
      return factory.label
    } catch (error: any) {
      appendLog('warn', `连接爆破失败 ${factory.label}：${error?.message || '未知错误'}`)
      safeClose(socket)
      await sleep(180)
    } finally {
      safeClose(socket)
    }
  }

  throw new Error(`连接爆破失败：${formatPrinterName(target.name)}`)
}

export function openBluetoothSettings() {
  const plusApi = ensureAndroidApp()
  const main = plusApi.android.runtimeMainActivity()
  const Settings = plusApi.android.importClass('android.provider.Settings')
  const intent = plusApi.android.newObject('android.content.Intent', Settings.ACTION_BLUETOOTH_SETTINGS)
  appendLog('info', '打开系统蓝牙设置')
  plusApi.android.invoke(main, 'startActivity', intent)
}

export async function listPairedPrinters() {
  const { plusApi, adapter } = await ensureBluetoothEnabled()
  const bondedDevices = plusApi.android.invoke(adapter, 'getBondedDevices')
  const iterator = plusApi.android.invoke(bondedDevices, 'iterator')
  const devices: BluetoothPrinterDevice[] = []

  while (plusApi.android.invoke(iterator, 'hasNext')) {
    const device = plusApi.android.invoke(iterator, 'next')
    const normalized = normalizePrinter({
      name: plusApi.android.invoke(device, 'getName'),
      address: plusApi.android.invoke(device, 'getAddress'),
    })
    if (normalized) devices.push(normalized)
  }

  appendLog('info', `读取到 ${devices.length} 台已配对蓝牙设备`)
  return devices.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

function buildSocketFactories(plusApi: any, remoteDevice: any, uuid: any, preferredTransportId?: string | null) {
  const factories = [
    {
      label: 'secure-spp-uuid',
      create: () => plusApi.android.invoke(remoteDevice, 'createRfcommSocketToServiceRecord', uuid),
    },
    {
      label: 'insecure-spp-uuid',
      create: () => plusApi.android.invoke(remoteDevice, 'createInsecureRfcommSocketToServiceRecord', uuid),
    },
    {
      label: 'secure-channel-3',
      create: () => plusApi.android.invoke(remoteDevice, 'createRfcommSocket', 3),
    },
    {
      label: 'insecure-channel-3',
      create: () => plusApi.android.invoke(remoteDevice, 'createInsecureRfcommSocket', 3),
    },
    {
      label: 'secure-channel-1',
      create: () => plusApi.android.invoke(remoteDevice, 'createRfcommSocket', 1),
    },
    {
      label: 'insecure-channel-1',
      create: () => plusApi.android.invoke(remoteDevice, 'createInsecureRfcommSocket', 1),
    },
  ]
  const preferred = getTransportOptionById(preferredTransportId)
  return [
    factories.find(item => item.label === preferred.id) || factories[0],
    ...factories.filter(item => item.label !== preferred.id),
  ]
}

async function openPrinterSocket(device: BluetoothPrinterDevice, strategy: BluetoothPrinterStrategy) {
  const { plusApi, adapter } = await ensureBluetoothEnabled()
  plusApi.android.invoke(adapter, 'cancelDiscovery')

  const UUID = plusApi.android.importClass('java.util.UUID')
  const remoteDevice = plusApi.android.invoke(adapter, 'getRemoteDevice', device.address)
  const uuid = UUID.fromString(SPP_UUID)
  const factories = buildSocketFactories(plusApi, remoteDevice, uuid, getSavedPrinterTransportId())

  for (const factory of factories) {
    let socket: any = null
    try {
      appendLog('info', `尝试连接 ${formatPrinterName(device.name)}：${factory.label}`)
      socket = factory.create()
      plusApi.android.invoke(socket, 'connect')
      await sleep(strategy.connectDelay)
      appendLog('info', `连接成功：${factory.label}`)
      return socket
    } catch (error: any) {
      appendLog('warn', `连接失败 ${factory.label}：${error?.message || '未知错误'}`)
      safeClose(socket)
      await sleep(120)
    }
  }

  throw new Error(`无法连接打印机：${formatPrinterName(device.name)}`)
}

export async function printText(text: string, device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const strategyOrder = buildStrategyOrder(getSavedPrinterTransportStrategyId())
  let lastError: any = null

  for (const strategy of strategyOrder) {
    let socket: any = null
    let outputStream: any = null
    try {
      appendLog('info', `开始打印：${target.name}，策略 ${strategy.label}`)
      socket = await openPrinterSocket(target, strategy)
      const plusApi = ensureAndroidApp()
      outputStream = plusApi.android.invoke(socket, 'getOutputStream')
      await initializePrinter(outputStream, strategy)
      await writeTextWithPacing(outputStream, text, strategy)
      plusApi.android.invoke(outputStream, 'flush')
      await sleep(strategy.connectDelay)
      savePrinter(target)
      savePrinterTransportStrategy(strategy.id)
      appendLog('info', `打印发送完成：${target.name}，策略 ${strategy.label}`)
      return
    } catch (error: any) {
      lastError = error
      appendLog('warn', `打印策略失败 ${strategy.label}：${error?.message || '未知错误'}`)
    } finally {
      safeClose(outputStream)
      safeClose(socket)
    }
  }

  appendLog('error', `打印失败：${target.name}，${lastError?.message || '未知错误'}`)
  throw new Error(lastError?.message || `打印失败：${formatPrinterName(target.name)}`)
}

export async function printTestPage(device?: BluetoothPrinterDevice | null) {
  const strategy = getStrategyById(getSavedPrinterTransportStrategyId())
  const now = formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
  await printText([
    '车销系统',
    '蓝牙打印测试',
    `时间：${now}`,
    `策略：${strategy.label}`,
    `编码：${strategy.encoding}`,
    '如果这张小票正常打印，说明蓝牙链路已打通。',
    '------------------------------',
    '测试完成',
  ].join('\n'), device)
}

function moneyText(value?: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function buildReceiptLines(lines: Array<{ productId: string; qty: number; boxQty?: number; price: number }>, products: Product[]) {
  return lines.flatMap((line) => {
    const product = products.find(item => item.id === line.productId)
    const name = product?.name || line.productId
    const qtyText = formatPackSummary(normalizeCount(line.qty), normalizeCount(line.boxQty), product?.boxQty) || `${normalizeCount(line.qty)}袋`
    const amount = Number(line.qty || 0) * Number(line.price || 0)
    return [
      name,
      `  ${qtyText} × ${moneyText(line.price)} = ${moneyText(amount)}`,
    ]
  })
}

function buildReceipt(header: string[], lines: string[], footer: string[]) {
  return [...header, '------------------------------', ...lines, '------------------------------', ...footer].join('\n')
}

export function buildSaleReceipt(doc: SaleDoc, storeName: string, salespersonName: string, products: Product[]) {
  const totalQty = doc.lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  const totalAmount = doc.lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0)

  return buildReceipt(
    ['车销系统', '销单', `单号：${doc.code}`, `日期：${doc.date}`, `超市：${storeName || '-'}`, `业务员：${salespersonName || '-'}`],
    buildReceiptLines(doc.lines, products),
    [
      `合计数量：${normalizeCount(totalQty)}袋`,
      `合计金额：${moneyText(totalAmount)}`,
      doc.remark ? `备注：${doc.remark}` : '',
      `打印时间：${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`,
    ].filter(Boolean),
  )
}

export function buildReturnReceipt(doc: ReturnDoc, storeName: string, salespersonName: string, products: Product[]) {
  const totalQty = doc.lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  const totalAmount = doc.lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0)
  const returnTypeText = doc.returnType === 'warehouse_return' ? '回仓' : '车库退货'

  return buildReceipt(
    ['车销系统', '退货单', `类型：${returnTypeText}`, `单号：${doc.code}`, `日期：${doc.date}`, `超市：${storeName || '-'}`, `业务员：${salespersonName || '-'}`],
    buildReceiptLines(doc.lines, products),
    [
      `合计数量：${normalizeCount(totalQty)}袋`,
      `合计金额：${moneyText(totalAmount)}`,
      doc.remark ? `备注：${doc.remark}` : '',
      `打印时间：${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`,
    ].filter(Boolean),
  )
}
