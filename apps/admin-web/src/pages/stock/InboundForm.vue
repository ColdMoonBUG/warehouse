<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <el-button link @click="$router.back()">← 返回</el-button>
            <span>入库单 {{ doc.code }}</span>
            <el-tag :type="statusType(doc.status)">{{ statusLabel(doc.status) }}</el-tag>
          </div>
          <div style="display:flex;gap:8px">
            <el-button @click="saveDraft" :disabled="doc.status!=='draft'">保存草稿</el-button>
            <el-button type="primary" @click="post" :disabled="doc.status!=='draft'">过账</el-button>
            <el-button type="danger" @click="voidDoc" :disabled="doc.status!=='posted'">作废</el-button>
          </div>
        </div>
      </template>
      <el-form :model="doc" ref="formRef" label-width="80px" :disabled="doc.status!=='draft'">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="厂家" prop="supplierId" :rules="[{required:true,message:'请选择厂家'}]">
              <el-select v-model="doc.supplierId" style="width:100%">
                <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="日期" prop="date" :rules="[{required:true,message:'请选择日期'}]">
              <el-date-picker v-model="doc.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="备注"><el-input v-model="doc.remark" /></el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div style="margin:12px 0;display:flex;justify-content:space-between;align-items:center">
        <b>入库明细</b>
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
        <el-table-column label="生产日期" width="140">
          <template #default="{row}">
            <el-date-picker v-model="row.mfgDate" type="date" value-format="YYYY-MM-DD" :disabled="doc.status!=='draft'" style="width:100%" @change="calcExpDate(row)" />
          </template>
        </el-table-column>
        <el-table-column label="到期日" width="140">
          <template #default="{row}">
            <el-date-picker v-model="row.expDate" type="date" value-format="YYYY-MM-DD" :disabled="doc.status!=='draft'" style="width:100%" />
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
        <el-table-column label="进价" width="150">
          <template #default="{row}">
            <el-input-number v-model="row.price" :min="0" :precision="2" :disabled="doc.status!=='draft'" controls-position="right" style="width:130px" />
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
import { getInboundById, getInbounds, saveInbound, postInbound, voidInbound } from '@/api/stock'
import { getSuppliers } from '@/api/supplier'
import { getProducts } from '@/api/product'
import { getPackSize, normalizePackLine, productPackLabel } from '@/utils/pack'
import type { InboundDoc, InboundLine, Supplier, Product } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const suppliers = ref<Supplier[]>([])
const products = ref<Product[]>([])

const doc = ref<InboundDoc>({
  id: '', code: '',
  supplierId: '', date: dayjs().format('YYYY-MM-DD'),
  remark: '', status: 'draft', lines: [], createdAt: new Date().toISOString()
})

function genLineId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getProduct(productId: string) {
  return products.value.find(p => p.id === productId)
}

function normalizeLines(lines: InboundLine[] = []) {
  return lines.map(line => normalizePackLine({ ...line }, getProduct(line.productId)))
}

function applyDoc(detail: InboundDoc) {
  doc.value = {
    ...detail,
    lines: normalizeLines(detail.lines)
  }
}

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }

function addLine() {
  doc.value.lines.push({ id: genLineId(), productId: '', boxQty: 0, bagQty: 0, qty: 0, price: 0 })
}
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function updateLine(row: InboundLine) {
  Object.assign(row, normalizePackLine(row, getProduct(row.productId)))
}

function onQtyChange(row: InboundLine) {
  const product = getProduct(row.productId)
  row.qty = Math.max(0, Math.floor(Number(row.qty) || 0))
  row.boxQty = Math.floor(row.qty / getPackSize(product))
  row.bagQty = row.qty - row.boxQty * getPackSize(product)
}

function onProductChange(row: InboundLine) {
  const p = getProduct(row.productId)
  if (p) row.price = p.purchasePrice
  updateLine(row)
  calcExpDate(row)
}
function calcExpDate(row: InboundLine) {
  const p = getProduct(row.productId)
  if (p && row.mfgDate) row.expDate = dayjs(row.mfgDate).add(p.shelfDays,'day').format('YYYY-MM-DD')
}

async function saveDraft() {
  const saved = await saveInbound(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as InboundDoc)
  if (!doc.value.id) {
    const list = await getInbounds()
    if (list[0]) applyDoc(list[0])
  }
  ElMessage.success('草稿已保存')
}

async function post() {
  if (!doc.value.supplierId) { ElMessage.error('请选择厂家'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  const saved = await saveInbound(doc.value, doc.value.lines)
  if (saved) applyDoc(saved as InboundDoc)
  if (!doc.value.id) {
    const list = await getInbounds()
    if (list[0]) applyDoc(list[0])
  }
  await postInbound(doc.value.id)
  const listAfterPost = await getInbounds()
  const u = listAfterPost.find(d => d.id === doc.value.id)
  if (u) applyDoc(u)
  ElMessage.success('过账成功')
}

async function voidDoc() {
  await ElMessageBox.confirm('确认作废？库存将自动反冲。','提示',{type:'warning'})
  await voidInbound(doc.value.id)
  const list = await getInbounds()
  const u = list.find(d => d.id === doc.value.id)
  if (u) applyDoc(u)
  ElMessage.success('已作废并反冲库存')
}

async function loadDetail(id: string) {
  if (id && id !== 'new') {
    const detail = await getInboundById(id)
    if (detail) {
      applyDoc(detail)
      return
    }
  }

  doc.value = {
    id: '', code: '',
    supplierId: '', date: dayjs().format('YYYY-MM-DD'),
    remark: '', status: 'draft', lines: [], createdAt: new Date().toISOString()
  }
}

watch(() => route.params.id, (id) => {
  if (typeof id === 'string') {
    loadDetail(id)
  }
})

onMounted(async () => {
  ;[suppliers.value, products.value] = await Promise.all([getSuppliers(), getProducts()])
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
