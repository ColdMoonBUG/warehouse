<template>
  <div class="page">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="系统维护"
      description="测试模式下所有仓库按无限库存处理；车库无限模式下仅车库无限库存，主仓/退货仓正常校验。进入正式模式前，请先清库并重建标准仓库。"
      style="margin-bottom: 16px"
    />

    <el-card shadow="hover" class="status-card">
      <template #header>
        <div class="card-head">
          <i class="ri-settings-3-line" />
          <span>运行状态</span>
        </div>
      </template>
      <div class="status-grid">
        <div class="status-item">
          <div class="label">当前模式</div>
          <el-tag :type="state.mode === 'TEST' ? 'warning' : state.mode === 'VEHICLE_UNLIMITED' ? '' : 'success'">
            {{ state.mode === 'TEST' ? '测试模式' : state.mode === 'VEHICLE_UNLIMITED' ? '车库无限模式' : '正式模式' }}
          </el-tag>
        </div>
        <div class="status-item">
          <div class="label">最近切换</div>
          <div>{{ state.updatedAt || '-' }} {{ state.updatedBy ? ` / ${state.updatedBy}` : '' }}</div>
        </div>
        <div class="status-item">
          <div class="label">最近清库</div>
          <div>{{ state.lastResetAt || '-' }} {{ state.lastResetBy ? ` / ${state.lastResetBy}` : '' }}</div>
        </div>
      </div>
      <div class="action-row">
        <el-button @click="loadState">刷新状态</el-button>
        <el-button type="warning" :loading="switchingTest" @click="doSwitchTest">开启测试模式</el-button>
        <el-button type="primary" :loading="switchingVehicle" @click="doSwitchVehicleUnlimited">车库无限模式</el-button>
        <el-button type="success" :loading="switchingLive" @click="doSwitchLive">进入正式模式</el-button>
      </div>
    </el-card>

    <!-- 初始化模式 -->
    <el-card shadow="hover" class="init-card">
      <template #header>
        <div class="card-head init">
          <i class="ri-loader-line" />
          <span>初始化模式（盘点专用）</span>
          <el-tag :type="state.initMode ? 'warning' : 'info'" style="margin-left:8px">
            {{ state.initMode ? '已开启' : '已关闭' }}
          </el-tag>
        </div>
      </template>
      <p class="desc">开启后，出库单过账时<b>只给目标仓库增加库存，不扣来源仓库</b>。</p>
      <p class="keep" style="color:#e6a23c">专用于初始盘点：主仓库已初始化完毕，直接把车库货物数量通过出库单写入车库，不影响主仓库存。</p>
      <p class="keep">完成后务必关闭，否则所有出库单都会只加不扣！</p>
      <div class="action-row">
        <el-button type="warning" :loading="togglingInit" @click="doEnableInit" :disabled="!!state.initMode">开启初始化模式</el-button>
        <el-button type="success" :loading="togglingInit" @click="doDisableInit" :disabled="!state.initMode">关闭初始化模式</el-button>
      </div>
    </el-card>

    <el-card shadow="hover" class="danger-card">
      <template #header>
        <div class="card-head danger">
          <i class="ri-delete-bin-line" />
          <span>清库并重建标准仓库</span>
        </div>
      </template>
      <p class="desc">将永久删除销单、退单、入库、出库、调拨、库存、台账、提成及仓库数据，操作不可恢复。</p>
      <p class="keep">保留：超市 / 商品 / 供应商 / 账户 / 静态配置</p>
      <el-button type="danger" :loading="resetting" @click="doReset" size="large">清库并重建标准仓库</el-button>
      <div v-if="resetResult" class="result">
        <div>共删除：<b>{{ resetResult.deletedRows }}</b> 行</div>
        <div>重建仓库：<b>{{ resetResult.rebuiltWarehouses }}</b> 个</div>
        <el-collapse style="margin-top:8px">
          <el-collapse-item title="各表删除明细">
            <div v-for="(rows, tbl) in resetResult.tableRows" :key="tbl" class="row-detail">
              <span>{{ tbl }}</span><span>{{ rows }}</span>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-card>

    <!-- 仅清库存（保留销单退单） -->
    <el-card shadow="hover" class="danger-card">
      <template #header>
        <div class="card-head warning">
          <i class="ri-archive-line" />
          <span>仅清库存（保留销退单）</span>
        </div>
      </template>
      <p class="desc">清除：入库单、出库单（调拨）、台账、库存数据。</p>
      <p class="keep">保留：销单 / 退单 / 提成记录 / 结清记录 / 超市 / 商品 / 账户</p>
      <p class="keep" style="color:#e6a23c">适合盘点重置库存，不影响历史销售记录。</p>
      <el-button type="warning" :loading="resetStockOnlyLoading" @click="doResetStockOnly" size="large">仅清库存并重置</el-button>
      <div v-if="resetStockOnlyResult" class="result">
        <div>共删除：<b>{{ resetStockOnlyResult.deletedRows }}</b> 行</div>
        <div style="color:#67c23a">{{ resetStockOnlyResult.note }}</div>
        <el-collapse style="margin-top:8px">
          <el-collapse-item title="各表删除明细">
            <div v-for="(rows, tbl) in resetStockOnlyResult.tableRows" :key="tbl" class="row-detail">
              <span>{{ tbl }}</span><span>{{ rows }}</span>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getMaintenanceState,
  resetBusinessData,
  resetStockOnly,
  enableInitMode,
  disableInitMode,
  switchToLiveMode,
  switchToTestMode,
  switchToVehicleUnlimitedMode,
  type MaintenanceState,
  type ResetBusinessResult,
} from '@/api/maintenance'

const state = reactive<MaintenanceState>({ mode: 'LIVE' })
const resetting = ref(false)
const switchingTest = ref(false)
const switchingLive = ref(false)
const switchingVehicle = ref(false)
const togglingInit = ref(false)
const resetResult = ref<ResetBusinessResult | null>(null)
const resetStockOnlyLoading = ref(false)
const resetStockOnlyResult = ref<any>(null)

async function loadState() {
  const next = await getMaintenanceState()
  Object.assign(state, next)
}

async function doSwitchTest() {
  try {
    switchingTest.value = true
    Object.assign(state, await switchToTestMode())
    ElMessage.success('已切换为测试模式')
  } catch (e: any) {
    ElMessage.error(e?.message || '切换失败')
  } finally {
    switchingTest.value = false
  }
}

async function doSwitchLive() {
  try {
    await ElMessageBox.confirm(
      '正式模式下会恢复真实库存校验。若尚未完成清库和重新盘点，请勿切换。',
      '确认进入正式模式',
      { type: 'warning', confirmButtonText: '确认进入', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    switchingLive.value = true
    Object.assign(state, await switchToLiveMode())
    ElMessage.success('已切换为正式模式')
  } catch (e: any) {
    ElMessage.error(e?.message || '切换失败')
  } finally {
    switchingLive.value = false
  }
}

async function doSwitchVehicleUnlimited() {
  try {
    switchingVehicle.value = true
    Object.assign(state, await switchToVehicleUnlimitedMode())
    ElMessage.success('已切换为车库无限模式：车库无限库存，主仓/退货仓正常校验')
  } catch (e: any) {
    ElMessage.error(e?.message || '切换失败')
  } finally {
    switchingVehicle.value = false
  }
}

async function doReset() {
  try {
    const { value } = await ElMessageBox.prompt(
      '将永久删除销单、退单、入库、出库、调拨、库存、台账、提成及仓库数据。\n\n请输入“确认清库”继续：',
      '确认清库并重建标准仓库',
      {
        type: 'warning',
        confirmButtonText: '执行',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入 确认清库',
      }
    )
    if (value !== '确认清库') {
      ElMessage.error('确认词不正确')
      return
    }
  } catch {
    return
  }

  try {
    resetting.value = true
    const res = await resetBusinessData()
    resetResult.value = res
    Object.assign(state, res.state)
    ElMessage.success(`已清库 ${res.deletedRows} 行，并重建 ${res.rebuiltWarehouses} 个标准仓库`)
  } catch (e: any) {
    ElMessage.error(e?.message || '清库失败')
  } finally {
    resetting.value = false
  }
}

async function doEnableInit() {
  try {
    togglingInit.value = true
    Object.assign(state, await enableInitMode())
    ElMessage.warning('初始化模式已开启，出库单过账只加目标仓，不扣来源仓')
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    togglingInit.value = false
  }
}

async function doDisableInit() {
  try {
    togglingInit.value = true
    Object.assign(state, await disableInitMode())
    ElMessage.success('初始化模式已关闭，出库单恢复正常双向扣减')
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    togglingInit.value = false
  }
}

async function doResetStockOnly() {
  try {
    const { value } = await ElMessageBox.prompt(
      '将清除入库单、出库单、台账、库存数据，销单退单提成记录保留。\n\n请输入"确认清库存"继续：',
      '确认仅清库存',
      {
        type: 'warning',
        confirmButtonText: '执行',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入 确认清库存',
      }
    )
    if (value !== '确认清库存') { ElMessage.error('确认词不正确'); return }
  } catch { return }
  try {
    resetStockOnlyLoading.value = true
    const res = await resetStockOnly()
    resetStockOnlyResult.value = res
    Object.assign(state, res.state)
    ElMessage.success(`已清库存 ${res.deletedRows} 行，销退单记录已保留`)
  } catch (e: any) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    resetStockOnlyLoading.value = false
  }
}

onMounted(loadState)
</script>

<style scoped>
.page { padding: 8px; }
.status-card,
.danger-card { margin-bottom: 16px; }
.card-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.card-head i { font-size: 18px; }
.card-head.danger { color: #f56c6c; }
.card-head.warning { color: #e6a23c; }
.card-head.init { color: #409eff; }
.init-card { margin-bottom: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px; }
.status-item { padding: 12px; background: var(--el-fill-color-light); border-radius: 6px; }
.label { color: #909399; font-size: 12px; margin-bottom: 6px; }
.action-row { display: flex; gap: 12px; flex-wrap: wrap; }
.desc { color: #606266; font-size: 13px; line-height: 1.6; margin: 0 0 12px; }
.keep { color: #67c23a; font-size: 12px; margin: -6px 0 12px; }
.result { margin-top: 16px; padding: 12px; background: var(--el-fill-color-light); border-radius: 6px; font-size: 13px; line-height: 1.8; }
.row-detail { display: flex; justify-content: space-between; font-family: monospace; font-size: 12px; padding: 2px 0; }
</style>
