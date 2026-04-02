<template>
  <view class="settings-page">
    <view class="header">
      <text class="title">设置</text>
    </view>

    <view class="content">
      <!-- 用户信息 -->
      <view class="user-card" v-if="currentUser">
        <view class="avatar">{{ currentUser.displayName?.charAt(0) || '?' }}</view>
        <view class="info">
          <text class="name">{{ currentUser.displayName }}</text>
          <text class="role">{{ currentUser.role === 'admin' ? '管理员' : '业务员' }}</text>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" v-if="isAdmin" @tap="goStoreList">
          <text class="menu-text">门店管理</text>
        </view>
        <view class="menu-item" v-if="!isAdmin" @tap="goStoreAdd">
          <text class="menu-text">新增超市</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goProduct">
          <text class="menu-text">商品管理</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goSupplier">
          <text class="menu-text">供应商管理</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goStock">
          <text class="menu-text">库存查询</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goInbound">
          <text class="menu-text">入库单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goOutbound">
          <text class="menu-text">出库单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goTransfer">
          <text class="menu-text">调拨单</text>
        </view>
        <view class="menu-item" v-if="isAdmin" @tap="goAccount">
          <text class="menu-text">账户管理</text>
        </view>
        <view class="menu-item" @tap="goSwitchAccount">
          <text class="menu-text">切换账户</text>
        </view>
      </view>

      <!-- 菜单 -->
      <view class="menu-group">
        <view class="menu-item" @tap="handleLogout">
          <text class="menu-text" style="color: #ff4d4f">退出登录</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const currentUser = computed(() => userStore.currentUser)
const isAdmin = computed(() => userStore.isAdmin)

function handleLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录？',
    success: (res) => {
      if (res.confirm) {
        userStore.logout()
        uni.reLaunch({ url: '/pages/login/index' })
      }
    },
  })
}

function goStoreList() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/settings/store-list' })
}

function goStoreAdd() {
  uni.navigateTo({ url: '/pages/settings/store-add' })
}

function goProduct() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/product/index' })
}

function goSupplier() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/supplier/index' })
}

function goStock() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/stock/index' })
}

function goInbound() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/inbound/index' })
}

function goOutbound() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/outbound/index' })
}

function goTransfer() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/transfer/index' })
}

function goAccount() {
  if (!userStore.isAdmin) return
  uni.navigateTo({ url: '/pages/admin/account/index' })
}

function goSwitchAccount() {
  userStore.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}

onShow(() => {
  userStore.init()
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: '/pages/login/index' })
  }
})
</script>

<style lang="scss" scoped>
.settings-page {
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

.user-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;

  .avatar {
    width: 100rpx;
    height: 100rpx;
    border-radius: 50%;
    background: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: #fff;
    font-weight: bold;
    margin-right: 24rpx;
  }

  .info {
    display: flex;
    flex-direction: column;

    .name {
      font-size: 34rpx;
      color: #333;
      font-weight: 500;
      margin-bottom: 8rpx;
    }

    .role {
      font-size: 26rpx;
      color: #999;
    }
  }
}

.menu-group {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;

  .menu-item {
    padding: 30rpx;
    text-align: center;
    border-bottom: 2rpx solid #f0f0f0;

    &:last-child { border-bottom: none; }

    .menu-text {
      font-size: 30rpx;
    }
  }
}
</style>
