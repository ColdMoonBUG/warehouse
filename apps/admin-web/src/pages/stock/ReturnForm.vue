<template>
  <div>
    <el-card>
      <template #header>
        <div class="header-row">
          <div class="header-left">
            <el-button link @click="$router.back()">← 返回</el-button>
            <span>退货单 {{ doc.code }}</span>
            <el-tag :type="statusType(doc.status)">{{ statusLabel(doc.status) }}</el-tag>
          </div>
          <div class="header-actions">
            <el-button @click="saveDraft" :disabled="doc.status!=='draft'">保存草稿</el-button>
            <el-button type="primary" @click="post" :disabled="doc.status!=='draft'">过账</el-button>
            <el-button type="danger" @click="voidDoc" :disabled="doc.status!=='posted'">作废</el-button>
          </div>
        </div>
      </template>
      <el-form :model="doc" label-width="90px" :disabled="doc.status!=='draft'">
        <el-row :gutter="16">
          <el-col :span="isMobile?24:8">
            <el-form-item label="业务员">
              <el-select v-model="doc.employeeId" style="width:100%" placeholder="请选择">
                <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item label="门店">
              <el-select v-model="doc.storeId" style="width:100%" placeholder="请选择" filterable>
                <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item label="日期">
              <el-date-picker v-model="doc.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="isMobile?24:8">
            <el-form-item :label="doc.returnType === 'warehouse_return' ? '来源车库' : '退回车库'">
              <el-select v-model="doc.fromWarehouseId" style="width:100%" placeholder="选择车库">
                <el-option v-for="w in vehicleWarehouses" :key="w.id" :label="w.name" :value="w.id" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="isMobile?24:8">
            <el-form-item label="退货类型">
              <el-select v-model="doc.returnType" style="width:100%">
                <el-option label="退回车库" value="vehicle_return" />
                <el-option label="退回仓库" value="warehouse_return" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="doc.returnType==='warehouse_return'" :span="isMobile?24:8">
            <el-form-item label="目标仓库">
              <el-select v-model="doc.toWarehouseId" style="width:100%" placeholder="选择目标仓库">
                <el-option v-for="w in targetWarehouses" :key="w.id" :label="w.name" :value="w.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注"><el-input v-model="doc.remark" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="section-row">
        <b>退货明细</b>
        <el-button size="small" @click="addLine" :disabled="doc.status!=='draft'">+ 添加行</el-button>
      </div>

      <div v-if="isMobile" class="mobile-lines">
        <div v-for="(row,idx) in doc.lines" :key="row.id" class="mobile-line">
          <div class="line-row">
            <el-select v-model="row.productId" placeholder="选择商品" :disabled="doc.status!=='draft'" style="width:100%" @change="onProductChange(row)">
              <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </div>
          <div class="line-row cols">
            <div class="col">
              <div class="label">数量(件)</div>
              <el-input-number v-model="row.qty" :min="1" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" />
            </div>
            <div class="col">
              <div class="label">单价</div>
              <el-input-number v-model="row.price" :min="0" :precision="2" :disabled="doc.status!=='draft'" controls-position="right" style="width:100%" />
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
            </template>
          </el-table-column>
          <el-table-column label="数量(件)" width="150">
            <template #default="{row}">
              <el-input-number v-model="row.qty" :min="1" :disabled="doc.status!=='draft'" controls-position="right" style="width:130px" />
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
        <span class="commission">提成扣回：¥{{ commissionSum().toFixed(2) }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getReturnById, saveReturn, postReturn, voidReturn } from '@/api/return'
import { getEmployees } from '@/api/employee'
import { getStores } from '@/api/store'
import { getProducts } from '@/api/product'
import { getWarehouses } from '@/api/stock'
import type { ReturnDoc, ReturnLine, Employee, Store, Product, Warehouse } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const employees = ref<Employee[]>([])
const stores = ref<Store[]>([])
const products = ref<Product[]>([])
const warehouses = ref<Warehouse[]>([])
const isMobile = ref(window.innerWidth < 768)

function onResize() { isMobile.value = window.innerWidth < 768 }

function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

const doc = ref<ReturnDoc>({
  id: '', code: '',
  employeeId: '', storeId: '',
  date: dayjs().format('YYYY-MM-DD'), remark: '',
  status: 'draft', lines: [],
  returnType: 'vehicle_return',
  fromWarehouseId: '',
  createdAt: new Date().toISOString()
})

const vehicleWarehouses = computed(() => warehouses.value.filter(w => w.type === 'vehicle'))
const targetWarehouses = computed(() => warehouses.value.filter(w => w.type !== 'vehicle'))

watch(() => doc.value.returnType, (type) => {
  if (type === 'warehouse_return') {
    if (!doc.value.toWarehouseId) doc.value.toWarehouseId = targetWarehouses.value[0]?.id || ''
    return
  }
  doc.value.toWarehouseId = undefined
})

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function addLine() { doc.value.lines.push({ id: gId(), productId: '', qty: 1, price: 0 }) }
function onProductChange(row: ReturnLine) {
  const p = products.value.find(p => p.id === row.productId)
  if (p) row.price = p.salePrice
}

async function saveDraft() {
  const saved = await saveReturn(doc.value, doc.value.lines)
  if (saved) doc.value = saved as any
  ElMessage.success('草稿已保存')
}

async function post() {
  if (!doc.value.employeeId) { ElMessage.error('请选择业务员'); return }
  if (!doc.value.storeId) { ElMessage.error('请选择门店'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  if (!doc.value.fromWarehouseId) { ElMessage.error('请选择来源车库'); return }
  if (doc.value.returnType === 'warehouse_return' && !doc.value.toWarehouseId) { ElMessage.error('请选择目标仓库'); return }
  const saved = await saveReturn(doc.value, doc.value.lines)
  if (saved) doc.value = saved as any
  await postReturn(doc.value.id)
  const detail = await getReturnById(doc.value.id)
  if (detail) doc.value = detail
  ElMessage.success('过账成功')
}

function amountSum() {
  return doc.value.lines.reduce((s, l) => s + l.qty * l.price, 0)
}
function commissionSum() {
  return amountSum() * 0.06
}

async function voidDoc() {
  await ElMessageBox.confirm('确认作废？','提示',{type:'warning'})
  await voidReturn(doc.value.id)
  const detail = await getReturnById(doc.value.id)
  if (detail) doc.value = detail
  ElMessage.success('已作废')
}

async function loadDetail(id: string) {
  if (id && id !== 'new') {
    const detail = await getReturnById(id)
    if (detail) {
      doc.value = detail
      return
    }
  }

  doc.value = {
    id: '', code: '',
    employeeId: '', storeId: '',
    date: dayjs().format('YYYY-MM-DD'), remark: '',
    status: 'draft', lines: [],
    returnType: 'vehicle_return',
    fromWarehouseId: vehicleWarehouses.value[0]?.id || '',
    createdAt: new Date().toISOString()
  }
}

watch(() => route.params.id, (id) => {
  if (typeof id === 'string') {
    loadDetail(id)
  }
})

onMounted(async () => {
  ;[employees.value, stores.value, products.value, warehouses.value] = await Promise.all([getEmployees(), getStores(), getProducts(), getWarehouses()])
  if (!doc.value.fromWarehouseId) doc.value.fromWarehouseId = vehicleWarehouses.value[0]?.id || ''
  if (doc.value.returnType === 'warehouse_return' && !doc.value.toWarehouseId) doc.value.toWarehouseId = targetWarehouses.value[0]?.id || ''
  await loadDetail(route.params.id as string)
  if (!doc.value.fromWarehouseId) doc.value.fromWarehouseId = vehicleWarehouses.value[0]?.id || ''
  if (doc.value.returnType === 'warehouse_return' && !doc.value.toWarehouseId) doc.value.toWarehouseId = targetWarehouses.value[0]?.id || ''
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
.total-row .commission { color:#fca5a5; }

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
