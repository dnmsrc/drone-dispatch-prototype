<template>
  <view class="page">
    <NavBar title="收银台" />
    <view v-if="order" class="body">
      <!-- 金额与倒计时 -->
      <view class="amount-card">
        <text class="a-label">支付金额</text>
        <text class="a-value"><text class="a-symbol">¥</text>{{ order.totalAmount.toLocaleString() }}</text>
        <view class="countdown" :class="{ warn: remainSec <= 60 }">
          <text>支付剩余时间 {{ mm }}:{{ ss }}</text>
        </view>
        <text class="a-order">订单号 {{ order.id }}</text>
      </view>

      <!-- 支付方式 -->
      <view class="card">
        <view class="sec-title">选择支付方式</view>
        <view class="channel" :class="{ on: channel === 'WECHAT' }" @click="channel = 'WECHAT'">
          <view class="ch-icon wx">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M8.7 4C4.9 4 2 6.6 2 9.8c0 1.8 1 3.4 2.5 4.5l-.6 2 2.2-1.1c.7.2 1.4.3 2.1.3h.5A6 6 0 0 1 10 14c0-3.2 3-5.7 6.6-5.7h.4C16.3 5.7 12.9 4 8.7 4Z"/></svg>
          </view>
          <view class="ch-info">
            <text class="ch-name">微信支付</text>
            <text class="ch-desc">推荐使用，千万用户的选择</text>
          </view>
          <view class="radio"></view>
        </view>
        <view class="channel" :class="{ on: channel === 'ALIPAY' }" @click="channel = 'ALIPAY'">
          <view class="ch-icon ali">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><path d="M21.8 15.6c-1.9-.7-4-1.6-5.9-2.4.6-1.1 1-2.4 1.4-3.7h-3.9V7.9h4.7V6.6h-4.7V4.3h-2.9v2.3H5.9v1.3h4.6v1.6H6.7v1.2h7.2c-.3.9-.7 1.8-1.2 2.6-2.1-.6-4.1-1.1-5.3-1.1-2.6 0-3.9 1.4-3.9 3.1 0 2 1.6 3.2 4 3.2 2.9 0 5.7-1.7 7.6-3.6 2 1 4.4 2.2 6.7 3.1l.6-1.6c-.2 0-.6-.2-.6-.2ZM6.5 17.5c-1.2 0-2-.5-2-1.4 0-.8.7-1.3 1.8-1.3 1 0 2.3.4 3.9.9-1.1 1-2.5 1.8-3.7 1.8Z"/></svg>
          </view>
          <view class="ch-info">
            <text class="ch-name">支付宝</text>
            <text class="ch-desc">大额支付更便捷</text>
          </view>
          <view class="radio"></view>
        </view>
      </view>

      <view class="demo-tip">演示环境 · 不会产生真实扣款</view>
      <view style="height: 170rpx"></view>
    </view>

    <view class="bottom-bar">
      <button class="pay-btn" :disabled="paying" @click="showPanel = true">
        立即支付 ¥{{ order ? order.totalAmount.toLocaleString() : 0 }}
      </button>
    </view>

    <!-- 模拟支付面板 -->
    <view v-if="showPanel" class="mask" @click="!paying && (showPanel = false)">
      <view class="panel" @click.stop>
        <view class="panel-head" :class="channel === 'WECHAT' ? 'wx-head' : 'ali-head'">
          <text class="ph-title">{{ channel === 'WECHAT' ? '微信支付' : '支付宝' }} · 模拟收银台</text>
          <text class="ph-amount">¥{{ order.totalAmount.toLocaleString() }}</text>
          <text class="ph-order">{{ order.id }}</text>
        </view>
        <view class="panel-body">
          <text class="pb-tip">这是模拟支付面板，用于演示完整支付流程</text>
          <button class="pb-btn success" :disabled="paying" @click="pay(true)">{{ paying ? '支付中…' : '模拟支付成功' }}</button>
          <button class="pb-btn fail" :disabled="paying" @click="pay(false)">模拟支付失败</button>
          <button class="pb-btn cancel" :disabled="paying" @click="showPanel = false">暂不支付</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { get, post } from '@/utils/request'

export default {
  components: { NavBar },
  data() {
    return {
      id: '', order: null, channel: 'WECHAT',
      showPanel: false, paying: false,
      remainSec: 0, timer: null
    }
  },
  computed: {
    mm() { return String(Math.floor(this.remainSec / 60)).padStart(2, '0') },
    ss() { return String(this.remainSec % 60).padStart(2, '0') }
  },
  onLoad(q) {
    this.id = q.id
    this.load()
  },
  onUnload() { clearInterval(this.timer) },
  methods: {
    load() {
      get(`/orders/${this.id}`).then(d => {
        this.order = d.order
        if (this.order.status !== 'PENDING_PAY') {
          uni.showToast({ title: '订单状态已变化', icon: 'none' })
          setTimeout(() => uni.redirectTo({ url: `/pages/order/detail?id=${this.id}` }), 600)
          return
        }
        this.remainSec = Math.max(0, Math.floor((new Date(this.order.expireAt) - Date.now()) / 1000))
        this.timer = setInterval(() => {
          this.remainSec--
          if (this.remainSec <= 0) {
            clearInterval(this.timer)
            uni.showToast({ title: '订单已超时取消', icon: 'none' })
            setTimeout(() => uni.redirectTo({ url: `/pages/order/detail?id=${this.id}` }), 800)
          }
        }, 1000)
      }).catch(() => {})
    },
    pay(success) {
      this.paying = true
      // 真实环境：微信支付走 wx.requestPayment / 支付宝走跳转，此处由服务端模拟回调
      setTimeout(() => {
        post(`/orders/${this.id}/pay`, { channel: this.channel, success })
          .then(d => {
            this.showPanel = false
            if (d.paid) {
              clearInterval(this.timer)
              uni.redirectTo({ url: `/pages/order/result?id=${this.id}` })
            } else {
              uni.showToast({ title: '支付失败，请重试', icon: 'none' })
            }
          })
          .finally(() => { this.paying = false })
      }, 600)
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.body { padding: 24rpx; }
.amount-card {
  background: linear-gradient(160deg, #1B2452, #10173A);
  border-radius: 24rpx; padding: 44rpx 32rpx;
  display: flex; flex-direction: column; align-items: center; gap: 12rpx;
  box-shadow: 0 12rpx 36rpx rgba(16, 23, 58, .3);
}
.a-label { color: rgba(232,236,255,.6); font-size: var(--fs-3); }
.a-value { color: #fff; font-size: var(--fs-12); font-weight: var(--fw-heavy); }
.a-symbol { font-size: var(--fs-10); margin-right: 6rpx; }
.countdown {
  margin-top: 8rpx; padding: 8rpx 24rpx; border-radius: 999rpx;
  background: rgba(61,224,192,.14); color: #3DE0C0; font-size: var(--fs-2);
}
.countdown.warn { background: rgba(245,108,108,.15); color: #FF8A8A; }
.a-order { color: rgba(232,236,255,.4); font-size: var(--fs-1); margin-top: 6rpx; }
.card { margin-top: 24rpx; }
.channel {
  display: flex; align-items: center; gap: 20rpx;
  border: 2rpx solid var(--line); border-radius: 18rpx; padding: 22rpx; margin-top: 16rpx;
}
.channel.on { border-color: var(--primary); background: rgba(74,108,247,.04); }
.ch-icon { width: 76rpx; height: 76rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center; }
.ch-icon.wx { background: #07C160; }
.ch-icon.ali { background: #1677FF; }
.ch-info { flex: 1; display: flex; flex-direction: column; gap: 2rpx; }
.ch-name { font-size: var(--fs-5); font-weight: var(--fw-bold); }
.ch-desc { font-size: var(--fs-2); color: var(--text-3); }
.radio { width: 36rpx; height: 36rpx; border-radius: 50%; border: 2rpx solid #D5DAEA; }
.channel.on .radio { border-color: var(--primary); background: radial-gradient(circle, var(--primary) 45%, transparent 50%); }
.demo-tip { text-align: center; color: var(--text-4); font-size: var(--fs-1); margin-top: 30rpx; }
.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  max-width: 480px; margin: 0 auto;
  background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line);
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.pay-btn {
  width: 100%; border: none; border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff; font-size: var(--fs-7); font-weight: var(--fw-bold); padding: 22rpx 0;
  box-shadow: 0 8rpx 22rpx rgba(74,108,247,.35);
}
.pay-btn::after { border: none; }
.mask { position: fixed; inset: 0; z-index: 200; background: rgba(10,12,26,.55); display: flex; align-items: flex-end; justify-content: center; }
.panel { width: 100%; max-width: 480px; background: #fff; border-radius: 32rpx 32rpx 0 0; overflow: hidden; animation: rise .25s ease-out; }
@keyframes rise { from { transform: translateY(80rpx); opacity: .6; } to { transform: none; opacity: 1; } }
.panel-head { padding: 36rpx; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.wx-head { background: linear-gradient(160deg, #0BBF63, #089E50); }
.ali-head { background: linear-gradient(160deg, #1677FF, #0E56C4); }
.ph-title { color: rgba(255,255,255,.85); font-size: var(--fs-3); }
.ph-amount { color: #fff; font-size: var(--fs-12); font-weight: var(--fw-heavy); }
.ph-order { color: rgba(255,255,255,.5); font-size: var(--fs-1); }
.panel-body { padding: 32rpx 36rpx 50rpx; display: flex; flex-direction: column; gap: 18rpx; }
.pb-tip { text-align: center; color: var(--text-3); font-size: var(--fs-2); margin-bottom: 6rpx; }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; }
.pb-btn::after { border: none; }
.pb-btn.success { background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; box-shadow: 0 8rpx 22rpx rgba(74,108,247,.3); }
.pb-btn.fail { background: #FFF1F0; color: var(--danger); }
.pb-btn.cancel { background: var(--bg-2); color: var(--text-2); }
</style>
