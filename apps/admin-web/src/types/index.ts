export type Status = 'active' | 'inactive'
export type DocStatus = 'draft' | 'posted' | 'voided'
export type Role = 'admin' | 'salesperson'

export interface Account {
  id: string
  username: string
  displayName: string
  role: Role
  employeeId?: string  // 业务员关联员工ID
  passwordHash: string  // 简单hash
  gestureHash?: string  // 手势密码hash
  status: Status
  createdAt: string
}

export interface Supplier {
  id: string
  code: string
  name: string
  contact?: string
  phone?: string
  status: Status
  createdAt: string
}

export interface Product {
  id: string
  code: string
  name: string
  supplierId: string
  unit: string
  boxQty: number
  shelfDays: number
  purchasePrice: number
  salePrice: number
  commission: number
  status: Status
  createdAt: string
}

export interface Employee {
  id: string
  code: string
  name: string
  phone?: string
  status: Status
  createdAt: string
}

export interface Store {
  id: string
  code?: string
  name: string
  address?: string
  defaultEmployeeId?: string
  lat?: number
  lng?: number
  scale?: 1 | 2 | 3 | 4  // 1=小 2=中 3=大 4=超大
  status: Status
  createdAt: string
}

export interface SaleLine {
  id: string
  productId: string
  qty: number
  price: number
}

export interface SaleDoc {
  id: string
  code: string
  employeeId: string
  storeId: string
  date: string
  remark?: string
  status: DocStatus
  lines: SaleLine[]
  createdAt: string
}

export interface Warehouse {
  id: string
  name: string
  type: 'main' | 'vehicle'
  employeeId?: string
}

export interface StockItem {
  warehouseId: string
  productId: string
  qty: number
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  bizType: 'inbound' | 'transfer'
  docId: string
  warehouseId: string
  productId: string
  qty: number
  createdAt: string
}

export interface InboundLine {
  id: string
  productId: string
  mfgDate?: string
  expDate?: string
  boxQty: number
  qty: number
  price: number
}

export interface InboundDoc {
  id: string
  code: string
  supplierId: string
  date: string
  remark?: string
  status: DocStatus
  lines: InboundLine[]
  createdAt: string
}

export interface TransferLine {
  id: string
  productId: string
  boxQty: number
  qty: number
}

export interface TransferDoc {
  id: string
  code: string
  fromWarehouseId: string
  toWarehouseId: string
  date: string
  remark?: string
  status: DocStatus
  lines: TransferLine[]
  createdAt: string
}
