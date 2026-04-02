import { supplierDb, productDb, storeDb, warehouseDb, saleDb, accountDb, stockDb } from './storage'
import type { SaleDoc, Account, Product, Store, Warehouse, StockItem } from '@/types'
import { simpleHash, hashGesture } from '@/api/auth'

type Rand = () => number
type SalespersonAccount = Account & { role: 'salesperson' }

function createRng(seed: number): Rand {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function randInt(rand: Rand, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

function randPick<T>(rand: Rand, list: T[]): T {
  return list[Math.floor(rand() * list.length)]
}

function pad3(n: number) {
  return n.toString().padStart(3, '0')
}

function listSalespersons(accounts: Account[]): SalespersonAccount[] {
  return accounts.filter((account): account is SalespersonAccount => account.role === 'salesperson')
}

function buildCanonicalAccounts(): Account[] {
  const createdAt = new Date().toISOString()
  return [
    {
      id: 'admin_root',
      username: 'admin',
      displayName: '管理员',
      role: 'admin',
      passwordHash: simpleHash('admin123'),
      gestureHash: hashGesture('1-2-3-6-9'),
      status: 'active',
      createdAt,
    },
    {
      id: 'sp_big',
      username: 'bigcar',
      displayName: '大车',
      role: 'salesperson',
      passwordHash: simpleHash('123456'),
      gestureHash: hashGesture('1-4-7-8-9'),
      status: 'active',
      createdAt,
    },
    {
      id: 'sp_small',
      username: 'smallcar',
      displayName: '小车',
      role: 'salesperson',
      passwordHash: simpleHash('123456'),
      gestureHash: hashGesture('2-5-8-9'),
      status: 'active',
      createdAt,
    },
    {
      id: 'sp_third',
      username: 'thirdcar',
      displayName: '三车',
      role: 'salesperson',
      passwordHash: simpleHash('123456'),
      gestureHash: hashGesture('3-6-9-8-7'),
      status: 'active',
      createdAt,
    },
  ]
}

function buildExtraProducts(count: number, rand: Rand, startIndex: number): Product[] {
  const brands = ['旺旺', '统一', '康师傅', '农夫山泉', '三只松鼠']
  const items = [
    '茉莉花茶(500ml)', '柠檬茶(500ml)', '无糖绿茶(500ml)', '可乐(500ml)', '橙汁(1L)',
    '苹果汁(1L)', '薯片(原味)', '薯片(烧烤)', '曲奇饼干', '牛奶(250ml)',
    '酸奶(200ml)', '能量饮料(250ml)', '苏打水(500ml)', '气泡水(500ml)', '咖啡饮料(300ml)'
  ]
  const boxOptions = [12, 20, 24, 30]
  const shelfOptions = [90, 180, 270, 365, 540, 720]
  const supplierIds: Array<'s1' | 's2' | 's3'> = ['s1', 's2', 's3']
  const list: Product[] = []
  for (let i = 0; i < count; i++) {
    const idx = startIndex + i
    const brand = brands[idx % brands.length]
    const item = items[idx % items.length]
    const purchasePrice = randInt(rand, 12, 58)
    const salePrice = purchasePrice + randInt(rand, 8, 20)
    list.push({
      id: `p${idx}`,
      code: `SP${pad3(idx)}`,
      name: `${brand}${item}`,
      supplierId: supplierIds[idx % supplierIds.length],
      unit: '袋',
      boxQty: randPick(rand, boxOptions),
      shelfDays: randPick(rand, shelfOptions),
      purchasePrice,
      salePrice,
      status: 'active',
      createdAt: new Date().toISOString(),
    })
  }
  return list
}

function buildStores(count: number, salespersons: SalespersonAccount[], rand: Rand): Store[] {
  const roads = ['幸福路', '建设路', '人民路', '光明街', '东关大道', '解放路', '中州路', '滨河路', '工业路', '新华路']
  const types = ['超市', '便利店', '商超', '小卖部', '生活馆']
  const center = { lat: 32.9987, lng: 112.5292 }
  const list: Store[] = []
  for (let i = 1; i <= count; i++) {
    const road = randPick(rand, roads)
    const type = randPick(rand, types)
    const num = randInt(rand, 1, 200)
    const lat = +(center.lat + (rand() - 0.5) * 0.06).toFixed(6)
    const lng = +(center.lng + (rand() - 0.5) * 0.08).toFixed(6)
    const salesperson = salespersons[(i - 1) % salespersons.length]
    list.push({
      id: `st${i}`,
      code: `MD${pad3(i)}`,
      name: `${road}${type}`,
      address: `南阳市${road}${num}号`,
      salespersonId: salesperson?.id,
      lat,
      lng,
      status: 'active',
      createdAt: new Date().toISOString(),
    })
  }
  return list
}

function buildVehicleWarehouses(salespersons: SalespersonAccount[]): Warehouse[] {
  return [
    { id: 'main', name: '主仓库', type: 'main' },
    ...salespersons.map(account => ({
      id: `veh_${account.id}`,
      name: `${account.displayName}(车库)`,
      type: 'vehicle' as const,
      salespersonId: account.id,
    })),
  ]
}

function buildVehicleStock(warehouseId: string, products: Product[], rand: Rand, count: number, updatedAt: string): StockItem[] {
  const ids = new Set<string>()
  const list: StockItem[] = []
  while (ids.size < Math.min(count, products.length)) {
    const product = randPick(rand, products)
    ids.add(product.id)
  }
  for (const productId of ids) {
    list.push({ warehouseId, productId, qty: randInt(rand, 0, 60), updatedAt })
  }
  return list
}

function buildSeedSales(): SaleDoc[] {
  function gId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  }
  function daysAgo(n: number) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }
  return [
    {
      id: gId(),
      code: 'SA00000001',
      salespersonId: 'sp_big',
      storeId: 'st1',
      warehouseId: 'veh_sp_big',
      date: daysAgo(2),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p1', qty: 24, price: 45 },
        { id: gId(), productId: 'p3', qty: 48, price: 52 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: gId(),
      code: 'SA00000002',
      salespersonId: 'sp_big',
      storeId: 'st2',
      warehouseId: 'veh_sp_big',
      date: daysAgo(5),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p1', qty: 36, price: 45 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: gId(),
      code: 'SA00000003',
      salespersonId: 'sp_big',
      storeId: 'st3',
      warehouseId: 'veh_sp_big',
      date: daysAgo(3),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p3', qty: 24, price: 52 },
        { id: gId(), productId: 'p5', qty: 12, price: 70 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: gId(),
      code: 'SA00000004',
      salespersonId: 'sp_small',
      storeId: 'st4',
      warehouseId: 'veh_sp_small',
      date: daysAgo(1),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p2', qty: 80, price: 38 },
        { id: gId(), productId: 'p4', qty: 20, price: 52 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: gId(),
      code: 'SA00000005',
      salespersonId: 'sp_small',
      storeId: 'st5',
      warehouseId: 'veh_sp_small',
      date: daysAgo(7),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p6', qty: 12, price: 15 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: gId(),
      code: 'SA00000006',
      salespersonId: 'sp_third',
      storeId: 'st6',
      warehouseId: 'veh_sp_third',
      date: daysAgo(4),
      status: 'posted',
      remark: '',
      lines: [
        { id: gId(), productId: 'p7', qty: 60, price: 30 },
        { id: gId(), productId: 'p8', qty: 36, price: 66 },
      ],
      createdAt: new Date().toISOString(),
    },
  ]
}

export function seedIfEmpty() {
  const hasSupplier = supplierDb.list().length > 0
  const accounts = buildCanonicalAccounts()

  if (hasSupplier && saleDb.list().length > 0 && accountDb.list().length > 0) {
    return
  }

  if (hasSupplier) {
    if (saleDb.list().length === 0) saleDb.save(buildSeedSales())
    if (accountDb.list().length === 0) accountDb.save(accounts)
    return
  }

  const suppliers = [
    { id: 's1', code: 'GY001', name: '旺旺食品厂', contact: '张经理', phone: '13800001111', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 's2', code: 'GY002', name: '统一食品厂', contact: '李经理', phone: '13800002222', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 's3', code: 'GY003', name: '康师傅饮料厂', contact: '王总', phone: '13800003333', status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  supplierDb.save(suppliers)

  const baseProducts = [
    { id: 'p1', code: 'SP001', name: '旺旺雪饼(大)', supplierId: 's1', unit: '袋', boxQty: 12, shelfDays: 180, purchasePrice: 35, salePrice: 45, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p2', code: 'SP002', name: '旺旺碎冰冰', supplierId: 's1', unit: '袋', boxQty: 20, shelfDays: 365, purchasePrice: 28, salePrice: 38, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p3', code: 'SP003', name: '统一冰红茶(500ml)', supplierId: 's2', unit: '袋', boxQty: 24, shelfDays: 180, purchasePrice: 40, salePrice: 52, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p4', code: 'SP004', name: '统一绿茶(500ml)', supplierId: 's2', unit: '袋', boxQty: 24, shelfDays: 180, purchasePrice: 40, salePrice: 52, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p5', code: 'SP005', name: '康师傅红烧牛肉面', supplierId: 's3', unit: '袋', boxQty: 12, shelfDays: 270, purchasePrice: 55, salePrice: 70, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p6', code: 'SP006', name: '康师傅矿泉水', supplierId: 's3', unit: '袋', boxQty: 12, shelfDays: 720, purchasePrice: 10, salePrice: 15, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p7', code: 'SP007', name: '旺旺仙贝(小)', supplierId: 's1', unit: '袋', boxQty: 30, shelfDays: 180, purchasePrice: 22, salePrice: 30, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p8', code: 'SP008', name: '统一老坛酸菜面', supplierId: 's2', unit: '袋', boxQty: 12, shelfDays: 270, purchasePrice: 52, salePrice: 66, status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  const rng = createRng(20250327)
  const products = [...baseProducts, ...buildExtraProducts(22, rng, 9)]
  productDb.save(products)

  const salespersons = listSalespersons(accounts)
  storeDb.save(buildStores(100, salespersons, rng))
  warehouseDb.save(buildVehicleWarehouses(salespersons))

  const updatedAt = new Date().toISOString()
  const mainStock: StockItem[] = products.map(product => ({
    warehouseId: 'main',
    productId: product.id,
    qty: randInt(rng, 0, 220),
    updatedAt,
  }))
  const allStock = [
    ...mainStock,
    ...buildVehicleStock('veh_sp_big', products, rng, 10, updatedAt),
    ...buildVehicleStock('veh_sp_small', products, rng, 10, updatedAt),
    ...buildVehicleStock('veh_sp_third', products, rng, 10, updatedAt),
  ]
  stockDb.save(allStock)

  saleDb.save(buildSeedSales())
  accountDb.save(accounts)
}
