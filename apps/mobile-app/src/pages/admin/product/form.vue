<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '编辑商品' : '新增商品' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="section">
        <text class="label">商品图片</text>
        <view class="image-row">
          <image v-if="previewUrl" :src="previewUrl" class="thumb" mode="aspectFill" />
          <view v-else class="thumb placeholder">暂无图片</view>
          <button class="btn" @tap="takePhoto">拍照</button>
        </view>
      </view>

      <view class="section">
        <text class="label">编码</text>
        <input v-model="form.code" placeholder="商品编码" />
      </view>
      <view class="section">
        <text class="label">名称</text>
        <input v-model="form.name" placeholder="商品名称" />
      </view>
      <view class="section">
        <text class="label">条形码</text>
        <input v-model="form.barcode" placeholder="条形码" />
      </view>
      <view class="section">
        <text class="label">供应商</text>
        <picker mode="selector" :range="suppliers" range-key="name" @change="onSupplierChange">
          <view class="picker"><text>{{ supplierName || '请选择供应商' }}</text></view>
        </picker>
      </view>
      <view class="section">
        <text class="label">基础单位</text>
        <view class="picker"><text>袋</text></view>
      </view>
      <view class="section">
        <text class="label">每箱袋数</text>
        <input v-model.number="form.boxQty" type="number" placeholder="请输入每箱袋数" />
      </view>
      <view class="section">
        <text class="label">保质期(天)</text>
        <input v-model.number="form.shelfDays" type="number" placeholder="保质期" />
      </view>
      <view class="section">
        <text class="label">进价</text>
        <input v-model.number="form.purchasePrice" type="number" placeholder="进价" />
      </view>
      <view class="section">
        <text class="label">售价</text>
        <input v-model.number="form.salePrice" type="number" placeholder="售价" />
      </view>

      <view class="actions">
        <button class="btn-save" @tap="submit">保存</button>
        <button class="btn-toggle" v-if="form.id" @tap="toggleStatus">{{ form.status === 'active' ? '停用' : '启用' }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getProductDetail, saveProduct, getSuppliers, uploadFile, getImageUrl, toggleProduct } from '@/api'
import type { Product, Supplier } from '@/types'
import { getPageQueryParam, normalizeBoxPackQty } from '@/utils'

const userStore = useUserStore()
const suppliers = ref<Supplier[]>([])
const form = ref<Partial<Product>>({ unit: '袋', boxQty: 1, shelfDays: 365 })
const previewUrl = ref('')
const uploading = ref(false)
const supplierName = computed(() => suppliers.value.find(s => s.id === form.value.supplierId)?.name || '')
const queryId = ref('')

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

function onSupplierChange(e: any) {
  const idx = Number(e.detail.value)
  form.value.supplierId = suppliers.value[idx]?.id
}

async function loadEdit(id: string) {
  const product = await getProductDetail(id)
  if (!product) return
  form.value = {
    ...product,
    unit: '袋',
    boxQty: normalizeBoxPackQty(product.boxQty),
  }
  if (product.imageUrl) previewUrl.value = getImageUrl(product.imageUrl)
}

async function takePhoto() {
  try {
    const res = await uni.chooseImage({ count: 1, sourceType: ['camera'] })
    const path = res.tempFilePaths?.[0]
    if (!path) return
    previewUrl.value = path
    uploading.value = true
    uni.showLoading({ title: '上传中', mask: true })
    const uploaded = await uploadFile(path)
    form.value.imageUrl = uploaded.path
    previewUrl.value = getImageUrl(uploaded.path)
    uni.showToast({ title: '上传成功', icon: 'success' })
  } catch (e: any) {
    uni.showToast({ title: e?.message || '上传失败', icon: 'none' })
  } finally {
    uploading.value = false
    uni.hideLoading()
  }
}

async function submit() {
  if (!form.value.code || !form.value.name) {
    uni.showToast({ title: '请填写编码和名称', icon: 'none' })
    return
  }
  if (uploading.value) {
    uni.showToast({ title: '图片上传中', icon: 'none' })
    return
  }
  form.value.unit = '袋'
  form.value.boxQty = normalizeBoxPackQty(form.value.boxQty)
  await saveProduct(form.value as any)
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

async function toggleStatus() {
  if (!form.value.id) return
  await toggleProduct(form.value.id)
  form.value.status = form.value.status === 'active' ? 'inactive' : 'active'
}

function goBack() {
  uni.navigateBack()
}

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  if (!guard()) return
  suppliers.value = await getSuppliers()
  if (queryId.value) await loadEdit(queryId.value)
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background:#f5f5f5; }
.header { display:flex; align-items:center; justify-content:space-between; background:#fff; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:36rpx; font-weight:600; color:#333; }
.content { padding: 30rpx; }
.section { background:#fff; border-radius:16rpx; padding:20rpx; margin-bottom:16rpx; }
.label { display:block; font-size:26rpx; color:#666; margin-bottom:10rpx; }
input { font-size:30rpx; }
.picker { padding: 20rpx; border:2rpx solid #eee; border-radius:12rpx; font-size:30rpx; color:#333; }
.image-row { display:flex; align-items:center; gap:16rpx; }
.thumb { width:120rpx; height:120rpx; border-radius:12rpx; }
.placeholder { display:flex; align-items:center; justify-content:center; color:#999; background:#fafafa; border:1rpx dashed #ddd; }
.btn { height:68rpx; padding:0 24rpx; background:#1890ff; color:#fff; border-radius:34rpx; }
.actions { display:flex; gap:12rpx; }
.btn-save { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:32rpx; border:none; }
.btn-toggle { flex:1; height:88rpx; background:#f0f0f0; color:#333; border-radius:44rpx; font-size:32rpx; border:none; }
</style>
