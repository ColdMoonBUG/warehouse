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

interface BluetoothPrinterStrategy extends BluetoothPrinterStrategyOption {
  encoding: 'GB18030' | 'GBK' | 'GB2312'
  lineEnding: '\r\n' | '\n'
  tailFeedCount: number
  chunkDelay: number
  blankDelay: number
  connectDelay: number
  initCommands: number[][]
}

const STORAGE_KEY = 'mobile_bluetooth_printer_v1'
const STRATEGY_STORAGE_KEY = 'mobile_bluetooth_printer_strategy_v1'
const LOG_STORAGE_KEY = 'mobile_bluetooth_printer_logs_v1'
const LOG_LIMIT = 120
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB'

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

function appendLog(level: BluetoothPrinterRuntimeLog['level'], message: string) {
  const next: BluetoothPrinterRuntimeLog = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss'),
    level,
    message,
  }
  writeLogs([next, ...readLogs()])
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getUniBluetooth() {
  return uni as any
}

function normalizeDeviceId(value?: string) {
  return String(value || '').trim().toLowerCase()
}

async function openBleAdapter() {
  const uniApi = getUniBluetooth()
  await new Promise<void>((resolve, reject) => {
    uniApi.openBluetoothAdapter({
      success: () => {
        appendLog('info', 'BLE 适配器已打开')
        resolve()
      },
      fail: (error: any) => {
        const message = error?.errMsg || 'BLE 适配器打开失败'
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

async function startBleDiscovery() {
  const uniApi = getUniBluetooth()
  appendLog('info', '开始扫描附近 BLE 设备')
  await new Promise<void>((resolve, reject) => {
    uniApi.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => resolve(),
      fail: (error: any) => {
        const message = error?.errMsg || 'BLE 扫描启动失败'
        if (/already/i.test(message)) {
          resolve()
          return
        }
        appendLog('warn', `BLE 扫描启动失败：${message}`)
        reject(new Error(message))
      },
    })
  })
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
      fail: (error: any) => reject(new Error(error?.errMsg || '读取 BLE 设备失败')),
    })
  })

  const seen = new Set<string>()
  const devices = (result?.devices || []).map((item: any) => {
    const deviceId = String(item?.deviceId || '')
    return {
      name: formatPrinterName(item?.name || item?.localName || deviceId),
      address: deviceId,
    }
  }).filter((item: BluetoothPrinterDevice) => {
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
      timeout: 10000,
      success: () => resolve(),
      fail: (error: any) => {
        const message = error?.errMsg || 'BLE 连接失败'
        if (/already/i.test(message)) {
          resolve()
          return
        }
        reject(new Error(message))
      },
    })
  })
  appendLog('info', `BLE 连接已建立：${deviceId}`)
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
}

async function getBleDeviceServices(deviceId: string) {
  const uniApi = getUniBluetooth()
  const result = await new Promise<any>((resolve, reject) => {
    uniApi.getBLEDeviceServices({
      deviceId,
      success: resolve,
      fail: (error: any) => reject(new Error(error?.errMsg || '读取 BLE 服务失败')),
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
      fail: (error: any) => reject(new Error(error?.errMsg || '读取 BLE 特征失败')),
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

function buildStrategyOrder(preferredId?: string | null) {
  const preferred = getStrategyById(preferredId)
  return [preferred, ...PRINTER_STRATEGIES.filter(item => item.id !== preferred.id)]
}

function toPrinterBytes(text: string, encoding: BluetoothPrinterStrategy['encoding']) {
  const plusApi = ensureAndroidApp()
  const javaString = plusApi.android.newObject('java.lang.String', text)
  return plusApi.android.invoke(javaString, 'getBytes', encoding)
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

export async function listNearbyBlePrinters() {
  await ensureBluetoothEnabled()
  await openBleAdapter()
  await startBleDiscovery()
  await sleep(1800)
  const devices = await getBleDiscoveredPrinters()
  await stopBleDiscovery()
  return devices.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

export async function inspectBlePrinter(device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  const deviceId = await resolveBleDeviceId(target)
  await openBleAdapter()
  await createBleConnection(deviceId)

  try {
    const services = await getBleDeviceServices(deviceId)
    appendLog('info', `BLE 服务数量：${services.length}`)
    for (const service of services) {
      const serviceId = String(service?.uuid || service?.serviceId || '')
      appendLog('info', `BLE 服务：${serviceId}${service?.isPrimary ? ' · primary' : ''}`)
      const characteristics = await getBleDeviceCharacteristics(deviceId, serviceId)
      appendLog('info', `特征数量：${characteristics.length}`)
      for (const characteristic of characteristics) {
        const characteristicId = String(characteristic?.uuid || characteristic?.characteristicId || '')
        appendLog('info', `特征：${characteristicId} · ${describeBleProperties(characteristic?.properties).join(', ')}`)
      }
    }
  } finally {
    await closeBleConnection(deviceId)
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

function buildSocketFactories(plusApi: any, remoteDevice: any, uuid: any) {
  return [
    {
      label: 'secure-spp-uuid',
      create: () => plusApi.android.invoke(remoteDevice, 'createRfcommSocketToServiceRecord', uuid),
    },
    {
      label: 'insecure-spp-uuid',
      create: () => plusApi.android.invoke(remoteDevice, 'createInsecureRfcommSocketToServiceRecord', uuid),
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
}

async function openPrinterSocket(device: BluetoothPrinterDevice, strategy: BluetoothPrinterStrategy) {
  const { plusApi, adapter } = await ensureBluetoothEnabled()
  plusApi.android.invoke(adapter, 'cancelDiscovery')

  const UUID = plusApi.android.importClass('java.util.UUID')
  const remoteDevice = plusApi.android.invoke(adapter, 'getRemoteDevice', device.address)
  const uuid = UUID.fromString(SPP_UUID)
  const factories = buildSocketFactories(plusApi, remoteDevice, uuid)

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
