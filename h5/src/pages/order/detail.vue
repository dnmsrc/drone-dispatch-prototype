<template>
  <view class="page">
    <NavBar title="订单详情" dark />
    <view v-if="o" class="wrap">
      <!-- 状态横幅 -->
      <view class="banner" :style="{ background: bannerBg }">
        <text class="b-status">{{ statusText }}</text>
        <text class="b-desc">{{ bannerDesc }}</text>
        <text class="b-id">订单号 {{ o.id }}</text>
      </view>

      <view class="body">
        <!-- 退款提示卡 -->
        <view v-if="o.refund" class="refund-card" :class="o.refund.status.toLowerCase()">
          <view class="rf-title">
            {{ o.refund.status === 'PENDING' ? '退款审核中' : o.refund.status === 'APPROVED' ? '退款成功' : '退款被拒绝' }}
          </view>
          <view class="rf-row" v-if="o.refund.status === 'PENDING'">
            <text>预计退款 ¥{{ o.refund.applyAmount.toLocaleString() }}（{{ Math.round(o.refund.ratio * 100) }}%），商户将在 24 小时内处理</text>
          </view>
          <view class="rf-row" v-else-if="o.refund.status === 'APPROVED'">
            <text>已退款 ¥{{ o.refund.refundAmount.toLocaleString() }}，原路返回</text>
            <text class="rf-no">退款流水号 {{ o.refund.refundNo }}</text>
          </view>
          <view class="rf-row" v-else>
            <text>拒绝理由：{{ o.refund.auditNote }}</text>
          </view>
          <view class="rf-reason">退款原因：{{ o.refund.reason }}</view>
        </view>

        <!-- 状态时间线 -->
        <view class="card">
          <view class="sec-title">订单进度</view>
          <view class="timeline">
            <view v-for="(t, i) in timeline" :key="i" class="tl-item" :class="{ first: i === 0 }">
              <view class="tl-dot"></view>
              <view class="tl-line" v-if="i < timeline.length - 1"></view>
              <view class="tl-content">
                <text class="tl-text">{{ t.text }}</text>
                <text class="tl-time">{{ fmtTime(t.time) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 方案明细 -->
        <view class="card">
          <view class="sec-title">表演方案</view>
          <view class="kv"><text class="k">表演场次</text><text class="v">{{ o.performDate }} {{ o.timeSlot }}</text></view>
          <view class="kv"><text class="k">编队规模</text><text class="v">{{ o.droneCount }} 架 · {{ o.duration }} 分钟</text></view>
          <view class="kv" v-if="o.patternPreset && o.patternPreset.length"><text class="k">预设图案</text><text class="v">{{ patternText }}</text></view>
          <view class="kv" v-if="o.customText"><text class="k">定制文字</text><text class="v">「{{ o.customText }}」</text></view>
          <view class="kv" v-if="o.customLogo"><text class="k">LOGO 定制</text><text class="v">{{ o.customLogo }}</text></view>
          <view class="kv" v-if="o.addons && o.addons.length"><text class="k">附加服务</text><text class="v">{{ addonText }}</text></view>
        </view>

        <!-- 场地联系人 -->
        <view class="card">
          <view class="sec-title">场地与联系人</view>
          <view class="kv"><text class="k">表演场地</text><text class="v">{{ o.venue.name }}</text></view>
          <view class="kv"><text class="k">详细地址</text><text class="v">{{ o.venue.address }}</text></view>
          <view class="kv"><text class="k">联系人</text><text class="v">{{ o.contact.name }} · {{ o.contact.phone }}</text></view>
        </view>

        <!-- 费用明细 -->
        <view class="card">
          <view class="sec-title">费用明细</view>
          <view v-for="(p, i) in o.priceDetail" :key="i" class="kv">
            <text class="k">{{ p.label }}</text>
            <text class="v price">¥{{ p.amount.toLocaleString() }}</text>
          </view>
          <view class="total-row">
            <text>实付金额</text>
            <text class="total">¥{{ o.totalAmount.toLocaleString() }}</text>
          </view>
          <view v-if="o.paidAt" class="pay-info">
            <text>{{ o.payChannel === 'WECHAT' ? '微信支付' : '支付宝' }} · {{ fmtTime(o.paidAt) }}</text>
            <text class="trade">流水号 {{ o.payTradeNo }}</text>
          </view>
        </view>

        <!-- 评价展示 -->
        <view v-if="o.review" class="card">
          <view class="sec-title">我的评价</view>
          <view class="stars">
            <text v-for="n in 5" :key="n" class="star" :class="{ on: n <= o.review.stars }">★</text>
          </view>
          <text class="review-content">{{ o.review.content }}</text>
        </view>

        <view style="height: 200rpx"></view>
      </view>

      <!-- 底部操作栏 -->
      <view v-if="actions.length" class="bottom-bar">
        <button
          v-for="a in actions" :key="a.text"
          class="bar-btn" :class="a.type"
          @click="a.handler"
        >{{ a.text }}</button>
      </view>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { get, post } from '@/utils/request'
import { statusOf, fmtTime, ADDON_NAMES, PATTERN_NAMES } from '@/utils/format'

export default {
  components: { NavBar },
  data() { return { id: '', o: null } },
  computed: {
    statusText() { return statusOf(this.o.status).text },
    bannerBg() {
      const c = statusOf(this.o.status).color
      return `linear-gradient(160deg, ${c} 0%, ${c}CC 100%)`
    },
    bannerDesc() {
      return {
        PENDING_PAY: '请在 15 分钟内完成支付，超时订单将自动取消',
        PENDING_ACCEPT: '支付成功，商户将在 24 小时内接单',
        ACCEPTED: '商户已接单，表演筹备中，敬请期待',
        IN_SERVICE: '表演正在进行中，请欣赏夜空盛宴',
        COMPLETED: '表演已完成，感谢选择星穹 SkyShow',
        REVIEWED: '感谢您的评价，期待再次相遇',
        CANCELLED: this.o.cancelReason ? `取消原因：${this.o.cancelReason}` : '订单已取消',
        REFUNDING: '退款申请审核中，商户将在 24 小时内处理',
        REFUNDED: '退款已完成，款项原路返回'
      }[this.o.status] || ''
    },
    timeline() { return (this.o.timeline || []).slice().reverse() },
    patternText() { return this.o.patternPreset.map(k => PATTERN_NAMES[k] || k).join('、') },
    addonText() { return this.o.addons.map(k => ADDON_NAMES[k] || k).join('、') },
    actions() {
      const A = []
      const s = this.o.status
      if (s === 'PENDING_PAY') {
        A.push({ text: '取消订单', type: 'ghost', handler: this.cancel })
        A.push({ text: '去支付', type: 'primary', handler: () => uni.navigateTo({ url: `/pages/order/cashier?id=${this.id}` }) })
      } else if (s === 'PENDING_ACCEPT' || s === 'ACCEPTED') {
        A.push({ text: '申请退款', type: 'ghost', handler: () => uni.navigateTo({ url: `/pages/order/refund?id=${this.id}` }) })
      } else if (s === 'COMPLETED') {
        A.push({ text: '现场照片', type: 'ghost', handler: () => uni.navigateTo({ url: `/pages/order/gallery?id=${this.id}` }) })
        A.push({ text: '评价订单', type: 'primary', handler: () => uni.navigateTo({ url: `/pages/order/review?id=${this.id}` }) })
      } else if (s === 'REVIEWED') {
        A.push({ text: '现场照片', type: 'ghost', handler: () => uni.navigateTo({ url: `/pages/order/gallery?id=${this.id}` }) })
      } else if (s === 'REFUNDING' || s === 'REFUNDED' || s === 'CANCELLED') {
        A.push({ text: '再次预约', type: 'primary', handler: () => uni.navigateTo({ url: '/pages/order/create' }) })
      }
      return A
    }
  },
  onLoad(q) { this.id = q.id },
  onShow() { this.load() },
  methods: {
    fmtTime,
    load() { get(`/orders/${this.id}`).then(d => { this.o = d.order }).catch(() => {}) },
    cancel() {
      uni.showModal({
        title: '取消订单', content: '确定取消该订单吗？',
        success: (r) => {
          if (!r.confirm) return
          post(`/orders/${this.id}/cancel`).then(() => {
            uni.showToast({ title: '已取消', icon: 'success' })
            this.load()
          })
        }
      })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.banner { padding: 30rpx 36rpx 60rpx; display: flex; flex-direction: column; gap: 10rpx; margin-top: -1px; }
.b-status { color: #fff; font-size: var(--fs-11); font-weight: var(--fw-heavy); }
.b-desc { color: rgba(255,255,255,.8); font-size: var(--fs-3); }
.b-id { color: rgba(255,255,255,.55); font-size: var(--fs-1); margin-top: 8rpx; }
.body { padding: 0 24rpx; margin-top: -30rpx; position: relative; z-index: 2; display: flex; flex-direction: column; gap: 24rpx; }
.refund-card { border-radius: 24rpx; padding: 26rpx 28rpx; display: flex; flex-direction: column; gap: 8rpx; box-shadow: var(--shadow); background: #fff; }
.refund-card.pending { border-left: 8rpx solid #FF7849; }
.refund-card.approved { border-left: 8rpx solid var(--success); }
.refund-card.rejected { border-left: 8rpx solid var(--danger); }
.rf-title { font-size: var(--fs-5); font-weight: var(--fw-bold); }
.rf-row { font-size: var(--fs-3); color: var(--text-2); display: flex; flex-direction: column; gap: 4rpx; }
.rf-no { color: var(--text-3); font-size: var(--fs-1); }
.rf-reason { font-size: var(--fs-2); color: var(--text-3); }
.timeline { padding: 8rpx 0 0 8rpx; }
.tl-item { position: relative; padding-left: 40rpx; padding-bottom: 30rpx; }
.tl-dot {
  position: absolute; left: 0; top: 8rpx;
  width: 18rpx; height: 18rpx; border-radius: 50%;
  background: #D5DAEA; border: 4rpx solid var(--bg-2);
}
.tl-item.first .tl-dot { background: var(--primary); border-color: rgba(74,108,247,.2); box-shadow: 0 0 0 6rpx rgba(74,108,247,.12); }
.tl-line { position: absolute; left: 13rpx; top: 34rpx; bottom: -4rpx; width: 2rpx; background: var(--line); }
.tl-content { display: flex; flex-direction: column; gap: 4rpx; }
.tl-text { font-size: var(--fs-4); color: var(--text-1); }
.tl-item:first-child .tl-text { font-weight: var(--fw-semibold); }
.tl-time { font-size: var(--fs-1); color: var(--text-4); }
.kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 12rpx 0; }
.k { color: var(--text-3); font-size: var(--fs-4); flex-shrink: 0; }
.v { color: var(--text-1); font-size: var(--fs-4); text-align: right; }
.v.price { font-weight: var(--fw-semibold); }
.total-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12rpx; padding-top: 18rpx; border-top: 1rpx solid var(--bg-2); font-weight: var(--fw-bold); font-size: var(--fs-5); }
.total { color: var(--primary); font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.pay-info { display: flex; flex-direction: column; align-items: flex-end; gap: 2rpx; margin-top: 10rpx; color: var(--text-4); font-size: var(--fs-1); }
.trade { font-size: var(--fs-1); }
.stars { display: flex; gap: 8rpx; margin-bottom: 12rpx; }
.star { font-size: var(--fs-10); color: #E3E6F0; }
.star.on { color: #FFB02E; }
.review-content { font-size: var(--fs-4); color: var(--text-2); line-height: 1.7; }
.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  max-width: 480px; margin: 0 auto;
  background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line);
  display: flex; gap: 20rpx; padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.bar-btn { flex: 1; border: none; border-radius: 999rpx; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; }
.bar-btn::after { border: none; }
.bar-btn.primary { background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; box-shadow: 0 8rpx 22rpx rgba(74,108,247,.35); }
.bar-btn.ghost { background: #fff; color: var(--primary); border: 2rpx solid var(--primary); }
</style>
