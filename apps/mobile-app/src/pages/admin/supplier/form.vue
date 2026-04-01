<template>
  <view class="page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">{{ form.id ? '编辑供应商' : '新增供应商' }}</text>
      <view style="width: 60rpx" />
    </view>
    <view class="content">
      <view class="section"><text class="label">编码</text><input v-model="form.code" placeholder="供应商编码" /></view>
      <view class="section"><text class="label">名称</text><input v-model="form.name" placeholder="供应商名称" /></view>
      <view class="section"><text class="label">联系人</text><input v-model="form.contact" placeholder="联系人" /></view>
      <view class="section"><text class="label">电话</text><input v-model="form.phone" placeholder="电话" /></view>
      <view class="actions">
        <button class="btn-save" @tap="submit">保存</button>
        <button class="btn-toggle" v-if="form.id" @tap="toggleStatus">{{ form.status === 'active' ? '停用' : '启用' }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSupplierDetail, saveSupplier, toggleSupplier } from '@/api'
import type { Supplier } from '@/types'
import { getPageQueryParam } from '@/utils'

const userStore = useUserStore()
const form = ref<Partial<Supplier>>({ status: 'active' })
const queryId = ref('')

function guard() {
  if (!userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.navigateBack()
    return false
  }
  return true
}

async function loadEdit(id: string) {
  const supplier = await getSupplierDetail(id)
  if (!supplier) return
  form.value = { ...supplier }
}

async function submit() {
  if (!form.value.code || !form.value.name) {
    uni.showToast({ title: '请填写编码和名称', icon: 'none' })
    return
  }
  await saveSupplier(form.value as any)
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 400)
}

async function toggleStatus() {
  if (!form.value.id) return
  await toggleSupplier(form.value.id)
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
  if (queryId.value) await loadEdit(queryId.value)
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
input { font-size:30rpx; }
.actions { display:flex; gap:12rpx; }
.btn-save { flex:1; height:88rpx; background:#1890ff; color:#fff; border-radius:44rpx; font-size:32rpx; border:none; }
.btn-toggle { flex:1; height:88rpx; background:#f0f0f0; color:#333; border-radius:44rpx; font-size:32rpx; border:none; }
</style>
