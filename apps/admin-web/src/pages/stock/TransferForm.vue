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
            <el-select v-model="row.productId" placeholder="选择商品" :disabled="doc.status!=='draft'" style="width:100%">
              <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="箱数" width="150">
          <template #default="{row}">
            <el-input-number v-model="row.boxQty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:130px" @change="onBoxChange(row)" />
          </template>
        </el-table-column>
        <el-table-column label="件数" width="150">
          <template #default="{row}">
            <el-input-number v-model="row.qty" :min="0" :disabled="doc.status!=='draft'" controls-position="right" style="width:130px" />
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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getTransfers, saveTransfer, postTransfer, voidTransfer, getWarehouses } from '@/api/stock'
import { getProducts } from '@/api/product'
import type { TransferDoc, TransferLine, Warehouse, Product } from '@/types'
import dayjs from 'dayjs'

const route = useRoute()
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])

function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

const doc = ref<TransferDoc>({
  id: gId(), code: 'TR' + Date.now().toString().slice(-8),
  fromWarehouseId: 'main', toWarehouseId: '',
  date: dayjs().format('YYYY-MM-DD'), remark: '',
  status: 'draft', lines: [], createdAt: new Date().toISOString()
})

function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

function addLine() { doc.value.lines.push({ id: gId(), productId: '', boxQty: 0, qty: 0 }) }
function onBoxChange(row: TransferLine) {
  const p = products.value.find(p => p.id === row.productId)
  if (p) row.qty = row.boxQty * p.boxQty
}

async function saveDraft() { await saveTransfer(doc.value); ElMessage.success('草稿已保存') }

async function post() {
  if (!doc.value.fromWarehouseId || !doc.value.toWarehouseId) { ElMessage.error('请选择调出/调入仓'); return }
  if (doc.value.fromWarehouseId === doc.value.toWarehouseId) { ElMessage.error('调出和调入仓不能相同'); return }
  if (!doc.value.lines.length) { ElMessage.error('请添加明细'); return }
  await saveTransfer(doc.value)
  try {
    await postTransfer(doc.value.id)
    const list = await getTransfers()
    const u = list.find(d => d.id === doc.value.id)
    if (u) doc.value = u
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
  if (u) doc.value = u
  ElMessage.success('已作废并反冲库存')
}

onMounted(async () => {
  ;[warehouses.value, products.value] = await Promise.all([getWarehouses(), getProducts()])
  const id = route.params.id as string
  if (id && id !== 'new') {
    const list = await getTransfers()
    const found = list.find(d => d.id === id)
    if (found) doc.value = found
  }
})
</script>

<style scoped>
:deep(.el-table .cell) {
  padding: 4px 6px;
  overflow: visible;
}
</style>
