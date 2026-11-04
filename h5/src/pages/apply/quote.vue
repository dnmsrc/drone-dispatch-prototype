<template>
  <view class="page">
    <NavBar title="申请单 · 报价区间" />
    <StepBar :current="4" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <view class="concl" :class="conclusionCls">
          <text class="concl-title">{{ judgment.conclusionText }}</text>
          <text class="concl-sub">{{ judgment.city.authority }} · {{ judgment.city.version }}（{{ judgment.city.effective }} 生效）</text>
        </view>
        <view class="kv"><text class="k">场地</text><text class="v">{{ venue.name }}</text></view>
        <view class="kv"><text class="k">日期时段</text><text class="v">{{ date }} {{ slot }}</text></view>
        <view class="kv"><text class="k">层级时效</text><text class="v">{{ judgment.approval.level }} · {{ quote.leadDays }} 工作日</text></view>
        <view class="kv"><text class="k">预计观众</text><text class="v">{{ quote.audience }} 人</text></view>
        <!-- 页上只留区间数字；「线上只给区间、不构成要约」这条进弹窗（第 12 组第 1 条） -->
        <view class="kv">
          <text class="k">市场区间</text>
          <text class="v">¥{{ quote.tier.range[0].toLocaleString() }} - ¥{{ quote.tier.range[1].toLocaleString() }}</text>
          <EntryChip label="依据" @tap="open('quoteRange', '报价区间口径', [], '费用与付款')" />
        </view>
      </view>

      <view class="sec card">
        <SecHead title="报价明细" sub="10 要素" entry="依据" @tap="open('priceLayers', '报价四层与未确认项', [], '费用与付款')" />
        <view v-for="(g, gi) in groups" :key="g.name" class="grp">
          <text class="grp-name">{{ g.name }}</text>
          <view v-for="(l, i) in g.lines" :key="i" class="kv">
            <view class="gk">
              <text class="k">{{ l.label }}</text>
              <text class="kd">{{ l.detail }}</text>
            </view>
            <text class="v price">¥{{ l.amount.toLocaleString() }}</text>
          </view>
        </view>
        <view class="total-row">
          <text>报价区间合计</text>
          <text class="total">¥{{ quote.total.toLocaleString() }}</text>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="付款节点" sub="里程碑" entry="依据" @tap="open('paymentNodes', '付款节点与违约成本', [], '费用与付款')" />
        <view v-for="m in milestones" :key="m.key" class="ms">
          <text class="ms-name">{{ m.name }}</text>
          <text class="ms-ratio">{{ Math.round(m.ratio * 100) }}%</text>
          <text class="ms-amt">¥{{ Math.round(quote.total * m.ratio).toLocaleString() }}</text>
          <text class="ms-trig">{{ m.trigger }}</text>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <view class="pb-left">
        <text class="pb-label">报价区间合计</text>
        <text class="pb-price">¥{{ quote.total.toLocaleString() }}</text>
      </view>
      <button class="pb-btn" @click="next">转人工咨询 · 由客服创建派单</button>
    </view>

    <BasisPop :show="pop.show" :title="pop.title" :lines="pop.lines" :sec="pop.sec" :touch="pop.touch" :must="pop.must" @close="pop.show = false" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import EntryChip from '@/components/EntryChip.vue'
import ackPop from '@/mixins/ackPop'
import { store, hydrateForPage } from '@/store'
import { quote as calcQuote } from '@/engine/pricing'
import { MILESTONES } from '@/engine/milestones'

const GROUP_ORDER = ['基础', '内容', '附加', '档期', '场地', '判定', '合规', '加急']

export default {
  components: { NavBar, StepBar, BasisPop, SecHead, EntryChip },
  mixins: [ackPop],
  data() {
    const a = hydrateForPage(4)
    const q = calcQuote({ need: a.need, venue: a.venue, judgment: a.judgment, date: a.date })
    store.apply.quote = q
    // 咨询单不在这里造：2026-11-02 起单子由服务端在「提交咨询单」那一刻生成，
    // 这里预生成会被第 5 步误当成「已提交」（用户质疑过这一点）。
    return { need: a.need, venue: a.venue, judgment: a.judgment, date: a.date, slot: a.slot, quote: q, milestones: MILESTONES }
  },
  computed: {
    groups() {
      return GROUP_ORDER.map(n => ({ name: n, lines: this.quote.lines.filter(l => l.group === n) })).filter(g => g.lines.length)
    },
    conclusionCls() { return { BLOCKED: 'bad', SURVEY: 'pend', APPROVAL: 'warn' }[this.judgment.conclusion] || '' }
  },
  methods: {
    // 门加在「转人工咨询」这一步：本单触发的条款还没确认完就拦住，并把还欠的那几条摆进弹窗
    next() {
      if (!this.gate()) return
      store.apply.step = 5
      uni.navigateTo({ url: '/pages/apply/consult' })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。 */
.sec { margin: 24rpx; }
/* 标题行与入口收进共用组件（2026-10-29 十次调整）：SecHead / EntryChip，页里不再各写一份 */
.concl { border-radius: 18rpx; padding: 24rpx; display: flex; flex-direction: column; gap: 8rpx; margin-bottom: 16rpx; }
.concl.bad { background: rgba(245,108,108,.1); }
.concl.warn { background: rgba(230,162,60,.1); }
.concl.pend { background: rgba(74,108,247,.08); }
.concl-title { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.concl.bad .concl-title { color: var(--danger); }
.concl.warn .concl-title { color: var(--warn); }
.concl.pend .concl-title { color: var(--primary); }
.concl-sub { font-size: var(--fs-1); color: var(--text-3); }
.kv { display: flex; align-items: center; gap: 16rpx; padding: 12rpx 0; }
.gk { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
/* 键值行的标签不换行（≤5 字，取自然宽，值收缩）；.gk 里的 .k 是明细行标题，长文案允许换行 */
.kv > .k { flex: none; min-width: 116rpx; white-space: nowrap; }
.kd { font-size: var(--fs-1); color: var(--text-3); }
.v { color: var(--text-1); font-size: var(--fs-4); text-align: right; flex: 1 1 auto; min-width: 116rpx; }
.v.price { font-weight: var(--fw-semibold); }
.grp { padding: 12rpx 0; border-bottom: 1rpx solid var(--bg-2); }
.grp-name { display: block; font-size: var(--fs-3); font-weight: var(--fw-bold); color: var(--primary); margin-bottom: 8rpx; }
.total-row { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 20rpx; border-top: 1rpx solid var(--bg-2); font-size: var(--fs-5); font-weight: var(--fw-bold); }
.total { color: var(--primary); font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.ms { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; padding: 12rpx 0; border-bottom: 1rpx solid var(--bg-2); }
.ms-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); flex: 1 1 auto; min-width: 116rpx; }
.ms-ratio { flex: none; font-size: var(--fs-2); color: var(--primary); background: rgba(74,108,247,.1); padding: 8rpx 12rpx; border-radius: 999rpx; }
.ms-amt { flex: none; font-size: var(--fs-4); font-weight: var(--fw-bold); }
.ms-trig { flex: 1 1 100%; font-size: var(--fs-1); color: var(--text-3); }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); display: flex; align-items: center; gap: 24rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-left { display: flex; flex-direction: column; }
.pb-label { font-size: var(--fs-1); color: var(--text-3); }
.pb-price { font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.pb-btn { flex: 1; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
</style>
