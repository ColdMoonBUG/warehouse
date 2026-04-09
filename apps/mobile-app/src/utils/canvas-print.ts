import { CPCL, HEX } from './cpcl'
import type { SaleDoc, ReturnDoc, Product, Store } from '@/types'
import { formatDate, normalizeCount } from '@/utils'
import { getSavedPrinter, appendLog } from './bluetooth-printer'

const CANVAS_ID = 'printCanvas'
const DPI = 300
const PAGE_WIDTH_DOTS = 2480
const CONTENT_WIDTH_DOTS = PAGE_WIDTH_DOTS - 120

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
  const headerLines = 4
  const infoLines = 4
  const tableHeaderLines = 1
  const itemLines = data.items.length
  const footerLines = 4
  const lineH = mmToDots(6)
  const sectionGap = mmToDots(4)
  const topBottom = mmToDots(10)

  return topBottom
    + headerLines * lineH + sectionGap
    + infoLines * lineH + sectionGap
    + tableHeaderLines * lineH + itemLines * lineH + sectionGap
    + footerLines * lineH
    + topBottom
}

async function drawPrintContent(ctx: any, data: PrintDocData, width: number, height: number): Promise<void> {
  ctx.setFillStyle('white')
  ctx.fillRect(0, 0, width, height)

  const leftMargin = 60
  const rightMargin = 60
  const contentWidth = width - leftMargin - rightMargin
  let y = 80

  ctx.setFillStyle('black')

  // 标题
  ctx.setFontSize(84)
  const titleText = '车销系统'
  ctx.fillText(titleText, Math.floor((width - titleText.length * 84 * 0.6) / 2), y + 84)
  y += 120

  // 副标题
  ctx.setFontSize(68)
  const docTypeText = data.type === 'sale' ? '销 货 单' : '退 货 单'
  const payTypeText = data.payType === 'cash' ? '【现金】' : '【单子】'
  const fullTitle = `${docTypeText}  ${payTypeText}`
  ctx.fillText(fullTitle, Math.floor((width - fullTitle.length * 68 * 0.6) / 2), y + 68)
  y += 108

  // 分隔线（粗）
  ctx.setStrokeStyle('black')
  ctx.setLineWidth(6)
  ctx.moveTo(leftMargin, y)
  ctx.lineTo(width - rightMargin, y)
  ctx.stroke()
  y += 36

  // 信息行
  ctx.setFontSize(56)
  ctx.fillText(`单号：${data.code}`, leftMargin, y + 56)
  y += 80
  ctx.fillText(`日期：${data.date}`, leftMargin, y + 56)
  y += 80
  ctx.fillText(`店铺：${data.storeName}`, leftMargin, y + 56)
  y += 80
  ctx.fillText(`业务员：${data.salespersonName}`, leftMargin, y + 56)
  y += 90

  // 分隔线
  ctx.setLineWidth(4)
  ctx.moveTo(leftMargin, y)
  ctx.lineTo(width - rightMargin, y)
  ctx.stroke()
  y += 30

  // 表头
  ctx.setFontSize(44)
  const colName = 45
  const colBarcode = 630
  const colQty = 1230
  const colPrice = 1530
  const colAmount = 1920

  ctx.fillText('商品名称', colName, y + 44)
  ctx.fillText('条形码', colBarcode, y + 44)
  ctx.fillText('数量', colQty, y + 44)
  ctx.fillText('单价', colPrice, y + 44)
  ctx.fillText('金额', colAmount, y + 44)
  y += 64

  ctx.setLineWidth(4)
  ctx.moveTo(leftMargin, y)
  ctx.lineTo(width - rightMargin, y)
  ctx.stroke()
  y += 20

  // 商品行
  ctx.setFontSize(44)
  for (const item of data.items) {
    const displayName = item.name.length > 10 ? item.name.slice(0, 10) + '..' : item.name
    const displayBarcode = (item.barcode || '-').slice(0, 13)
    const qtyText = `${normalizeCount(item.qty)}`
    const priceText = moneyText(item.price)
    const amountText = moneyText(item.amount)

    ctx.fillText(displayName, colName, y + 44)
    ctx.fillText(displayBarcode, colBarcode, y + 44)
    ctx.fillText(qtyText, colQty, y + 44)
    ctx.fillText(priceText, colPrice, y + 44)
    ctx.fillText(amountText, colAmount, y + 44)
    y += 72
  }

  y += 20
  // 分隔线（粗）
  ctx.setLineWidth(6)
  ctx.moveTo(leftMargin, y)
  ctx.lineTo(width - rightMargin, y)
  ctx.stroke()
  y += 36

  // 合计
  ctx.setFontSize(56)
  ctx.fillText(`合计数量：${normalizeCount(data.totalQty)}`, leftMargin, y + 56)
  ctx.fillText(`合计金额：${moneyText(data.totalAmount)}`, width - rightMargin - 800, y + 56)
  y += 90

  if (data.remark) {
    ctx.setFontSize(44)
    ctx.fillText(`备注：${data.remark}`, leftMargin, y + 44)
    y += 64
  }

  y += 36
  ctx.setLineWidth(4)
  ctx.moveTo(leftMargin, y)
  ctx.lineTo(width - rightMargin, y)
  ctx.stroke()
  y += 30

  ctx.setFontSize(36)
  ctx.fillText(`打印时间：${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`, leftMargin, y + 36)

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
    appendLog('info', `[A4打印] 开始Canvas绘制：${width}x${height}，${data.items.length} 项商品`)

    const ctx = uni.createCanvasContext(CANVAS_ID)
    appendLog('info', '[A4打印] Canvas上下文创建成功')

    await drawPrintContent(ctx, data, width, height)
    appendLog('info', '[A4打印] Canvas绘制完成，开始获取图片数据')

    const imageData = await getCanvasImageData(width, height)
    appendLog('info', `[A4打印] 图片数据获取成功：${imageData.width}x${imageData.height}，数据长度 ${imageData.data?.length || 0}`)

    return imageData
  } catch (error: any) {
    appendLog('error', `[A4打印] Canvas绘制失败：${error?.message || error}`)
    throw error
  }
}

function buildCpclCommand(imageData: any, taskId: string): ArrayBuffer {
  try {
    appendLog('info', `[A4打印] 开始构建CPCL指令：taskId=${taskId}，图片 ${imageData.width}x${imageData.height}`)
    const cpcl = CPCL.Builder.createArea(0, imageData.height, 1)
      .taskId(taskId || '1')
      .pageWidth(2592)
      .imageGG(imageData, 0, 0)
      .formPrint()
      .build()
    appendLog('info', `[A4打印] CPCL指令构建成功：${cpcl.byteLength} 字节`)
    return cpcl
  } catch (error: any) {
    appendLog('error', `[A4打印] CPCL指令构建失败：${error?.message || error}`)
    throw error
  }
}

export async function buildSalePrintData(
  doc: SaleDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  payType: 'cash' | 'card' = 'card'
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; data: PrintDocData }> {
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

  appendLog('info', `[A4打印] 开始生成销单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data)
  const cpclBuffer = buildCpclCommand(imageData, doc.id || doc.code)
  appendLog('info', `[A4打印] 销单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, data }
}

export async function buildReturnPrintData(
  doc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[]
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; data: PrintDocData }> {
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

  appendLog('info', `[A4打印] 开始生成退货单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data)
  const cpclBuffer = buildCpclCommand(imageData, doc.id || doc.code)
  appendLog('info', `[A4打印] 退货单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, data }
}

export { CANVAS_ID, PAGE_WIDTH_DOTS, DPI, estimateContentHeight, generatePrintImageData, buildCpclCommand }
export type { PrintDocData, PrintItem }