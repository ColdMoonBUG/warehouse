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

// 获取商品快捷选择显示文本
export function formatProductQuickPickLabel(product: { name?: string; barcode?: string }): string {
  const name = product.name || '未命名商品'
  return product.barcode ? `${name}（${product.barcode}）` : name
}

// 获取商品包装换算提示
export function formatProductPackageSummary(product: { unit?: string; boxQty?: number }, qty: number): string {
  const packQty = Number(product.boxQty || 0)
  if (packQty <= 0 || qty <= 0) return ''
  const packUnit = product.unit && product.unit !== '件' ? product.unit : '箱'
  const packCount = qty / packQty
  const packCountText = packCount
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1')
  return `折合${packCountText}${packUnit}（${packQty}件/${packUnit}）`
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
