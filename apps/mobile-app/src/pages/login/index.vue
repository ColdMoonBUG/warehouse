<template>
  <view class="login-page">
    <view class="login-header">
      <view class="logo">
        <text class="logo-icon">店</text>
      </view>
      <text class="title">车销系统</text>
      <text class="subtitle">食品中间商移动管理平台</text>
      <text v-if="debugMsg" class="debug-msg">{{ debugMsg }}</text>
    </view>

    <view class="account-list">
      <view class="section-title">选择账户登录</view>
      <view v-if="loading && accounts.length === 0" class="loading">
        <text>正在加载账户...</text>
      </view>
      <view v-else>
        <view
          v-for="account in accounts"
          :key="account.id"
          class="account-card"
          @tap="selectAccount(account)"
        >
          <view class="avatar" :class="account.role">
            {{ account.displayName.charAt(0) }}
          </view>
          <view class="account-info">
            <text class="name">{{ account.displayName }}</text>
            <text class="role">{{ account.role === 'admin' ? '管理员' : '业务员' }}</text>
          </view>
          <view class="arrow">›</view>
        </view>

        <view v-if="loading && accounts.length > 0" class="loading inline-loading">
          <text>账户已显示，正在后台刷新...</text>
        </view>

        <view v-if="!loading && accounts.length === 0" class="empty">
          <text>暂无可用账户</text>
        </view>
      </view>
    </view>

    <view class="footer">
      <text class="version">v1.0.0</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getSession } from '@/api'
import { useReferenceStore } from '@/store/reference'
import { applyRoleTabBar, switchToRoleHome } from '@/utils/tabbar'
import { onAccountLogin, onAccountLogout } from '@/utils/bluetooth-printer'
import type { Account } from '@/types'

const userStore = useUserStore()
const referenceStore = useReferenceStore()
const accounts = ref<Account[]>([])
const debugMsg = ref('')
const loading = ref(false)

function syncAccounts() {
  accounts.value = [...referenceStore.accounts]
  debugMsg.value = accounts.value.length ? `获取到 ${accounts.value.length} 个账户` : ''
}

onMounted(async () => {
  const session = getSession()
  if (session) {
    userStore.setSession(session)
    onAccountLogin(session.displayName)   // 冷启动已有 session，触发自动连接
    applyRoleTabBar()
    setTimeout(() => {
      switchToRoleHome()
    }, 0)
    return
  }

  referenceStore.hydrate()
  syncAccounts()
  loading.value = true
  try {
    await userStore.loadAccounts()
    syncAccounts()
  } catch (e: any) {
    syncAccounts()
    debugMsg.value = accounts.value.length ? '账户刷新失败，已显示缓存结果' : `错误: ${e.message}`
    if (accounts.value.length > 0) {
      uni.showToast({ title: '账户刷新失败，已显示缓存', icon: 'none' })
    } else {
      uni.showModal({ title: '加载失败', content: e.message, showCancel: false })
    }
  } finally {
    loading.value = false
  }
})

onShow(() => {
  userStore.init()
  applyRoleTabBar()
})

function selectAccount(account: Account) {
  // 切换账户前断开当前蓝牙连接
  onAccountLogout()
  const gestureFlag = account.gestureHash ? '1' : '0'
  const base = `username=${account.username}&name=${encodeURIComponent(account.displayName)}&id=${account.id}&hasGesture=${gestureFlag}`
  if (account.gestureHash) {
    uni.navigateTo({ url: `/pages/login/gesture?${base}` })
  } else {
    uni.navigateTo({ url: `/pages/login/password?${base}` })
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #1890FF 0%, #096dd9 100%);
  display: flex;
  flex-direction: column;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 0 60rpx;

  .logo {
    width: 120rpx;
    height: 120rpx;
    background: #fff;
    border-radius: 30rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24rpx;
    box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);

    .logo-icon {
      font-size: 48rpx;
      font-weight: bold;
      color: #1890ff;
    }
  }

  .title {
    font-size: 44rpx;
    font-weight: bold;
    color: #fff;
    margin-bottom: 12rpx;
  }

  .subtitle {
    font-size: 26rpx;
    color: rgba(255, 255, 255, 0.8);
  }
}

.account-list {
  flex: 1;
  background: #f5f5f5;
  border-radius: 40rpx 40rpx 0 0;
  padding: 40rpx 30rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));

  .section-title {
    font-size: 28rpx;
    color: #666;
    margin-bottom: 24rpx;
  }
}

.account-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  .avatar {
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    background: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32rpx;
    color: #fff;
    font-weight: bold;
    margin-right: 24rpx;

    &.admin {
      background: #722ed1;
    }
  }

  .account-info {
    flex: 1;
    display: flex;
    flex-direction: column;

    .name {
      font-size: 32rpx;
      color: #333;
      font-weight: 500;
      margin-bottom: 6rpx;
    }

    .role {
      font-size: 24rpx;
      color: #999;
    }
  }

  .arrow {
    font-size: 40rpx;
    color: #ccc;
  }
}

.loading,
.empty {
  text-align: center;
  padding: 60rpx;
  color: #999;
  font-size: 28rpx;
}

.inline-loading {
  padding-top: 24rpx;
  padding-bottom: 16rpx;
  font-size: 24rpx;
}

.footer {
  text-align: center;
  padding: 20rpx;

  .version {
    font-size: 22rpx;
    color: rgba(255, 255, 255, 0.5);
  }
}
</style>
