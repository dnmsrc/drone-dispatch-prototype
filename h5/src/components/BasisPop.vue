<template>
  <!-- 填报页只保留输入与选项；说明和重大利害关系条款统一在下一步／提交／签署时确认。
       确认记录 = 版本 + 条款号 + 触点 + 时间戳 + 账号 + 内容哈希。 -->
  <view v-if="show" class="bp-mask" @click="tryClose">
    <view class="bp-pop" @click.stop>
      <view class="bp-head">
        <text class="bp-title">{{ title }}</text>
        <text class="bp-x" :class="{ dis: !canClose }" @click="tryClose">✕</text>
      </view>
      <scroll-view scroll-y class="bp-body">
        <!-- 天气不确定的预约风险（2026-11-02）：超出预报期的日期允许预约，但必须让用户明确同意
             因天气改期的后果（改期 = 重新审批、加急费、定金不可退、当日决定权在公安）。
             放在条款之前：这是用户刚做的那一个选择带来的风险，不该埋在 8 条长条款下面。
             这是「选择到触发项时才确认」的那种确认，不是流程开头的批量确认。 -->
        <view v-if="risk" class="bp-risk">
          <view class="bp-row">
            <text class="bp-no">风险</text>
            <text class="bp-grp">{{ risk.group || '天气不确定' }}</text>
          </view>
          <text v-for="(l, i) in risk.lines" :key="'r' + i" class="bp-line">{{ l }}</text>
          <button v-if="!risk.acked" class="bp-ck" @click="$emit('risk-ack')">同意并预约</button>
          <text v-else class="bp-done">已同意 · {{ risk.at }} · {{ risk.user }}</text>
          <view class="bp-skip" @click="$emit('risk-skip')">换个日期</view>
        </view>
        <view v-for="(c, i) in clauses" :key="c.n" class="bp-clause" :class="{ done: c.done }">
          <view class="bp-row">
            <text class="bp-no">第 {{ c.n }} 条</text>
            <text class="bp-grp">{{ c.group }}</text>
          </view>
          <text class="bp-line">{{ c.text }}</text>
          <button v-if="!c.done" class="bp-ck" @click="confirm(c)">确认本条</button>
          <text v-else class="bp-done">已确认 · {{ c.at }} · {{ c.user }}</text>
        </view>
        <text v-for="(l, i) in lines" :key="'l' + i" class="bp-line" :class="{ dim: l.indexOf('依据：') === 0 }">{{ l }}</text>
      </scroll-view>
      <text v-if="must && (pendingHere || riskOpen)" class="bp-hint">这一屏的条款必须逐条确认后才能继续（留痕不可撤销）</text>
      <view v-if="secName && canClose" class="bp-link" @click="goSec">查看《申请说明》· {{ secName }} ›</view>
      <button class="bp-btn ghost" :class="{ dis: !canClose }" :disabled="!canClose" @click="tryClose">{{ canClose ? '关闭' : '确认后才能继续' }}</button>
    </view>
  </view>
</template>

<script>
import { store, confirmClause } from '@/store'
import { DISCLOSURE_VERSION, clauseOf, confirmedClauses, latestAck, appliesTo } from '@/engine/disclosure'

export default {
  name: 'BasisPop',
  props: {
    show: { type: Boolean, default: false },
    title: { type: String, default: '' },
    lines: { type: Array, default: () => [] },
    // 触点 key（engine/disclosure.js 的 TOUCH_CLAUSE）：这一屏对应《申请说明》的哪几条。可传字符串或数组。
    touch: { type: [String, Array], default: '' },
    sec: { type: String, default: '' },
    // 阻断式（门弹出的那一屏）：这一屏的条款没确认完不能关——门的作用就是拦人，能关等于没拦。
    must: { type: Boolean, default: false },
    // 预约风险块：{ group, lines: [], acked, at, user }。只在「选到超出预报期的日期」时传进来。
    risk: { type: Object, default: null }
  },
  computed: {
    clauses() {
      const keys = Array.isArray(this.touch) ? this.touch : (this.touch ? [this.touch] : [])
      const got = confirmedClauses(store.apply && store.apply.acks, DISCLOSURE_VERSION)
      return keys.filter(k => appliesTo(k, store.apply)).map(k => {
        const c = clauseOf(k)
        if (!c) return null
        const e = ((store.apply && store.apply.acks) || []).filter(x => x && x.v === DISCLOSURE_VERSION && x.clause === c.n).pop()
        return { ...c, key: k, done: got.includes(c.n), at: e ? e.at : '', user: e ? e.user : '' }
      }).filter(Boolean)
    },
    secName() { return this.sec || (this.clauses.length ? this.clauses[0].group : '') },
    pendingHere() { return this.clauses.filter(c => !c.done).length },
    riskOpen() { return !!(this.risk && !this.risk.acked) },
    canClose() { return !this.must || (this.pendingHere === 0 && !this.riskOpen) }
  },
  methods: {
    tryClose() {
      // 阻断时弹窗内已有“确认后才能继续”和剩余条款，不再发会残留到下一页的 toast。
      if (!this.canClose) return
      this.$emit('close')
    },
    goSec() {
      if (!this.canClose) return
      this.$emit('close')
      if (!this.secName) return
      uni.navigateTo({ url: '/pages/apply/disclosure?sec=' + encodeURIComponent(this.secName) })
    },
    confirm(c) {
      // 按钮立即变成下方的留痕状态，不再叠 toast 盖住条款正文或右下角回看面板。
      confirmClause(c.key)
    }
  }
}
</script>

<style scoped>
.bp-mask { position: fixed; inset: 0; z-index: 200; background: rgba(26, 29, 46, .45); display: flex; align-items: flex-end; }
.bp-pop { width: 100%; max-height: 72vh; background: #fff; border-radius: 32rpx 32rpx 0 0; padding: 32rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); box-sizing: border-box; display: flex; flex-direction: column; }
.bp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20rpx; }
.bp-title { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.bp-x { flex: none; width: 88rpx; height: 88rpx; margin: -20rpx -20rpx -20rpx 0; display: flex; align-items: center; justify-content: center; font-size: var(--fs-4); color: var(--text-3); }
/* 阻断式弹窗没确认完不能关：✕ 和关闭按钮置灰但仍占位（位置不变，用户知道是"现在不能"，不是"没有这个按钮"） */
.bp-x.dis { color: var(--text-4); }
.bp-hint { display: block; font-size: var(--fs-2); color: var(--warn); margin-bottom: 12rpx; }
.bp-body { flex: 1; min-height: 0; max-height: 44vh; }
/* 条款块：编号 + 组名 + 原文 + 确认按钮。未确认橙色，确认后转主色（已留痕，不可撤销）。 */
.bp-clause { padding-bottom: 20rpx; margin-bottom: 12rpx; border-bottom: 2rpx solid var(--line); }
.bp-row { display: flex; align-items: baseline; gap: 12rpx; margin-bottom: 8rpx; }
.bp-no { font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--warn); }
.bp-clause.done .bp-no { color: var(--primary); }
.bp-grp { font-size: var(--fs-2); color: var(--text-3); }
.bp-line { display: block; font-size: var(--fs-3); color: var(--text-2); line-height: 1.8; margin-bottom: 12rpx; }
.bp-line.dim { color: var(--text-3); font-size: var(--fs-2); }
.bp-ck { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--warn), #E0832A); color: #fff; font-size: var(--fs-4); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.bp-ck::after { border: none; }
.bp-done { display: block; font-size: var(--fs-2); color: var(--text-3); }
.bp-link { min-height: 88rpx; display: flex; align-items: center; font-size: var(--fs-3); font-weight: var(--fw-semibold); color: var(--primary); }
.bp-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-5); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.bp-btn::after { border: none; }
.bp-btn.ghost { background: var(--bg-2); color: var(--text-2); font-weight: var(--fw-medium); }
.bp-btn.ghost.dis { color: var(--text-4); }
/* 预约风险块：与条款块分开渲染（不加 .bp-clause），门弹窗的条款条数判据仍只数真条款 */
.bp-risk { margin-top: 8rpx; padding: 20rpx 0 4rpx; border-top: 2rpx solid var(--line); }
.bp-skip { min-height: 88rpx; display: flex; align-items: center; justify-content: center; font-size: var(--fs-3); color: var(--text-3); }
</style>
