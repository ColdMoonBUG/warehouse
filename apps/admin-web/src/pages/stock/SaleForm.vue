<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <div class="header-left">
            <el-button link @click="$router.back()">← 返回</el-button>
            <span>销售单 {{ doc.code }}</span>
            <el-tag :type="statusType(doc.status)">{{ statusLabel(doc.status) }}</el-tag>
          </div>
          <div class="header-actions">
            <el-button @click="saveDraft" :disabled="doc.status!=='draft'">保存草稿</el-button>
            <el-button type="primary" @click="post" :disabled="doc.status!=='draft'">过账</el-button>
            <el-button type="danger" @click="voidDoc" :disabled="doc.status!=='posted'">作废</el-button>
          </div>
        </div>
      </template>
      <el-form :model="doc" label-width="80px" :disabled="doc.status!=='draft'">
        <el-row :gutter="16">
          <el-col :span="isMobile?24:8">
            <el-form-item label="业务员">
              <el-input :model-value="currentSalespersonName" disabled placeholder="选择车库后自动带出" />
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item label="门店">
              <el-select v-model="doc.storeId" style="width:100%" placeholder="请选择" filterable>
                <el-option v-for="s in availableStores" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item label="车库">
              <el-select v-model="doc.warehouseId" style="width:100%" placeholder="选择车库">
                <el-option v-for="w in vehicleWarehouses" :key="w.id" :label="w.name" :value="w.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item label="日期">
              <el-date-picker v-model="doc.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注"><el-input v-model="doc.remark" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="section-row">
        <b>销售明细</b>
        <el-button size="small" @click="addLine" :disabled="doc.status!=='draft'">+ 添加行</el-button>
      </div>

      <div v-if="isMobile" class="mobile-lines">
        <div v-for="(row,idx) in doc.lines" :key="row.id" class="mobile-line">
          <div class="line-row">
            <el-select v-model="row.productId" placeholder="选择商品" :disabled="doc.status!=='draft'" style="width:100%" @change="onProductChange(row)">
              <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <div class="pack-hint">{{ productPackLabel(getProduct(row.productId)) }}</div>
          </div>
          <div class="line-row cols cols-3">
            <div class="col">
              <div class="label">箱数</div>
              <el-input-number v-model="row.boxQty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" @change="updateLine(row)" />
            </div>
            <div class="col">
              <div class="label">袋数</div>
              <el-input-number v-model="row.bagQty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" @change="updateLine(row)" />
            </div>
            <div class="col">
              <div class="label">总袋数</div>
              <el-input-number v-model="row.qty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" @change="onQtyChange(row)" />
            </div>
          </div>
          <div class="line-row cols">
            <div class="col">
              <div class="label">单价</div>
              <el-input-number v-model="row.price" :min="0" :precision="2" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" />
            </div>
            <div class="col summary-col">
              <div class="label">包装</div>
              <div class="value">{{ row.boxQty || 0 }}箱{{ row.bagQty || 0 }}袋</div>
            </div>
          </div>
          <div class="line-row">
            <div class="label">小计</div>
            <div class="value">¥{{ (row.qty * row.price).toFixed(2) }}</div>
          </div>
          <div class="line-row">
            <el-button link type="danger" :disabled="doc.status!=='draft'" @click="doc.lines.splice(idx,1)">删除</el-button>
          </div>
        </div>
      </div>

      <div v-else>
        <el-table :data="doc.lines" border>
          <el-table-column label="商品" min-width="180">
            <template #default="{row}">
              <el-select v-model="row.productId" placeholder="选择商品" :disabled="doc.status!=='draft'" style="width:100%" @change="onProductChange(row)">
                <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
              <div class="pack-hint">{{ productPackLabel(getProduct(row.productId)) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="箱数" width="120">
            <template #default="{row}">
              <el-input-number v-model="row.boxQty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:100px" @change="updateLine(row)" />
            </template>
          </el-table-column>
          <el-table-column label="袋数" width="120">
            <template #default="{row}">
              <el-input-number v-model="row.bagQty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:100px" @change="updateLine(row)" />
            </template>
          </el-table-column>
          <el-table-column label="总袋数" width="140">
            <template #default="{row}">
              <el-input-number v-model="row.qty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:120px" @change="onQtyChange(row)" />
            </template>
          </el-table-column>
          <el-table-column label="单价" width="150">
            <template #default="{row}">
              <el-input-number v-model="row.price" :min="0" :precision="2" :disabled="doc.status!=='draft'" controls-position="right" style="width:130px" />
            </template>
          </el-table-column>
          <el-table-column label="小计" width="100">
            <template #default="{row}">
              <span>{{ (row.qty * row.price).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{$index}">
              <el-button link type="danger" :disabled="doc.status!=='draft'" @click="doc.lines.splice($index,1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="total-row">
        合计：¥{{ amountSum().toFixed(2) }}
        <span class="commission">提成：¥{{ commissionSum().toFixed(2) }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSaleById, saveSale, postSale, voidSale } from '@/api/sale'
import { getSalespersonAccounts, getSalespersonName, getSession } from '@/api/auth'
import { getStores } from '@/api/store'
import { getProducts } from '@/api/product'
import { getStock, getWarehouses } from '@/api/stock'
import { normalizePackLine, productPackLabel } from '@/utils/pack'
import type { SaleDoc, SaleLine, Account, Store, Product, Warehouse } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const session = getSession()
const salespersonAccounts = ref<Account[]>([])
const stores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const isMobile = ref(window.innerWidth < 768)

function onResize() { isMobile.value = window.innerWidth < 768 }

const doc = ref<SaleDoc>({
  id: '', code: '',
  salespersonId: '', storeId: '', warehouseId: '',
  date: dayjs().format('YYYY-MM-DD'), remark: '',
  status: 'draft', lines: [], createdAt: new Date().toISOString()
})

function getProduct(productId: string) {
  return products.value.find(p => p.id === productId)
}

function applyDoc(detail: SaleDoc) {
  doc.value = {
    ...detail,
    lines: detail.lines.map(line => normalizePackLine({ ...line }, getProduct(line.productId)))
  }
}

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
const vehicleWarehouses = computed(() => {
  const list = warehouses.value.filter(w => w.type === 'vehicle')
  if (session?.role === 'salesperson') return list.filter(w => w.salespersonId === session.accountId)
  return list
})
const availableStores = computed(() => {
  if (!doc.value.salespersonId) return stores.value
  return stores.value.filter(store => store.salespersonId === doc.value.salespersonId)
})
const currentWarehouse = computed(() => warehouses.value.find(w => w.id === doc.value.warehouseId))
const currentSalespersonName = computed(() => {
  return getSalespersonName(salespersonAccounts.value, doc.value.salespersonId || currentWarehouse.value?.salespersonId)
})

function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function genLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function addLine() { doc.value.lines.push({ id: genLineId(), productId: '', boxQty: 0, bagQty: 0, qty: 0, price: 0 }) }
function updateLine(row: SaleLine) {
  Object.assign(row, normalizePackLine(row, getProduct(row.productId)))
}
function onQtyChange(row: SaleLine) {
  Object.assign(row, normalizePackLine({ ...row, bagQty: undefined }, getProduct(row.productId)))
}
function onProductChange(row: SaleLine) {
  const p = getProduct(row.productId)
  if (p) row.price = p.salePrice
  updateLine(row)
}

function amountSum() {
  return doc.value.lines.reduce((s, l) => s + l.qty * l.price, 0)
}
function commissionSum() {
  return amountSum() * 0.06
}

async function validateStockBeforePost() {
  const warehouseId = doc.value.warehouseId
  if (!warehouseId) return true
  const stockList = await getStock(warehouseId)
  const stockMap = new Map(stockList.map(item => [item.productId, item.qty || 0]))
  const requiredMap = new Map<string, number>()
  for (const line of doc.value.lines) {
    if (!line.productId) continue
    requiredMap.set(line.productId, (requiredMap.get(line.productId) || 0) + (line.qty || 0))
  }
  for (const [productId, requiredQty] of requiredMap.entries()) {
    const currentQty = stockMap.get(productId) || 0
    if (currentQty >= requiredQty) continue
    const productName = getProduct(productId)?.name || productId
    ElMessage.error(`${productName}库存不足，车库现有${currentQty}袋，销单需要${requiredQty}袋`)
    return false
  }
  return true
}

function syncSalespersonFromWarehouse() {
  if (currentWarehouse.value?.salespersonId) {
    doc.value.salespersonId = currentWarehouse.value.salespersonId
    return
  }
  if (!doc.value.salespersonId && session?.role === 'salesperson') {
    doc.value.salespersonId = session.accountId
  }
}

function syncStoreFromSalesperson() {
  if (!doc.value.storeId) return
  if (availableStores.value.some(store => store.id === doc.value.storeId)) return
  doc.value.storeId = availableStores.value[0]?.id || ''
}

async function saveDraft() {
  const saved = await saveSale(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as SaleDoc)
  ElMessage.success('草稿已保存')
}

async function post() {
  if (!doc.value.salespersonId) { ElMessage.error('请选择业务员'); return }
  if (!doc.value.storeId) { ElMessage.error('请选择门店'); return }
  if (!doc.value.warehouseId) { ElMessage.error('请选择车库'); return }
  if (doc.value.warehouseId === 'main') { ElMessage.error('销售必须从车库出库'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  if (!(await validateStockBeforePost())) return
  const saved = await saveSale(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as SaleDoc)
  await postSale(doc.value.id)
  const detail = await getSaleById(doc.value.id)
  if (detail) applyDoc(detail)
  ElMessage.success('过账成功')
}

async function voidDoc() {
  await ElMessageBox.confirm('确认作废？','提示',{type:'warning'})
  await voidSale(doc.value.id)
  const detail = await getSaleById(doc.value.id)
  if (detail) applyDoc(detail)
  ElMessage.success('已作废')
}

async function loadDetail(id: string) {
  if (id && id !== 'new') {
    const detail = await getSaleById(id)
    if (detail) {
      applyDoc(detail)
      return
    }
  }

  const defaultWarehouseId = vehicleWarehouses.value[0]?.id || ''
  doc.value = {
    id: '', code: '',
    salespersonId: '', storeId: '', warehouseId: defaultWarehouseId,
    date: dayjs().format('YYYY-MM-DD'), remark: '',
    status: 'draft', lines: [], createdAt: new Date().toISOString()
  }
  syncSalespersonFromWarehouse()
  syncStoreFromSalesperson()
}

watch(() => doc.value.warehouseId, () => {
  syncSalespersonFromWarehouse()
  syncStoreFromSalesperson()
})

watch(() => doc.value.salespersonId, () => {
  syncStoreFromSalesperson()
})

watch(() => route.params.id, (id) => {
  if (typeof id === 'string') {
    loadDetail(id)
  }
})

onMounted(async () => {
  ;[salespersonAccounts.value, stores.value, products.value, warehouses.value] = await Promise.all([getSalespersonAccounts(), getStores(), getProducts(), getWarehouses()])
  if (!doc.value.warehouseId) doc.value.warehouseId = vehicleWarehouses.value[0]?.id || ''
  syncSalespersonFromWarehouse()
  syncStoreFromSalesperson()
  await loadDetail(route.params.id as string)
  if (!doc.value.warehouseId) doc.value.warehouseId = vehicleWarehouses.value[0]?.id || ''
  syncSalespersonFromWarehouse()
  syncStoreFromSalesperson()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left { display:flex; align-items:center; gap:12px; }
.header-actions { display:flex; gap:8px; }
.section-row { margin:12px 0; display:flex; justify-content:space-between; align-items:center; }
.total-row { text-align:right; padding:12px 0; font-weight:600; font-size:15px; display:flex; justify-content:flex-end; gap:16px; flex-wrap:wrap; }
.total-row .commission { color:#86efac; }
.pack-hint { margin-top: 4px; font-size: 12px; color:#94a3b8; }
.summary-col { display:flex; flex-direction:column; justify-content:flex-end; }

.mobile-lines { display:flex; flex-direction:column; gap:10px; }
.mobile-line {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
}
.line-row { margin-top: 8px; }
.line-row:first-child { margin-top: 0; }
.line-row.cols { display:flex; gap:10px; }
.line-row.cols-3 .col { min-width: 0; }
.line-row .col { flex: 1; }
.line-row .label { font-size:12px; color:#94a3b8; margin-bottom:4px; }
.line-row .value { font-weight:600; }

@media (max-width: 480px) {
  .header-row { flex-direction: column; align-items: flex-start; gap: 10px; }
  .header-actions { width: 100%; flex-wrap: wrap; }
  .header-actions :deep(.el-button) { flex: 1; }
  .section-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .line-row.cols { flex-direction: column; }
}

:deep(.el-table .cell) { padding: 4px 6px; overflow: visible; }
</style>
