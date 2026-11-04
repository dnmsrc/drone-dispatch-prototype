<template>
  <view class="page">
    <view class="result">
      <view class="check-wrap">
        <view class="ring"></view>
        <svg class="check" viewBox="0 0 52 52" width="140rpx" height="140rpx" xmlns="http://www.w3.org/2000/svg">
          <circle class="ck-circle" cx="26" cy="26" r="24" fill="none" stroke="#2BA471" stroke-width="2.5"/>
          <path class="ck-path" fill="none" stroke="#2BA471" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" d="M14 27l8 8 16-17"/>
        </svg>
      </view>
      <text class="title">支付成功</text>
      <text class="sub">商户将在 24 小时内接单，请留意订单状态</text>
      <view class="btns">
        <button class="btn-primary btn" @click="goDetail">查看订单</button>
        <button class="btn-ghost btn" @click="goHome">返回首页</button>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() { return { id: '' } },
  onLoad(q) { this.id = q.id || '' },
  methods: {
    goDetail() { uni.redirectTo({ url: `/pages/order/detail?id=${this.id}` }) },
    goHome() { uni.reLaunch({ url: '/pages/index/index' }) }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); display: flex; }
.result { flex: 1; display: flex; flex-direction: column; align-items: center; padding-top: 180rpx; }
.check-wrap { position: relative; width: 160rpx; height: 160rpx; display: flex; align-items: center; justify-content: center; }
.ring { position: absolute; inset: -20rpx; border-radius: 50%; background: rgba(43,164,113,.1); animation: breathe 2s ease-in-out infinite; }
@keyframes breathe { 0%,100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.12); opacity: .35; } }
.ck-circle { stroke-dasharray: 151; stroke-dashoffset: 151; animation: draw .5s ease-out forwards; }
.ck-path { stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw .35s .45s ease-out forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.title { font-size: var(--fs-10); font-weight: var(--fw-heavy); margin-top: 40rpx; }
.sub { color: var(--text-3); font-size: var(--fs-3); margin-top: 12rpx; }
.btns { display: flex; flex-direction: column; gap: 20rpx; margin-top: 70rpx; width: 60%; }
/* uni-button 默认 margin: 0 auto 会阻止 flex 交叉轴拉伸，按钮收缩成内容宽（文字被挤出圆形按钮），
   必须显式 width:100% + margin:0；line-height 覆盖 uni-button 默认 2.55 的过高行高 */
.btn { width: 100%; margin: 0; font-size: var(--fs-6); padding: 20rpx 0; line-height: 1.5; }
</style>
