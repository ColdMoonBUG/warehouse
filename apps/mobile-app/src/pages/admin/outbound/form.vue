<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '出库单详情' : '新增出库单' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="section">
        <text class="label">业务员</text>
        <picker mode="selector" :range="employees" range-key="name" @change="onEmployeeChange">
          <view class="picker"><text>{{ employeeName || '请选择业务员' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">出库仓库</text>
        <picker mode="selector" :range="warehouses" range-key="name" @change="onWarehouseChange">
          <view class="picker"><text>{{ warehouseName || '请选择仓库' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">日期</text>
        <input v-model="form.date" placeholder="YYYY-MM-DD" />
      </view>
      <view class="section">
        <text class="label">备注</text>
        <input v-model="form.remark" placeholder="备注" />
      </view>

      <view class="section">
        <text class="label">商品明细</text>
        <view class="line-card" v-for="(l, i) in lines" :key="i">
          <view class="line-head">
            <text class="line-title">明细 {{ i + 1 }}</text>
            <button class="btn-delete" @tap="removeLine(i)">删除</button>
          </view>
          <view class="field">
            <text class="field-label">商品</text>
            <picker mode="selector" :range="products" range-key="name" @change="(e)=>onProductChange(e,i)">
              <view class="field-box picker-box"><text>{{ productName(l.productId) || '请选择商品' }}</text></view>
            </picker>
          </view>
          <view class="field-grid">
            <view class="field">
              <text class="field-label">数量</text>
              <input class="field-box input-box" v-model.number="l.qty" type="number" placeholder="请输入数量" />
            </view>
            <view class="field">
              <text class="field-label">单价</text>
              <input class="field-box input-box" v-model.number="l.price" type="number" placeholder="请输入单价" />
            </view>
          </view>
        </view>
        <button class="btn-add-line" @tap="addLine">+ 添加一行</button>
      </view>

      <view class="actions">
        <button class="btn" @tap="save">保存</button>
        <button class="btn ghost" :disabled="!form.id || form.status!=='draft'" @tap="post">过账</button>
        <button class="btn danger" :disabled="!form.id || form.status!=='posted'" @tap="voidDoc">作废</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getOutboundDetail, saveOutbound, postOutbound, voidOutbound, getProducts, getWarehouses, getEmployees, getEmployeeDetail, getProductDetail } from '@/api'
import type { OutboundDoc, OutboundLine, Product, Warehouse, Employee } from '@/types'
import { formatDate, getPageQueryParam } from '@/utils'

const userStore = useUserStore()
const employees = ref<Employee[]>([])
const warehouses = ref<Warehouse[]>([])
const products = ref<Product[]>([])
const lines = ref<OutboundLine[]>([])
const form = ref<Partial<OutboundDoc>>({ date: formatDate(new Date(), 'YYYY-MM-DD'), status: 'draft' })
const queryId = ref('')

const employeeName = computed(() => employees.value.find(e => e.id === form.value.employeeId)?.name || '')
const warehouseName = computed(() => warehouses.value.find(w => w.id === form.value.warehouseId)?.name || '')

async function ensureEmployeeLoaded(id?: string) {
  if (!id || employees.value.some(e => e.id === id)) return
  const employee = await getEmployeeDetail(id)
  if (employee) employees.value = [...employees.value, employee]
}

async function ensureProductsLoaded(ids: string[]) {
  const missingIds = [...new Set(ids)].filter(id => id && !products.value.some(p => p.id === id))
  if (!missingIds.length) return
  const missingProducts = await Promise.all(missingIds.map(id => getProductDetail(id)))
  products.value = [...products.value, ...(missingProducts.filter(Boolean) as Product[])]
}

async function applyDoc(doc: OutboundDoc) {
  form.value = { ...doc }
  lines.value = doc.lines || []
  await Promise.all([
    ensureEmployeeLoaded(doc.employeeId),
    ensureProductsLoaded(lines.value.map(line => line.productId)),
  ])
}

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function addLine() {
  lines.value.push({ id: '', productId: '', qty: 1, price: 0 })
}

function removeLine(i: number) {
  lines.value.splice(i, 1)
}

function onEmployeeChange(e: any) {
  const idx = Number(e.detail.value)
  form.value.employeeId = employees.value[idx]?.id
}

function onWarehouseChange(e: any) {
  const idx = Number(e.detail.value)
  form.value.warehouseId = warehouses.value[idx]?.id
}

function onProductChange(e: any, i: number) {
  const idx = Number(e.detail.value)
  lines.value[i].productId = products.value[idx]?.id || ''
}

function productName(id: string) {
  return products.value.find(p => p.id === id)?.name || ''
}

async function loadEdit(id: string) {
  const doc = await getOutboundDetail(id)
  if (!doc) return
  await applyDoc(doc)
}

async function save() {
  if (!form.value.employeeId || !form.value.warehouseId) {
    uni.showToast({ title: '请选择业务员与仓库', icon: 'none' })
    return
  }
  if (lines.value.length === 0) {
    uni.showToast({ title: '请添加明细', icon: 'none' })
    return
  }
  await saveOutbound(form.value as OutboundDoc, lines.value)
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

async function post() {
  if (!form.value.id) return
  await postOutbound(form.value.id)
  const doc = await getOutboundDetail(form.value.id)
  if (doc) await applyDoc(doc)
  uni.showToast({ title: '已过账', icon: 'success' })
}

async function voidDoc() {
  if (!form.value.id) return
  await voidOutbound(form.value.id)
  const doc = await getOutboundDetail(form.value.id)
  if (doc) await applyDoc(doc)
  uni.showToast({ title: '已作废', icon: 'success' })
}

function goBack() {
  uni.navigateBack()
}

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  if (!guard()) return
  const [emps, whs, pros] = await Promise.all([getEmployees(), getWarehouses(), getProducts()])
  employees.value = emps
  warehouses.value = whs
  products.value = pros
  if (queryId.value) await loadEdit(queryId.value)
  if (lines.value.length === 0) addLine()
})
</script>

<style lang="scss" scoped>
.page { min-height:100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding:30rpx; }
.section { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.label { display:block; font-size:26rpx; color:#666; margin-bottom:10rpx; }
.picker { padding: 16rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:28rpx; margin-bottom: 12rpx; background:#fff; }
.line-card { background:#f8fafc; border:2rpx solid #eef2f7; border-radius:16rpx; padding:20rpx; margin-bottom:20rpx; }
.line-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16rpx; }
.line-title { font-size:26rpx; font-weight:600; color:#333; }
.field { margin-bottom:16rpx; }
.field:last-child { margin-bottom:0; }
.field-label { display:block; font-size:24rpx; color:#666; margin-bottom:10rpx; }
.field-grid { display:flex; flex-wrap:wrap; gap:16rpx; }
.field-grid .field { flex:1; min-width:240rpx; }
.field-grid-single { display:block; }
.field-box { width:100%; min-height:80rpx; box-sizing:border-box; background:#fff; border:2rpx solid #dbe3ee; border-radius:12rpx; padding:0 20rpx; font-size:28rpx; color:#333; display:flex; align-items:center; }
.picker-box text { width:100%; color:#333; }
.input-box { display:block; padding:0 20rpx; line-height:80rpx; margin-bottom:0; }
input { font-size:28rpx; margin-bottom: 10rpx; }
.btn-delete { min-width:108rpx; height:60rpx; padding:0 20rpx; background:#fff1f0; color:#ff4d4f; border-radius:999rpx; font-size:24rpx; line-height:60rpx; border:none; }
.btn-delete::after { border:none; }
.btn-add-line { width:100%; height:80rpx; background:#eef6ff; color:#1890ff; border-radius:12rpx; font-size:28rpx; border:2rpx dashed #b5d4ff; }
.btn-add-line::after { border:none; }
.actions { display:flex; gap:12rpx; }
.btn { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:30rpx; border:none; }
.btn.ghost { background:#f0f0f0; color:#333; }
.btn.danger { background:#ff4d4f; }
</style>
