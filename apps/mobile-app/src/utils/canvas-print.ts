import { CPCL, HEX } from './cpcl'
import type { SaleDoc, ReturnDoc, Product, Store } from '@/types'
import { formatDate, normalizeCount } from '@/utils'
import { getSavedPrinter, appendLog } from './bluetooth-printer'

const CANVAS_ID = 'printCanvas'
const DPI = 300
const PAGE_WIDTH_DOTS = Math.floor(210 * DPI / 25.4)
const PAGE_HEIGHT_DOTS = Math.floor(297 * DPI / 25.4)
const PAGE_MARGIN_DOTS = mmToDots(8)
const SIGNATURE_AREA_GAP_DOTS = mmToDots(8)
const SIGNATURE_AREA_WIDTH_DOTS = mmToDots(38)
const CONTENT_LEFT_DOTS = PAGE_MARGIN_DOTS
const CONTENT_RIGHT_DOTS = PAGE_WIDTH_DOTS - PAGE_MARGIN_DOTS - SIGNATURE_AREA_GAP_DOTS - SIGNATURE_AREA_WIDTH_DOTS
const CONTENT_WIDTH_DOTS = CONTENT_RIGHT_DOTS - CONTENT_LEFT_DOTS
const SIGNATURE_LEFT_DOTS = CONTENT_RIGHT_DOTS + SIGNATURE_AREA_GAP_DOTS
const SIGNATURE_RIGHT_DOTS = PAGE_WIDTH_DOTS - PAGE_MARGIN_DOTS
const CUT_BOTTOM_BLANK_DOTS = mmToDots(10)

interface PrintBuildOptions {
  fillFullPage?: boolean
  rotateImage?: boolean
  autoCut?: boolean
}

// 业务员电话映射（按显示名匹配）
const SALESPERSON_PHONES: Record<string, string> = {
  小车: '18625667559',
  大车: '18625667519',
  三车: '18625667511',
}

function mmToDots(mm: number): number {
  return Math.floor(mm * DPI / 25.4)
}

function moneyText(value?: number): string {
  return `¥${Number(value || 0).toFixed(2)}`
}

function resolveDocCode(value?: string, fallbackId?: string): string {
  const code = (value || '').trim()
  if (code) return code
  const fallback = (fallbackId || '').trim()
  return fallback ? `ID:${fallback}` : '未知'
}

function formatSalesperson(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '-'
  const phone = SALESPERSON_PHONES[trimmed]
  return phone ? `${trimmed} ${phone}` : trimmed
}

function formatPrintDate(date: string, createdAt?: string): string {
  const source = (createdAt || '').trim() || (date || '').trim()
  if (!source) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source
  return formatDate(source, 'YYYY-MM-DD HH:mm')
}

function resolvePrintDate(doc: { date?: string; createdAt?: string }): string {
  return formatPrintDate(doc.date || '', doc.createdAt)
}

function drawSignatureNoteArea(ctx: any, height: number) {
  const signatureTop = PAGE_MARGIN_DOTS + 160
  const signatureBottom = Math.max(height - CUT_BOTTOM_BLANK_DOTS - mmToDots(18), signatureTop + mmToDots(70))
  const titleBottom = signatureTop + 20
  const noticeY = signatureBottom - mmToDots(6)

  ctx.setFontSize(40)
  ctx.fillText('签字备注区', SIGNATURE_LEFT_DOTS, signatureTop)
  ctx.setLineWidth(1)
  ctx.moveTo(SIGNATURE_LEFT_DOTS, titleBottom)
  ctx.lineTo(SIGNATURE_RIGHT_DOTS, titleBottom)
  ctx.stroke()
  ctx.moveTo(SIGNATURE_LEFT_DOTS, signatureBottom)
  ctx.lineTo(SIGNATURE_RIGHT_DOTS, signatureBottom)
  ctx.stroke()
  ctx.moveTo(SIGNATURE_LEFT_DOTS, titleBottom)
  ctx.lineTo(SIGNATURE_LEFT_DOTS, signatureBottom)
  ctx.stroke()
  ctx.moveTo(SIGNATURE_RIGHT_DOTS, titleBottom)
  ctx.lineTo(SIGNATURE_RIGHT_DOTS, signatureBottom)
  ctx.stroke()

  ctx.setFontSize(24)
  ctx.fillText('本单据为有效对账凭证', SIGNATURE_LEFT_DOTS, noticeY)
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

function estimateContentHeight(data: PrintDocData, fillFullPage: boolean = false): number {
  if (fillFullPage) return PAGE_HEIGHT_DOTS
  const headerH = 72
  const infoLineH = 54
  const infoH = 2 * infoLineH + 12
  const tableLineH = 64
  const tableH = (1 + data.items.length) * tableLineH + 22
  const footerLineH = 56
  const remarkH = data.remark ? 42 : 0
  const footerH = footerLineH + remarkH + 22

  const margin = PAGE_MARGIN_DOTS
  return Math.min(margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS, PAGE_HEIGHT_DOTS)
}

async function drawPrintContent(ctx: any, data: PrintDocData, width: number, height: number): Promise<void> {
  ctx.setFillStyle('white')
  ctx.fillRect(0, 0, width, height)

  const left = CONTENT_LEFT_DOTS
  const right = CONTENT_RIGHT_DOTS
  const contentWidth = CONTENT_WIDTH_DOTS
  const mid = left + Math.floor(contentWidth / 2)
  let y = PAGE_MARGIN_DOTS
  const ll = 1

  const colSeq = left
  const colBarcode = left + Math.floor(contentWidth * 0.06)
  const colName = left + Math.floor(contentWidth * 0.26)
  const colQty = left + Math.floor(contentWidth * 0.66)
  const colPrice = left + Math.floor(contentWidth * 0.79)
  const colAmount = left + Math.floor(contentWidth * 0.89)

  ctx.setFillStyle('black')

  ctx.setFontSize(56)
  const titleText = data.type === 'sale' ? '艳萍麻花销单' : '艳萍麻花退单'
  const payTag = data.payType === 'cash' ? '[现金]' : '[单子]'
  ctx.fillText(`${titleText} ${payTag}`, left, y + 56)
  y += 72

  ctx.setStrokeStyle('black')
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(40)
  ctx.fillText(`单号:${data.code}`, left, y + 40)
  ctx.fillText(`日期:${formatPrintDate(data.date)}`, mid, y + 40)
  y += 54
  ctx.fillText(`店铺:${data.storeName}`, left, y + 40)
  ctx.fillText(`业务员:${formatSalesperson(data.salespersonName)}`, mid, y + 40)
  y += 54

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(46)
  ctx.fillText('序', colSeq, y + 44)
  ctx.fillText('条形码', colBarcode, y + 44)
  ctx.fillText('商品', colName, y + 44)
  ctx.fillText('数量', colQty, y + 44)
  ctx.fillText('进价', colPrice, y + 44)
  ctx.fillText('总计', colAmount, y + 44)
  y += 58

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 12

  let seqNo = 0
  for (const item of data.items) {
    seqNo++
    const barcodeText = (item.barcode || '-').slice(0, 13)
    const nameText = item.name
    const qtyText = `${normalizeCount(item.qty)}`
    const priceText = moneyText(item.price)
    const amountText = moneyText(item.amount)

    ctx.fillText(`${seqNo}`, colSeq, y + 44)
    ctx.fillText(barcodeText, colBarcode, y + 44)
    ctx.fillText(nameText, colName, y + 44)
    ctx.fillText(qtyText, colQty, y + 44)
    ctx.fillText(priceText, colPrice, y + 44)
    ctx.fillText(amountText, colAmount, y + 44)
    y += 64
  }

  y += 8
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 15

  ctx.setFontSize(46)
  ctx.fillText(`品种:${data.items.length}种 合计:${normalizeCount(data.totalQty)}`, left, y + 46)
  ctx.fillText(`合计金额:${moneyText(data.totalAmount)}`, right - mmToDots(42), y + 46)
  y += 56

  if (data.remark) {
    ctx.setFontSize(32)
    ctx.fillText(`备注:${data.remark}`, left, y + 32)
    y += 42
  }

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()

  drawSignatureNoteArea(ctx, height)

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

async function generatePrintImageData(data: PrintDocData, fillFullPage: boolean = false): Promise<any> {
  try {
    const height = estimateContentHeight(data, fillFullPage)
    const width = PAGE_WIDTH_DOTS
    appendLog('info', `[A4打印] 开始Canvas绘制：${width}x${height}，${data.items.length} 项商品${fillFullPage ? '（铺满整页）' : `（底部留白${CUT_BOTTOM_BLANK_DOTS}点，右侧预留签字区）`}`)

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

function strToBytes(str: string): Uint8Array {
  return new Uint8Array(str.split('').map(c => c.charCodeAt(0)))
}

/**
 * 将 RGBA 像素数据逆时针旋转 90 度（向左旋转）
 * 原始 (W x H) → 旋转后 (H x W)
 * 内容从上到下排列，下方留白
 */
function rotateImageData90CCW(imageData: { data: any; width: number; height: number }): { data: Uint8Array; width: number; height: number } {
  const { data: src, width: W, height: H } = imageData
  const newW = H
  const newH = W
  const dst = new Uint8Array(newW * newH * 4)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcIdx = (y * W + x) * 4
      // 逆时针90度: (x, y) → (y, W-1-x)
      const nx = y
      const ny = W - 1 - x
      const dstIdx = (ny * newW + nx) * 4
      dst[dstIdx] = src[srcIdx]
      dst[dstIdx + 1] = src[srcIdx + 1]
      dst[dstIdx + 2] = src[srcIdx + 2]
      dst[dstIdx + 3] = src[srcIdx + 3]
    }
  }

  return { data: dst, width: newW, height: newH }
}

function buildJournalSetup(): ArrayBuffer {
  const setup = '! DF RUN.BAT\n! UTILITIES\nJOURNAL\nSETFF 50 5\nPRINT\n'
  return strToBytes(setup).buffer
}

function buildCpclCommand(imageData: any, taskId: string, options: PrintBuildOptions = {}): { cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer } {
  try {
    appendLog('info', `[A5打印] 开始构建CPCL指令：taskId=${taskId}，原始图片 ${imageData.width}x${imageData.height}`)

    const shouldRotate = options.rotateImage ?? true
    const printData = shouldRotate ? rotateImageData90CCW(imageData) : imageData
    appendLog('info', shouldRotate
      ? `[A5打印] 图片旋转90°完成：${printData.width}x${printData.height}`
      : `[A5打印] 按原始方向打印：${printData.width}x${printData.height}`)

    const builder = CPCL.Builder.createArea(0, printData.height, 1)
      .taskId(taskId || '1')
      .pageWidth(printData.width)
      .imageGG(printData, 0, 0)
      .formPrint()

    if (options.autoCut) {
      builder.append('CUT 0\n')
      appendLog('info', '[A5打印] 已追加自动切纸指令 CUT 0')
    }

    const cpclBuffer = builder.build()

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
  payType: 'cash' | 'card' = 'card',
  options: PrintBuildOptions = {}
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
    code: resolveDocCode(doc.code, doc.id),
    date: resolvePrintDate(doc),
    storeName: store?.name || '-',
    salespersonName,
    items,
    totalQty,
    totalAmount,
    payType,
    remark: doc.remark,
  }

  appendLog('info', `[A5打印] 开始生成销单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data, options.fillFullPage)
  const { cpclBuffer, journalSetup } = buildCpclCommand(imageData, doc.id || doc.code, options)
  appendLog('info', `[A5打印] 销单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, journalSetup, data }
}

export async function buildReturnPrintData(
  doc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  options: PrintBuildOptions = {}
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
    code: resolveDocCode(doc.code, doc.id),
    date: resolvePrintDate(doc),
    storeName: store?.name || '-',
    salespersonName,
    items,
    totalQty,
    totalAmount,
    payType: 'card',
    remark: doc.remark ? `${returnTypeText} - ${doc.remark}` : returnTypeText,
  }

  appendLog('info', `[A5打印] 开始生成退货单图片：${doc.code}，${items.length} 项商品`)
  const imageData = await generatePrintImageData(data, options.fillFullPage)
  const { cpclBuffer, journalSetup } = buildCpclCommand(imageData, doc.id || doc.code, options)
  appendLog('info', `[A5打印] 退货单 CPCL 指令生成完成：${cpclBuffer.byteLength} 字节，图片 ${imageData.width}x${imageData.height}`)

  return { imageData, cpclBuffer, journalSetup, data }
}

interface CombinedPrintData {
  code: string
  date: string
  storeName: string
  salespersonName: string
  saleItems: PrintItem[]
  returnItems: PrintItem[]
  saleTotalQty: number
  saleTotalAmount: number
  returnTotalQty: number
  returnTotalAmount: number
  payType: 'cash' | 'card'
  remark?: string
}

const MAX_ITEMS_PER_PAGE = 30

function estimateCombinedHeight(data: CombinedPrintData, saleItems: PrintItem[], returnItems: PrintItem[], fillFullPage: boolean = false): number {
  if (fillFullPage) return PAGE_HEIGHT_DOTS
  const headerH = 72
  const infoH = 2 * 54 + 12
  const tableLineH = 64
  const saleTableH = (1 + saleItems.length) * tableLineH + 22
  const returnTableH = returnItems.length > 0 ? (1 + returnItems.length) * tableLineH + 22 : 0
  const sectionLabelH = returnItems.length > 0 ? 80 : 0
  const footerH = 56 + 56 + 22

  const margin = PAGE_MARGIN_DOTS
  return Math.min(margin + headerH + 15 + infoH + 15 + saleTableH + sectionLabelH + returnTableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS, PAGE_HEIGHT_DOTS)
}

async function drawCombinedContent(ctx: any, data: CombinedPrintData, saleItems: PrintItem[], returnItems: PrintItem[], width: number, height: number, pageNo: number, totalPages: number): Promise<void> {
  ctx.setFillStyle('white')
  ctx.fillRect(0, 0, width, height)

  const left = CONTENT_LEFT_DOTS
  const right = CONTENT_RIGHT_DOTS
  const contentWidth = CONTENT_WIDTH_DOTS
  const mid = left + Math.floor(contentWidth / 2)
  let y = PAGE_MARGIN_DOTS
  const ll = 1

  const colSeq = left
  const colBarcode = left + Math.floor(contentWidth * 0.06)
  const colName = left + Math.floor(contentWidth * 0.26)
  const colQty = left + Math.floor(contentWidth * 0.66)
  const colPrice = left + Math.floor(contentWidth * 0.79)
  const colAmount = left + Math.floor(contentWidth * 0.89)

  ctx.setFillStyle('black')

  ctx.setFontSize(56)
  const payTag = data.payType === 'cash' ? '[现金]' : '[单子]'
  const pageTag = totalPages > 1 ? ` (${pageNo}/${totalPages})` : ''
  ctx.fillText(`艳萍麻花销单 ${payTag}${pageTag}`, left, y + 56)
  y += 72

  ctx.setStrokeStyle('black')
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(40)
  ctx.fillText(`单号:${data.code}`, left, y + 40)
  ctx.fillText(`日期:${formatPrintDate(data.date)}`, mid, y + 40)
  y += 54
  ctx.fillText(`店铺:${data.storeName}`, left, y + 40)
  ctx.fillText(`业务员:${formatSalesperson(data.salespersonName)}`, mid, y + 40)
  y += 54

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  if (saleItems.length > 0) {
    if (returnItems.length > 0) {
      ctx.setFontSize(42)
      ctx.fillText('【销售】', left, y + 42)
      y += 56
    }

    ctx.setFontSize(46)
    ctx.fillText('序', colSeq, y + 44)
    ctx.fillText('条形码', colBarcode, y + 44)
    ctx.fillText('商品', colName, y + 44)
    ctx.fillText('数量', colQty, y + 44)
    ctx.fillText('进价', colPrice, y + 44)
    ctx.fillText('总计', colAmount, y + 44)
    y += 58

    ctx.setLineWidth(ll)
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 12

    let seqNo = 0
    for (const item of saleItems) {
      seqNo++
      ctx.fillText(`${seqNo}`, colSeq, y + 44)
      ctx.fillText((item.barcode || '-').slice(0, 13), colBarcode, y + 44)
      ctx.fillText(item.name, colName, y + 44)
      ctx.fillText(`${normalizeCount(item.qty)}`, colQty, y + 44)
      ctx.fillText(moneyText(item.price), colPrice, y + 44)
      ctx.fillText(moneyText(item.amount), colAmount, y + 44)
      y += 64
    }

    y += 8
    ctx.setLineWidth(ll)
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 15

    ctx.setFontSize(46)
    const saleSummaryQty = saleItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
    const saleSummaryAmt = saleItems.reduce((s, i) => s + i.amount, 0)
    ctx.fillText(`品种:${saleItems.length}种 合计:${saleSummaryQty}`, left, y + 46)
    ctx.fillText(`金额:${moneyText(saleSummaryAmt)}`, right - mmToDots(36), y + 46)
    y += 56
  }

  if (returnItems.length > 0) {
    y += 10
    ctx.setFontSize(42)
    ctx.fillText('【退货】', left, y + 42)
    y += 56

    ctx.setFontSize(46)
    ctx.fillText('序', colSeq, y + 44)
    ctx.fillText('条形码', colBarcode, y + 44)
    ctx.fillText('商品', colName, y + 44)
    ctx.fillText('数量', colQty, y + 44)
    ctx.fillText('进价', colPrice, y + 44)
    ctx.fillText('总计', colAmount, y + 44)
    y += 58

    ctx.setLineWidth(ll)
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 12

    let seqNo = 0
    for (const item of returnItems) {
      seqNo++
      ctx.fillText(`${seqNo}`, colSeq, y + 44)
      ctx.fillText((item.barcode || '-').slice(0, 13), colBarcode, y + 44)
      ctx.fillText(item.name, colName, y + 44)
      ctx.fillText(`${normalizeCount(item.qty)}`, colQty, y + 44)
      ctx.fillText(moneyText(item.price), colPrice, y + 44)
      ctx.fillText(moneyText(item.amount), colAmount, y + 44)
      y += 64
    }

    y += 8
    ctx.setLineWidth(ll)
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 15

    ctx.setFontSize(46)
    const retSummaryQty = returnItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
    const retSummaryAmt = returnItems.reduce((s, i) => s + i.amount, 0)
    ctx.fillText(`品种:${returnItems.length}种 合计:${retSummaryQty}`, left, y + 46)
    ctx.fillText(`金额:-${moneyText(retSummaryAmt)}`, right - mmToDots(36), y + 46)
    y += 56
  }

  if (returnItems.length > 0 && saleItems.length > 0) {
    y += 10
    ctx.setLineWidth(2)
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 15

    ctx.setFontSize(50)
    const netAmount = data.saleTotalAmount - data.returnTotalAmount
    ctx.fillText(`净额: ${moneyText(netAmount)}`, left, y + 50)
    y += 60
  }

  if (data.remark) {
    ctx.setFontSize(32)
    ctx.fillText(`备注:${data.remark}`, left, y + 32)
    y += 42
  }

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()

  drawSignatureNoteArea(ctx, height)

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

export async function buildCombinedPrintData(
  saleDoc: SaleDoc,
  returnDoc: ReturnDoc,
  store: Store | undefined,
  salespersonName: string,
  products: Product[],
  payType: 'cash' | 'card' = 'card',
  options: PrintBuildOptions = {}
): Promise<{ pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }> }> {
  const saleItems: PrintItem[] = saleDoc.lines.map((line) => {
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

  const returnItems: PrintItem[] = returnDoc.lines.map((line) => {
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

  const totalVarieties = saleItems.length + returnItems.length
  const saleTotalQty = saleItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
  const saleTotalAmount = saleItems.reduce((s, i) => s + i.amount, 0)
  const returnTotalQty = returnItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
  const returnTotalAmount = returnItems.reduce((s, i) => s + i.amount, 0)

  const combinedData: CombinedPrintData = {
    code: resolveDocCode(saleDoc.code, saleDoc.id),
    date: saleDoc.date,
    storeName: store?.name || '-',
    salespersonName,
    saleItems,
    returnItems,
    saleTotalQty,
    saleTotalAmount,
    returnTotalQty,
    returnTotalAmount,
    payType,
    remark: saleDoc.remark,
  }

  // 分页逻辑：总品种超过30种则拆分
  const pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }> = []

  if (totalVarieties <= MAX_ITEMS_PER_PAGE) {
    // 单页
    const height = estimateCombinedHeight(combinedData, saleItems, returnItems, options.fillFullPage)
    const ctx = uni.createCanvasContext(CANVAS_ID)
    await drawCombinedContent(ctx, combinedData, saleItems, returnItems, PAGE_WIDTH_DOTS, height, 1, 1)
    const imageData = await getCanvasImageData(PAGE_WIDTH_DOTS, height)
    pages.push(buildCpclCommand(imageData, saleDoc.id || saleDoc.code, options))
  } else {
    // 多页：先放销单，再放退单，按 MAX_ITEMS_PER_PAGE 拆
    const allPageItems: Array<{ sale: PrintItem[]; ret: PrintItem[] }> = []
    let remainSale = [...saleItems]
    let remainReturn = [...returnItems]
    while (remainSale.length > 0 || remainReturn.length > 0) {
      const pageSale: PrintItem[] = []
      const pageReturn: PrintItem[] = []
      let slots = MAX_ITEMS_PER_PAGE

      if (remainSale.length > 0) {
        const take = Math.min(remainSale.length, slots)
        pageSale.push(...remainSale.splice(0, take))
        slots -= take
      }
      if (remainReturn.length > 0 && slots > 0) {
        const take = Math.min(remainReturn.length, slots)
        pageReturn.push(...remainReturn.splice(0, take))
      }
      allPageItems.push({ sale: pageSale, ret: pageReturn })
    }

    const totalPages = allPageItems.length
    for (let i = 0; i < totalPages; i++) {
      const { sale: pageSaleItems, ret: pageReturnItems } = allPageItems[i]
      const height = estimateCombinedHeight(combinedData, pageSaleItems, pageReturnItems, options.fillFullPage)
      const ctx = uni.createCanvasContext(CANVAS_ID)
      await drawCombinedContent(ctx, combinedData, pageSaleItems, pageReturnItems, PAGE_WIDTH_DOTS, height, i + 1, totalPages)
      const imageData = await getCanvasImageData(PAGE_WIDTH_DOTS, height)
      pages.push(buildCpclCommand(imageData, `${saleDoc.id || saleDoc.code}_p${i + 1}`, options))
    }
  }

  appendLog('info', `[A5打印] 合并打印数据生成完成：${pages.length} 页，销 ${saleItems.length} 种 + 退 ${returnItems.length} 种`)
  return { pages }
}

export { CANVAS_ID, PAGE_WIDTH_DOTS, DPI, estimateContentHeight, generatePrintImageData, buildCpclCommand, buildJournalSetup }
export type { PrintDocData, PrintItem }
