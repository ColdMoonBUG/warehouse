export type Status = 'active' | 'inactive'
export type DocStatus = 'draft' | 'posted' | 'voided'
export type Role = 'admin' | 'salesperson'

export interface Account {
  id: string
  username: string
  displayName: string
  role: Role
  salespersonId?: string
  passwordHash: string
  gestureHash?: string
  status: Status
  createdAt: string
}

export interface Salesperson {
  id: string
  username: string
  displayName: string
  role: 'salesperson'
  salespersonId?: string
  passwordHash: string
  gestureHash?: string
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
  imageUrl?: string
  barcode?: string
  supplierId?: string
  unit?: string
  boxQty?: number
  shelfDays?: number
  purchasePrice?: number
  salePrice?: number
  status: Status
  createdAt: string
}

export interface OutboundLine {
  id: string
  productId: string
  boxQty?: number
  qty: number
  price: number
}

export interface OutboundDoc {
  id: string
  code: string
  salespersonId: string
  warehouseId: string
  date: string
  remark?: string
  status: DocStatus
  lines: OutboundLine[]
  createdAt: string
}

export interface Store {
  id: string
  code?: string
  name: string
  address?: string
  salespersonId?: string
  lat?: number
  lng?: number
  scale?: 1 | 2 | 3 | 4  // 1=小 2=中 3=大 4=超大
  status: Status
  createdAt: string
}

export interface SaleLine {
  id: string
  productId: string
  boxQty?: number
  qty: number
  price: number
}

export interface SaleDoc {
  id: string
  code: string
  salespersonId: string
  storeId: string
  warehouseId?: string
  date: string
  remark?: string
  status: DocStatus
  lines: SaleLine[]
  createdAt: string
}

export interface Warehouse {
  id: string
  name: string
  type: 'main' | 'vehicle' | 'return'
  salespersonId?: string
}

export interface StockItem {
  warehouseId: string
  productId: string
  qty: number
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  bizType: 'inbound' | 'transfer' | 'sale' | 'return_vehicle' | 'return_warehouse' | 'outbound'
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

export interface ReturnLine {
  id: string
  productId: string
  boxQty?: number
  qty: number
  price: number
}

export interface ReturnDoc {
  id: string
  code: string
  salespersonId: string
  storeId: string
  date: string
  returnType: 'vehicle_return' | 'warehouse_return'
  fromWarehouseId: string
  toWarehouseId?: string
  remark?: string
  status: DocStatus
  lines: ReturnLine[]
  createdAt: string
}

export interface Session {
  accountId: string
  username: string
  displayName: string
  role: Role
  salespersonId?: string
  expiresAt: string
}
