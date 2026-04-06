import type { Product, ReturnDoc, SaleDoc } from '@/types'
import { formatDate, formatPackSummary, normalizeCount } from '@/utils'

export interface BluetoothPrinterDevice {
  name: string
  address: string
}

const STORAGE_KEY = 'mobile_bluetooth_printer_v1'
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB'

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

async function requestBluetoothPermissions() {
  const plusApi = ensureAndroidApp()
  const sdkInt = getSdkInt()
  const permissions = sdkInt >= 31
    ? ['android.permission.BLUETOOTH_CONNECT', 'android.permission.BLUETOOTH_SCAN']
    : ['android.permission.ACCESS_FINE_LOCATION']

  await new Promise<void>((resolve, reject) => {
    plusApi.android.requestPermissions(
      permissions,
      (result: any) => {
        const denied = [...(result?.deniedAlways || []), ...(result?.deniedPresent || [])]
        if (denied.length > 0) {
          reject(new Error('蓝牙权限未授予，请到系统设置中允许蓝牙权限'))
          return
        }
        resolve()
      },
      () => reject(new Error('蓝牙权限申请失败')),
    )
  })
}

async function ensureBluetoothEnabled() {
  await requestBluetoothPermissions()
  const { plusApi, adapter } = getBluetoothAdapter()
  const enabled = !!plusApi.android.invoke(adapter, 'isEnabled')
  if (!enabled) {
    throw new Error('蓝牙未开启，请先打开手机蓝牙')
  }
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

function toPrinterBytes(text: string) {
  const plusApi = ensureAndroidApp()
  const normalized = `${text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')}\n\n\n`
  const javaString = plusApi.android.newObject('java.lang.String', normalized)
  return plusApi.android.invoke(javaString, 'getBytes', 'GBK')
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
}

export function clearSavedPrinter() {
  uni.removeStorageSync(STORAGE_KEY)
}

export function openBluetoothSettings() {
  const plusApi = ensureAndroidApp()
  const main = plusApi.android.runtimeMainActivity()
  const Settings = plusApi.android.importClass('android.provider.Settings')
  const intent = plusApi.android.newObject('android.content.Intent', Settings.ACTION_BLUETOOTH_SETTINGS)
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

  return devices.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

async function openPrinterSocket(device: BluetoothPrinterDevice) {
  const { plusApi, adapter } = await ensureBluetoothEnabled()
  plusApi.android.invoke(adapter, 'cancelDiscovery')

  const UUID = plusApi.android.importClass('java.util.UUID')
  const remoteDevice = plusApi.android.invoke(adapter, 'getRemoteDevice', device.address)
  const uuid = UUID.fromString(SPP_UUID)

  try {
    return plusApi.android.invoke(remoteDevice, 'createRfcommSocketToServiceRecord', uuid)
  } catch {
    try {
      return plusApi.android.invoke(remoteDevice, 'createInsecureRfcommSocketToServiceRecord', uuid)
    } catch {
      throw new Error(`无法创建打印机连接：${formatPrinterName(device.name)}`)
    }
  }
}

export async function printText(text: string, device?: BluetoothPrinterDevice | null) {
  const target = normalizePrinter(device) || getSavedPrinter()
  if (!target) {
    throw new Error('请先在蓝牙打印页面选择打印机')
  }

  let socket: any = null
  let outputStream: any = null
  try {
    socket = await openPrinterSocket(target)
    const plusApi = ensureAndroidApp()
    plusApi.android.invoke(socket, 'connect')
    outputStream = plusApi.android.invoke(socket, 'getOutputStream')
    const bytes = toPrinterBytes(text)
    plusApi.android.invoke(outputStream, 'write', bytes)
    plusApi.android.invoke(outputStream, 'flush')
    savePrinter(target)
  } catch (error: any) {
    throw new Error(error?.message || `打印失败：${formatPrinterName(target.name)}`)
  } finally {
    safeClose(outputStream)
    safeClose(socket)
  }
}

export async function printTestPage(device?: BluetoothPrinterDevice | null) {
  const now = formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
  await printText([
    '车销系统',
    '蓝牙打印测试',
    `时间：${now}`,
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
