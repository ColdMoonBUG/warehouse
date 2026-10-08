<template>
  <el-card style="margin-top: 16px">
    <template #header>按日期查询工资（提成）</template>
    <div class="filters">
      <el-select v-model="accountId" placeholder="选择账户" filterable style="width: 200px" :disabled="loading">
        <el-option v-for="a in accounts" :key="a.salespersonId" :label="a.salespersonName" :value="a.salespersonId" />
      </el-select>
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" :disabled="loading" />
      <el-button type="primary" :loading="loading" @click="query">查询工资</el-button>
    </div>
    <p>按单据日期统计，包含已结清、未结清提成及作废冲销；不含底薪等未录入系统的工资项目。</p>
    <template v-if="result">
      <p>{{ result.label }}：{{ result.undated.length ? '已确认日期的提成小计' : '工资合计' }} <b>¥{{ (result.total / 100).toFixed(2) }}</b></p>
      <el-alert v-if="result.undated.length" type="warning" :closable="false" show-icon
        :title="`该账户有 ${result.undated.length} 笔历史流水无法确认单据日期，净额 ¥${(result.undatedTotal / 100).toFixed(2)}。未计入上述小计，当前结果不是完整期间工资。`"
        description="以下待核对流水来自该账户全部历史，无法判断是否属于所选日期范围；流水发生时间和结清时间不作为单据日期。" />
      <el-table :data="result.rows" border max-height="400" show-summary>
        <el-table-column prop="date" label="日期" />
        <el-table-column prop="sale" label="销售净提成（元）" />
        <el-table-column prop="returns" label="退货净提成（元）" />
        <el-table-column prop="total" label="工资合计（元）" />
      </el-table>
      <el-collapse v-if="result.undated.length" style="margin-top: 12px">
        <el-collapse-item title="缺少单据日期的历史流水（待核对）" name="undated">
          <el-table :data="result.undated" border max-height="300">
            <el-table-column prop="docId" label="单据 ID" min-width="180" />
            <el-table-column prop="bizType" label="流水类型" width="120" />
            <el-table-column prop="createdAt" label="流水发生时间（非单据日期）" min-width="200" />
            <el-table-column label="提成（元）" width="120">
              <template #default="{ row }">{{ Number(row.commissionAmount || 0).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </template>
  </el-card>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getWage } from '@/api/finance'
import { monthRange } from '@/utils/reporting'
import type { CommissionSummary, CommissionLedger } from '@/types'
const props = defineProps<{ accounts: CommissionSummary[] }>()
const accountId = ref('')
const range = ref<[string, string] | null>(monthRange())
const loading = ref(false)
const result = ref<{ label: string; total: number; undated: CommissionLedger[]; undatedTotal: number; rows: { date: string; sale: number; returns: number; total: number }[] } | null>(null)
// 按单据日期归集提成在后端完成（流水关联原单日期），不再把全部销单/退单拉到浏览器里拼。
async function query() {
  if (!accountId.value || !range.value) return void ElMessage.warning('请选择账户和日期范围')
  const id = accountId.value
  const dates: [string, string] = [...range.value]
  loading.value = true
  result.value = null
  try {
    const wage = await getWage(id, dates[0], dates[1])
    result.value = {
      label: `${props.accounts.find(a => a.salespersonId === id)?.salespersonName || id} · ${dates.join(' 至 ')}`,
      total: Number(wage.total) || 0,
      undated: wage.undated || [],
      undatedTotal: Number(wage.undatedTotal) || 0,
      rows: (wage.rows || []).map(r => ({ date: r.date, sale: Number(r.sale), returns: Number(r.returns), total: Number(r.total) })),
    }
  } catch (e: any) { ElMessage.error(e.message || '工资查询失败') }
  finally { loading.value = false }
}
</script>
<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; }
p { font-size: 13px; }
</style>
