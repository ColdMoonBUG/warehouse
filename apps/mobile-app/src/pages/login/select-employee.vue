<template>
  <view class="select-page">
    <view class="header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">选择账户</text>
      <view style="width: 60rpx" />
    </view>

    <view class="content">
      <view class="section">
        <text class="label">账户选择已合并</text>
        <view class="tip-box">
          <text>请直接在账户列表中选择管理员、大车、小车或三车登录。</text>
        </view>
      </view>

      <button class="btn" @tap="goLogin">返回账户列表</button>
    </view>
  </view>
</template>

<script setup lang="ts">
function goBack() {
  uni.navigateBack()
}

function goLogin() {
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<style lang="scss" scoped>
.select-page { min-height: 100vh; background: #fff; }
.header { display:flex; align-items:center; justify-content:space-between; padding:20rpx 30rpx; padding-top: calc(20rpx + var(--status-bar-height,0)); }
.back { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; font-size:48rpx; color:#333; }
.title { font-size:34rpx; font-weight:500; color:#333; }
.content { padding: 40rpx 30rpx; }
.section { background:#f7f7f7; border-radius:16rpx; padding:24rpx; margin-bottom:24rpx; }
.label { font-size:28rpx; color:#666; margin-bottom:12rpx; display:block; }
.tip-box { font-size:28rpx; color:#333; line-height:1.7; }
.btn { width:100%; height:88rpx; background:#1890ff; color:#fff; font-size:32rpx; border-radius:44rpx; border:none; }
.btn::after { border:none; }
</style>
