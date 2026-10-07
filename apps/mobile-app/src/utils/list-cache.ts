// 列表的内存缓存：回到列表页时先显示上一次的结果，同时在后台刷新。
// 只放内存（App 关闭即清空），不写本地存储，避免占空间和读到过期数据。
interface CachedPage<T> {
  list: T[]
  total: number
  page: number
  savedAt: number
}

const cache = new Map<string, CachedPage<unknown>>()

export function readListCache<T>(key: string): CachedPage<T> | undefined {
  return cache.get(key) as CachedPage<T> | undefined
}

export function writeListCache<T>(key: string, value: Omit<CachedPage<T>, 'savedAt'>) {
  cache.set(key, { ...value, savedAt: Date.now() })
  // 只保留最近 20 个查询条件的结果
  if (cache.size > 20) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt)[0]
    if (oldest) cache.delete(oldest[0])
  }
}

export function clearListCache() {
  cache.clear()
}
