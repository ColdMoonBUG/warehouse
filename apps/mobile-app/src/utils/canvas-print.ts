import { CPCL, HEX } from './cpcl'
import type { SaleDoc, ReturnDoc, Product, Store } from '@/types'
import { formatDate, normalizeCount } from '@/utils'
import { getSavedPrinter, appendLog } from './bluetooth-printer'

const CANVAS_ID = 'printCanvas'
const DPI = 300
const PAGE_WIDTH_DOTS = Math.floor(210 * DPI / 25.4)
const PAGE_HEIGHT_DOTS = Math.floor(297 * DPI / 25.4)
// A5 短边宽度（153mm = 148+5），用于 A4mini 旋转打印模式
const A5_SHORT_DOTS = Math.floor(153 * DPI / 25.4)
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
  return phone ? `${trimmed} 业务电话:${phone}` : trimmed
}

function formatPrintDate(date: string, createdAt?: string): string {
  const created = (createdAt || '').trim()
  if (created) return formatDate(created, 'YYYY-MM-DD HH:mm')
  const source = (date || '').trim()
  if (!source) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source
  return formatDate(source, 'YYYY-MM-DD HH:mm')
}

function resolvePrintDate(doc: { date?: string; createdAt?: string }): string {
  return formatPrintDate(doc.date || '', doc.createdAt)
}

const PRODUCT_COLUMN_OFFSET_DOTS = mmToDots(10)

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
  shelfDays?: number
  weight?: string
  boxPackQty?: number  // 每箱袋数，出库单显示 X箱(X袋) 用
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
  returnType?: 'vehicle_return' | 'warehouse_return'
  remark?: string
}

function sortLinesByLineNo<T extends { lineNo?: number }>(lines: T[] = []): T[] {
  return [...lines].sort((a, b) => {
    const aNo = typeof a.lineNo === 'number' && Number.isFinite(a.lineNo) ? a.lineNo : Number.MAX_SAFE_INTEGER
    const bNo = typeof b.lineNo === 'number' && Number.isFinite(b.lineNo) ? b.lineNo : Number.MAX_SAFE_INTEGER
    return aNo - bNo
  })
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
  return margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS
}

/**
 * 供页面给 <canvas> 元素设置高度用。
 *
 * 背景：各页面此前各自用「800 + 商品数×64」之类的独立公式估高，与打印模块真实
 * 绘制高度不同步。一旦元素高度小于实际绘制高度，canvasGetImageData 读不到超出
 * 部分，小票底部（合计/签名）会被静默裁掉——商品越多越容易触发。
 * 这里用与绘制完全相同的常量计算，并额外留 15% 余量兜底。
 */
export function calcCanvasHeightForItems(_itemCount: number, _hasRemark: boolean = true): number {
  // 恒为 A4 整页高度：
  // - 不能更矮：fillFullPage 预设会铺满整页，画布矮于整页就会被裁掉底部（原先各页面
  //   自算的 800 + 商品数×64 正是矮于整页才导致小票底部丢失）。
  // - 不需更高：超过一页的内容一律由 splitItemsByHeight 分页渲染，单张画布永远不会
  //   画得比一页更高；盲目加高只会逼近 WebView 的 canvas 尺寸上限反而整块变空白。
  // 保留入参是为了调用点语义清晰，也便于将来改成按内容动态收缩。
  return PAGE_HEIGHT_DOTS
}

function estimateSalePageHeight(itemCount: number): number {
  const headerH = 72
  const infoH = 2 * 54 + 12
  const tableLineH = 64
  const tableH = (1 + itemCount) * tableLineH + 22
  const footerH = 56 + 22
  const margin = PAGE_MARGIN_DOTS
  return margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS
}

function estimateReturnPageHeight(itemCount: number): number {
  const headerH = 72
  const infoH = 2 * 54 + 12
  const tableLineH = 64
  const tableH = (1 + itemCount) * tableLineH + 22
  const footerH = 56 + 42 + 22
  const margin = PAGE_MARGIN_DOTS
  return margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS
}

function estimateCombinedPageHeight(saleCount: number, returnCount: number): number {
  const headerH = 72
  const infoH = 2 * 54 + 12
  const tableLineH = 64
  const saleTableH = saleCount > 0 ? (1 + saleCount) * tableLineH + 22 : 0
  const returnTableH = returnCount > 0 ? (1 + returnCount) * tableLineH + 22 : 0
  const saleSectionH = saleCount > 0 && returnCount > 0 ? 56 : 0
  const returnSectionH = returnCount > 0 ? 56 + 10 : 0
  const netAmountH = saleCount > 0 && returnCount > 0 ? 85 : 0
  const footerH = 56 + 22
  const margin = PAGE_MARGIN_DOTS
  return margin + headerH + 15 + infoH + 15 + saleSectionH + saleTableH + returnSectionH + returnTableH + netAmountH + footerH + margin + CUT_BOTTOM_BLANK_DOTS
}

function splitItemsByHeight(items: PrintItem[], maxHeight: number, estimateHeight: (count: number) => number): PrintItem[][] {
  const pages: PrintItem[][] = []
  let start = 0
  while (start < items.length) {
    let take = 1
    while (start + take <= items.length && estimateHeight(take) <= maxHeight) {
      take++
    }
    take = Math.max(1, take - 1)
    pages.push(items.slice(start, start + take))
    start += take
  }
  return pages
}

function splitCombinedItemsByHeight(saleItems: PrintItem[], returnItems: PrintItem[], maxHeight: number): Array<{ sale: PrintItem[]; ret: PrintItem[] }> {
  const pages: Array<{ sale: PrintItem[]; ret: PrintItem[] }> = []
  let saleIndex = 0
  let returnIndex = 0

  while (saleIndex < saleItems.length || returnIndex < returnItems.length) {
    const pageSale: PrintItem[] = []
    const pageReturn: PrintItem[] = []

    while (saleIndex < saleItems.length && estimateCombinedPageHeight(pageSale.length + 1, pageReturn.length) <= maxHeight) {
      pageSale.push(saleItems[saleIndex])
      saleIndex++
    }

    while (returnIndex < returnItems.length && estimateCombinedPageHeight(pageSale.length, pageReturn.length + 1) <= maxHeight) {
      pageReturn.push(returnItems[returnIndex])
      returnIndex++
    }

    if (pageSale.length === 0 && saleIndex < saleItems.length) {
      pageSale.push(saleItems[saleIndex])
      saleIndex++
    } else if (pageReturn.length === 0 && returnIndex < returnItems.length) {
      pageReturn.push(returnItems[returnIndex])
      returnIndex++
    }

    pages.push({ sale: pageSale, ret: pageReturn })
  }

  return pages
}

function canPrintAsSinglePage(height: number): boolean {
  return height <= PAGE_HEIGHT_DOTS
}

function normalizeSinglePageOptions(options: PrintBuildOptions = {}): PrintBuildOptions {
  return { ...options, autoCut: false }
}

function withAutoCutOnLastPage(options: PrintBuildOptions = {}, isLastPage: boolean = false): PrintBuildOptions {
  return isLastPage ? options : { ...options, autoCut: false }
}

function buildPagedCpclCommands(imagePages: any[], baseTaskId: string, options: PrintBuildOptions = {}): Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }> {
  return imagePages.map((imageData, index) => {
    const taskId = imagePages.length === 1 ? baseTaskId : `${baseTaskId}_p${index + 1}`
    return buildCpclCommand(imageData, taskId, withAutoCutOnLastPage(options, index === imagePages.length - 1))
  })
}

async function renderSalePages(data: PrintDocData, options: PrintBuildOptions = {}): Promise<any[]> {
  const singleHeight = estimateContentHeight(data, options.fillFullPage)
  if (canPrintAsSinglePage(singleHeight)) {
    return [await generatePrintImageData(data, options.fillFullPage)]
  }
  const pages = splitItemsByHeight(data.items, PAGE_HEIGHT_DOTS, estimateSalePageHeight)
  const imagePages = []
  for (const items of pages) {
    const pageData: PrintDocData = {
      ...data,
      items,
      totalQty: items.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      remark: undefined,
    }
    imagePages.push(await generatePrintImageData(pageData, false))
  }
  return imagePages
}

async function renderReturnPages(data: PrintDocData, options: PrintBuildOptions = {}): Promise<any[]> {
  const singleHeight = estimateContentHeight(data, options.fillFullPage)
  if (canPrintAsSinglePage(singleHeight)) {
    return [await generatePrintImageData(data, options.fillFullPage)]
  }
  const pages = splitItemsByHeight(data.items, PAGE_HEIGHT_DOTS, estimateReturnPageHeight)
  const imagePages = []
  for (let index = 0; index < pages.length; index++) {
    const items = pages[index]
    const pageData: PrintDocData = {
      ...data,
      items,
      totalQty: items.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      remark: index === pages.length - 1 ? data.remark : undefined,
    }
    imagePages.push(await generatePrintImageData(pageData, false))
  }
  return imagePages
}

async function renderCombinedPages(data: CombinedPrintData, options: PrintBuildOptions = {}): Promise<any[]> {
  const singleHeight = estimateCombinedHeight(data, data.saleItems, data.returnItems, options.fillFullPage)
  if (canPrintAsSinglePage(singleHeight) && data.saleItems.length + data.returnItems.length <= MAX_ITEMS_PER_PAGE) {
    const ctx = uni.createCanvasContext(CANVAS_ID)
    await drawCombinedContent(ctx, data, data.saleItems, data.returnItems, PAGE_WIDTH_DOTS, singleHeight, 1, 1)
    return [await getCanvasImageData(PAGE_WIDTH_DOTS, singleHeight)]
  }

  const chunks = splitCombinedItemsByHeight(data.saleItems, data.returnItems, PAGE_HEIGHT_DOTS)
  const totalPages = chunks.length
  const imagePages = []
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    const height = estimateCombinedPageHeight(chunk.sale.length, chunk.ret.length)
    const ctx = uni.createCanvasContext(CANVAS_ID)
    await drawCombinedContent(ctx, data, chunk.sale, chunk.ret, PAGE_WIDTH_DOTS, height, index + 1, totalPages)
    imagePages.push(await getCanvasImageData(PAGE_WIDTH_DOTS, height))
  }
  return imagePages
}

function mergeJournalSetup(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return pages[0]?.journalSetup || buildJournalSetup()
}

function firstPageResult(data: PrintDocData, imagePages: any[], pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: mergeJournalSetup(pages),
    data,
    pages,
  }
}

function firstReturnPageResult(data: PrintDocData, imagePages: any[], pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: mergeJournalSetup(pages),
    data,
    pages,
  }
}

function appendPagedBuildLog(label: string, pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  if (pages.length > 1) {
    appendLog('info', `[A4打印] ${label}已自动拆分为 ${pages.length} 页，末页裁切`)
  }
}

function combinedPagesResult(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return { pages }
}

function singlePageOptions(options: PrintBuildOptions = {}) {
  return normalizeSinglePageOptions(options)
}

function getTaskId(value?: string, fallback?: string) {
  return value || fallback || '1'
}

function shouldUseSinglePageImage(itemCount: number) {
  return itemCount <= MAX_ITEMS_PER_PAGE
}

function buildPageDataTotals(items: PrintItem[]) {
  return {
    totalQty: items.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
  }
}

function buildCombinedTaskId(saleDoc: SaleDoc) {
  return saleDoc.id || saleDoc.code || '1'
}

function shouldKeepRemarkOnPage(pageIndex: number, pageCount: number) {
  return pageIndex === pageCount - 1
}

function createCombinedImagePage(height: number) {
  return uni.createCanvasContext(CANVAS_ID)
}

function shouldPaginateByHeight(height: number) {
  return height > PAGE_HEIGHT_DOTS
}

function buildCombinedPageHeight(saleCount: number, retCount: number) {
  return estimateCombinedPageHeight(saleCount, retCount)
}

function renderCombinedSinglePage(data: CombinedPrintData, height: number) {
  return height
}

function clampPageHeight(height: number) {
  return height
}

function calculateMaxPrintableHeight() {
  return PAGE_HEIGHT_DOTS
}

function createPageImageTaskId(baseTaskId: string, index: number, total: number) {
  return total === 1 ? baseTaskId : `${baseTaskId}_p${index + 1}`
}

function buildNonCutOptions(options: PrintBuildOptions = {}) {
  return { ...options, autoCut: false }
}

function buildPageOptions(options: PrintBuildOptions = {}, index: number, total: number) {
  return index === total - 1 ? options : buildNonCutOptions(options)
}

function toPagedBuildResult(data: PrintDocData, imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  const pages = imagePages.map((imageData, index) => buildCpclCommand(imageData, createPageImageTaskId(taskId, index, imagePages.length), buildPageOptions(options, index, imagePages.length)))
  return firstPageResult(data, imagePages, pages)
}

function toPagedReturnBuildResult(data: PrintDocData, imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  const pages = imagePages.map((imageData, index) => buildCpclCommand(imageData, createPageImageTaskId(taskId, index, imagePages.length), buildPageOptions(options, index, imagePages.length)))
  return firstReturnPageResult(data, imagePages, pages)
}

function toCombinedBuildResult(imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  const pages = imagePages.map((imageData, index) => buildCpclCommand(imageData, createPageImageTaskId(taskId, index, imagePages.length), buildPageOptions(options, index, imagePages.length)))
  return combinedPagesResult(pages)
}

function logPageCount(prefix: string, pageCount: number) {
  if (pageCount > 1) {
    appendLog('info', `[A4打印] ${prefix}已拆分 ${pageCount} 页，最后一页自动裁切`)
  }
}

function getCombinedPageChunks(data: CombinedPrintData) {
  return splitCombinedItemsByHeight(data.saleItems, data.returnItems, PAGE_HEIGHT_DOTS)
}

function createPrintDocPageData(data: PrintDocData, items: PrintItem[], remark?: string): PrintDocData {
  const totals = buildPageDataTotals(items)
  return {
    ...data,
    items,
    totalQty: totals.totalQty,
    totalAmount: totals.totalAmount,
    remark,
  }
}

function isSingleCombinedPage(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  const height = estimateCombinedHeight(data, data.saleItems, data.returnItems, options.fillFullPage)
  return canPrintAsSinglePage(height) && data.saleItems.length + data.returnItems.length <= MAX_ITEMS_PER_PAGE
}

function getSingleCombinedHeight(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return estimateCombinedHeight(data, data.saleItems, data.returnItems, options.fillFullPage)
}

function createCombinedPageData(data: CombinedPrintData) {
  return data
}

function totalVarietyCount(data: CombinedPrintData) {
  return data.saleItems.length + data.returnItems.length
}

function keepRemarkForSinglePage(data: CombinedPrintData) {
  return data
}

function calculateSplitMaxHeight() {
  return PAGE_HEIGHT_DOTS
}

function getPagedTaskBase(value?: string, fallback?: string) {
  return getTaskId(value, fallback)
}

function toFirstPageBuffers(data: PrintDocData, imagePages: any[], taskId: string, options: PrintBuildOptions) {
  return toPagedBuildResult(data, imagePages, taskId, options)
}

function toFirstReturnPageBuffers(data: PrintDocData, imagePages: any[], taskId: string, options: PrintBuildOptions) {
  return toPagedReturnBuildResult(data, imagePages, taskId, options)
}

function toCombinedPageBuffers(imagePages: any[], taskId: string, options: PrintBuildOptions) {
  return toCombinedBuildResult(imagePages, taskId, options)
}

function createCombinedCanvasContext() {
  return uni.createCanvasContext(CANVAS_ID)
}

function createPrintCanvasContext() {
  return uni.createCanvasContext(CANVAS_ID)
}

function renderSingleCombinedHeight(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return getSingleCombinedHeight(data, options)
}

function renderCombinedChunkHeight(chunk: { sale: PrintItem[]; ret: PrintItem[] }) {
  return estimateCombinedPageHeight(chunk.sale.length, chunk.ret.length)
}

function shouldRenderCombinedAsPaged(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return !isSingleCombinedPage(data, options)
}

function logPagedCombined(totalPages: number) {
  if (totalPages > 1) {
    appendLog('info', `[A4打印] 合并打印内容较长，已拆分 ${totalPages} 页，最后一页自动裁切`)
  }
}

function logPagedSale(totalPages: number) {
  if (totalPages > 1) {
    appendLog('info', `[A4打印] 销单内容较长，已拆分 ${totalPages} 页，最后一页自动裁切`)
  }
}

function logPagedReturn(totalPages: number) {
  if (totalPages > 1) {
    appendLog('info', `[A4打印] 退货单内容较长，已拆分 ${totalPages} 页，最后一页自动裁切`)
  }
}

function getPerPageTaskId(baseTaskId: string, index: number, total: number) {
  return createPageImageTaskId(baseTaskId, index, total)
}

function getPerPageOptions(options: PrintBuildOptions = {}, index: number, total: number) {
  return buildPageOptions(options, index, total)
}

function createPageCommands(imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  return imagePages.map((imageData, index) => buildCpclCommand(imageData, getPerPageTaskId(taskId, index, imagePages.length), getPerPageOptions(options, index, imagePages.length)))
}

function journalFromPages(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return mergeJournalSetup(pages)
}

function singlePageBufferResult(data: PrintDocData, imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  const pages = createPageCommands(imagePages, taskId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: journalFromPages(pages),
    data,
    pages,
  }
}

function combinedBufferResult(imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  return { pages: createPageCommands(imagePages, taskId, options) }
}

function getSafePrintTaskId(docId?: string, docCode?: string) {
  return docId || docCode || '1'
}

function includeRemarkOnLastPage(index: number, total: number, remark?: string) {
  return index === total - 1 ? remark : undefined
}

function createPagedCombinedData(data: CombinedPrintData, chunk: { sale: PrintItem[]; ret: PrintItem[] }, index: number, total: number): CombinedPrintData {
  return {
    ...data,
    saleItems: chunk.sale,
    returnItems: chunk.ret,
    saleTotalQty: chunk.sale.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    saleTotalAmount: chunk.sale.reduce((sum, item) => sum + item.amount, 0),
    returnTotalQty: chunk.ret.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    returnTotalAmount: chunk.ret.reduce((sum, item) => sum + item.amount, 0),
    remark: includeRemarkOnLastPage(index, total, data.remark),
  }
}

function createPagedSaleData(data: PrintDocData, items: PrintItem[], index: number, total: number): PrintDocData {
  return createPrintDocPageData(data, items, includeRemarkOnLastPage(index, total, data.remark))
}

function createPagedReturnData(data: PrintDocData, items: PrintItem[], index: number, total: number): PrintDocData {
  return createPrintDocPageData(data, items, includeRemarkOnLastPage(index, total, data.remark))
}

function getPrintablePageLimit() {
  return PAGE_HEIGHT_DOTS
}

function isOverPageHeight(height: number) {
  return height > getPrintablePageLimit()
}

function appendSplitHint(label: string, pageCount: number) {
  if (pageCount > 1) appendLog('info', `[A4打印] ${label}超出单页高度，已拆分 ${pageCount} 页`)
}

function resolveCombinedDate(doc: SaleDoc) {
  return resolvePrintDate(doc)
}

function resolvePageHeight(data: PrintDocData, options: PrintBuildOptions = {}) {
  return estimateContentHeight(data, options.fillFullPage)
}

function resolveCombinedHeight(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return estimateCombinedHeight(data, data.saleItems, data.returnItems, options.fillFullPage)
}

function buildMultiPageCommands(imagePages: any[], taskId: string, options: PrintBuildOptions = {}) {
  return createPageCommands(imagePages, taskId, options)
}

function singlePageHeightAllowed(height: number) {
  return !isOverPageHeight(height)
}

function createCombinedChunkContext() {
  return uni.createCanvasContext(CANVAS_ID)
}

function combinedSinglePageAllowed(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return singlePageHeightAllowed(resolveCombinedHeight(data, options)) && totalVarietyCount(data) <= MAX_ITEMS_PER_PAGE
}

function createSinglePageImageData(width: number, height: number) {
  return getCanvasImageData(width, height)
}

function addPagedPrintLog(label: string, pages: number) {
  appendSplitHint(label, pages)
}

function getAutoCutOptionsForPage(options: PrintBuildOptions = {}, pageIndex: number, totalPages: number) {
  return pageIndex === totalPages - 1 ? options : { ...options, autoCut: false }
}

function createCommandPages(imagePages: any[], baseTaskId: string, options: PrintBuildOptions = {}) {
  return imagePages.map((imageData, pageIndex) => buildCpclCommand(imageData, createPageImageTaskId(baseTaskId, pageIndex, imagePages.length), getAutoCutOptionsForPage(options, pageIndex, imagePages.length)))
}

function getCombinedResultFromImages(imagePages: any[], baseTaskId: string, options: PrintBuildOptions = {}) {
  return { pages: createCommandPages(imagePages, baseTaskId, options) }
}

function getSingleResultFromImages(data: PrintDocData, imagePages: any[], baseTaskId: string, options: PrintBuildOptions = {}) {
  const pages = createCommandPages(imagePages, baseTaskId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: pages[0].journalSetup,
    data,
    pages,
  }
}

function getReturnResultFromImages(data: PrintDocData, imagePages: any[], baseTaskId: string, options: PrintBuildOptions = {}) {
  const pages = createCommandPages(imagePages, baseTaskId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: pages[0].journalSetup,
    data,
    pages,
  }
}

function getFinalRemark(data: PrintDocData, pageIndex: number, totalPages: number) {
  return pageIndex === totalPages - 1 ? data.remark : undefined
}

function getFinalCombinedRemark(data: CombinedPrintData, pageIndex: number, totalPages: number) {
  return pageIndex === totalPages - 1 ? data.remark : undefined
}

function buildPageLogName(data: PrintDocData) {
  return data.type === 'sale' ? '销单' : '退货单'
}

function buildCombinedLogName() {
  return '合并打印'
}

function getPageChunkTotals(items: PrintItem[]) {
  return buildPageDataTotals(items)
}

function getChunkedSaleData(data: PrintDocData, items: PrintItem[], pageIndex: number, totalPages: number) {
  const totals = getPageChunkTotals(items)
  return {
    ...data,
    items,
    totalQty: totals.totalQty,
    totalAmount: totals.totalAmount,
    remark: getFinalRemark(data, pageIndex, totalPages),
  }
}

function getChunkedCombinedData(data: CombinedPrintData, chunk: { sale: PrintItem[]; ret: PrintItem[] }, pageIndex: number, totalPages: number) {
  return {
    ...data,
    saleItems: chunk.sale,
    returnItems: chunk.ret,
    saleTotalQty: chunk.sale.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    saleTotalAmount: chunk.sale.reduce((sum, item) => sum + item.amount, 0),
    returnTotalQty: chunk.ret.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    returnTotalAmount: chunk.ret.reduce((sum, item) => sum + item.amount, 0),
    remark: getFinalCombinedRemark(data, pageIndex, totalPages),
  }
}

function shouldSplitSale(data: PrintDocData, options: PrintBuildOptions = {}) {
  return isOverPageHeight(resolvePageHeight(data, options))
}

function shouldSplitCombined(data: CombinedPrintData, options: PrintBuildOptions = {}) {
  return !combinedSinglePageAllowed(data, options)
}

function getSplitMaxHeight() {
  return PAGE_HEIGHT_DOTS
}

function buildImagePageTaskId(baseTaskId: string, pageIndex: number, totalPages: number) {
  return createPageImageTaskId(baseTaskId, pageIndex, totalPages)
}

function buildImagePageOptions(options: PrintBuildOptions, pageIndex: number, totalPages: number) {
  return getAutoCutOptionsForPage(options, pageIndex, totalPages)
}

function createImagePageCommands(imagePages: any[], baseTaskId: string, options: PrintBuildOptions) {
  return imagePages.map((imageData, pageIndex) => buildCpclCommand(imageData, buildImagePageTaskId(baseTaskId, pageIndex, imagePages.length), buildImagePageOptions(options, pageIndex, imagePages.length)))
}

function firstPageJournalSetup(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return pages[0]?.journalSetup || buildJournalSetup()
}

function resultFromSalePages(data: PrintDocData, imagePages: any[], baseTaskId: string, options: PrintBuildOptions) {
  const pages = createImagePageCommands(imagePages, baseTaskId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: firstPageJournalSetup(pages),
    data,
    pages,
  }
}

function resultFromCombinedPages(imagePages: any[], baseTaskId: string, options: PrintBuildOptions) {
  return { pages: createImagePageCommands(imagePages, baseTaskId, options) }
}

function logSplitPage(label: string, pageCount: number) {
  if (pageCount > 1) {
    appendLog('info', `[A4打印] ${label}内容较长，已自动拆分 ${pageCount} 页，最后一页裁切`)
  }
}

function canUseFillFullPage(options: PrintBuildOptions = {}) {
  return !!options.fillFullPage
}

function buildSplitItems(items: PrintItem[], maxHeight: number, estimateHeight: (count: number) => number) {
  return splitItemsByHeight(items, maxHeight, estimateHeight)
}

function getDrawHeightForCombined(chunk: { sale: PrintItem[]; ret: PrintItem[] }) {
  return estimateCombinedPageHeight(chunk.sale.length, chunk.ret.length)
}

function buildCombinedChunks(data: CombinedPrintData) {
  return splitCombinedItemsByHeight(data.saleItems, data.returnItems, getSplitMaxHeight())
}

function getTaskBaseId(docId?: string, docCode?: string) {
  return docId || docCode || '1'
}

function getSafeRemark(data: PrintDocData, pageIndex: number, pageCount: number) {
  return pageIndex === pageCount - 1 ? data.remark : undefined
}

function getSafeCombinedRemark(data: CombinedPrintData, pageIndex: number, pageCount: number) {
  return pageIndex === pageCount - 1 ? data.remark : undefined
}

function buildChunkedDocData(data: PrintDocData, items: PrintItem[], pageIndex: number, pageCount: number): PrintDocData {
  const totals = buildPageDataTotals(items)
  return {
    ...data,
    items,
    totalQty: totals.totalQty,
    totalAmount: totals.totalAmount,
    remark: getSafeRemark(data, pageIndex, pageCount),
  }
}

function buildChunkedCombinedPrintData(data: CombinedPrintData, chunk: { sale: PrintItem[]; ret: PrintItem[] }, pageIndex: number, pageCount: number): CombinedPrintData {
  return {
    ...data,
    saleItems: chunk.sale,
    returnItems: chunk.ret,
    saleTotalQty: chunk.sale.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    saleTotalAmount: chunk.sale.reduce((sum, item) => sum + item.amount, 0),
    returnTotalQty: chunk.ret.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    returnTotalAmount: chunk.ret.reduce((sum, item) => sum + item.amount, 0),
    remark: getSafeCombinedRemark(data, pageIndex, pageCount),
  }
}

function pageNeedsSplit(height: number) {
  return height > PAGE_HEIGHT_DOTS
}

function allowedPageHeight() {
  return PAGE_HEIGHT_DOTS
}

function buildImageTaskId(baseId: string, pageIndex: number, totalPages: number) {
  return totalPages === 1 ? baseId : `${baseId}_p${pageIndex + 1}`
}

function buildImageOptions(options: PrintBuildOptions, pageIndex: number, totalPages: number) {
  return pageIndex === totalPages - 1 ? options : { ...options, autoCut: false }
}

function createPageBuilds(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return imagePages.map((imageData, pageIndex) => buildCpclCommand(imageData, buildImageTaskId(baseId, pageIndex, imagePages.length), buildImageOptions(options, pageIndex, imagePages.length)))
}

function buildSaleResult(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  const pages = createPageBuilds(imagePages, baseId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: pages[0].journalSetup,
    data,
    pages,
  }
}

function buildCombinedResult(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return { pages: createPageBuilds(imagePages, baseId, options) }
}

function combinedBaseId(saleDoc: SaleDoc) {
  return getTaskBaseId(saleDoc.id, saleDoc.code)
}

function saleBaseId(doc: SaleDoc) {
  return getTaskBaseId(doc.id, doc.code)
}

function returnBaseId(doc: ReturnDoc) {
  return getTaskBaseId(doc.id, doc.code)
}

function getCombinedPagesCount(chunks: Array<{ sale: PrintItem[]; ret: PrintItem[] }>) {
  return chunks.length
}

function shouldLeaveRemarkOnPage(index: number, total: number) {
  return index === total - 1
}

function safePrintHeight(height: number) {
  return height
}

function pageCountLabel(pageCount: number) {
  return pageCount
}

function pageSplitNotice(label: string, pageCount: number) {
  logSplitPage(label, pageCount)
}

function singlePageNotice(label: string) {
  return label
}

function finalPageOptions(options: PrintBuildOptions, pageIndex: number, totalPages: number) {
  return buildImageOptions(options, pageIndex, totalPages)
}

function pageBuilds(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return createPageBuilds(imagePages, baseId, options)
}

function splitHeightLimit() {
  return allowedPageHeight()
}

function needsSplitByPageHeight(height: number) {
  return pageNeedsSplit(height)
}

function buildChunkTotals(items: PrintItem[]) {
  return buildPageDataTotals(items)
}

function buildPageDocData(data: PrintDocData, items: PrintItem[], index: number, total: number): PrintDocData {
  const totals = buildChunkTotals(items)
  return {
    ...data,
    items,
    totalQty: totals.totalQty,
    totalAmount: totals.totalAmount,
    remark: shouldLeaveRemarkOnPage(index, total) ? data.remark : undefined,
  }
}

function buildPageCombinedData(data: CombinedPrintData, chunk: { sale: PrintItem[]; ret: PrintItem[] }, index: number, total: number): CombinedPrintData {
  return {
    ...data,
    saleItems: chunk.sale,
    returnItems: chunk.ret,
    saleTotalQty: chunk.sale.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    saleTotalAmount: chunk.sale.reduce((sum, item) => sum + item.amount, 0),
    returnTotalQty: chunk.ret.reduce((sum, item) => sum + normalizeCount(item.qty), 0),
    returnTotalAmount: chunk.ret.reduce((sum, item) => sum + item.amount, 0),
    remark: shouldLeaveRemarkOnPage(index, total) ? data.remark : undefined,
  }
}

function pageLimitHeight() {
  return splitHeightLimit()
}

function useSinglePage(height: number) {
  return !needsSplitByPageHeight(height)
}

function useSingleCombinedPage(data: CombinedPrintData, options: PrintBuildOptions) {
  return combinedSinglePageAllowed(data, options)
}

function createChunkImagePages(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return pageBuilds(imagePages, baseId, options)
}

function resultPagesFromImages(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return createChunkImagePages(imagePages, baseId, options)
}

function resultJournal(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return pages[0]?.journalSetup || buildJournalSetup()
}

function longPageHint(label: string, pageCount: number) {
  pageSplitNotice(label, pageCount)
}

function noCutOptions(options: PrintBuildOptions) {
  return { ...options, autoCut: false }
}

function optionsForPage(options: PrintBuildOptions, pageIndex: number, totalPages: number) {
  return pageIndex === totalPages - 1 ? options : noCutOptions(options)
}

function commandPagesFromImages(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return imagePages.map((imageData, pageIndex) => buildCpclCommand(imageData, buildImageTaskId(baseId, pageIndex, imagePages.length), optionsForPage(options, pageIndex, imagePages.length)))
}

function resultForDocPages(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  const pages = commandPagesFromImages(imagePages, baseId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: resultJournal(pages),
    data,
    pages,
  }
}

function resultForCombined(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return { pages: commandPagesFromImages(imagePages, baseId, options) }
}

function finalTaskId(docId?: string, docCode?: string) {
  return getTaskBaseId(docId, docCode)
}

function finalLog(label: string, count: number) {
  longPageHint(label, count)
}

function totalItemsCount(data: CombinedPrintData) {
  return data.saleItems.length + data.returnItems.length
}

function canKeepSinglePage(data: CombinedPrintData, options: PrintBuildOptions) {
  return useSingleCombinedPage(data, options) && totalItemsCount(data) <= MAX_ITEMS_PER_PAGE
}

function imageHeightForCombined(chunk: { sale: PrintItem[]; ret: PrintItem[] }) {
  return renderCombinedChunkHeight(chunk)
}

function heightForDoc(data: PrintDocData, options: PrintBuildOptions) {
  return resolvePageHeight(data, options)
}

function heightForCombined(data: CombinedPrintData, options: PrintBuildOptions) {
  return resolveCombinedHeight(data, options)
}

function getHeightLimit() {
  return pageLimitHeight()
}

function shouldSplitItems(height: number) {
  return height > getHeightLimit()
}

function createSplitItems(items: PrintItem[], estimateHeight: (count: number) => number) {
  return buildSplitItems(items, getHeightLimit(), estimateHeight)
}

function createSplitCombined(data: CombinedPrintData) {
  return buildCombinedChunks(data)
}

function combinedPrintDate(doc: SaleDoc) {
  return resolvePrintDate(doc)
}

function combinedRemark(doc: SaleDoc) {
  return doc.remark
}

function printHeight(height: number) {
  return safePrintHeight(height)
}

function createPageCtx() {
  return createPrintCanvasContext()
}

function createCombinedCtx() {
  return createCombinedCanvasContext()
}

function docPagesLabel(data: PrintDocData) {
  return buildPageLogName(data)
}

function combinedPagesLabel() {
  return buildCombinedLogName()
}

function singlePageData(data: PrintDocData) {
  return data
}

function singleCombinedData(data: CombinedPrintData) {
  return data
}

function hasLongContent(height: number) {
  return shouldSplitItems(height)
}

function createTaskBaseId(docId?: string, docCode?: string) {
  return finalTaskId(docId, docCode)
}

function pageImageCommands(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return commandPagesFromImages(imagePages, baseId, options)
}

function journalSetupFromPages(pages: Array<{ cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }>) {
  return resultJournal(pages)
}

function docPageResult(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return resultForDocPages(data, imagePages, baseId, options)
}

function combinedPageResult(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return resultForCombined(imagePages, baseId, options)
}

function pageCountNotice(label: string, count: number) {
  finalLog(label, count)
}

function pageHeightNotice(height: number) {
  return height
}

function splitLabel(data: PrintDocData) {
  return docPagesLabel(data)
}

function splitCombinedLabel() {
  return combinedPagesLabel()
}

function imagePagesCount(imagePages: any[]) {
  return imagePages.length
}

function pageTaskId(baseId: string, pageIndex: number, totalPages: number) {
  return buildImageTaskId(baseId, pageIndex, totalPages)
}

function pageTaskOptions(options: PrintBuildOptions, pageIndex: number, totalPages: number) {
  return optionsForPage(options, pageIndex, totalPages)
}

function drawPageNotice(pageCount: number) {
  return pageCount
}

function getCombinedItemsCount(data: CombinedPrintData) {
  return totalItemsCount(data)
}

function shouldCombinedSinglePage(data: CombinedPrintData, options: PrintBuildOptions) {
  return canKeepSinglePage(data, options)
}

function dataDate(doc: SaleDoc) {
  return combinedPrintDate(doc)
}

function dataRemark(doc: SaleDoc) {
  return combinedRemark(doc)
}

function pageImageResult(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return docPageResult(data, imagePages, baseId, options)
}

function pageCombinedImageResult(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return combinedPageResult(imagePages, baseId, options)
}

function useSplitPage(height: number) {
  return hasLongContent(height)
}

function useSplitCombinedPage(data: CombinedPrintData, options: PrintBuildOptions) {
  return !shouldCombinedSinglePage(data, options)
}

function pageImagesResult(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return pageImageResult(data, imagePages, baseId, options)
}

function combinedImagesResult(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return pageCombinedImageResult(imagePages, baseId, options)
}

function getPageTaskBaseId(docId?: string, docCode?: string) {
  return createTaskBaseId(docId, docCode)
}

function getPageLabel(data: PrintDocData) {
  return splitLabel(data)
}

function getCombinedLabel() {
  return splitCombinedLabel()
}

function logPageSplit(label: string, pageCount: number) {
  pageCountNotice(label, pageCount)
}

function getPageImageHeight(height: number) {
  return printHeight(height)
}

function buildPageData(data: PrintDocData, items: PrintItem[], pageIndex: number, pageCount: number) {
  return buildPageDocData(data, items, pageIndex, pageCount)
}

function buildCombinedDataByChunk(data: CombinedPrintData, chunk: { sale: PrintItem[]; ret: PrintItem[] }, pageIndex: number, pageCount: number) {
  return buildPageCombinedData(data, chunk, pageIndex, pageCount)
}

function shouldAddAutoCut(options: PrintBuildOptions, pageIndex: number, pageCount: number) {
  return pageIndex === pageCount - 1 ? options : noCutOptions(options)
}

function buildPageCommandsFromImages(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return imagePages.map((imageData, pageIndex) => buildCpclCommand(imageData, pageTaskId(baseId, pageIndex, imagePages.length), shouldAddAutoCut(options, pageIndex, imagePages.length)))
}

function buildPageResult(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  const pages = buildPageCommandsFromImages(imagePages, baseId, options)
  return {
    imageData: imagePages[0],
    cpclBuffer: pages[0].cpclBuffer,
    journalSetup: journalSetupFromPages(pages),
    data,
    pages,
  }
}

function buildCombinedPagesResult(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return { pages: buildPageCommandsFromImages(imagePages, baseId, options) }
}

function finalPageLabel(data: PrintDocData) {
  return getPageLabel(data)
}

function finalCombinedPageLabel() {
  return getCombinedLabel()
}

function notifySplit(label: string, pageCount: number) {
  logPageSplit(label, pageCount)
}

function getPageBaseId(docId?: string, docCode?: string) {
  return getPageTaskBaseId(docId, docCode)
}

function renderDocImages(data: PrintDocData, options: PrintBuildOptions, estimateHeight: (count: number) => number): Promise<any[]> {
  const height = heightForDoc(data, options)
  if (!useSplitPage(height)) {
    return Promise.resolve([])
  }
  const chunks = createSplitItems(data.items, estimateHeight)
  notifySplit(finalPageLabel(data), chunks.length)
  // 必须串行：所有页共用同一个 canvas('printCanvas')，并发绘制会互相覆盖，
  // 导致 canvasGetImageData 读到别页的像素。
  return (async () => {
    const pages: any[] = []
    for (let index = 0; index < chunks.length; index++) {
      pages.push(await generatePrintImageData(buildPageData(data, chunks[index], index, chunks.length), false))
    }
    return pages
  })()
}

function renderCombinedImagePages(data: CombinedPrintData, options: PrintBuildOptions): Promise<any[]> {
  const height = heightForCombined(data, options)
  if (!useSplitCombinedPage(data, options)) {
    return Promise.resolve([])
  }
  const chunks = createSplitCombined(data)
  notifySplit(finalCombinedPageLabel(), chunks.length)
  // 必须串行：多页共用同一个 canvas，并发绘制会互相覆盖导致读到错页像素
  return (async () => {
    const pages: any[] = []
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      const pageData = buildCombinedDataByChunk(data, chunk, index, chunks.length)
      const pageHeight = getPageImageHeight(imageHeightForCombined(chunk))
      const ctx = createCombinedCtx()
      await drawCombinedContent(ctx, pageData, pageData.saleItems, pageData.returnItems, PAGE_WIDTH_DOTS, pageHeight, index + 1, chunks.length)
      pages.push(await getCanvasImageData(PAGE_WIDTH_DOTS, pageHeight))
    }
    return pages
  })()
}

function getSaleImagePages(data: PrintDocData, options: PrintBuildOptions) {
  return renderDocImages(data, options, estimateSalePageHeight)
}

function getReturnImagePages(data: PrintDocData, options: PrintBuildOptions) {
  return renderDocImages(data, options, estimateReturnPageHeight)
}

function getCombinedImagePages(data: CombinedPrintData, options: PrintBuildOptions) {
  return renderCombinedImagePages(data, options)
}

function saleResultFromPages(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return buildPageResult(data, imagePages, baseId, options)
}

function returnResultFromPages(data: PrintDocData, imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return buildPageResult(data, imagePages, baseId, options)
}

function combinedResultFromPages(imagePages: any[], baseId: string, options: PrintBuildOptions) {
  return buildCombinedPagesResult(imagePages, baseId, options)
}

function getSinglePageImageData(data: PrintDocData, options: PrintBuildOptions) {
  return generatePrintImageData(data, options.fillFullPage)
}

function getSingleCombinedImageData(data: CombinedPrintData, options: PrintBuildOptions) {
  return Promise.resolve(null)
}

function renderSingleCombinedImage(data: CombinedPrintData, options: PrintBuildOptions): Promise<any> {
  const height = resolveCombinedHeight(data, options)
  const ctx = createCombinedCtx()
  return drawCombinedContent(ctx, data, data.saleItems, data.returnItems, PAGE_WIDTH_DOTS, height, 1, 1).then(() => getCanvasImageData(PAGE_WIDTH_DOTS, height))
}

function isSaleSinglePage(data: PrintDocData, options: PrintBuildOptions) {
  return !useSplitPage(heightForDoc(data, options))
}

function isCombinedSinglePage(data: CombinedPrintData, options: PrintBuildOptions) {
  return !useSplitCombinedPage(data, options)
}

function getCombinedTaskId(saleDoc: SaleDoc) {
  return getPageBaseId(saleDoc.id, saleDoc.code)
}

function getSaleTaskId(doc: SaleDoc) {
  return getPageBaseId(doc.id, doc.code)
}

function getReturnTaskId(doc: ReturnDoc) {
  return getPageBaseId(doc.id, doc.code)
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
  const colBarcode = left + Math.floor(contentWidth * 0.05)
  const colName = left + Math.floor(contentWidth * 0.23) + PRODUCT_COLUMN_OFFSET_DOTS
  const colQty = left + Math.floor(contentWidth * 0.55)
  const colShelf = left + Math.floor(contentWidth * 0.65)
  const colWeight = left + Math.floor(contentWidth * 0.75)
  const colPrice = left + Math.floor(contentWidth * 0.84)
  const colAmount = left + Math.floor(contentWidth * 0.92)

  ctx.setFillStyle('black')

  ctx.setFontSize(56)
  const titleText = data.type === 'sale' ? '艳萍麻花销单' : '艳萍麻花退单'
  const payTag = data.payType === 'cash' ? '[现金]' : '[单子]'
  const isWarehouseReturn = data.type === 'return' && data.returnType === 'warehouse_return'
  const headerLine = isWarehouseReturn
    ? `${data.salespersonName}退单`
    : `${titleText} ${payTag}`
  ctx.fillText(headerLine, left, y + 56)
  y += 72

  ctx.setStrokeStyle('black')
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(40)
  ctx.fillText(`单号:${data.code}`, left, y + 40)
  ctx.fillText(`日期:${data.date}`, mid, y + 40)
  y += 54
  // 回仓退货：只显示业务员名，不显示店铺和手机号
  if (isWarehouseReturn) {
    ctx.fillText(`业务员:${(data.salespersonName || '').trim() || '-'}`, left, y + 40)
  } else {
    ctx.fillText(`店铺:${data.storeName}`, left, y + 40)
    ctx.fillText(`业务员:${formatSalesperson(data.salespersonName)}`, mid, y + 40)
  }
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
  ctx.fillText('保质期', colShelf, y + 44)
  ctx.fillText('克重', colWeight, y + 44)
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
    const shelfText = item.shelfDays ? `${item.shelfDays}天` : '-'
    const priceText = moneyText(item.price)
    const amountText = moneyText(item.amount)

    ctx.fillText(`${seqNo}`, colSeq, y + 44)
    ctx.fillText(barcodeText, colBarcode, y + 44)
    ctx.fillText(nameText, colName, y + 44)
    ctx.fillText(qtyText, colQty, y + 44)
    ctx.fillText(shelfText, colShelf, y + 44)
    ctx.fillText(item.weight || '', colWeight, y + 44)
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
    ctx.draw(false, () => {
      setTimeout(resolve, 200)
    })
  })
}

function readCanvasImageDataOnce(width: number, height: number): Promise<any> {
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

/**
 * 读取画布像素。
 * 慢设备上 ctx.draw 之后固定等 200ms 有时仍未光栅化完成，会读到空/残缺数据。
 * 这里做一次校验与重试兜底：数据长度不足预期(width*height*4)时补等再读一次，
 * 仍不达标也照常返回（打印内容可能偏短，但不会直接中断整个打印流程）。
 */
async function getCanvasImageData(width: number, height: number): Promise<any> {
  const expected = width * height * 4
  let res: any
  try {
    res = await readCanvasImageDataOnce(width, height)
  } catch (e) {
    await new Promise(r => setTimeout(r, 300))
    res = await readCanvasImageDataOnce(width, height) // 第二次失败才向上抛
    return res
  }
  const len = res?.data?.length || 0
  if (len < expected) {
    console.warn(`[canvas-print] 像素数据不完整(${len}/${expected})，补等后重读`)
    await new Promise(r => setTimeout(r, 300))
    try {
      const retry = await readCanvasImageDataOnce(width, height)
      if ((retry?.data?.length || 0) >= len) return retry
    } catch {
      // 重读失败则沿用首次结果，避免打印彻底失败
    }
  }
  return res
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

    const shouldRotate = options.rotateImage ?? false
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
  const items: PrintItem[] = sortLinesByLineNo(doc.lines).map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
      shelfDays: product?.shelfDays,
      weight: product?.weight,
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
  payType: 'cash' | 'card' = 'card',
  options: PrintBuildOptions = {}
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer; data: PrintDocData }> {
  const items: PrintItem[] = sortLinesByLineNo(doc.lines).map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
      shelfDays: product?.shelfDays,
      weight: product?.weight,
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
    payType,
    returnType: doc.returnType,
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
  return margin + headerH + 15 + infoH + 15 + saleTableH + sectionLabelH + returnTableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS
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
  const colBarcode = left + Math.floor(contentWidth * 0.05)
  const colName = left + Math.floor(contentWidth * 0.23) + PRODUCT_COLUMN_OFFSET_DOTS
  const colQty = left + Math.floor(contentWidth * 0.55)
  const colShelf = left + Math.floor(contentWidth * 0.65)
  const colWeight = left + Math.floor(contentWidth * 0.75)
  const colPrice = left + Math.floor(contentWidth * 0.84)
  const colAmount = left + Math.floor(contentWidth * 0.92)

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
  ctx.fillText(`日期:${data.date}`, mid, y + 40)
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
    ctx.fillText('保质期', colShelf, y + 44)
    ctx.fillText('克重', colWeight, y + 44)
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
      ctx.fillText(item.shelfDays ? `${item.shelfDays}天` : '-', colShelf, y + 44)
      ctx.fillText(item.weight || '', colWeight, y + 44)
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
    ctx.fillText('保质期', colShelf, y + 44)
    ctx.fillText('克重', colWeight, y + 44)
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
      ctx.fillText(item.shelfDays ? `${item.shelfDays}天` : '-', colShelf, y + 44)
      ctx.fillText(item.weight || '', colWeight, y + 44)
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
    ctx.draw(false, () => {
      setTimeout(resolve, 200)
    })
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
  const saleItems: PrintItem[] = sortLinesByLineNo(saleDoc.lines).map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
      shelfDays: product?.shelfDays,
      weight: product?.weight,
    }
  })

  const returnItems: PrintItem[] = sortLinesByLineNo(returnDoc.lines).map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: line.price,
      amount: Number(line.qty) * Number(line.price),
      shelfDays: product?.shelfDays,
      weight: product?.weight,
    }
  })

  const saleTotalQty = saleItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
  const saleTotalAmount = saleItems.reduce((s, i) => s + i.amount, 0)
  const returnTotalQty = returnItems.reduce((s, i) => s + normalizeCount(i.qty), 0)
  const returnTotalAmount = returnItems.reduce((s, i) => s + i.amount, 0)

  const combinedData: CombinedPrintData = {
    code: resolveDocCode(saleDoc.code, saleDoc.id),
    date: resolvePrintDate(saleDoc),
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

  const height = estimateCombinedHeight(combinedData, saleItems, returnItems, options.fillFullPage)
  const ctx = uni.createCanvasContext(CANVAS_ID)
  await drawCombinedContent(ctx, combinedData, saleItems, returnItems, PAGE_WIDTH_DOTS, height, 1, 1)
  const imageData = await getCanvasImageData(PAGE_WIDTH_DOTS, height)
  const page = buildCpclCommand(imageData, saleDoc.id || saleDoc.code, options)

  appendLog('info', `[A4打印] 合并打印数据生成完成：单页长图，销 ${saleItems.length} 种 + 退 ${returnItems.length} 种，高度 ${height}`)
  return { pages: [page] }
}

// ============================================================
// 出库单（调拨单）打印
// ============================================================

interface TransferPrintData {
  code: string
  date: string
  fromWarehouseName: string
  toWarehouseName: string
  items: PrintItem[]
  totalQty: number
  remark?: string
}

function estimateTransferPageHeight(itemCount: number): number {
  const headerH = 72
  const infoH = 2 * 54 + 12   // 只有调出/调入两行，去掉经手
  const tableLineH = 64
  const tableH = (1 + itemCount) * tableLineH + 22
  const footerH = 56 + 22
  const margin = PAGE_MARGIN_DOTS
  return margin + headerH + 15 + infoH + 15 + tableH + 15 + footerH + margin + CUT_BOTTOM_BLANK_DOTS
}

async function drawTransferContent(ctx: any, data: TransferPrintData, width: number, height: number): Promise<void> {
  ctx.setFillStyle('white')
  ctx.fillRect(0, 0, width, height)

  // 动态计算内容区域（适配不同纸宽）
  const margin = PAGE_MARGIN_DOTS
  const left = margin
  const right = width - margin
  const contentWidth = right - left
  const mid = left + Math.floor(contentWidth / 2)
  let y = margin
  const ll = 1

  const colSeq = left
  const colBarcode = left + Math.floor(contentWidth * 0.06)
  const colName = left + Math.floor(contentWidth * 0.26) + PRODUCT_COLUMN_OFFSET_DOTS
  const colQty = left + Math.floor(contentWidth * 0.75)

  ctx.setFillStyle('black')

  ctx.setFontSize(56)
  ctx.fillText('艳萍麻花出库单', left, y + 56)
  y += 72

  ctx.setStrokeStyle('black')
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 14

  ctx.setFontSize(40)
  ctx.fillText(`单号:${data.code}`, left, y + 40)
  ctx.fillText(`日期:${data.date}`, mid, y + 40)
  y += 54
  ctx.fillText(`调出:${data.fromWarehouseName}`, left, y + 40)
  ctx.fillText(`调入:${data.toWarehouseName}`, mid, y + 40)
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
  y += 58

  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 12

  let seqNo = 0
  for (const item of data.items) {
    seqNo++
    ctx.fillText(`${seqNo}`, colSeq, y + 44)
    ctx.fillText((item.barcode || '-').slice(0, 13), colBarcode, y + 44)
    ctx.fillText(item.name, colName, y + 44)
    // 显示 X箱(X袋) 格式
    const packQty = item.boxPackQty || 0
    let qtyText: string
    if (packQty > 1) {
      const boxes = Math.floor(normalizeCount(item.qty) / packQty)
      const bags = normalizeCount(item.qty) % packQty
      if (boxes > 0 && bags > 0) qtyText = `${boxes}箱(${bags}袋)`
      else if (boxes > 0) qtyText = `${boxes}箱`
      else qtyText = `${bags}袋`
    } else {
      qtyText = `${normalizeCount(item.qty)}袋`
    }
    ctx.fillText(qtyText, colQty, y + 44)
    y += 64
  }

  y += 8
  ctx.setLineWidth(ll)
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  y += 15

  ctx.setFontSize(46)
  ctx.fillText(`品种:${data.items.length}种  合计:${normalizeCount(data.totalQty)}袋`, left, y + 46)
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

  // 出库单不需要签名区（给仓管看，A5 纸宽度下签名区会超出）

  await new Promise<void>((resolve) => {
    ctx.draw(false, () => { setTimeout(resolve, 200) })
  })
}

export async function buildTransferPrintData(
  doc: import('@/types').TransferDoc,
  fromWarehouseName: string,
  toWarehouseName: string,
  products: import('@/types').Product[],
  options: PrintBuildOptions = {}
): Promise<{ imageData: any; cpclBuffer: ArrayBuffer; journalSetup: ArrayBuffer }> {
  const items: PrintItem[] = doc.lines.map((line) => {
    const product = products.find((p) => p.id === line.productId)
    return {
      productId: line.productId,
      name: product?.name || '未知商品',
      barcode: product?.barcode,
      qty: line.qty,
      price: 0,
      amount: 0,
      boxPackQty: product?.boxQty || 0,
    }
  })

  const totalQty = items.reduce((sum, item) => sum + normalizeCount(item.qty), 0)

  const data: TransferPrintData = {
    code: resolveDocCode(doc.code, doc.id),
    date: resolvePrintDate(doc),
    fromWarehouseName,
    toWarehouseName,
    items,
    totalQty,
    remark: doc.remark,
  }

  // A4mini 旋转模式：画布宽度用 A5 短边（148mm），旋转后正好适配 A5 纸宽
  // A4Pro 正常模式：画布宽度用 A4 宽（210mm）
  const canvasWidth = options.rotateImage ? A5_SHORT_DOTS : PAGE_WIDTH_DOTS
  const height = options.fillFullPage ? PAGE_HEIGHT_DOTS : estimateTransferPageHeight(items.length)
  const ctx = uni.createCanvasContext(CANVAS_ID)
  await drawTransferContent(ctx, data, canvasWidth, height)
  const imageData = await getCanvasImageData(canvasWidth, height)
  const { cpclBuffer, journalSetup } = buildCpclCommand(imageData, doc.id || doc.code, options)

  appendLog('info', `[A4打印] 出库单打印数据生成完成：${items.length} 种，画布 ${canvasWidth}x${height}，旋转=${!!options.rotateImage}`)
  return { imageData, cpclBuffer, journalSetup }
}

export { CANVAS_ID, PAGE_WIDTH_DOTS, DPI, estimateContentHeight, generatePrintImageData, buildCpclCommand, buildJournalSetup }
export type { PrintDocData, PrintItem }
