export const BAG_UNIT = '袋'

export type PackProductLike = {
  boxQty?: number
}

export type PackLineLike = {
  qty?: number
  boxQty?: number
  bagQty?: number
}

function normalizeInt(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.floor(num)
}

export function getPackSize(product?: PackProductLike | null): number {
  return Math.max(1, normalizeInt(product?.boxQty) || 1)
}

export function calcQty(boxCount: unknown, bagCount: unknown, product?: PackProductLike | null): number {
  const packSize = getPackSize(product)
  const boxes = normalizeInt(boxCount)
  const bags = normalizeInt(bagCount)
  return boxes * packSize + bags
}

export function derivePackState(totalQty: unknown, currentBoxes: unknown, product?: PackProductLike | null) {
  const packSize = getPackSize(product)
  const qty = normalizeInt(totalQty)
  const boxQty = Math.min(normalizeInt(currentBoxes), Math.floor(qty / packSize))
  const bagQty = qty - boxQty * packSize
  return { boxQty, bagQty, qty }
}

export function deriveBagQty(totalQty: unknown, boxCount: unknown, product?: PackProductLike | null): number {
  return derivePackState(totalQty, boxCount, product).bagQty
}

export function normalizePackLine<T extends PackLineLike>(line: T, product?: PackProductLike | null): T {
  if (line.bagQty == null) {
    const derived = derivePackState(line.qty, line.boxQty, product)
    return {
      ...line,
      boxQty: derived.boxQty,
      bagQty: derived.bagQty,
      qty: derived.qty
    }
  }

  const boxQty = normalizeInt(line.boxQty)
  const bagQty = normalizeInt(line.bagQty)
  return {
    ...line,
    boxQty,
    bagQty,
    qty: calcQty(boxQty, bagQty, product)
  }
}

export function packSummary(line: PackLineLike, product?: PackProductLike | null): string {
  const normalized = normalizePackLine(line, product)
  return `${normalized.boxQty || 0}箱${normalized.bagQty || 0}${BAG_UNIT} / ${normalized.qty || 0}${BAG_UNIT}`
}

export function productPackLabel(product?: PackProductLike | null): string {
  if (!product) return ''
  return `每箱${getPackSize(product)}${BAG_UNIT}`
}

export function toPersistedPackLine<T extends PackLineLike>(line: T): Omit<T, 'bagQty'> {
  const { bagQty, ...rest } = line
  return rest as Omit<T, 'bagQty'>
}
