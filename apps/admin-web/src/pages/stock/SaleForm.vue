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
        合计：¥{{ doc.lines.reduce((s,l)=>s+l.qty*l.price,0).toFixed(2) }}
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSales, saveSale, postSale, voidSale } from '@/api/sale'
import { getEmployees } from '@/api/employee'
import { getStores } from '@/api/store'
import { getProducts } from '@/api/product'
import type { SaleDoc, SaleLine, Employee, Store, Product } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const employees = ref<Employee[]>([])
const stores = ref<Store[]>([])
const products = ref<Product[]>([])
const isMobile = ref(window.innerWidth < 768)

function onResize() { isMobile.value = window.innerWidth < 768 }

function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

const doc = ref<SaleDoc>({
  id: gId(), code: 'SA' + Date.now().toString().slice(-8),
  employeeId: '', storeId: '',
  date: dayjs().format('YYYY-MM-DD'), remark: '',
  status: 'draft', lines: [], createdAt: new Date().toISOString()
})

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function addLine() { doc.value.lines.push({ id: gId(), productId: '', qty: 1, price: 0 }) }
function onProductChange(row: SaleLine) {
  const p = products.value.find(p => p.id === row.productId)
  if (p) row.price = p.salePrice
}

async function saveDraft() { await saveSale(doc.value); ElMessage.success('草稿已保存') }

async function post() {
  if (!doc.value.employeeId) { ElMessage.error('请选择业务员'); return }
  if (!doc.value.storeId) { ElMessage.error('请选择门店'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  await saveSale(doc.value)
  await postSale(doc.value.id)
  const list = await getSales()
  const u = list.find(d => d.id === doc.value.id)
  if (u) doc.value = u
  ElMessage.success('过账成功')
}

async function voidDoc() {
  await ElMessageBox.confirm('确认作废？','提示',{type:'warning'})
  await voidSale(doc.value.id)
  const list = await getSales()
  const u = list.find(d => d.id === doc.value.id)
  if (u) doc.value = u
  ElMessage.success('已作废')
}

onMounted(async () => {
  ;[employees.value, stores.value, products.value] = await Promise.all([getEmployees(), getStores(), getProducts()])
  const id = route.params.id as string
  if (id && id !== 'new') {
    const list = await getSales()
    const found = list.find(d => d.id === id)
    if (found) doc.value = found
  }
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
.total-row { text-align:right; padding:12px 0; font-weight:600; font-size:15px; }

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
