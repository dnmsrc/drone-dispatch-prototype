<template>
  <view class="page">
    <NavBar title="申请单 · 进度" />
    <StepBar :current="8" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <view class="sec-title">流程状态链</view>
        <view class="chain">
          <view v-for="(n, i) in chain" :key="n.key" class="cn" :class="{ done: n.done, cur: n.current }">
            <view class="cn-dot"><view v-if="n.done" class="gck"></view><text v-else>{{ i + 1 }}</text></view>
            <view class="cn-body">
              <text class="cn-name">{{ n.name }}</text>
              <text class="cn-note">{{ n.note }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="sec card">
        <view class="sec-title">里程碑与已发生成本</view>
        <view v-for="m in milestones" :key="m.key" class="node" :class="{ paid: paidNodes.includes(m.key) }">
          <view class="nd-left">
            <text class="nd-name">{{ m.name }}</text>
            <text class="nd-trig">{{ m.trigger }}</text>
          </view>
          <view class="nd-right">
            <text class="nd-ratio">{{ Math.round(m.ratio * 100) }}%</text>
            <text class="nd-amt">¥{{ Math.round(quote.total * m.ratio).toLocaleString() }}</text>
            <text class="nd-status">{{ paidNodes.includes(m.key) ? '已付' : '未触发' }}</text>
          </view>
        </view>
      </view>

      <view class="sec card">
        <view class="sec-title">当日决策点</view>
        <view class="kv"><text class="k">建议态</text><text class="v price">{{ decision.suggested }}</text></view>
        <view class="kv"><text class="k">最终态</text><text class="v">{{ decision.final }}</text></view>
        <view class="kv"><text class="k">预报</text><text class="v">风速 {{ decision.forecast.windMs }} m/s · {{ decision.forecast.tempC }}℃ · {{ decision.forecast.humidity }}% · 能见度 {{ decision.forecast.visibilityKm }} km</text></view>
        <view class="kv"><text class="k">预警</text><text class="v">{{ decision.warnings.length ? decision.warnings.map(w => `${w.type} ${w.level} ${w.start}→${w.end}`).join('；') : '无' }}</text></view>
        <text class="note">{{ decision.authority }}。{{ decision.priority }}。{{ decision.perItem }}。</text>
        <view class="branch-row">
          <text v-for="o in ['照常','推迟','取消']" :key="o" class="branch" :class="{ on: override === o }" @click="override = o">人工覆盖 · {{ o }}</text>
        </view>
      </view>

      <view class="sec card">
        <view class="sec-title">若此刻取消 · 退款试算</view>
        <view class="branch-row">
          <text v-for="b in branches" :key="b.key" class="branch" :class="{ on: branch === b.key }" @click="branch = b.key">{{ b.label }}</text>
        </view>
        <text class="note">{{ branches.find(b => b.key === branch).note }}</text>
        <view v-if="calc.rescheduleFirst" class="warn-box">
          先改期，改期不成才解除。改期 = 重新备案 + 重新审批（不得擅自由变更经备案的活动内容、地点等关键要素）：最早 {{ calc.reschedule.earliestDays }} 天（备案 20 日 + 各部门 7 日核实 + {{ calc.reschedule.level }}组织）。已发生成本不变，已付节点按原节点继续有效。
        </view>
        <view class="cost-list">
          <text class="cost-title">已发生成本清单（三条件：专为本案合同产生 / 有充分证据证明已实际支出 / 符合行业惯例）</text>
          <view v-for="(c, i) in costs" :key="i" class="cost" :class="{ ok: calc.deductible.includes(c) }">
            <text class="cost-name">{{ c.label }}</text>
            <text class="cost-amt">¥{{ c.amount.toLocaleString() }}</text>
            <text class="cost-why">{{ calc.deductible.includes(c) ? '可扣除' : '不可扣除 · ' + (c.subcontract && !c.subcontractApproved ? '转包未经甲方书面同意' : !c.evidence ? '无充分证据' : '不满足三条件') }}</text>
          </view>
        </view>
        <view v-for="(r, i) in calc.rows" :key="i" class="kv">
          <text class="k">{{ r.name }}</text>
          <text class="v price">¥{{ r.refund.toLocaleString() }}<text class="rs">（{{ r.why }}）</text></text>
        </view>
        <view class="total-row">
          <text>可退合计</text>
          <text class="total">¥{{ calc.refund.toLocaleString() }}</text>
        </view>
        <view class="kv"><text class="k">违约金</text><text class="v">¥{{ calc.penalty.toLocaleString() }}<text class="rs">（{{ calc.penaltyWhy }}）</text></text></view>
        <text class="note">签约节点性质：{{ calc.depositNature === 'deposit' ? '定金（适用定金罚则）' : '预付款（不适用定金罚则）' }}。法律依据：{{ calc.legalBasis.join('；') }}。</text>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" @click="back">返回申请单首页</button>
    </view>

  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import { store, hydrateForPage } from '@/store'
import { MILESTONES, BRANCHES, settle, rescheduleOption } from '@/engine/milestones'
import { decide } from '@/engine/weather'

export default {
  components: { NavBar, StepBar },
  data() {
    const a = hydrateForPage(8)
    return {
      quote: a.quote, judgment: a.judgment,
      paidNodes: a.contract ? a.contract.paidNodes : [],
      branches: BRANCHES, branch: 'USER',
      override: null,
      costs: [
        { label: '实地勘察工时（1 个工作日）', amount: 1200, exclusive: true, evidence: true, reasonable: true },
        { label: '转包第三方编队费（已扣除第三方退款）', amount: 20000, exclusive: true, evidence: true, reasonable: true, subcontract: true, subcontractApproved: false },
        { label: '前期方案设计与沟通协调人力成本', amount: 3000, exclusive: true, evidence: false, reasonable: true }
      ]
    }
  },
  computed: {
    chain() {
      const j = this.judgment
      const virtual = j.venue.virtual
      return [
        { key: 'submit', name: '需求登记', note: '需求与场地意向已登记', done: true },
        { key: 'judge', name: '场地预判定', note: `${j.conclusionText}`, done: true },
        { key: 'survey', name: '实地勘察 + 联合现场勘查', note: virtual ? '约 1 个工作日：净空、面积、圈层防护、场地许可；主、承办单位、场地管理单位和公安机关四方联合勘查' : '已完成实测；四方联合勘查', done: !virtual, current: virtual },
        { key: 'officialEval', name: '官方可行性评估', note: j.venue.officialEvalDone ? '初次活动前已由公安机关会同空管、气象、无线电管理等部门完成（二次活动不重做）' : '初次活动前须由公安机关会同空管、气象、无线电管理等部门评估', done: j.venue.officialEvalDone, current: !j.venue.officialEvalDone },
        { key: 'consult', name: '人工咨询与派单', note: '线上给报价区间；正式报价与派单由客服创建，用户不能自助下单', done: true },
        { key: 'contract', name: '电子合同签署', note: '身份与资质查验 + 逐条确认 + 存证（保存至证书失效后五年）', done: true },
        { key: 'deposit', name: '签约节点', note: `已付 · 性质：${(store.apply.dispatch && store.apply.dispatch.mustFill.find(m => m.key === 'depositNature') || {}).value || '预付款'}`, done: true },
        { key: 'filing', name: '备案（六线并行）', note: '活动前 20 日完成备案；公安、民航、无线电、文旅、场地管理部门 7 日内核实后报空管审批', done: false, current: true },
        { key: 'approval', name: '空域审批', note: `${j.approval.level}组织 · ${j.approval.leadDays} 工作日；可能不予批准或与政府公告冲突；失败时先改期`, done: false },
        { key: 'arrange', name: '编排与彩排', note: '按批复的水平、垂直范围与使用时间编排；活动前须做小架次边框或彩排测试（含应急情况处置）', done: false },
        { key: 'perform', name: '演出', note: '计划起飞 1 小时前报告准备情况，经确认后方可起飞；当日是否举行由公安机关决定', done: false },
        { key: 'accept', name: '验收', note: '按派单载明的投入规模核对机队数，误差 ≤5%；编队精度 ≤1 m、灯光音乐同步率 ≥98%', done: false },
        { key: 'clear', name: '清场', note: '画面垂直投射地面边界外延 30 m 保持无人清空；圈层防护撤收', done: false },
        { key: 'delivery', name: '交付视频', note: '成片与现场素材移交', done: false },
        { key: 'review', name: '安全监管复盘', note: '活动结束后公安机关对安全监管工作进行复盘总结', done: false }
      ]
    },
    milestones() { return MILESTONES },
    decision() {
      const a = store.apply
      return decide({ date: a.date, slot: a.slot, cityCode: this.judgment.city.code, override: this.override })
    },
    calc() {
      const a = store.apply
      const d = store.apply.dispatch
      const terms = d ? Object.fromEntries(d.mustFill.map(m => [m.key, m.value])) : {}
      const r = settle({
        total: this.quote.total,
        paidNodes: this.paidNodes,
        costs: this.costs,
        date: a.date, slot: a.slot,
        branch: this.branch,
        responsibility: terms.approvalFailLiability ? 'PERFORMER' : 'SHARED',
        depositNature: String(terms.depositNature || '预付款').includes('定金') ? 'deposit' : 'prepayment',
        agreementExplicit: !!terms.approvalFailLiability
      })
      r.reschedule = rescheduleOption({ city: this.judgment.city, drones: a.need.droneCount, date: a.date, slot: a.slot })
      return r
    }
  },
  methods: {
    back() { uni.redirectTo({ url: '/pages/apply/venue' }) }
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
.chain { display: flex; flex-direction: column; gap: 12rpx; }
.cn { display: flex; gap: 12rpx; align-items: flex-start; }
.cn-dot { flex: none; width: 36rpx; height: 36rpx; border-radius: 50%; background: var(--bg-2); color: var(--text-3); font-size: var(--fs-1); font-weight: var(--fw-bold); display: flex; align-items: center; justify-content: center; }
.cn.done .cn-dot { background: rgba(43,164,113,.12); color: var(--success); }
.cn.cur .cn-dot { background: rgba(230,162,60,.14); color: var(--warn); }
.cn-body { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
.cn-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.cn.cur .cn-name { color: var(--warn); }
.cn.done .cn-name { color: var(--success); }
.cn-note { font-size: var(--fs-1); color: var(--text-3); line-height: 1.6; }
.node { display: flex; justify-content: space-between; gap: 20rpx; padding: 16rpx 0; border-bottom: 1rpx solid var(--bg-2); }
.nd-left { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
.nd-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.nd-trig { font-size: var(--fs-1); color: var(--text-3); }
.nd-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; }
.nd-ratio { font-size: var(--fs-2); color: var(--primary); background: rgba(74,108,247,.1); padding: 4rpx 12rpx; border-radius: 999rpx; }
.nd-amt { font-size: var(--fs-4); font-weight: var(--fw-bold); }
.nd-status { font-size: var(--fs-1); color: var(--text-4); }
.node.paid .nd-status { color: var(--success); }
.branch-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 12rpx; }
.branch { padding: 12rpx 20rpx; border-radius: 12rpx; background: var(--bg-2); font-size: var(--fs-3); color: var(--text-2); box-sizing: border-box; min-height: 88rpx; display: flex; align-items: center; }
.branch.on { background: rgba(74,108,247,.1); color: var(--primary); font-weight: var(--fw-semibold); }
/* 标签不被值挤压成多行：行内齐高用 center，标签取自然宽 */
.kv { display: flex; justify-content: space-between; align-items: center; gap: 24rpx; padding: 12rpx 0; }
/* 标签不换行：flex:none 取自然宽，值收缩换行 */
.k { color: var(--text-3); font-size: var(--fs-4); flex: none; min-width: 116rpx; white-space: nowrap; }
.v { color: var(--text-1); font-size: var(--fs-4); text-align: right; }
.v.price { font-weight: var(--fw-semibold); }
.rs { display: block; font-size: var(--fs-1); color: var(--text-3); font-weight: 400; }
.total-row { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-top: 20rpx; border-top: 1rpx solid var(--bg-2); font-size: var(--fs-5); font-weight: var(--fw-bold); }
.total { color: var(--success); font-size: var(--fs-10); font-weight: var(--fw-heavy); }
.note { display: block; margin-top: 12rpx; font-size: var(--fs-1); color: var(--text-3); line-height: 1.7; }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.warn-box { background: rgba(230,162,60,.08); border-left: 8rpx solid var(--warn); border-radius: 14rpx; padding: 20rpx; font-size: var(--fs-3); color: var(--text-2); line-height: 1.7; margin-bottom: 16rpx; }
.cost-list { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 16rpx; }
.cost-title { font-size: var(--fs-2); color: var(--text-3); line-height: 1.6; }
/* 两行结构：第一行「名称 + 金额」，第二行「可/不可扣除说明」。
   注意必须 wrap —— 说明用 100% 宽独占第二行；容器不 wrap 时三者总宽超出，
   flex 收缩会把每个中文标签压成 1 字宽的竖排（2026-11-03 用户截图 bug）。 */
.cost { display: flex; flex-wrap: wrap; align-items: center; gap: 4rpx 12rpx; padding: 16rpx; background: var(--bg-2); border-radius: 12rpx; }
.cost.ok { background: rgba(43,164,113,.08); }
.cost-name { flex: 1 1 auto; min-width: 0; font-size: var(--fs-3); line-height: 1.5; }
.cost-amt { flex: none; font-size: var(--fs-3); font-weight: var(--fw-bold); }
.cost-why { flex: 1 0 100%; font-size: var(--fs-1); color: var(--text-3); line-height: 1.6; }
.cost.ok .cost-why { color: var(--success); }
</style>
