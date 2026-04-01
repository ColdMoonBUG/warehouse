<template>
  <view>
    <!-- App根组件 -->
  </view>
</template>

<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { getSession } from '@/api'

onLaunch(() => {
  const session = getSession()
  if (!session) {
    uni.reLaunch({ url: '/pages/login/index' })
  }
})
</script>

<style>
page {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 28rpx;
  color: #333333;
  background-color: #f5f5f5;
}

.container {
  padding: 30rpx;
  padding-bottom: calc(30rpx + env(safe-area-inset-bottom));
}

.flex {
  display: flex;
}

.flex-column {
  flex-direction: column;
}

.flex-center {
  align-items: center;
  justify-content: center;
}

.flex-between {
  justify-content: space-between;
}

.flex-1 {
  flex: 1;
}

.text-primary {
  color: #1890FF;
}

.text-success {
  color: #52C41A;
}

.text-warning {
  color: #FAAD14;
}

.text-danger {
  color: #FF4D4F;
}
</style>
