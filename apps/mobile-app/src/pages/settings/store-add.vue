<template>
  <view class="store-add-page">
    <view class="header">
      <text class="title">{{ isEdit ? '编辑超市' : '新增超市' }}</text>
    </view>

    <view class="content">
      <view class="form-item">
        <text class="label">名称</text>
        <input v-model="form.name" placeholder="请输入超市名称" />
      </view>
      <view class="form-item">
        <text class="label">地址</text>
        <input v-model="form.address" placeholder="请选择位置" />
      </view>
      <view class="form-item">
        <text class="label">位置</text>
        <view class="picker" @tap="goPickLocation">
          <text>{{ form.lat && form.lng ? '已选择位置' : '地图选点' }}</text>
        </view>
      </view>
      <view class="form-item">
        <text class="label">业务员</text>
        <picker mode="selector" :range="employees" range-key="name" @change="onEmployeeChange">
          <view class="picker"><text>{{ selectedEmployee?.name || '请选择业务员' }}</text></view>
        </picker>
      </view>
      <button class="btn" @tap="submit">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { saveStore, getStoresAll, getEmployees } from '@/api'
import type { Store, Employee } from '@/types'
import { getPageQueryParam } from '@/utils'

const userStore = useUserStore()
const form = ref({ id: '', name: '', address: '', lat: '', lng: '', defaultEmployeeId: '', status: 'active' as Store['status'] })
const employees = ref<Employee[]>([])
const selectedEmployee = ref<Employee | null>(null)
const queryId = ref('')
const isEdit = computed(() => !!form.value.id || !!queryId.value)

function onEmployeeChange(e: any) {
  const idx = Number(e.detail.value)
  selectedEmployee.value = employees.value[idx] || null
  form.value.defaultEmployeeId = selectedEmployee.value?.id || ''
}

function goPickLocation() {
  uni.navigateTo({
    url: '/pages/map/pick',
    success: (res) => {
      res.eventChannel.on('picked', (data: any) => {
        if (data?.name) form.value.name = data.name
        if (data?.address) form.value.address = data.address
        if (data?.lat != null) form.value.lat = String(data.lat)
        if (data?.lng != null) form.value.lng = String(data.lng)
      })
    },
  })
}

function ensureLocation() {
  if (!form.value.lat || !form.value.lng) {
    uni.showToast({ title: '请选择位置', icon: 'none' })
    return false
  }
  return true
}

async function loadEdit(id: string) {
  const list = await getStoresAll()
  const store = list.find(s => s.id === id)
  if (!store) return
  form.value = {
    id: store.id,
    name: store.name,
    address: store.address || '',
    lat: store.lat != null ? String(store.lat) : '',
    lng: store.lng != null ? String(store.lng) : '',
    defaultEmployeeId: store.defaultEmployeeId || '',
    status: store.status || 'active',
  }
  if (form.value.defaultEmployeeId) {
    selectedEmployee.value = employees.value.find(e => e.id === form.value.defaultEmployeeId) || null
  }
}

async function submit() {
  if (!form.value.name.trim()) {
    uni.showToast({ title: '请输入名称', icon: 'none' })
    return
  }
  if (!ensureLocation()) return
  await saveStore({
    id: form.value.id || undefined,
    name: form.value.name,
    code: form.value.name,
    address: form.value.address,
    lat: form.value.lat ? Number(form.value.lat) : undefined,
    lng: form.value.lng ? Number(form.value.lng) : undefined,
    status: form.value.status,
    defaultEmployeeId: form.value.defaultEmployeeId || undefined,
  })
  uni.showToast({ title: '保存成功', icon: 'success' })
  setTimeout(() => {
    uni.navigateBack()
  }, 400)
}

onLoad((query) => {
  queryId.value = query?.id || getPageQueryParam('id')
})

onMounted(async () => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  if (queryId.value && !userStore.isAdmin) {
    uni.showToast({ title: '无权限', icon: 'none' })
    uni.reLaunch({ url: '/pages/settings/index' })
    return
  }
  employees.value = await getEmployees()
  if (queryId.value) {
    await loadEdit(queryId.value)
  } else if (userStore.currentUser?.employeeId) {
    selectedEmployee.value = employees.value.find(e => e.id === userStore.currentUser?.employeeId) || null
    form.value.defaultEmployeeId = selectedEmployee.value?.id || ''
  }
})
</script>

<style lang="scss" scoped>
.store-add-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  background: #fff;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));

  .title {
    font-size: 36rpx;
    font-weight: 600;
    color: #333;
  }
}

.content {
  padding: 30rpx;
}

.form-item {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;

  .label {
    display: block;
    font-size: 26rpx;
    color: #666;
    margin-bottom: 10rpx;
  }

  input {
    font-size: 30rpx;
  }

  .picker {
    padding: 20rpx;
    border: 2rpx solid #eee;
    border-radius: 12rpx;
    font-size: 30rpx;
  }
}

.btn {
  width: 100%;
  height: 88rpx;
  background: #1890ff;
  color: #fff;
  font-size: 32rpx;
  border-radius: 44rpx;
  border: none;
}
</style>
