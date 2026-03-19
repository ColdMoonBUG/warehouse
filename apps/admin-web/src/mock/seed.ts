import { supplierDb, productDb, employeeDb, storeDb, warehouseDb, stockDb, saleDb, accountDb } from './storage'
import type { SaleDoc, Account } from '@/types'
import { simpleHash } from '@/api/auth'

export function seedIfEmpty() {
  const hasSupplier = supplierDb.list().length > 0
  // 销售数据始终更新（保证颜色分级样例生效）
  if (hasSupplier && saleDb.list().length > 0 && accountDb.list().length > 0) return
  if (hasSupplier) {
    // 只补充销售/账户数据
    if (saleDb.list().length === 0) _seedSales()
    if (accountDb.list().length === 0) _seedAccounts()
    return
  }

  // 厂家
  const suppliers = [
    { id: 's1', code: 'GY001', name: '旺旺食品厂', contact: '张经理', phone: '13800001111', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 's2', code: 'GY002', name: '统一食品厂', contact: '李经理', phone: '13800002222', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 's3', code: 'GY003', name: '康师傅饮料厂', contact: '王总', phone: '13800003333', status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  supplierDb.save(suppliers)

  // 商品
  const products = [
    { id: 'p1', code: 'SP001', name: '旺旺雪饼(大)', supplierId: 's1', unit: '件', boxQty: 12, shelfDays: 180, purchasePrice: 35, salePrice: 45, commission: 1.5, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p2', code: 'SP002', name: '旺旺碎冰冰', supplierId: 's1', unit: '件', boxQty: 20, shelfDays: 365, purchasePrice: 28, salePrice: 38, commission: 1.0, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p3', code: 'SP003', name: '统一冰红茶(500ml)', supplierId: 's2', unit: '件', boxQty: 24, shelfDays: 180, purchasePrice: 40, salePrice: 52, commission: 1.2, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p4', code: 'SP004', name: '统一绿茶(500ml)', supplierId: 's2', unit: '件', boxQty: 24, shelfDays: 180, purchasePrice: 40, salePrice: 52, commission: 1.2, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p5', code: 'SP005', name: '康师傅红烧牛肉面', supplierId: 's3', unit: '件', boxQty: 12, shelfDays: 270, purchasePrice: 55, salePrice: 70, commission: 2.0, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p6', code: 'SP006', name: '康师傅矿泉水', supplierId: 's3', unit: '件', boxQty: 12, shelfDays: 720, purchasePrice: 10, salePrice: 15, commission: 0.5, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p7', code: 'SP007', name: '旺旺仙贝(小)', supplierId: 's1', unit: '件', boxQty: 30, shelfDays: 180, purchasePrice: 22, salePrice: 30, commission: 0.8, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'p8', code: 'SP008', name: '统一老坛酸菜面', supplierId: 's2', unit: '件', boxQty: 12, shelfDays: 270, purchasePrice: 52, salePrice: 66, commission: 1.8, status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  productDb.save(products)

  // 员工（业务员）
  const employees = [
    { id: 'e1', code: 'YG001', name: '赵明', phone: '13911110001', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'e2', code: 'YG002', name: '钱磊', phone: '13911110002', status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'e3', code: 'YG003', name: '孙丽', phone: '13911110003', status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  employeeDb.save(employees)

  // 门店
  const stores = [
    { id: 'st1', code: 'MD001', name: '幸福路超市', address: '南阳市幸福路88号', defaultEmployeeId: 'e1', lat: 32.9992, lng: 112.5280, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'st2', code: 'MD002', name: '建设路便利店', address: '南阳市建设路12号', defaultEmployeeId: 'e1', lat: 33.0015, lng: 112.5320, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'st3', code: 'MD003', name: '人民路商超', address: '南阳市人民路56号', defaultEmployeeId: 'e2', lat: 32.9970, lng: 112.5350, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'st4', code: 'MD004', name: '光明小卖部', address: '南阳市光明街3号', defaultEmployeeId: 'e2', lat: 32.9955, lng: 112.5210, status: 'active' as const, createdAt: new Date().toISOString() },
    { id: 'st5', code: 'MD005', name: '东关综合超市', address: '南阳市东关大道101号', defaultEmployeeId: 'e3', lat: 33.0030, lng: 112.5410, status: 'active' as const, createdAt: new Date().toISOString() },
  ]
  storeDb.save(stores)

  // 仓库：主仓 + 三个车库
  const warehouses = [
    { id: 'main', name: '主仓库', type: 'main' as const },
    { id: 'veh_e1', name: '赵明(车库)', type: 'vehicle' as const, employeeId: 'e1' },
    { id: 'veh_e2', name: '钱磊(车库)', type: 'vehicle' as const, employeeId: 'e2' },
    { id: 'veh_e3', name: '孙丽(车库)', type: 'vehicle' as const, employeeId: 'e3' },
  ]
  const wList: typeof warehouses = []
  for (const w of warehouses) wList.push(w)
  warehouseDb.save(wList)

  // 主仓库存
  const t = new Date().toISOString()
  const mainStock = [
    { warehouseId: 'main', productId: 'p1', qty: 120, updatedAt: t },
    { warehouseId: 'main', productId: 'p2', qty: 85, updatedAt: t },
    { warehouseId: 'main', productId: 'p3', qty: 200, updatedAt: t },
    { warehouseId: 'main', productId: 'p4', qty: 0, updatedAt: t },
    { warehouseId: 'main', productId: 'p5', qty: 48, updatedAt: t },
    { warehouseId: 'main', productId: 'p6', qty: 7, updatedAt: t },
    { warehouseId: 'main', productId: 'p7', qty: 60, updatedAt: t },
    { warehouseId: 'main', productId: 'p8', qty: 36, updatedAt: t },
  ]
  // 赵明车库
  const e1Stock = [
    { warehouseId: 'veh_e1', productId: 'p1', qty: 24, updatedAt: t },
    { warehouseId: 'veh_e1', productId: 'p3', qty: 48, updatedAt: t },
    { warehouseId: 'veh_e1', productId: 'p5', qty: 12, updatedAt: t },
  ]
  // 钱磊车库
  const e2Stock = [
    { warehouseId: 'veh_e2', productId: 'p2', qty: 40, updatedAt: t },
    { warehouseId: 'veh_e2', productId: 'p4', qty: 5, updatedAt: t },
    { warehouseId: 'veh_e2', productId: 'p6', qty: 0, updatedAt: t },
  ]
  // 孙丽车库
  const e3Stock = [
    { warehouseId: 'veh_e3', productId: 'p7', qty: 30, updatedAt: t },
    { warehouseId: 'veh_e3', productId: 'p8', qty: 8, updatedAt: t },
  ]
  const allStock = [...mainStock, ...e1Stock, ...e2Stock, ...e3Stock]
  localStorage.setItem('wh_stock', JSON.stringify(allStock))

  _seedSales()
  _seedAccounts()
}

function _seedSales() {
  function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }
  function daysAgo(n: number) {
    const d = new Date(); d.setDate(d.getDate() - n)
    return d.toISOString().slice(0,10)
  }
  const sales: SaleDoc[] = [
    { id: gId(), code: 'SA00000001', employeeId: 'e1', storeId: 'st1', date: daysAgo(2), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p1', qty: 24, price: 45 },
      { id: gId(), productId: 'p3', qty: 48, price: 52 },
    ], createdAt: new Date().toISOString() },
    { id: gId(), code: 'SA00000002', employeeId: 'e1', storeId: 'st1', date: daysAgo(5), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p1', qty: 36, price: 45 },
    ], createdAt: new Date().toISOString() },
    { id: gId(), code: 'SA00000003', employeeId: 'e1', storeId: 'st2', date: daysAgo(3), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p3', qty: 24, price: 52 },
      { id: gId(), productId: 'p5', qty: 12, price: 70 },
    ], createdAt: new Date().toISOString() },
    { id: gId(), code: 'SA00000004', employeeId: 'e2', storeId: 'st3', date: daysAgo(1), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p2', qty: 80, price: 38 },
      { id: gId(), productId: 'p4', qty: 20, price: 52 },
    ], createdAt: new Date().toISOString() },
    { id: gId(), code: 'SA00000005', employeeId: 'e2', storeId: 'st4', date: daysAgo(7), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p6', qty: 12, price: 15 },
    ], createdAt: new Date().toISOString() },
    { id: gId(), code: 'SA00000006', employeeId: 'e3', storeId: 'st5', date: daysAgo(4), status: 'posted', remark: '', lines: [
      { id: gId(), productId: 'p7', qty: 60, price: 30 },
      { id: gId(), productId: 'p8', qty: 36, price: 66 },
    ], createdAt: new Date().toISOString() },
  ]
  saleDb.save(sales)
}

function _seedAccounts() {
  const accounts: Account[] = [
    {
      id: 'a_admin',
      username: 'admin',
      displayName: '管理员',
      role: 'admin',
      passwordHash: simpleHash('admin123'),
      gestureHash: simpleHash('1-2-3-6-9'),
      status: 'active',
      createdAt: new Date().toISOString()
    },
    {
      id: 'a_e1',
      username: 'zhaoming',
      displayName: '赵明',
      role: 'salesperson',
      employeeId: 'e1',
      passwordHash: simpleHash('123456'),
      gestureHash: simpleHash('1-4-7-8-9'),
      status: 'active',
      createdAt: new Date().toISOString()
    },
    {
      id: 'a_e2',
      username: 'qianlei',
      displayName: '钱磊',
      role: 'salesperson',
      employeeId: 'e2',
      passwordHash: simpleHash('123456'),
      gestureHash: simpleHash('2-5-8-9'),
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ]
  accountDb.save(accounts)
}
