<template>
  <div class="overview">
    <el-card class="header-card">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-size:16px;font-weight:600">仓库库存总览</span>
        <el-select v-model="warehouseId" style="width:200px" placeholder="选择仓库" @change="loadStock">
          <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
        </el-select>
        <el-button @click="loadAll" :icon="RefreshIcon">刷新</el-button>
        <el-select v-model="sortKey" style="width:180px" placeholder="排序" @change="sortData">
          <el-option label="库存从多到少" value="qty_desc" />
          <el-option label="更新时间新→旧" value="time_desc" />
          <el-option label="更新时间旧→新" value="time_asc" />
        </el-select>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="card">卡片</el-radio-button>
          <el-radio-button value="table">表格</el-radio-button>
        </el-radio-group>
        <el-tag v-if="currentWarehouse" type="info">{{ currentWarehouse.name }}</el-tag>
      </div>
    </el-card>



    <el-card class="chart-card">
      <div class="chart-header">商品库存分布</div>
      <div v-if="!pieData.length" class="chart-empty">暂无数据</div>
      <div v-else class="chart-wrap">
        <div class="pie-wrap">
          <svg class="pie" viewBox="0 0 120 120">
            <g transform="translate(60,60)">
              <path v-for="seg in pieData" :key="seg.name"
                :d="seg.path" :fill="seg.color" stroke="rgba(255,255,255,0.7)" stroke-width="1" />
            </g>
          </svg>
          <div class="pie-legend">
            <div v-for="seg in pieData" :key="seg.name" class="pie-legend-item">
              <span class="pie-dot" :style="{ background: seg.color }" />
              <span class="pie-text">{{ seg.name }}</span>
            </div>
          </div>
        </div>
        <div class="bar-panel">
          <div class="bar-title">累计进货排行（占位：当前库存）</div>
          <div class="bar-list">
            <div v-for="item in barData" :key="item.productId" class="bar-item">
              <span class="bar-name">{{ item.productName }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: barPct(item.qty) + '%' }" />
              </div>
              <span class="bar-val">{{ item.qty }}</span>
            </div>
          </div>
        </div>
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
        <div class="stock-icon">
          <el-image v-if="item.imageUrl" :src="getImageUrl(item.imageUrl)" class="stock-image" fit="cover">
            <template #error>
              <div class="stock-icon-placeholder" v-html="productIcon" />
            </template>
          </el-image>
          <div v-else class="stock-icon-placeholder" v-html="productIcon" />
        </div>
        <div class="stock-name">{{ item.productName }}</div>
        <div class="stock-code">{{ item.productCode }}</div>
        <div class="stock-qty">
          <span class="qty-num">{{ item.qty }}</span>
          <span class="qty-unit">袋</span>
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
        <el-table-column label="库存袋数" width="200">
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
import { getImageUrl } from '@/api/upload'
import type { Warehouse, Product } from '@/types'

const warehouses = ref<Warehouse[]>([])
const warehouseId = ref('main')
const products = ref<Product[]>([])
const tableData = ref<any[]>([])
const viewMode = ref<'card'|'table'>('card')
const sortKey = ref<'qty_desc'|'time_desc'|'time_asc'>('qty_desc')

const productIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="8" y="10" width="48" height="44" rx="8" fill="#e0f2fe" />
  <path d="M16 28l16-10 16 10v18H16z" fill="#38bdf8" />
  <rect x="24" y="36" width="16" height="10" rx="2" fill="#0ea5e9" />
</svg>`

const currentWarehouse = computed(() => warehouses.value.find(w => w.id === warehouseId.value))

const maxQty = computed(() => Math.max(...tableData.value.map(i => i.qty), 1))

const pieData = computed(() => {
  const items = tableData.value.filter(i => i.qty > 0)
  if (!items.length) return []
  const top = [...items].sort((a, b) => b.qty - a.qty).slice(0, 10)
  const total = top.reduce((s, i) => s + i.qty, 0)
  if (total <= 0) return []
  const colors = ['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#fb7185','#22d3ee','#f97316','#4ade80','#facc15']
  let acc = 0
  return top.map((i, idx) => {
    const pct = +(i.qty / total * 100).toFixed(1)
    const start = acc
    const end = acc + i.qty
    acc = end
    const startAngle = (start / total) * Math.PI * 2
    const endAngle = (end / total) * Math.PI * 2
    const r = 48
    const x1 = Math.cos(startAngle) * r
    const y1 = Math.sin(startAngle) * r
    const x2 = Math.cos(endAngle) * r
    const y2 = Math.sin(endAngle) * r
    const large = endAngle - startAngle > Math.PI ? 1 : 0
    const path = `M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
    const name = i.productName || '-'
    return {
      name,
      qty: i.qty,
      pct,
      color: colors[idx % colors.length],
      path
    }
  })
})

const barData = computed(() => {
  const list = [...tableData.value]
  list.sort((a, b) => b.qty - a.qty)
  return list.slice(0, 10)
})

const barMax = computed(() => Math.max(...barData.value.map(i => i.qty), 1))

function sortData() {
  const list = [...tableData.value]
  if (sortKey.value === 'qty_desc') {
    list.sort((a, b) => b.qty - a.qty)
  } else if (sortKey.value === 'time_desc') {
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  } else {
    list.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
  }
  tableData.value = list
}

function barPct(qty: number) {
  return Math.round((qty / barMax.value) * 100)
}

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
    return {
      productId: s.productId,
      productCode: p?.code || s.productId,
      productName: p?.name || '-',
      imageUrl: p?.imageUrl || '',
      qty: s.qty,
      updatedAt: s.updatedAt
    }
  })
  sortData()
}

onMounted(loadAll)
</script>

<style scoped>
.overview { display: flex; flex-direction: column; gap: 16px; }
.header-card :deep(.el-card__body) { padding: 12px 16px; }
.chart-card :deep(.el-card__body) { padding: 12px 16px; }
.chart-header { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #303133; }
.chart-wrap { display: flex; align-items: center; justify-content: flex-start; gap: 16px; }
.pie-wrap { display: flex; align-items: flex-end; gap: 8px; }
.pie-legend { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #606266; }
.pie-legend-item { display: flex; align-items: center; gap: 6px; }
.pie-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pie-text { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-panel { flex: 1; min-width: 260px; border-left: 1px solid #ebeef5; padding-left: 16px; }
.bar-title { font-size: 12px; color: #909399; margin-bottom: 8px; }
.bar-list { max-height: 220px; overflow-y: auto; padding-right: 6px; }
.bar-item { display: grid; grid-template-columns: 120px 1fr 48px; align-items: center; gap: 8px; margin-bottom: 8px; }
.bar-name { font-size: 12px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 8px; background: #f2f3f5; border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #34d399); }
.bar-val { font-size: 12px; color: #606266; text-align: right; }
.chart-empty { text-align: center; padding: 24px; color: #909399; }
.pie { width: 240px; height: 240px; display: block; }
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.stock-card { position: relative; cursor: default; }
.stock-icon {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 56px;
  height: 56px;
  opacity: 0.9;
}
.stock-image {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 8px;
  overflow: hidden;
}
.stock-icon-placeholder {
  width: 100%;
  height: 100%;
}
.stock-icon-placeholder :deep(svg) { width: 100%; height: 100%; display: block; }
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
