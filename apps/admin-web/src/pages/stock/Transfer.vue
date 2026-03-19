<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>出库单列表</span>
          <el-button type="primary" @click="$router.push('/stock/transfer/new')">+ 新建出库单</el-button>
        </div>
      </template>
      <el-table :data="list" border stripe>
        <el-table-column prop="code" label="单号" width="160" />
        <el-table-column label="调出仓" width="150">
          <template #default="{row}">{{ whName(row.fromWarehouseId) }}</template>
        </el-table-column>
        <el-table-column label="调入仓" width="150">
          <template #default="{row}">{{ whName(row.toWarehouseId) }}</template>
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
            <el-button link type="primary" @click="$router.push('/stock/transfer/'+row.id)">查看/编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getTransfers, getWarehouses } from '@/api/stock'
import type { TransferDoc, Warehouse } from '@/types'

const list = ref<TransferDoc[]>([])
const warehouses = ref<Warehouse[]>([])

function whName(id: string) { return warehouses.value.find(w => w.id === id)?.name || id }
function statusLabel(s: string) { return ({draft:'草稿',posted:'已过账',voided:'已作废'} as any)[s]||s }
function statusType(s: string) { return ({draft:'info',posted:'success',voided:'danger'} as any)[s]||'' }

async function load() {
  ;[list.value, warehouses.value] = await Promise.all([getTransfers(), getWarehouses()])
}
onMounted(load)
</script>
