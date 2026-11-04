<template>
  <!-- 申请流程唯一的条款回看入口：右下角轻量入口，只读，不执行确认。
       确认发生在用户点击「下一步／提交／签署」时的 BasisPop 弹窗里；这里只看本步或全部留痕。 -->
  <view class="ack-dock">
    <view v-if="open" class="ad-mask" @click="open = false"></view>
    <view v-if="open" class="ad-panel">
      <view class="ad-head">
        <view class="ad-heading">
          <text class="ad-title">已确认条款</text>
          <text class="ad-sub">本步 {{ stepItems.length }} 条 · 全部 {{ allItems.length }} 条</text>
        </view>
        <text class="ad-close" @click="open = false">✕</text>
      </view>
      <view class="ad-tabs">
        <text class="ad-tab" :class="{ on: tab === 'step' }" @click="tab = 'step'">本步已确认</text>
        <text class="ad-tab" :class="{ on: tab === 'all' }" @click="tab = 'all'">全部已确认</text>
      </view>
      <scroll-view scroll-y class="ad-list">
        <view v-if="!shownItems.length" class="ad-empty">
          {{ tab === 'step' ? '本步还没有已确认条款' : '还没有已确认条款' }}
        </view>
        <view v-for="c in shownItems" :key="c.n" class="ad-item">
          <view class="ad-row">
            <text class="ad-no">第 {{ c.n }} 条</text>
            <text class="ad-group">{{ c.group }}</text>
          </view>
          <text class="ad-text">{{ c.text }}</text>
          <text class="ad-meta">已确认 · {{ c.at }} · {{ c.user }}</text>
        </view>
      </scroll-view>
      <view class="ad-full" @click="goDisclosure">查看完整《申请说明》<text> ›</text></view>
    </view>

    <view v-if="!open" class="ack-fab" @click="openDock">
      <view class="af-doc"><view class="af-line"></view><view class="af-line short"></view></view>
      <text class="af-text">申请说明</text>
      <text v-if="stepItems.length" class="af-count">{{ stepItems.length }}</text>
    </view>
  </view>
</template>

<script>
import { store } from '@/store'
import {
  DISCLOSURE_VERSION, DISCLOSURE_SECTIONS, TOUCH_CLAUSE, TOUCH_STEP,
  clauseOf, confirmedClauses
} from '@/engine/disclosure'

let clauseNo = 0
const ALL_CLAUSES = DISCLOSURE_SECTIONS.flatMap(s => s.items.map(text => ({ n: ++clauseNo, group: s.title, text })))
const TOUCHES = Object.keys(TOUCH_CLAUSE).map(key => ({ key, ...clauseOf(key) }))

export default {
  name: 'AckDock',
  props: { step: { type: Number, default: 0 } },
  data() { return { open: false, tab: 'step' } },
  computed: {
    allItems() {
      const acks = (store.apply && store.apply.acks) || []
      const got = confirmedClauses(acks, DISCLOSURE_VERSION)
      return ALL_CLAUSES.filter(c => got.includes(c.n)).map(c => {
        const touch = TOUCHES.find(t => t.n === c.n)
        const event = [...acks].reverse().find(e => e && e.v === DISCLOSURE_VERSION && (e.clause === c.n || (e.risk || []).includes(c.n)))
        return { ...c, touch: touch ? touch.key : '', at: event ? event.at : '', user: event ? event.user : '' }
      })
    },
    stepItems() {
      return this.allItems.filter(c => c.touch && TOUCH_STEP[c.touch] === this.step)
    },
    shownItems() { return this.tab === 'step' ? this.stepItems : this.allItems }
  },
  methods: {
    openDock() { this.tab = 'step'; this.open = true },
    goDisclosure() {
      this.open = false
      uni.navigateTo({ url: '/pages/apply/disclosure' })
    }
  }
}
</script>

<style scoped>
.ack-fab {
  position: fixed;
  right: 24rpx;
  bottom: calc(144rpx + env(safe-area-inset-bottom));
  z-index: 90;
  min-height: 88rpx;
  box-sizing: border-box;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border: 2rpx solid rgba(74, 108, 247, .16);
  border-radius: 999rpx;
  background: rgba(255, 255, 255, .96);
  color: var(--primary);
  box-shadow: 0 8rpx 28rpx rgba(26, 29, 46, .16);
  font-size: var(--fs-2);
  font-weight: var(--fw-semibold);
  white-space: nowrap;
}
.af-doc { width: 24rpx; height: 30rpx; border: 3rpx solid currentColor; border-radius: 4rpx; box-sizing: border-box; padding: 5rpx 3rpx; display: flex; flex-direction: column; gap: 4rpx; }
.af-line { height: 3rpx; background: currentColor; border-radius: 2rpx; }
.af-line.short { width: 65%; }
.af-count { min-width: 30rpx; height: 30rpx; padding: 0 8rpx; box-sizing: border-box; border-radius: 999rpx; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: var(--fs-1); }
.ad-mask { position: fixed; inset: 0; z-index: 170; background: rgba(26, 29, 46, .38); }
.ad-panel { position: fixed; z-index: 180; right: 24rpx; bottom: calc(144rpx + env(safe-area-inset-bottom)); width: min(640rpx, calc(100vw - 48rpx)); max-height: 66vh; box-sizing: border-box; padding: 28rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 20rpx 64rpx rgba(26, 29, 46, .24); display: flex; flex-direction: column; }
.ad-head { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.ad-heading { display: flex; flex-direction: column; gap: 4rpx; }
.ad-title { font-size: var(--fs-6); font-weight: var(--fw-bold); color: var(--text-1); }
.ad-sub { font-size: var(--fs-2); color: var(--text-3); }
.ad-close { flex: none; width: 88rpx; height: 88rpx; margin: -20rpx -20rpx -20rpx 0; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: var(--fs-4); }
.ad-tabs { display: flex; gap: 12rpx; margin: 20rpx 0 12rpx; }
.ad-tab { min-height: 88rpx; padding: 0 20rpx; display: flex; align-items: center; border-radius: 999rpx; background: var(--bg-2); color: var(--text-3); font-size: var(--fs-2); }
.ad-tab.on { background: rgba(74, 108, 247, .1); color: var(--primary); font-weight: var(--fw-semibold); }
.ad-list { min-height: 120rpx; max-height: 40vh; }
.ad-empty { padding: 48rpx 20rpx; text-align: center; color: var(--text-3); font-size: var(--fs-3); }
.ad-item { padding: 20rpx 0; border-bottom: 2rpx solid var(--line); }
.ad-row { display: flex; align-items: baseline; gap: 12rpx; margin-bottom: 8rpx; }
.ad-no { color: var(--success); font-size: var(--fs-3); font-weight: var(--fw-bold); }
.ad-group { color: var(--text-3); font-size: var(--fs-2); }
.ad-text { display: block; color: var(--text-2); font-size: var(--fs-3); line-height: 1.75; }
.ad-meta { display: block; margin-top: 8rpx; color: var(--text-3); font-size: var(--fs-1); }
.ad-full { flex: none; min-height: 88rpx; margin-top: 12rpx; display: flex; align-items: center; justify-content: center; border-radius: 999rpx; background: var(--bg-2); color: var(--primary); font-size: var(--fs-3); font-weight: var(--fw-semibold); }
</style>
