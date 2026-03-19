<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>入库单列表</span>
          <el-button type="primary" @click="$router.push('/stock/inbound/new')">+ 新建入库单</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="code" label="单号" width="160" />
        <el-table-column label="厂家" width="150">
          <template #default="{row}">{{ supplierName(row.supplierId) }}</template>
        </el-table-column>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" />
        <el-table-column label="操作" width="120">
          <template #default="{row}">
            <el-button link type="primary" @click="$router.push('/stock/inbound/'+row.id)">查看/编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getInbounds } from '@/api/stock'
import { getSuppliers } from '@/api/supplier'
import type { InboundDoc, Supplier } from '@/types'

const list = ref<InboundDoc[]>([])
const suppliers = ref<Supplier[]>([])

function supplierName(id: string) { return suppliers.value.find(s => s.id === id)?.name || '-' }
function statusLabel(s: string) { return { draft:'草稿', posted:'已过账', voided:'已作废' }[s] || s }
function statusType(s: string) { return { draft:'info', posted:'success', voided:'danger' }[s] || '' }

async function load() {
  ;[list.value, suppliers.value] = await Promise.all([getInbounds(), getSuppliers()])
}
onMounted(load)
</script>
