<template>
  <view class="password-page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">密码登录</text>
      <view style="width: 60rpx" />
    </view>

    <view class="user-info">
      <view class="avatar">{{ displayName.charAt(0) }}</view>
      <text class="name">{{ displayName }}</text>
    </view>

    <view class="form">
      <view class="input-group">
        <text class="label">密码</text>
        <input
          v-model="password"
          type="password"
          placeholder="请输入密码"
          :focus="true"
          @confirm="handleLogin"
        />
      </view>

      <button class="btn-login" :loading="loading" @tap="handleLogin">
        登 录
      </button>

      <view class="tips">
        <text>{{ username === 'admin' ? '当前管理员密码: admin123' : '默认密码: 123456' }}</text>
      </view>
    </view>

    <view class="gesture-link" @tap="goGesture">
      <text>使用手势密码登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { loginByPassword } from '@/api'
import { useReferenceStore } from '@/store/reference'
import { applyRoleTabBar, switchToRoleHome } from '@/utils/tabbar'
import { onAccountLogin } from '@/utils/bluetooth-printer'

const userStore = useUserStore()
const referenceStore = useReferenceStore()

const username = ref('')
const displayName = ref('')
const accountId = ref('')
const hasGesture = ref(false)
const password = ref('')
const loading = ref(false)

onLoad((query) => {
  if (query?.username) username.value = query.username
  if (query?.name) displayName.value = decodeURIComponent(query.name)
  if (query?.id) accountId.value = query.id
  hasGesture.value = query?.hasGesture === '1'
})

function goBack() {
  uni.navigateBack()
}

function goGesture() {
  if (!hasGesture.value) {
    uni.showToast({ title: '当前账户未设置手势密码', icon: 'none' })
    return
  }
  uni.redirectTo({
    url: `/pages/login/gesture?username=${username.value}&name=${encodeURIComponent(displayName.value)}&id=${accountId.value}&hasGesture=1`,
  })
}

async function handleLogin() {
  if (!password.value.trim()) {
    uni.showToast({ title: '请输入密码', icon: 'none' })
    return
  }

  loading.value = true
  try {
    const session = await loginByPassword(username.value, password.value)
    userStore.setSession(session)
    referenceStore.hydrate()
    void referenceStore.preloadCore(true).catch(() => {})
    if (session.role === 'admin') {
      void referenceStore.preloadAllAccounts(true).catch(() => {})
      void referenceStore.preloadSuppliers(true).catch(() => {})
    }
    onAccountLogin(session.displayName)
    uni.showToast({ title: '登录成功', icon: 'success' })
    applyRoleTabBar()
    setTimeout(() => {
      switchToRoleHome()
    }, 500)
  } catch (e: any) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.password-page {
  min-height: 100vh;
  background: #fff;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 30rpx;
  padding-top: calc(20rpx + var(--status-bar-height, 0));

  .back {
    width: 60rpx;
    height: 60rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
    color: #333;
  }

  .title {
    font-size: 34rpx;
    font-weight: 500;
    color: #333;
  }
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0 80rpx;

  .avatar {
    width: 120rpx;
    height: 120rpx;
    border-radius: 50%;
    background: #1890ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
    color: #fff;
    font-weight: bold;
    margin-bottom: 20rpx;
  }

  .name {
    font-size: 32rpx;
    color: #333;
    font-weight: 500;
  }
}

.form {
  padding: 0 60rpx;

  .input-group {
    display: flex;
    align-items: center;
    border-bottom: 2rpx solid #e8e8e8;
    padding: 20rpx 0;
    margin-bottom: 40rpx;

    .label {
      font-size: 30rpx;
      color: #333;
      width: 100rpx;
    }

    input {
      flex: 1;
      font-size: 30rpx;
      padding: 10rpx 0;
    }
  }

  .btn-login {
    width: 100%;
    height: 88rpx;
    background: #1890ff;
    color: #fff;
    font-size: 32rpx;
    border-radius: 44rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    margin-top: 20rpx;

    &::after {
      border: none;
    }
  }

  .tips {
    text-align: center;
    margin-top: 30rpx;
    font-size: 24rpx;
    color: #999;
  }
}

.gesture-link {
  position: fixed;
  bottom: 80rpx;
  left: 0;
  right: 0;
  text-align: center;

  text {
    font-size: 28rpx;
    color: #1890ff;
  }
}
</style>
