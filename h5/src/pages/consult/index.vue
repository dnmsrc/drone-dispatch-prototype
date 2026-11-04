<template>
  <view class="page">
    <NavBar title="我的预约" />
    <scroll-view scroll-y class="body">
      <!-- 未登录：直接引导登录，不摆空列表骗人 -->
      <view v-if="!logged" class="card sec gate">
        <text class="g-t">登录后查看你的预约</text>
        <text class="g-s">咨询单、客服受理进度与派单都绑在账号上</text>
        <button class="pb-inline" @click="goLogin">去登录</button>
      </view>

      <!-- 空态：还没有提交过咨询单 -->
      <view v-else-if="!loading && !list.length" class="card sec gate">
        <text class="g-t">还没有预约申请</text>
        <text class="g-s">提交咨询单后，客服受理进度、派单与报价区间都会出现在这里</text>
        <button class="pb-inline" @click="goApply">去预约表演</button>
      </view>

      <view v-for="c in list" :key="c.id" class="card sec item">
        <view class="it-head">
          <view class="ih-left">
            <text class="ih-no">{{ c.id }}</text>
            <text class="ih-sub">{{ c.performDate }} {{ c.timeSlot }} · {{ c.venue && c.venue.name }}</text>
          </view>
          <text class="ih-status" :class="statusCls(c)">{{ c.statusText }}</text>
        </view>

        <view class="it-meta"><text class="im-k">规模与内容</text><text class="im-v">{{ c.need.droneCount }} 架 · {{ c.need.duration }} 分钟 · 观众 {{ c.need.audience }} 人</text></view>
        <view class="it-meta"><text class="im-k">报价区间</text><text class="im-v price" :class="{ dim: !isActive(c) }">¥{{ rangeOf(c)[0].toLocaleString() }} - ¥{{ rangeOf(c)[1].toLocaleString() }}</text></view>
        <!-- 派单号只在真的派单号存在时出现：客服工作台数据不完整时，宁可少一行也不能摆一行空值 -->
        <view v-if="c.dispatch && c.dispatch.id" class="it-meta"><text class="im-k">派单号</text><text class="im-v">{{ c.dispatch.id }}<text v-if="!isActive(c)" class="void-note">（已作废）</text></text></view>
        <view class="it-meta"><text class="im-k">最近更新</text><text class="im-v">{{ fmtStamp(c.updatedAt) }}</text></view>

        <view v-if="c.reject" class="it-note bad">客服驳回：{{ c.reject.reason }}</view>
        <!-- 状态胶囊已经写了「已自动废弃」，这里只补「去向」，不再重复一遍「废弃」 -->
        <view v-if="c.supersede" class="it-note">已被新申请 {{ c.supersede.by }} 覆盖，本单不再受理</view>

        <!-- 展开：派单六项 + 全流程留痕 -->
        <view v-if="expanded[c.id]" class="detail">
          <view v-if="c.dispatch" class="fill-list">
            <view v-for="m in c.dispatch.mustFill" :key="m.key" class="fill">
              <text class="fl-t">{{ m.label }}</text>
              <text class="fl-v">{{ showVal(m) }}</text>
            </view>
            <view v-if="c.dispatch.note" class="dn"><text class="dn-k">客服备注</text><text class="dn-v">{{ c.dispatch.note }}</text></view>
          </view>
          <view class="tl">
            <view v-for="(e, i) in c.timeline" :key="i" class="tl-row">
              <text class="tl-dot" :class="{ last: i === c.timeline.length - 1 }"></text>
              <view class="tl-main">
                <text class="tl-t">{{ e.text }}</text>
                <text class="tl-s">{{ fmtStamp(e.at) }} · {{ e.by }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="it-acts">
          <button class="ghost-btn half" @click="toggle(c.id)">{{ expanded[c.id] ? '收起' : '查看进度' }}</button>
          <button v-if="canContinue(c)" class="pb-inline half" @click="toApply(c)">继续办理</button>
          <button v-else class="ghost-btn half" @click="reapply">重新申请</button>
        </view>
      </view>

      <view style="height: 60rpx"></view>
    </scroll-view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import { store, newApply, restoreFromConsult, requireLogin, isLoggedIn } from '@/store'
import { getSilent } from '@/utils/request'
import { isActive, fmtStamp } from '@/engine/consult'

/**
 * 我的预约（2026-11-02 用户要求：咨询单要留记录，H5 要有便捷入口随时点进来看）。
 * 数据全部来自服务端（/api/consults/mine），不读本地草稿 —— 换设备、清缓存后仍然看得到。
 * 页面上做的事只有两件：看进度、继续办理（把这张单恢复进流程）。
 */
export default {
  components: { NavBar },
  data() {
    return { list: [], loading: false, expanded: {} }
  },
  computed: {
    logged() { return isLoggedIn() }
  },
  onShow() { this.load() },
  methods: {
    fmtStamp,
    // 模板里直接调用的函数必须挂到实例上（选项式 API 只认 methods/computed/data 的键）；
    // 只 import 不进 methods 的话，模板求值会抛 `isActive is not a function`，
    // Vue 把出错的那个节点渲染成 <!---->，整行静默消失 —— 页面看着只是「少了一行」，不报错。
    isActive,
    async load() {
      if (!this.logged) return
      this.loading = true
      try {
        const d = await getSilent('/consults/mine')
        this.list = d.list || []
      } catch (e) {
        this.list = []
      } finally {
        this.loading = false
      }
    },
    statusCls(c) {
      if (['PENDING', 'RECEIVED'].includes(c.status)) return 'wait'
      if (c.status === 'DISPATCHED') return 'todo'
      if (c.status === 'CONFIRMED') return 'done'
      if (c.status === 'REJECTED') return 'bad'
      return 'idle'
    },
    // 报价区间：客服派单给了就用派单的，否则用提交时的预估区间
    rangeOf(c) {
      if (c.dispatch && c.dispatch.quoteRange) return c.dispatch.quoteRange
      if (c.quote) return [c.quote.lo || 0, c.quote.hi || 0]
      return [0, 0]
    },
    showVal(m) { return typeof m.value === 'number' ? `¥${m.value.toLocaleString()}` : (m.value == null ? '—' : m.value) },
    toggle(id) { this.expanded[id] = !this.expanded[id] },
    canContinue(c) { return isActive(c) },
    toApply(c) {
      restoreFromConsult(c)
      uni.navigateTo({ url: '/pages/apply/consult' })
    },
    reapply() {
      uni.showModal({
        title: '重新申请',
        content: '将回到第 1 步重新填写，原来那张单不会被翻新；确认重新申请吗？',
        success: (r) => {
          if (!r.confirm) return
          store.apply = newApply()
          uni.navigateTo({ url: '/pages/apply/venue' })
        }
      })
    },
    goLogin() { uni.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/consult/index') }) },
    // 2026-11-03 用户要求：空态的「去预约表演」直接进预约表单，不要绕回首页（原来 reLaunch 首页，用户还得再点一次）。
    // 空态说明还没有咨询单，草稿也一并重置，从第 1 步重新开始。
    goApply() {
      if (!requireLogin('/pages/apply/venue')) return
      store.apply = newApply()
      uni.navigateTo({ url: '/pages/apply/venue' })
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
.body { flex: 1; min-height: 0; }
/* 间距标准：节奏 = 4 的倍数；卡片留白 24；可点目标 ≥88rpx */
.sec { margin: 24rpx; }
.gate { display: flex; flex-direction: column; gap: 12rpx; align-items: flex-start; }
.g-t { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.g-s { font-size: var(--fs-3); color: var(--text-2); line-height: 1.7; }
.item { display: flex; flex-direction: column; }
.it-head { display: flex; align-items: flex-start; gap: 16rpx; padding-bottom: 16rpx; border-bottom: 1rpx solid var(--bg-2); }
.ih-left { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 6rpx; }
.ih-no { font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--text-1); }
.ih-sub { font-size: var(--fs-2); color: var(--text-3); }
.ih-status { flex: none; font-size: var(--fs-2); font-weight: var(--fw-bold); padding: 8rpx 16rpx; border-radius: 999rpx; background: var(--bg-2); color: var(--text-2); }
.ih-status.wait { color: var(--primary); background: rgba(74,108,247,.1); }
.ih-status.todo { color: var(--warn); background: rgba(230,162,60,.12); }
.ih-status.done { color: var(--success); background: rgba(43,164,113,.12); }
.ih-status.bad { color: var(--danger); background: rgba(245,108,108,.12); }
.it-meta { display: flex; align-items: center; gap: 16rpx; min-height: 64rpx; }
.im-k { flex: none; min-width: 116rpx; font-size: var(--fs-2); color: var(--text-3); white-space: nowrap; }
.im-v { flex: 1; min-width: 116rpx; font-size: var(--fs-3); color: var(--text-1); }
.im-v.price { color: var(--primary-deep); font-weight: var(--fw-bold); }
/* 已废弃/已驳回的单：报价只是历史，不再有效 —— 降为次要文字，避免被当成「还能按这个价签」 */
.im-v.price.dim { color: var(--text-3); font-weight: var(--fw-semibold); }
.void-note { color: var(--danger); font-size: var(--fs-2); font-weight: var(--fw-semibold); }
.it-note { margin-top: 8rpx; padding: 16rpx; border-radius: 12rpx; background: var(--bg-2); font-size: var(--fs-2); color: var(--text-2); line-height: 1.6; }
.it-note.bad { color: var(--danger); background: rgba(245,108,108,.1); }
.detail { margin-top: 12rpx; display: flex; flex-direction: column; gap: 12rpx; }
.fill-list { display: flex; flex-direction: column; gap: 12rpx; }
.fill { border-left: 6rpx solid var(--primary); background: var(--bg); border-radius: 12rpx; padding: 16rpx; display: flex; flex-direction: column; gap: 4rpx; min-width: 116rpx; }
.fl-t { font-size: var(--fs-3); font-weight: var(--fw-bold); }
.fl-v { font-size: var(--fs-3); color: var(--success); }
.dn { padding: 16rpx; background: var(--bg-2); border-radius: 12rpx; display: flex; flex-direction: column; gap: 4rpx; }
.dn-k { font-size: var(--fs-2); color: var(--text-3); }
.dn-v { font-size: var(--fs-3); }
.tl { display: flex; flex-direction: column; }
.tl-row { display: flex; gap: 16rpx; min-height: 64rpx; }
.tl-dot { flex: none; width: 16rpx; height: 16rpx; border-radius: 50%; background: var(--primary); margin-top: 12rpx; box-shadow: 0 0 0 6rpx rgba(74,108,247,.12); }
.tl-dot.last { background: var(--success); box-shadow: 0 0 0 6rpx rgba(43,164,113,.14); }
.tl-main { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; padding-bottom: 16rpx; border-bottom: 1rpx solid var(--bg-2); }
.tl-row:last-child .tl-main { border-bottom: none; }
.tl-t { font-size: var(--fs-3); color: var(--text-1); }
.tl-s { font-size: var(--fs-1); color: var(--text-3); }
.it-acts { display: flex; gap: 16rpx; margin-top: 24rpx; }
/* 两枚按钮严格均分（min-width:0 抵消 flex item 的 min-content 下限，否则两枚宽度会差 2–4rpx） */
.half { flex: 1 1 0; min-width: 0; margin-top: 0; }
/* 两枚按钮并排：内边距必须同一档（uni-button 自带 14px 内边距，不覆盖会比实心按钮窄 2rpx 且文字位置不齐） */
.ghost-btn { border: 2rpx solid var(--primary); background: rgba(74,108,247,.06); color: var(--primary-deep); border-radius: 999rpx; font-size: var(--fs-3); font-weight: var(--fw-bold); min-height: 88rpx; box-sizing: border-box; padding: 0 24rpx; }
.ghost-btn::after { border: none; }
/* 实心按钮补一圈透明边框：并排的描边按钮有 2rpx 边框，不补的话实心按钮会窄 2–4rpx，
   且两枚按钮的字基线差半格（实测 317.5 vs 319.5） */
.pb-inline { border: 2rpx solid transparent; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-3); font-weight: var(--fw-bold); min-height: 88rpx; box-sizing: border-box; padding: 0 24rpx; }
.pb-inline::after { border: none; }
</style>
