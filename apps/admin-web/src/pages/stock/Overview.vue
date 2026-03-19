<template>
  <div class="overview">
    <el-card class="header-card">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-size:16px;font-weight:600">仓库库存总览</span>
        <el-select v-model="warehouseId" style="width:200px" placeholder="选择仓库" @change="loadStock">
          <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
        <el-button @click="loadAll" :icon="RefreshIcon">刷新</el-button>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="card">卡片</el-radio-button>
          <el-radio-button value="table">表格</el-radio-button>
        </el-radio-group>
        <el-tag v-if="currentWarehouse" type="info">{{ currentWarehouse.name }}</el-tag>
      </div>
    </el-card>

    <!-- 卡片视图 -->
    <div v-if="viewMode==='card'" class="card-grid">
      <div v-if="!tableData.length" class="empty">暂无库存数据</div>
      <el-card
        v-for="item in tableData" :key="item.productId"
        class="stock-card"
        :class="{ zero: item.qty === 0, low: item.qty > 0 && item.qty <= 10 }"
        shadow="hover"
      >
        <div class="stock-name">{{ item.productName }}</div>
        <div class="stock-code">{{ item.productCode }}</div>
        <div class="stock-qty">
          <span class="qty-num">{{ item.qty }}</span>
          <span class="qty-unit">件</span>
        </div>
        <el-progress
          :percentage="calcPct(item.qty)"
          :color="progressColor(item.qty)"
          :stroke-width="8"
          :show-text="false"
          style="margin-top:10px"
        />
        <div class="stock-meta">
          <el-tag size="small" :type="item.qty===0?'danger':item.qty<=10?'warning':'success'">
            {{ item.qty===0 ? '缺货' : item.qty<=10 ? '库存偏低' : '库存正常' }}
          </el-tag>
          <span class="update-time">{{ fmtTime(item.updatedAt) }}</span>
        </div>
      </el-card>
    </div>

    <!-- 表格视图 -->
    <el-card v-else>
      <el-table :data="tableData" border stripe>
        <el-table-column prop="productCode" label="商品编码" width="120" />
        <el-table-column prop="productName" label="商品名称" />
        <el-table-column label="库存数量" width="200">
          <template #default="{row}">
            <div style="display:flex;align-items:center;gap:8px">
              <span :style="{color:row.qty===0?'#f56c6c':row.qty<=10?'#e6a23c':'#67c23a',fontWeight:700,minWidth:'40px'}">
                {{ row.qty }}
              </span>
              <el-progress :percentage="calcPct(row.qty)" :color="progressColor(row.qty)"
                :stroke-width="8" :show-text="false" style="flex:1" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="row.qty===0?'danger':row.qty<=10?'warning':'success'" size="small">
              {{ row.qty===0?'缺货':row.qty<=10?'偏低':'正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{row}">{{ fmtTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
      <div v-if="!tableData.length" style="text-align:center;padding:32px;color:#909399">暂无库存数据</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh as RefreshIcon } from '@element-plus/icons-vue'
import { getWarehouses, getStock } from '@/api/stock'
import { getProducts } from '@/api/product'
import type { Warehouse, Product } from '@/types'

const warehouses = ref<Warehouse[]>([])
const warehouseId = ref('main')
const products = ref<Product[]>([])
const tableData = ref<any[]>([])
const viewMode = ref<'card'|'table'>('card')

const currentWarehouse = computed(() => warehouses.value.find(w => w.id === warehouseId.value))

const maxQty = computed(() => Math.max(...tableData.value.map(i => i.qty), 1))

function calcPct(qty: number) {
  return Math.round((qty / maxQty.value) * 100)
}

function progressColor(qty: number) {
  if (qty === 0) return '#f56c6c'
  if (qty <= 10) return '#e6a23c'
  return '#67c23a'
}

function fmtTime(t?: string) {
  return t ? t.slice(0, 19).replace('T', ' ') : '-'
}

async function loadAll() {
  ;[warehouses.value, products.value] = await Promise.all([getWarehouses(), getProducts()])
  await loadStock()
}

async function loadStock() {
  const stock = await getStock(warehouseId.value)
  tableData.value = stock.map(s => {
    const p = products.value.find(p => p.id === s.productId)
    return { productId: s.productId, productCode: p?.code || s.productId, productName: p?.name || '-', qty: s.qty, updatedAt: s.updatedAt }
  })
}

onMounted(loadAll)
</script>

<style scoped>
.overview { display: flex; flex-direction: column; gap: 16px; }
.header-card :deep(.el-card__body) { padding: 12px 16px; }
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.stock-card { position: relative; cursor: default; }
.stock-card.zero { border-color: #f56c6c44; background: rgba(245,108,108,0.06); }
.stock-card.low { border-color: #e6a23c44; background: rgba(230,162,60,0.06); }
.stock-name { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
.stock-code { font-size: 12px; color: #909399; margin-bottom: 8px; }
.stock-qty { display: flex; align-items: baseline; gap: 4px; }
.qty-num { font-size: 36px; font-weight: 700; line-height: 1; color: #303133; }
.qty-unit { font-size: 13px; color: #909399; }
.stock-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.update-time { font-size: 11px; color: #c0c4cc; }
.empty { grid-column: 1/-1; text-align: center; padding: 48px; color: #909399; }
</style>
