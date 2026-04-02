<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <el-button link @click="$router.back()">← 返回</el-button>
            <span>出库单 {{ doc.code }}</span>
            <el-tag :type="statusType(doc.status)">{{ statusLabel(doc.status) }}</el-tag>
          </div>
          <div style="display:flex;gap:8px">
            <el-button @click="saveDraft" :disabled="doc.status!=='draft'">保存草稿</el-button>
            <el-button type="primary" @click="post" :disabled="doc.status!=='draft'">过账</el-button>
            <el-button type="danger" @click="voidDoc" :disabled="doc.status!=='posted'">作废</el-button>
          </div>
        </div>
      </template>
      <el-form :model="doc" label-width="80px" :disabled="doc.status!=='draft'">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="调出仓">
              <el-select v-model="doc.fromWarehouseId" style="width:100%">
                <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="调入仓">
              <el-select v-model="doc.toWarehouseId" style="width:100%">
                <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="日期">
              <el-date-picker v-model="doc.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注"><el-input v-model="doc.remark" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div style="margin:12px 0;display:flex;justify-content:space-between;align-items:center">
        <b>出库明细</b>
        <el-button size="small" @click="addLine" :disabled="doc.status!=='draft'">+ 添加行</el-button>
      </div>
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
        <el-table-column label="操作" width="80">
          <template #default="{$index}">
            <el-button link type="danger" :disabled="doc.status!=='draft'" @click="doc.lines.splice($index,1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getTransferById, getTransfers, saveTransfer, postTransfer, voidTransfer, getWarehouses } from '@/api/stock'
import { getProducts } from '@/api/product'
import { getPackSize, normalizePackLine, productPackLabel } from '@/utils/pack'
import type { TransferDoc, TransferLine, Warehouse, Product } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])

const doc = ref<TransferDoc>({
  id: '', code: '',
  fromWarehouseId: 'main', toWarehouseId: '',
  date: dayjs().format('YYYY-MM-DD'), remark: '',
  status: 'draft', lines: [], createdAt: new Date().toISOString()
})

function getProduct(productId: string) {
  return products.value.find(p => p.id === productId)
}

function normalizeLines(lines: TransferLine[] = []) {
  return lines.map(line => normalizePackLine({ ...line }, getProduct(line.productId)))
}

function applyDoc(detail: TransferDoc) {
  doc.value = {
    ...detail,
    lines: normalizeLines(detail.lines)
  }
}

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }
function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function addLine() { doc.value.lines.push({ id: gId(), productId: '', boxQty: 0, bagQty: 0, qty: 0 }) }

function updateLine(row: TransferLine) {
  Object.assign(row, normalizePackLine(row, getProduct(row.productId)))
}

function onQtyChange(row: TransferLine) {
  const product = getProduct(row.productId)
  row.qty = Math.max(0, Math.floor(Number(row.qty) || 0))
  row.boxQty = Math.floor(row.qty / getPackSize(product))
  row.bagQty = row.qty - row.boxQty * getPackSize(product)
}

function onProductChange(row: TransferLine) {
  updateLine(row)
}

async function saveDraft() {
  const saved = await saveTransfer(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as TransferDoc)
  if (!doc.value.id) {
    const list = await getTransfers()
    if (list[0]) applyDoc(list[0])
  }
  ElMessage.success('草稿已保存')
}

async function post() {
  if (!doc.value.fromWarehouseId || !doc.value.toWarehouseId) { ElMessage.error('请选择调出/调入仓'); return }
  if (doc.value.fromWarehouseId === doc.value.toWarehouseId) { ElMessage.error('调出和调入仓不能相同'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  const saved = await saveTransfer(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as TransferDoc)
  if (!doc.value.id) {
    const list = await getTransfers()
    if (list[0]) applyDoc(list[0])
  }
  try {
    await postTransfer(doc.value.id)
    const list2 = await getTransfers()
    const u2 = list2.find(d => d.id === doc.value.id)
    if (u2) applyDoc(u2)
    ElMessage.success('过账成功')
  } catch(e: any) {
    ElMessage.error(e.message || '过账失败')
  }
}

async function voidDoc() {
  await ElMessageBox.confirm('确认作废？库存将自动反冲。','提示',{type:'warning'})
  await voidTransfer(doc.value.id)
  const list = await getTransfers()
  const u = list.find(d => d.id === doc.value.id)
  if (u) applyDoc(u)
  ElMessage.success('已作废并反冲库存')
}

async function loadDetail(id: string) {
  if (id && id !== 'new') {
    const detail = await getTransferById(id)
    if (detail) {
      applyDoc(detail)
      return
    }
  }

  doc.value = {
    id: '', code: '',
    fromWarehouseId: 'main', toWarehouseId: '',
    date: dayjs().format('YYYY-MM-DD'), remark: '',
    status: 'draft', lines: [], createdAt: new Date().toISOString()
  }
}

watch(() => route.params.id, (id) => {
  if (typeof id === 'string') {
    loadDetail(id)
  }
})

onMounted(async () => {
  ;[warehouses.value, products.value] = await Promise.all([getWarehouses(), getProducts()])
  await loadDetail(route.params.id as string)
})
</script>

<style scoped>
.pack-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

:deep(.el-table .cell) {
  padding: 4px 6px;
  overflow: visible;
}
</style>
