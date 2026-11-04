<template>
  <view class="page">
    <NavBar title="申请单 · 场地" />
    <StepBar :current="1" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <!-- 填报页只保留用户需要作出的选择；档案与条款统一在下一步确认或右下角回看。 -->
        <SecHead title="表演场地" />

        <view class="venue-list">
          <view v-for="v in venues" :key="v.id" class="venue-item" :class="{ on: venue && venue.id === v.id }" @click="pick(v)">
            <view class="venue-radio"></view>
            <view class="venue-info">
              <text class="venue-name">{{ v.name }}</text>
              <text class="venue-addr">{{ cityOf(v.city).name }} · {{ v.address }}</text>
              <view class="venue-line">
                <!-- 行里的短值只留「这一屏要用到的」：可承接上限决定第 2 步能选哪档。
                     净空 / 面积 / 每日 N 场都不平铺，减少填写时的干扰；条款统一在下一步确认。 -->
                <text class="venue-meta">可承接上限 {{ capOf(v) === null ? '未实测（需勘察）' : capOf(v) }} 架</text>
              </view>
            </view>
            <text class="badge" :class="v.airspace === 'fit' ? 'ok' : 'warn'">{{ v.airspace === 'fit' ? '适飞空域' : '管制空域' }}</text>
          </view>
        </view>
      </view>

      <!-- 填报页只保留场地列表，不展示「这个场地决定什么」等只读说明。
           被这个场地触发的条款（场地管理部门未同意、管制空域违规飞行）不在选择时打断，
           统一在点击下一步时由 gate 弹出并逐条确认。 -->

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" :class="{ dis: !venue }" @click="next">
        {{ !venue ? '请选择场地' : '下一步 · 按这个场地的上限定规模' }}
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
import { store, invalidateFrom, hydrateForPage, requireLogin } from '@/store'
import { VENUES, venueCap } from '@/engine/venues'
import { cityOf } from '@/engine/policy'

export default {
  components: { NavBar, StepBar, BasisPop, SecHead },
  mixins: [ackPop],
  data() {
    const a = hydrateForPage(1)
    return { venue: a.venue, venues: VENUES }
  },
  // 登录门兜底（2026-11-03 用户要求：没登录不允许点进预约）：首页入口已经拦一层，
  // 这里再拦一层，防止直接改地址、或从别的页面深链进来绕过入口。
  onLoad() { requireLogin('/pages/apply/venue') },
  methods: {
    cityOf,
    capOf: venueCap,
    // 改场地只更新业务选择，不在填写途中打断用户；未确认条款由下一步的 gate 统一弹出。
    pick(v) {
      this.venue = v
      store.apply.venue = v
      invalidateFrom(1)
    },
    next() {
      if (!this.venue) { uni.showToast({ title: '请选择场地', icon: 'none' }); return }
      // 门在每一步的「下一步」（2026-10-29 用户指出：没确认就该拦住）：
      // 选场地时触发的条款没确认完，不能进第 2 步——弹窗是阻断式，确认完才能继续。
      if (!this.gate()) return
      store.apply.step = 2
      uni.navigateTo({ url: '/pages/apply/need' })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。
   标题行与入口在共用组件里（SecHead / EntryChip）——这里不再各页写一份，这是「不统一」的根因。 */
.sec { margin: 24rpx; }
.sec-sub { font-size: var(--fs-2); color: var(--text-3); font-weight: 400; margin-left: 12rpx; }
.venue-list { display: flex; flex-direction: column; gap: 12rpx; }
.venue-item { display: flex; align-items: center; gap: 16rpx; border: 2rpx solid var(--line); border-radius: 16rpx; padding: 20rpx; box-sizing: border-box; min-height: 88rpx; }
.venue-item.on { border-color: var(--primary); background: rgba(74,108,247,.05); }
.venue-radio { width: 30rpx; height: 30rpx; border-radius: 50%; border: 2rpx solid #D5DAEA; flex: none; }
.venue-item.on .venue-radio { border-color: var(--primary); background: radial-gradient(circle, var(--primary) 45%, transparent 50%); }
.venue-info { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
.venue-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.venue-addr { font-size: var(--fs-2); color: var(--text-3); }
/* 行里只留短值（2026-10-29 九次调整）；入口在标题行右侧（十次调整），行尾不再挂东西。 */
.venue-line { display: flex; align-items: baseline; gap: 12rpx; }
.venue-meta { flex: 1; min-width: 116rpx; font-size: var(--fs-1); color: var(--text-3); }
.badge { flex: none; font-size: var(--fs-1); padding: 8rpx 12rpx; border-radius: 999rpx; }
.badge.ok { color: var(--success); background: rgba(43,164,113,.12); }
.badge.warn { color: var(--warn); background: rgba(230,162,60,.12); }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.pb-btn.dis { background: #E3E6F0; color: var(--text-3); }
</style>
