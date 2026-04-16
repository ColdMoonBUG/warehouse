/**
 * 蓝牙打印模块 - 参照官方 demo（uni-app printer-demo）
 * 极简 BLE 连接 + CPCL 图形打印
 */
import type { Product, ReturnDoc, SaleDoc, Store } from '@/types'
import { formatDate, normalizeCount } from '@/utils'

export interface PrinterDevice {
  deviceId: string
  name: string
  RSSI?: number
}

export interface PrinterLog {
  id: string
  createdAt: string
  level: 'info' | 'warn' | 'error'
  message: string
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

const _logs: PrinterLog[] = []

export function appendLog(level: PrinterLog['level'], message: string) {
  const log: PrinterLog = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toLocaleTimeString('zh-CN'),
    level,
    message,
  }
  _logs.push(log)
  if (_logs.length > 100) _logs.shift()
  console.log(`[${level.toUpperCase()}] ${message}`)
}

export function getBluetoothPrinterLogs(): PrinterLog[] {
  return [..._logs]
}

export function clearBluetoothPrinterLogs() {
  _logs.length = 0
}

const HEX = {
  ab2hex(buffer: ArrayBuffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => ('00' + b.toString(16)).slice(-2))
      .join('')
  },
  hex2ab(hex: string) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes.buffer
  },
}

// ============================================================
// BLE 底层 - 完全参照官方 demo bluetooth.js
// ============================================================

function openBluetoothAdapter(): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.closeBluetoothAdapter({
      fail: reject,
      complete() {
        uni.openBluetoothAdapter({
          success: resolve,
          fail: reject,
        })
      },
    })
  })
}

function createBleConnection(deviceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.createBLEConnection({
      deviceId,
      success: () => resolve(),
      fail: reject,
    })
  })
}

function closeBleConnection(deviceId: string): Promise<void> {
  return new Promise((resolve) => {
    uni.closeBLEConnection({
      deviceId,
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
}

function getBleDeviceServices(deviceId: string) {
  return new Promise<any>((resolve, reject) => {
    uni.getBLEDeviceServices({
      deviceId,
      success: (res: any) => {
        // 找 0000FF00 服务（打印机服务）
        const service = res.services.find((s: any) =>
          (s.uuid || '').toUpperCase().startsWith('0000FF00')
        )
        resolve(service || res.services[0] || null)
      },
      fail: reject,
    })
  })
}

function getBleDeviceCharacteristics(deviceId: string, serviceId: string) {
  return new Promise<any>((resolve, reject) => {
    uni.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res: any) => {
        const chars = res.characteristics || []
        resolve({
          notify: chars.find((c: any) => c.properties?.notify),
          write: chars.find((c: any) => c.properties?.write),
          dataFC: chars.find((c: any) =>
            (c.uuid || '').toUpperCase().startsWith('0000FF03')
          ),
        })
      },
      fail: reject,
    })
  })
}

function setBleMTU(deviceId: string, mtu: number): Promise<void> {
  return new Promise(resolve => {
    uni.setBLEMTU({
      deviceId,
      mtu,
      success: () => resolve(),
      fail: () => resolve(), // Android 部分机型 setBLEMTU 会失败，忽略
      complete: () => resolve(),
    })
  })
}

function notifyBleCharacteristic(deviceId: string, serviceId: string, characteristicId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId,
      characteristicId,
      state: true,
      success: resolve,
      fail: reject,
    })
  })
}

function writeBleCharacteristic(
  deviceId: string,
  serviceId: string,
  characteristicId: string,
  value: ArrayBuffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.writeBLECharacteristicValue({
      deviceId,
      serviceId,
      characteristicId,
      value,
      writeType: 'writeNoResponse',
      success: () => resolve(),
      fail: reject,
    })
  })
}

// 参照官方 demo：带流控的分片写入
async function writeBleWithFlowControl(
  device: {
    deviceId: string
    serviceId: string
    writeCharacteristicId: string
    dataFC: { mtu: number; credit: number }
  },
  value: ArrayBuffer
) {
  const total = value.byteLength
  let count = 0
  const deadline = Date.now() + 3000
  let noCreditTicks = 0

  while (count < total) {
    if (device.dataFC.mtu > 0 && device.dataFC.credit > 0) {
      const subData = value.slice(count, count + device.dataFC.mtu - 3)
      if (subData.byteLength === 0) break
      count += subData.byteLength
      device.dataFC.credit--

      let ok = false
      let retries = 0
      while (!ok && retries < 3) {
        try {
          await writeBleCharacteristic(
            device.deviceId,
            device.serviceId,
            device.writeCharacteristicId,
            subData
          )
          ok = true
        } catch (e: any) {
          if (e?.code === 10007) {
            retries++
            await sleep(10)
          } else {
            throw e
          }
        }
      }
      noCreditTicks = 0
    } else {
      noCreditTicks++
      if (noCreditTicks > 100 && count === 0) {
        // 3 秒内没收到流控 credit，降级为普通分片写入
        appendLog('warn', '未收到流控 credit，降级为普通写入')
        await writeBleSimple(device, value, count)
        return
      }
      await sleep(30)
    }
  }
}

async function writeBleSimple(
  device: {
    deviceId: string
    serviceId: string
    writeCharacteristicId: string
  },
  value: ArrayBuffer,
  offset = 0
) {
  const CHUNK = 200
  const total = value.byteLength
  let count = offset

  while (count < total) {
    const end = Math.min(count + CHUNK, total)
    const chunk = value.slice(count, end)
    await writeBleCharacteristic(
      device.deviceId,
      device.serviceId,
      device.writeCharacteristicId,
      chunk
    )
    count = end
    if (count < total) await sleep(20)
  }
}

// ============================================================
// BLE 连接会话管理
// ============================================================

interface BleSession {
  deviceId: string
  serviceId: string
  writeCharacteristicId: string
  notifyCharacteristicId: string
  dataFCCharacteristicId: string
  dataFC: { mtu: number; credit: number }
  resultResolver?: (v: any) => void
  resultRejecter?: (e: any) => void
}

let currentSession: BleSession | null = null
let resultBuffer: number[] = []
let jsonBuffer: string | null = null

uni.onBLECharacteristicValueChange((res: any) => {
  if (!currentSession) return
  const { characteristicId, value } = res

  if (characteristicId === currentSession.notifyCharacteristicId) {
    const data = new Uint8Array(value)
    for (let i = 0; i < data.byteLength; i++) {
      const b = data[i]
      if (b === 0x7B) {
        jsonBuffer = ''
        resultBuffer = []
      }
      if (jsonBuffer !== null) {
        jsonBuffer += String.fromCharCode(b)
      }
      if (b === 0x7D && jsonBuffer !== null) {
        try {
          const result = JSON.parse(jsonBuffer)
          currentSession.resultResolver?.(result)
        } catch {}
        jsonBuffer = null
      }
    }
  }

  if (characteristicId === currentSession.dataFCCharacteristicId) {
    const data = new Uint8Array(value)
    if (data[0] === 1) {
      currentSession.dataFC.credit += data[1]
    } else if (data[0] === 2) {
      currentSession.dataFC.mtu = (data[2] << 8) | data[1]
    }
  }
})

export async function connectPrinter(deviceId: string): Promise<void> {
  if (currentSession) {
    appendLog('info', `断开旧连接：${currentSession.deviceId}`)
    await closeBleConnection(currentSession.deviceId).catch(() => {})
    currentSession = null
  }

  appendLog('info', `[1/6] 初始化蓝牙适配器...`)
  await openBluetoothAdapter()
  appendLog('info', `[1/6] 蓝牙适配器已打开`)

  appendLog('info', `[2/6] 建立 BLE 连接：${deviceId}...`)
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const handler = (res: any) => {
      if (res.deviceId !== deviceId || settled) return
      settled = true
      if (res.connected) {
        appendLog('info', `[2/6] BLE 连接成功`)
        resolve()
      } else {
        appendLog('error', `[2/6] BLE 连接已断开：${JSON.stringify(res)}`)
        reject(new Error('蓝牙连接失败或已断开'))
      }
    }
    uni.onBLEConnectionStateChange(handler)
    createBleConnection(deviceId).catch((e: any) => {
      if (!settled) {
        settled = true
        appendLog('error', `[2/6] createBLEConnection 失败：${e?.message || e}`)
        reject(e)
      }
    })
  })

  appendLog('info', `[3/6] 等待服务就绪...`)
  await sleep(1000)

  appendLog('info', `[3/6] 获取 BLE 服务...`)
  const service = await getBleDeviceServices(deviceId)
  if (!service) {
    appendLog('error', `[3/6] 未找到打印机服务（0000FF00）`)
    throw new Error('未找到打印机服务')
  }
  const serviceId = service.uuid || service.serviceId
  appendLog('info', `[3/6] 找到服务：${serviceId}`)

  appendLog('info', `[4/6] 获取特征值...`)
  const chars = await getBleDeviceCharacteristics(deviceId, serviceId)
  if (!chars.write) {
    appendLog('error', `[4/6] 未找到写入特征`)
    throw new Error('未找到写入特征')
  }
  appendLog('info', `[4/6] write=${chars.write.uuid} notify=${chars.notify?.uuid || '无'} dataFC=${chars.dataFC?.uuid || '无'}`)

  appendLog('info', `[5/6] 设置 MTU=512...`)
  await setBleMTU(deviceId, 512)
  await sleep(500)
  appendLog('info', `[5/6] MTU 设置完成`)

  currentSession = {
    deviceId,
    serviceId,
    writeCharacteristicId: chars.write.uuid || chars.write.characteristicId || '',
    notifyCharacteristicId: chars.notify?.uuid || chars.notify?.characteristicId || '',
    dataFCCharacteristicId: chars.dataFC?.uuid || chars.dataFC?.characteristicId || '',
    dataFC: { mtu: 0, credit: 0 },
  }

  appendLog('info', `[6/6] 启用 notify...`)
  if (currentSession.notifyCharacteristicId) {
    await notifyBleCharacteristic(deviceId, serviceId, currentSession.notifyCharacteristicId)
    appendLog('info', `[6/6] notify 已启用`)
  }
  if (currentSession.dataFCCharacteristicId) {
    await sleep(500)
    await notifyBleCharacteristic(deviceId, serviceId, currentSession.dataFCCharacteristicId)
    appendLog('info', `[6/6] dataFC notify 已启用`)
  }

  appendLog('info', `连接完成 ✓ ${deviceId}`)
  _connected = true
  _currentDeviceId = deviceId
}

export async function testConnection(deviceId: string): Promise<boolean> {
  try {
    await connectPrinter(deviceId)
    return true
  } catch (e: any) {
    appendLog('error', `连接失败：${e?.message || e}`)
    return false
  }
}

export async function disconnectPrinter(): Promise<void> {
  if (!currentSession) return
  await closeBleConnection(currentSession.deviceId).catch(() => {})
  currentSession = null
  _connected = false
  _currentDeviceId = null
}

// ============================================================
// 打印数据构建（参照官方 demo cpcl0）
// ============================================================

const CPCL_MIN_RAW = import.meta.glob('./CPCL.min.js', { eager: true, query: '?raw', import: 'default' })['./CPCL.min.js'] as string

type CpclModule = { Builder: any; Tools: { HEX: any } }

let _cpcl: CpclModule | undefined

function getCpcl(): CpclModule {
  if (_cpcl) return _cpcl
  const m: { exports: CpclModule } = { exports: {} as CpclModule }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', CPCL_MIN_RAW)(m, m.exports)
  _cpcl = m.exports
  return _cpcl
}

function buildTestPageCpcl(): ArrayBuffer {
  const cpcl = getCpcl()
  const width = 600
  const height = 300
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const v = (y >= 60 && y < 240 && x >= 30 && x < 570) ? 0 : 255
      pixels[idx] = v
      pixels[idx + 1] = v
      pixels[idx + 2] = v
      pixels[idx + 3] = 255
    }
  }
  return cpcl.Builder.createArea(0, height, 1)
    .taskId('TEST')
    .pageWidth(2592)
    .imageGG({ width, height, data: pixels }, 0, 0)
    .formPrint()
    .build()
}

// ============================================================
// 打印发送（参照官方 demo device.write 分片发送）
// ============================================================

async function sendCpcl(cpcl: ArrayBuffer): Promise<void> {
  if (!currentSession) {
    throw new Error('请先连接打印机')
  }

  if (currentSession.writeCharacteristicId && currentSession.dataFCCharacteristicId) {
    await writeBleWithFlowControl(currentSession, cpcl)
  } else if (currentSession.writeCharacteristicId) {
    const mtu = 512
    const total = cpcl.byteLength
    let count = 0
    while (count < total) {
      const end = Math.min(count + mtu, total)
      const chunk = cpcl.slice(count, end)
      await writeBleCharacteristic(
        currentSession.deviceId,
        currentSession.serviceId,
        currentSession.writeCharacteristicId,
        chunk
      )
      count = end
      if (count < total) await sleep(20)
    }
  }
}

function setupResultListener(): Promise<{ taskid: string; printMsg: string }> {
  return new Promise((resolve, reject) => {
    if (!currentSession) {
      reject(new Error('未连接'))
      return
    }
    currentSession.resultResolver = resolve
    currentSession.resultRejecter = reject
    setTimeout(() => reject(new Error('等待打印回包超时')), 30000)
  })
}

// ============================================================
// 业务层
// ============================================================

function moneyText(value?: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function buildReceipt(header: string[], lines: string[], footer: string[]) {
  return [...header, '------------------------------', ...lines, '------------------------------', ...footer].join('\n')
}

function buildReceiptLines(
  docLines: Array<{ productId: string; qty: number; price: number }>,
  products: Product[]
) {
  return docLines.map(line => {
    const product = products.find(p => p.id === line.productId)
    const name = product?.name || '未知商品'
    const barcode = product?.barcode || '-'
    const qty = normalizeCount(line.qty)
    const amount = Number(line.qty) * Number(line.price)
    return `${name}（${barcode}）x${qty} ¥${amount.toFixed(2)}`
  })
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

// ============================================================
// 打印入口（参照官方 demo testPrint 流程）
// ============================================================

export async function printTestPage(device?: PrinterDevice | null) {
  const target = device || getSavedPrinter()
  if (!target) {
    throw new Error('请先选择打印机')
  }

  await ensurePrinterConnected(target)
  const cpcl = buildTestPageCpcl()
  await sendCpcl(cpcl)
}

export async function printSaleA4(
  doc: SaleDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  payType: 'cash' | 'card' = 'card',
  device?: PrinterDevice | null
) {
  const { buildSalePrintData } = await import('./canvas-print')
  const { cpclBuffer, journalSetup } = await buildSalePrintData(doc, store, salespersonName, products, payType)
  const target = device || getSavedPrinter()
  if (!target) {
    throw new Error('请先选择打印机')
  }
  await ensurePrinterConnected(target)

  appendLog('info', `[A4打印] 发送 JOURNAL+SETFF 配置...`)
  await sendCpcl(journalSetup)
  await sleep(500)
  appendLog('info', `[A4打印] 发送打印指令...`)
  await sendCpcl(cpclBuffer)
  appendLog('info', `[A4打印] 完成`)
}

export async function printReturnA4(
  doc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  device?: PrinterDevice | null
) {
  const { buildReturnPrintData } = await import('./canvas-print')
  const { cpclBuffer, journalSetup } = await buildReturnPrintData(doc, store, salespersonName, products)
  const target = device || getSavedPrinter()
  if (!target) {
    throw new Error('请先选择打印机')
  }
  await ensurePrinterConnected(target)
  appendLog('info', '[A4打印] 发送 JOURNAL+SETFF 配置...')
  await sendCpcl(journalSetup)
  await sleep(500)
  appendLog('info', '[A4打印] 发送打印指令...')
  await sendCpcl(cpclBuffer)
}

export async function printCombinedA4(
  saleDoc: SaleDoc,
  returnDoc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  payType: 'cash' | 'card' = 'card',
  device?: PrinterDevice | null
) {
  const { buildCombinedPrintData } = await import('./canvas-print')
  const { pages } = await buildCombinedPrintData(saleDoc, returnDoc, store, salespersonName, products, payType)
  const target = device || getSavedPrinter()
  if (!target) {
    throw new Error('请先选择打印机')
  }
  await ensurePrinterConnected(target)

  appendLog('info', `[合并打印] ${pages.length} 页`)

  for (let p = 0; p < pages.length; p++) {
    const { cpclBuffer, journalSetup } = pages[p]
    appendLog('info', `[合并打印] 第 ${p + 1}/${pages.length} 页 - 发送配置...`)
    await sendCpcl(journalSetup)
    await sleep(500)
    appendLog('info', `[合并打印] 第 ${p + 1}/${pages.length} 页 - 发送打印指令...`)
    await sendCpcl(cpclBuffer)
    if (p < pages.length - 1) {
      await sleep(1500)
    }
  }
  appendLog('info', `[合并打印] 完成，共 ${pages.length} 页`)
}

export function checkPrinterConnected(): PrinterDevice | null {
  return getBoundPrinter()
}

export function navigateToPrinterSettings() {
  uni.navigateTo({ url: '/pages/settings/printer' })
}

// ============================================================
// 设备管理（参照官方 demo find）
// ============================================================

export async function listNearbyPrinters(): Promise<PrinterDevice[]> {
  await openBluetoothAdapter()

  return new Promise((resolve) => {
    const devices: PrinterDevice[] = []
    const seen = new Set<string>()

    uni.onBluetoothDeviceFound((res: any) => {
      for (const item of res.devices || []) {
        if (!item.name || seen.has(item.deviceId)) continue
        seen.add(item.deviceId)
        devices.push({
          deviceId: item.deviceId,
          name: item.name,
          RSSI: item.RSSI,
        })
      }
    })

    uni.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => {
        setTimeout(() => {
          uni.stopBluetoothDevicesDiscovery({})
          resolve(devices)
        }, 5000)
      },
      fail: () => resolve(devices),
    })
  })
}

const PRINTER_KEY = 'saved_printer_v2'
const PRINTER_BIND_KEY = 'wh_printer_bindings'

// ============================================================
// 预设设备 & 账户绑定
// ============================================================

/** 预设打印机设备参数（MAC 地址在 Android 下即 deviceId） */
export const PRESET_PRINTERS: Record<string, { name: string; mac: string }> = {
  小车: { name: 'A4LEP-A0290A', mac: '80:F1:B2:A0:29:0A' },
  大车: { name: 'A4LEP-A0C4CA', mac: '80:F1:B2:A0:C4:CA' },
  三车: { name: '', mac: '' },  // 待配置
}

/** 获取当前账户的显示名标签（用于绑定打印机） */
function getAccountLabel(): string {
  try {
    const raw = uni.getStorageSync('wh_current_user')
    if (!raw) return ''
    const user = typeof raw === 'string' ? JSON.parse(raw) : raw
    // 管理员不参与绑定
    if (user.role === 'admin') return ''
    const name = (user.displayName || '').trim()
    if (!name) return ''
    return name
  } catch {
    return ''
  }
}

/** 获取当前账户绑定的打印机（优先级：手动绑定 > 预设） */
export function getBoundPrinter(): PrinterDevice | null {
  const label = getAccountLabel()
  // 1. 查手动绑定
  const bindings = loadBindings()
  if (label && bindings[label]) {
    return bindings[label]
  }
  // 2. 查预设
  if (label && PRESET_PRINTERS[label]?.mac) {
    const preset = PRESET_PRINTERS[label]
    return { deviceId: preset.mac, name: preset.name }
  }
  // 3. 兜底旧的 saved_printer
  return getSavedPrinter()
}

/** 将当前账户绑定到指定设备 */
export function bindPrinterToAccount(device: PrinterDevice): boolean {
  const label = getAccountLabel()
  if (!label) return false
  const bindings = loadBindings()
  bindings[label] = { deviceId: device.deviceId, name: device.name }
  saveBindings(bindings)
  // 同时保存为 saved_printer（兼容旧逻辑）
  savePrinter(device)
  appendLog('info', `[绑定] ${label} 绑定打印机: ${device.name} (${device.deviceId})`)
  return true
}

/** 解除当前账户的绑定 */
export function unbindPrinterFromAccount() {
  const label = getAccountLabel()
  if (!label) return
  const bindings = loadBindings()
  delete bindings[label]
  saveBindings(bindings)
  appendLog('info', `[绑定] ${label} 已解除打印机绑定`)
}

/** 获取当前账户标签（导出给 UI 使用） */
export function getCurrentAccountLabel(): string {
  return getAccountLabel()
}

function loadBindings(): Record<string, PrinterDevice> {
  try {
    const raw = uni.getStorageSync(PRINTER_BIND_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveBindings(bindings: Record<string, PrinterDevice>) {
  uni.setStorageSync(PRINTER_BIND_KEY, JSON.stringify(bindings))
}

export function getSavedPrinter(): PrinterDevice | null {
  try {
    const raw = uni.getStorageSync(PRINTER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePrinter(device: PrinterDevice) {
  uni.setStorageSync(PRINTER_KEY, JSON.stringify(device))
}

export function clearSavedPrinter() {
  uni.removeStorageSync(PRINTER_KEY)
}

export function openBluetoothSettings() {
  // Android 打开系统蓝牙设置
  try {
    if (typeof uni.openDeviceBluetoothSetting === 'function') {
      uni.openDeviceBluetoothSetting()
    } else {
      uni.showToast({ title: '请在系统设置中开启蓝牙', icon: 'none' })
    }
  } catch {
    uni.showToast({ title: '请在系统设置中开启蓝牙', icon: 'none' })
  }
}

// ============================================================
// 蓝牙前台保活 + 10秒心跳
// ============================================================

let _connected = false
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null
let _currentDeviceId: string | null = null
let _reconnecting = false

export function isBluetoothConnected(): boolean {
  return _connected && !!currentSession
}

/** 尝试发送最小数据检测连接是否存活 */
async function heartbeatPing(): Promise<boolean> {
  if (!currentSession) return false
  try {
    // 发送一个空字节检测连接
    const testData = new Uint8Array([0x00]).buffer
    await writeBleCharacteristic(
      currentSession.deviceId,
      currentSession.serviceId,
      currentSession.writeCharacteristicId,
      testData,
    )
    return true
  } catch {
    return false
  }
}

async function attemptReconnect() {
  if (_reconnecting) return
  _reconnecting = true
  const saved = getBoundPrinter()
  if (!saved) {
    _reconnecting = false
    return
  }
  appendLog('info', `[心跳] 连接断开，尝试自动重连 ${saved.name}(${saved.deviceId})...`)
  try {
    await connectPrinter(saved.deviceId)
    _connected = true
    _currentDeviceId = saved.deviceId
    appendLog('info', '[心跳] 自动重连成功')
  } catch (e: any) {
    _connected = false
    appendLog('warn', `[心跳] 自动重连失败: ${e?.message || e}`)
  } finally {
    _reconnecting = false
  }
}

function startHeartbeat() {
  stopHeartbeat()
  _heartbeatTimer = setInterval(async () => {
    if (_reconnecting) return
    if (!_connected || !currentSession) {
      await attemptReconnect()
      return
    }
    const alive = await heartbeatPing()
    if (!alive) {
      _connected = false
      appendLog('warn', '[心跳] 连接丢失')
      await attemptReconnect()
    }
  }, 10000)
}

function stopHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer)
    _heartbeatTimer = null
  }
}

/** App 进入前台时调用：根据账户绑定设备启动心跳，自动重连 */
export function startBluetoothDaemon() {
  const bound = getBoundPrinter()
  if (!bound) {
    appendLog('info', '[心跳] 当前账户未绑定打印机，跳过自动连接')
    return
  }
  appendLog('info', `[心跳] 账户绑定设备: ${bound.name}(${bound.deviceId})`)
  // 如果当前无连接，尝试重连
  if (!_connected || !currentSession) {
    attemptReconnect()
  }
  startHeartbeat()
  appendLog('info', '[心跳] 前台保活已启动')
}

/** App 进入后台时调用：暂停心跳 */
export function pauseBluetoothDaemon() {
  stopHeartbeat()
  appendLog('info', '[心跳] 后台暂停心跳')
}

/** 确保打印前连接就绪：每次打印都强制关闭旧连接并重新建立，确保可靠性 */
export async function ensurePrinterConnected(device?: PrinterDevice | null): Promise<void> {
  const target = device || getBoundPrinter()
  if (!target) {
    throw new Error('请先绑定打印机')
  }
  // 关闭旧连接（忽略失败，可能本来就没连接）
  if (currentSession) {
    await closeBleConnection(currentSession.deviceId).catch(() => {})
    currentSession = null
    _connected = false
    _currentDeviceId = null
  }
  // 每次打印都全新连接，确保可靠
  appendLog('info', `[打印] 建立连接: ${target.name}(${target.deviceId})`)
  await connectPrinter(target.deviceId)
  _connected = true
  _currentDeviceId = target.deviceId
}
