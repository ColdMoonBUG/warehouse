import { CPCL, HEX } from './cpcl'
import type { SaleDoc, ReturnDoc, Product, Store } from '@/types'
import { formatDate, normalizeCount } from '@/utils'
import { getSavedPrinter, appendLog } from './bluetooth-printer'

const CANVAS_ID = 'printCanvas'
const DPI = 300
const PAGE_WIDTH_DOTS = Math.floor(148 * DPI / 25.4)
const PAGE_HEIGHT_DOTS = Math.floor(210 * DPI / 25.4)
const CONTENT_WIDTH_DOTS = PAGE_WIDTH_DOTS - 100

function mmToDots(mm: number): number {
  return Math.floor(mm * DPI / 25.4)
}

function moneyText(value?: number): string {
  return `¥${Number(value || 0).toFixed(2)}`
}

interface PrintItem {
  productId: string
  name: string
  barcode?: string
  qty: number
  price: number
  amount: number
}

interface PrintDocData {
  type: 'sale' | 'return'
  code: string
  date: string
  storeName: string
  salespersonName: string
  items: PrintItem[]
  totalQty: number
  totalAmount: number
  payType: 'cash' | 'card'
  remark?: string
}

function estimateContentHeight(data: PrintDocData): number {
  const headerH = 72
  const infoLineH = 50
  const infoH = 4 * infoLineH + 12
  const tableLineH = 46
  const tableH = (1 + data.items.length) * tableLineH + 22
  const footerLineH = 50
  const remarkH = data.remark ? 42 : 0
  const footerH = footerLineH + remarkH + 22

  const margin = mmToDots(5)
  return Math.min(margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin, PAGE_HEIGHT_DOTS)
}

async function drawPrintContent(ctx: any, data: PrintDocData, width: number, height: number): Promise<void> {
  ctx.setFillStyle('white')
  ctx.fillRect(0, 0, width, height)

  const lm = 30
  const rm = 30
  let y = 35
  const ll = 1

  ctx.setFillStyle('black')

  ctx.setFontSize(56)
  const titleText = data.type === 'sale' ? '艳萍麻花销单' : '艳萍麻花退单'
  const payTag = data.payType === 'cash' ? '[现金]' : '[单子]'
  ctx.fillText(`${titleText} ${payTag}`, lm, y + 56)
  y += 72

  ctx.setStrokeStyle('black')
  ctx.setLineWidth(ll)
  ctx.moveTo(lm, y)
  ctx.lineTo(width - rm, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(38)
  ctx.fillText(`单号:${data.code}`, lm, y + 38)
  y += 50
  ctx.fillText(`日期:${data.date}`, lm, y + 38)
  y += 50
  ctx.fillText(`店铺:${data.storeName}`, lm, y + 38)
  y += 50
  ctx.fillText(`业务员:${data.salespersonName}`, lm, y + 38)
  y += 54

  ctx.setLineWidth(ll)
  ctx.moveTo(lm, y)
  ctx.lineTo(width - rm, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(34)
  const colBarcode = lm
  const colName = 480
  const colQty = 980
  const colPrice = 1200
  const colAmount = 1450

  ctx.fillText('条形码', colBarcode, y + 34)
  ctx.fillText('商品', colName, y + 34)
  ctx.fillText('数量', colQty, y + 34)
  ctx.fillText('进价', colPrice, y + 34)
  ctx.fillText('总计', colAmount, y + 34)
  y += 46

  ctx.setLineWidth(ll)
  ctx.moveTo(lm, y)
  ctx.lineTo(width - rm, y)
  ctx.stroke()
  y += 12

  for (const item of data.items) {
    const barcodeText = (item.barcode || '-').slice(0, 13)
    const nameText = item.name.length > 5 ? item.name.slice(0, 5) + '..' : item.name
    const qtyText = `${normalizeCount(item.qty)}`
    const priceText = moneyText(item.price)
    const amountText = moneyText(item.amount)

    ctx.fillText(barcodeText, colBarcode, y + 34)
    ctx.fillText(nameText, colName, y + 34)
    ctx.fillText(qtyText, colQty, y + 34)
    ctx.fillText(priceText, colPrice, y + 34)
    ctx.fillText(amountText, colAmount, y + 34)
    y += 46
  }

  y += 8
  ctx.setLineWidth(ll)
  ctx.moveTo(lm, y)
  ctx.lineTo(width - rm, y)
  ctx.stroke()
  y += 15

  ctx.setFontSize(40)
  ctx.fillText(`合计数量:${normalizeCount(data.totalQty)}`, lm, y + 40)
  ctx.fillText(`合计金额:${moneyText(data.totalAmount)}`, width - rm - 520, y + 40)
  y += 50

  if (data.remark) {
    ctx.setFontSize(32)
    ctx.fillText(`备注:${data.remark}`, lm, y + 32)
    y += 42
  }

  ctx.setLineWidth(ll)
  ctx.moveTo(lm, y)
  ctx.lineTo(width - rm, y)
  ctx.stroke()

  await new Promise<void>((resolve) => {
    let resolved = false
    const done = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    ctx.draw(false, done)
    setTimeout(done, 3000)
  })
}

async function getCanvasImageData(width: number, height: number): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.canvasGetImageData({
      canvasId: CANVAS_ID,
      x: 0,
      y: 0,
      width,
      height,
      success: resolve,
      fail: reject,
    })
  })
}

async function generatePrintImageData(data: PrintDocData): Promise<any> {
  try {
    const height = estimateContentHeight(data)
    const width = PAGE_WIDTH_DOTS
    appendLog('info', `[A5打印] 开始Canvas绘制：${width}x${height}，${data.items.length} 项商品`)

    const ctx = uni.createCanvasContext(CANVAS_ID)
    appendLog('info', '[A5打印] Canvas上下文创建成功')

    await drawPrintContent(ctx, data, width, height)
    appendLog('info', '[A5打印] Canvas绘制完成，开始获取图片数据')

    const imageData = await getCanvasImageData(width, height)
    appendLog('info', `[A5打印] 图片数据获取成功：${imageData.width}x${imageData.height}，数据长度 ${imageData.data?.length || 0}`)

    return imageData
  } catch (error: any) {
    appendLog('error', `[A5打印] Canvas绘制失败：${error?.message || error}`)
    throw error
  }
}

function strToBytes(str: string): Uint8Array {
  return new Uint8Array(str.split('').map(c => c.charCodeAt(0)))
}

function buildJournalSetup(): ArrayBuffer {
  const setup = '! DF RUN.BAT\n! UTILITIES\nJOURNAL\nSETFF 50 5\nPRINT\n'
  return strToBytes(setup).buffer
}

function buildCpclCommand(imageData: any, taskId: string): { cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer } {
  try {
    appendLog('info', `[A5打印] 开始构建CPCL指令：taskId=${taskId}，图片 ${imageData.width}x${imageData.height}`)

    const cpclBuffer = CPCL.Builder.createArea(0, imageData.height, 1)
      .taskId(taskId || '1')
      .pageWidth(PAGE_WIDTH_DOTS)
      .imageGG(imageData, 0, 0)
      .formPrint()
      .build()

    const journalSetup = buildJournalSetup()
    appendLog('info', `[A5打印] CPCL指令构建成功：${cpclBuffer.byteLength} 字节，JOURNAL配置 ${journalSetup.byteLength} 字节`)
    return { cpclBuffer, journalSetup }
  } catch (error: any) {
    appendLog('error', `[A5打印] CPCL指令构建失败：${error?.message || error}`)
    throw error
  }
}

export async function buildSalePrintData(
  doc: SaleDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  payType: 'cash' | 'card' = 'card'
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer; data: PrintDocData }> {
  const items: PrintItem[] = doc.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
    }
  })

  const totalQty = items.reduce((sum, item) => sum + normalizeCount(item.qty), 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const data: PrintDocData = {
    type: 'sale',
    code: doc.code,
    date: doc.date,
    storeName: store?.name || '-',
    salespersonName,
    items,
    totalQty,
    totalAmount,
    payType,
    remark: doc.remark,
  }

  appendLog('info', `[A5打印] 开始生成销单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data)
  const { cpclBuffer, journalSetup } = buildCpclCommand(imageData, doc.id || doc.code)
  appendLog('info', `[A5打印] 销单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, journalSetup, data }
}

export async function buildReturnPrintData(
  doc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[]
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer; data: PrintDocData }> {
  const items: PrintItem[] = doc.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
    }
  })

  const totalQty = items.reduce((sum, item) => sum + normalizeCount(item.qty), 0)
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const returnTypeText = doc.returnType === 'warehouse_return' ? '回仓退货' : '车库退货'

  const data: PrintDocData = {
    type: 'return',
    code: doc.code,
    date: doc.date,
    storeName: store?.name || '-',
    salespersonName,
    items,
    totalQty,
    totalAmount,
    payType: 'card',
    remark: doc.remark ? `${returnTypeText} - ${doc.remark}` : returnTypeText,
  }

  appendLog('info', `[A5打印] 开始生成退货单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data)
  const { cpclBuffer, journalSetup } = buildCpclCommand(imageData, doc.id || doc.code)
  appendLog('info', `[A5打印] 退货单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, journalSetup, data }
}

export { CANVAS_ID, PAGE_WIDTH_DOTS, DPI, estimateContentHeight, generatePrintImageData, buildCpclCommand, buildJournalSetup }
export type { PrintDocData, PrintItem }
