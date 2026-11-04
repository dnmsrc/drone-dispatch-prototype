<template>
  <view class="page">
    <NavBar title="申请单 · 里程碑付款" />
    <StepBar :current="7" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <view class="sec-title">合同摘要</view>
        <view class="kv"><text class="k">合同编号</text><text class="v">{{ contract.no }}</text></view>
        <view class="kv"><text class="k">签约主体</text><text class="v">{{ contract.name }}</text></view>
        <view class="kv"><text class="k">条款确认</text><text class="v">{{ contract.clauses.length }}/{{ clauses.length }} 条</text></view>
        <view class="kv"><text class="k">存证哈希</text><text class="v mono">{{ contract.hash }}</text></view>
      </view>

      <view class="sec card">
        <view class="sec-title">付款节点</view>
        <view v-for="m in milestones" :key="m.key" class="node" :class="{ cur: m.key === currentKey, paid: contract.paidNodes.includes(m.key) }">
          <view class="nd-left">
            <text class="nd-name">{{ m.name }}</text>
            <text class="nd-trig">{{ m.trigger }}</text>
            <text v-if="!m.refundable" class="nd-flag">定金 · 不可退</text>
          </view>
          <view class="nd-right">
            <text class="nd-ratio">{{ Math.round(m.ratio * 100) }}%</text>
            <text class="nd-amt">¥{{ Math.round(quote.total * m.ratio).toLocaleString() }}</text>
            <text class="nd-status">{{ contract.paidNodes.includes(m.key) ? '已付' : (m.key === currentKey ? '本节点' : '未触发') }}</text>
          </view>
        </view>
      </view>

      <view class="sec card">
        <view class="sec-title">支付方式</view>
        <view class="pay-row">
          <text v-for="c in channels" :key="c.key" class="pay" :class="{ on: channel === c.key }" @click="channel = c.key">{{ c.label }}</text>
        </view>
        <text class="note">演示环境点击「支付本节点」即模拟支付成功，不产生真实扣款。正式版需与支付宝 / 微信 API 联调，按节点逐笔收款并回写流水号。</text>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <view class="pb-left">
        <text class="pb-label">本节点应付</text>
        <text class="pb-price">¥{{ due.toLocaleString() }}</text>
      </view>
      <button class="pb-btn" :class="{ dis: paying }" @click="pay">{{ paying ? '支付中…' : '支付本节点' }}</button>
    </view>

  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import { store, hydrateForPage } from '@/store'
import { MILESTONES } from '@/engine/milestones'
import { CLAUSES } from '@/engine/contract'

export default {
  components: { NavBar, StepBar },
  data() {
    const a = hydrateForPage(7)
    return {
      contract: a.contract, quote: a.quote, milestones: MILESTONES, clauses: CLAUSES,
      channel: 'WECHAT',
      channels: [{ key: 'WECHAT', label: '微信支付' }, { key: 'ALIPAY', label: '支付宝' }],
      paying: false
    }
  },
  computed: {
    currentKey() { return MILESTONES.find(m => !this.contract.paidNodes.includes(m.key)).key },
    due() { return Math.round(this.quote.total * MILESTONES.find(m => m.key === this.currentKey).ratio) }
  },
  methods: {
    pay() {
      if (this.paying) return
      this.paying = true
      const p = (n) => String(n).padStart(2, '0')
      const d = new Date()
      this.contract.paidNodes.push(this.currentKey)
      this.contract.payments = (this.contract.payments || []).concat([{
        node: this.currentKey,
        amount: this.due,
        channel: this.channel,
        tradeNo: 'DEMO' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + Math.floor(Math.random() * 100000),
        time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      }])
      store.apply.step = 8
      uni.showToast({ title: '本节点支付成功', icon: 'success' })
      setTimeout(() => uni.navigateTo({ url: '/pages/apply/progress' }), 600)
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。 */
.sec { margin: 24rpx; }
.sec-title { font-size: var(--fs-5); font-weight: var(--fw-bold); margin-bottom: 20rpx; }
.sec-sub { font-size: var(--fs-2); color: var(--text-3); font-weight: 400; margin-left: 12rpx; }
.kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 12rpx 0; }
/* 标签不换行：flex:none 取自然宽，值收缩换行 */
.k { color: var(--text-3); font-size: var(--fs-4); flex: none; min-width: 116rpx; white-space: nowrap; }
.v { color: var(--text-1); font-size: var(--fs-4); text-align: right; }
.v.mono { font-family: ui-monospace, monospace; font-size: var(--fs-2); word-break: break-all; }
.node { display: flex; justify-content: space-between; gap: 20rpx; padding: 16rpx 0; border-bottom: 1rpx solid var(--bg-2); }
.node.cur { background: rgba(74,108,247,.06); border-radius: 14rpx; padding: 16rpx; }
.nd-left { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
.nd-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.nd-trig { font-size: var(--fs-1); color: var(--text-3); }
.nd-flag { font-size: var(--fs-1); color: var(--danger); }
.nd-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; }
.nd-ratio { font-size: var(--fs-2); color: var(--primary); background: rgba(74,108,247,.1); padding: 4rpx 12rpx; border-radius: 999rpx; }
.nd-amt { font-size: var(--fs-4); font-weight: var(--fw-bold); }
.nd-status { font-size: var(--fs-1); color: var(--text-4); }
.pay-row { display: flex; gap: 12rpx; }
.pay { flex: 1; text-align: center; padding: 20rpx 0; border-radius: 14rpx; background: var(--bg-2); font-size: var(--fs-4); color: var(--text-2); box-sizing: border-box; min-height: 88rpx; }
.pay.on { background: rgba(74,108,247,.1); color: var(--primary); font-weight: var(--fw-semibold); }
.note { display: block; margin-top: 12rpx; font-size: var(--fs-1); color: var(--text-3); line-height: 1.7; }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); display: flex; align-items: center; gap: 24rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-left { display: flex; flex-direction: column; }
.pb-label { font-size: var(--fs-1); color: var(--text-3); }
.pb-price { font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.pb-btn { flex: 1; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.pb-btn.dis { background: #E3E6F0; color: var(--text-3); }
</style>
