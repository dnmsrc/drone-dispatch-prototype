<template>
  <view class="page">
    <NavBar title="申请单 · 电子合同" />
    <StepBar :current="6" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <SecHead title="签约主体" />
        <view class="chip-row">
          <text v-for="t in types" :key="t.key" class="chip" :class="{ on: subject === t.key }" @click="pickType(t)">{{ t.label }}</text>
        </view>
        <input v-model="form.name" class="text-input" :placeholder="subject === 'person' ? '姓名（与身份证件一致）' : '企业名称（与营业执照一致）'" placeholder-class="ph" />
        <input v-model="form.idno" class="text-input" :placeholder="subject === 'person' ? '身份证件号码' : '统一社会信用代码'" placeholder-class="ph" />
        <input v-model="form.agent" v-if="subject === 'company'" class="text-input" placeholder="经办人姓名 + 身份证件号码" placeholder-class="ph" />
        <input v-model="form.phone" class="text-input" type="number" maxlength="11" placeholder="实名手机号" placeholder-class="ph" />
      </view>

      <view class="sec card">
        <SecHead title="意愿认证与签署" />
        <view class="code-row">
          <input v-model="code" class="text-input code-input" placeholder="验证码" placeholder-class="ph" />
          <button class="code-btn" @click="sendCode">{{ codeSent ? '已发送 ' + code : '获取验证码' }}</button>
        </view>
      </view>

      <view v-if="receipt" class="sec card receipt">
        <SecHead title="签署完成 · 存证" />
        <view class="kv"><text class="k">合同编号</text><text class="v">{{ receipt.no }}</text></view>
        <view class="kv"><text class="k">签署主体</text><text class="v">{{ receipt.name }}</text></view>
        <view class="kv"><text class="k">内容哈希</text><text class="v mono">{{ receipt.hash }}</text></view>
        <view class="kv"><text class="k">签署时间</text><text class="v">{{ receipt.time }}</text></view>
        <view class="kv"><text class="k">证书链</text><text class="v">{{ receipt.ca }}</text></view>
        <view class="kv"><text class="k">保存期限</text><text class="v">至证书失效后 5 年</text></view>
        <view v-if="annex" class="kv"><text class="k">合同附件</text><text class="v">《申请说明》{{ annex.v }} · 逐条确认 {{ ackCount }} 条 · 哈希 {{ (annex.hash || '').slice(0, 12) }}</text></view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <view class="pb-left">
        <text class="pb-label">本节点应付</text>
        <text class="pb-price">¥{{ firstNode.toLocaleString() }}</text>
      </view>
      <!-- 门在签署这一页：没确认完，这个按钮的作用就是拦人（点它打开门）。
           所以「还欠确认」时按钮不能置灰——置灰了门就够不着。置灰只留给身份/意愿没做完的那一段。 -->
      <button class="pb-btn" :class="{ dis: pendCount === 0 && !identityReady }" @click="sign">
        {{ identityReady ? '签署并进入付款' : '完成身份与意愿认证' }}
      </button>
    </view>

    <BasisPop :show="pop.show" :title="pop.title" :lines="pop.lines" :sec="pop.sec" :touch="pop.touch" :must="pop.must" @close="pop.show = false" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import ackPop from '@/mixins/ackPop'
import { store, hydrateForPage } from '@/store'
import { SUBJECT_TYPES, hashOf } from '@/engine/contract'
import { DISCLOSURE_VERSION, latestAck, confirmedClauses, appliesTo, clauseOf, TOUCH_CLAUSE, TOUCH_STEP } from '@/engine/disclosure'
import { MILESTONES } from '@/engine/milestones'

export default {
  components: { NavBar, StepBar, BasisPop, SecHead },
  mixins: [ackPop],
  data() {
    // 进这一页按当前草稿重算（草稿跨页共享）；存证与附件走 computed，跟着草稿实时变
    hydrateForPage(6)
    return {
      types: SUBJECT_TYPES,
      subject: 'person',
      form: { name: '', idno: '', agent: '', phone: '' },
      code: '', codeSent: false
    }
  },
  computed: {
    // 存证与附件必须跟着草稿走：sign() 写的是 store.apply.contract，
    // 如果 receipt 只在 data() 里从草稿取一次快照，签署后这一页看不到存证（要重进页才有）。
    receipt() { return (store.apply && store.apply.contract) || null },
    annex() { return latestAck(store.apply && store.apply.acks) },
    // 本单真的触发了哪几条（不是全量）：确认状态只有一个来源 = 留痕。
    // 页上不能再有第二个来源（勾选框）：留痕不可撤销，勾选框可以取消勾选。
    triggered() { return Object.keys(TOUCH_CLAUSE).filter(k => (TOUCH_STEP[k] || 99) <= this.ackStep && appliesTo(k, store.apply)) },
    triggeredCount() { return this.triggered.length },
    pendCount() { return this.pendSet.size },
    identityReady() { return !!(this.form.name && this.form.idno && this.form.phone && this.code) },
    ready() { return this.triggeredCount > 0 && this.pendCount === 0 && this.identityReady },
    ackCount() { return confirmedClauses(store.apply && store.apply.acks, DISCLOSURE_VERSION).length },
    firstNode() { return Math.round((store.apply.quote ? store.apply.quote.total : 0) * MILESTONES[0].ratio) }
  },
  methods: {
    pickType(t) {
      this.subject = t.key
    },
    sendCode() {
      this.code = String(Math.floor(100000 + Math.random() * 900000))
      this.codeSent = true
    },
    sign() {
      // 签署是第二个门（mixins/ackPop.js 的 gate）：本单触发的重大条款没确认完不能签
      if (!this.gate()) return
      if (!this.ready) { uni.showToast({ title: '请完成身份查验与意愿认证后签署', icon: 'none' }); return }
      const a = store.apply
      // 合同金额来自第 4 步的报价区间；直接跳这一页时 quote 是空的，读空值会崩在这一行
      if (!a.quote) { uni.showToast({ title: '先完成第 4 步报价区间', icon: 'none' }); return }
      const p = (n) => String(n).padStart(2, '0')
      const d = new Date()
      // 合同里列的条款 = 留痕里真的确认过的那几条（本单触发的），不是页上勾选的状态
      const got = confirmedClauses(a.acks, DISCLOSURE_VERSION)
      const content = [a.quote.total, a.venue.name, a.date, a.slot, this.form.name, this.form.idno, got.join(',')].join('|')
      a.contract = {
        no: 'HT' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + hashOf(content).slice(0, 6).toUpperCase(),
        subject: this.subject,
        name: this.form.name,
        idno: this.form.idno,
        agent: this.form.agent,
        phone: this.form.phone,
        clauses: got,
        hash: hashOf(content),
        time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
        ca: '演示环境未接入 CA · 正式版由依法设立的电子认证服务提供者签发',
        paidNodes: []
      }
      a.step = 7
      uni.showToast({ title: '签署完成，存证已生成', icon: 'success' })
      setTimeout(() => uni.navigateTo({ url: '/pages/apply/pay' }), 600)
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
.chip-row { display: flex; gap: 12rpx; }
.chip { padding: 12rpx 24rpx; border-radius: 12rpx; background: var(--bg-2); font-size: var(--fs-3); color: var(--text-2); box-sizing: border-box; min-height: 88rpx; display: flex; align-items: center; }
.chip.on { background: rgba(74,108,247,.1); color: var(--primary); font-weight: var(--fw-semibold); }
.text-input { margin-top: 16rpx; background: var(--bg); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: var(--fs-5); height: 88rpx; box-sizing: border-box; }
.ph { color: var(--text-4); }
/* 行内控件不得带 margin：齐高 88rpx */
.row { display: flex; align-items: center; gap: 16rpx; margin-top: 16rpx; }
.row .text-input { margin-top: 0; flex: 1; min-width: 116rpx; }
.doc-list { margin-top: 16rpx; display: flex; flex-direction: column; gap: 8rpx; }
.doc { font-size: var(--fs-2); color: var(--text-2); }
/* 逐条确认的勾选框样式已删（2026-10-29）：确认只在弹窗里逐条发生，页上不该有第二个确认来源。
   行 = 短值（标题）在左 + 入口在右（唯一形态 = EntryChip 胶囊，恰好 88rpx）；正文和文号在弹窗里，不平铺。 */
.cl-row { display: flex; align-items: center; gap: 16rpx; min-height: 88rpx; }
.cl-t { flex: 1; min-width: 116rpx; font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.cond { display: flex; gap: 12rpx; align-items: flex-start; padding: 8rpx 0; }
.cond-mark { width: 26rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; flex: none; }
.cond-text { font-size: var(--fs-3); color: var(--text-2); flex: 1; }
.code-row { display: flex; gap: 12rpx; align-items: center; }
.code-input { flex: 1; min-width: 116rpx; margin-top: 0; }
.code-btn { flex: none; height: 88rpx; padding: 0 24rpx; display: flex; align-items: center; justify-content: center; border: none; border-radius: 14rpx; background: var(--bg-2); color: var(--primary); font-size: var(--fs-3); font-weight: var(--fw-semibold); box-sizing: border-box; }
.code-btn::after { border: none; }
.receipt { border-left: 8rpx solid var(--success); }
.kv { display: flex; justify-content: space-between; gap: 24rpx; padding: 12rpx 0; }
.k { color: var(--text-3); font-size: var(--fs-4); flex: none; min-width: 116rpx; white-space: nowrap; }
.v { color: var(--text-1); font-size: var(--fs-4); text-align: right; }
.v.mono { font-family: ui-monospace, monospace; font-size: var(--fs-2); word-break: break-all; }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); display: flex; align-items: center; gap: 24rpx; padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-left { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; }
.pb-label { font-size: var(--fs-1); color: var(--text-3); }
.pb-price { font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.pb-btn { flex: 1; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.pb-btn.dis { background: #E3E6F0; color: var(--text-3); font-size: var(--fs-3); }
</style>
