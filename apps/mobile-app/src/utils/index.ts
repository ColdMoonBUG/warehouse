// 简单hash函数（与现有账户数据保持一致）
export function simpleHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

// 生成唯一ID
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// 获取当前时间ISO字符串
export function now(): string {
  return new Date().toISOString()
}

// 获取本地日期字符串（yyyy-MM-dd）
export function todayLocalDate(): string {
  return formatDate(new Date(), 'YYYY-MM-DD')
}

// 格式化日期
export function formatDate(date: string | Date, fmt = 'YYYY-MM-DD'): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return fmt
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

// 获取当前页面查询参数
export function getPageQueryParam(name: string): string {
  try {
    const getPages = (globalThis as any).getCurrentPages
    const pages = typeof getPages === 'function' ? getPages() : []
    const currentPage = pages.length ? pages[pages.length - 1] : null
    const optionValue = currentPage?.options?.[name]
    if (typeof optionValue === 'string' && optionValue) return optionValue
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined') {
    const hashQuery = window.location.hash.split('?')[1] || ''
    const searchQuery = window.location.search.startsWith('?') ? window.location.search.slice(1) : ''
    return new URLSearchParams(hashQuery || searchQuery).get(name) || ''
  }

  return ''
}

export const COMMISSION_RATE = 0.06

// 获取商品快捷选择显示文本
export function formatProductQuickPickLabel(product: { name?: string; barcode?: string }, extraText = ''): string {
  const name = product.name || '未命名商品'
  const label = product.barcode ? `${name}（${product.barcode}）` : name
  return extraText ? `${label} · ${extraText}` : label
}

// 将库存列表转换为商品库存映射
export function toStockQtyMap(stockList: Array<{ productId: string; qty?: number }>): Record<string, number> {
  return stockList.reduce<Record<string, number>>((acc, item) => {
    if (!item.productId) return acc
    acc[item.productId] = normalizeCount(item.qty)
    return acc
  }, {})
}

// 读取商品库存
export function getProductStockQty(stockMap: Record<string, number>, productId?: string): number {
  if (!productId) return 0
  return normalizeCount(stockMap[productId])
}

// 格式化库存摘要
export function formatStockPreview(parts: Array<{ label: string; qty?: number; hidden?: boolean }>): string {
  return parts
    .filter(part => part && !part.hidden)
    .map(part => `${part.label}${normalizeCount(part.qty)}袋`)
    .join('｜')
}

// 规范化每箱袋数
export function normalizeBoxPackQty(boxQty?: number): number {
  const normalized = Math.floor(Number(boxQty || 0))
  return normalized > 0 ? normalized : 1
}

// 规范化数量输入
export function normalizeCount(value?: number): number {
  const normalized = Math.floor(Number(value || 0))
  return normalized > 0 ? normalized : 0
}

// 计算总袋数
export function calcQty(boxCount?: number, bagCount?: number, productBoxQty?: number): number {
  const safeBoxCount = normalizeCount(boxCount)
  const safeBagCount = normalizeCount(bagCount)
  const packQty = normalizeBoxPackQty(productBoxQty)
  return safeBoxCount * packQty + safeBagCount
}

// 根据总袋数和箱数反推散袋数
export function deriveBagQty(totalQty?: number, boxCount?: number, productBoxQty?: number): number {
  const safeTotalQty = normalizeCount(totalQty)
  const safeBoxCount = normalizeCount(boxCount)
  const packQty = normalizeBoxPackQty(productBoxQty)
  return Math.max(safeTotalQty - safeBoxCount * packQty, 0)
}

// 格式化袋数展示
export function formatBagQty(qty?: number): string {
  return `${normalizeCount(qty)}袋`
}

// 格式化箱袋摘要
export function formatPackSummary(totalQty?: number, boxCount?: number, productBoxQty?: number): string {
  const safeTotalQty = normalizeCount(totalQty)
  if (safeTotalQty <= 0) return ''

  const safeBoxCount = normalizeCount(boxCount)
  const bagQty = deriveBagQty(safeTotalQty, safeBoxCount, productBoxQty)

  if (safeBoxCount > 0 && bagQty > 0) {
    return `${safeBoxCount}箱${bagQty}袋（共${safeTotalQty}袋）`
  }
  if (safeBoxCount > 0) {
    return `${safeBoxCount}箱（共${safeTotalQty}袋）`
  }
  return `${safeTotalQty}袋`
}

// 获取商品包装换算提示
export function formatProductPackageSummary(
  product: { unit?: string; boxQty?: number },
  qty?: number,
  boxCount?: number
): string {
  const packQty = normalizeBoxPackQty(product.boxQty)
  const parts = [`每箱${packQty}袋`]
  const summary = formatPackSummary(qty, boxCount, packQty)
  if (summary) parts.push(summary)
  return parts.join(' · ')
}

// 防抖
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay = 300
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// 节流
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay = 300
): (...args: Parameters<T>) => void {
  let last = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn(...args)
    }
  }
}
