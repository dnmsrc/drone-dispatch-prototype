<template>
  <view class="page">
    <!-- 夜空 Banner -->
    <NightSky :star-count="56">
      <view class="hero">
        <view class="brand">
          <DroneLogo :size="44" :float="false" color="#8FA6FF" light="#3DE0C0" />
          <text class="brand-name">{{ brandName }}</text>
        </view>
        <view class="hero-main">
          <DroneLogo :size="210" color="#7E97FF" rotor-color="#A9BCFF" light="#3DE0C0" />
          <text class="slogan">把夜空，变成你的舞台</text>
          <text class="slogan-sub">{{ slogan }}</text>
          <button class="cta" @click="goCreate()">
            <text>立即预约表演</text>
            <text class="cta-arrow">→</text>
          </button>
          <!-- 便捷入口：有进行中的咨询单时带徽标，点一下直接看客服受理到哪一步 -->
          <view class="mine-link" @click="goMine">
            <text class="ml-t">我的预约</text>
            <text v-if="activeCount" class="ml-badge">{{ activeCount }} 单进行中</text>
            <text class="ml-arrow">›</text>
          </view>
        </view>
        <view class="hero-stats">
          <view class="stat"><text class="num">1200<text class="plus">+</text></text><text class="lbl">场成功表演</text></view>
          <view class="divider"></view>
          <view class="stat"><text class="num">100-1000</text><text class="lbl">架次任选</text></view>
          <view class="divider"></view>
          <view class="stat"><text class="num">4.9</text><text class="lbl">用户评分</text></view>
        </view>
      </view>
    </NightSky>

    <!-- 服务流程 -->
    <view class="section">
      <view class="sec-title">服务流程</view>
      <view class="flow">
        <view v-for="(f, i) in flows" :key="i" class="flow-item">
          <view class="flow-icon" v-html="f.icon"></view>
          <text class="flow-name">{{ f.name }}</text>
          <text class="flow-desc">{{ f.desc }}</text>
          <view v-if="i < flows.length - 1" class="flow-line"></view>
        </view>
      </view>
    </view>

    <!-- 架次档位 -->
    <view class="section">
      <view class="sec-title">架次档位<text class="sec-sub">按场景随心选</text></view>
      <scroll-view scroll-x class="tier-scroll" enhanced :show-scrollbar="false">
        <view class="tier-row">
          <view v-for="t in tiers" :key="t.drones" class="tier-card" @click="goCreate(t.drones)">
            <view class="tier-dots"><text v-for="n in dotCount(t.drones)" :key="n" class="tdot">✦</text></view>
            <text class="tier-num">{{ t.drones }}<text class="tier-unit"> 架</text></text>
            <text class="tier-price">¥{{ t.price.toLocaleString() }}<text class="per"> 起</text></text>
            <text class="tier-desc">{{ t.desc }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 精选案例 -->
    <view class="section">
      <view class="sec-title">精选案例<text class="sec-sub">每一场都独一无二</text></view>
      <scroll-view scroll-x class="case-scroll" enhanced :show-scrollbar="false">
        <view class="case-row">
          <view v-for="c in cases" :key="c.title" class="case-card">
            <image class="case-img" :src="c.img" mode="aspectFill" />
            <view class="case-info">
              <text class="case-title">{{ c.title }}</text>
              <text class="case-meta">{{ c.meta }}</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <view class="tip">演示环境 · 数据来自本地 Mock Server</view>
    <view style="height: 140rpx"></view>
    <TabBar current="home" />

    <!-- 已有进行中的咨询单：先问用户是「去看」还是「重新申请」，不替他决定 -->
    <view v-if="askShow" class="mask" @click="askShow = false">
      <view class="ask" @click.stop>
        <text class="ask-t">你有一张进行中的咨询单</text>
        <text class="ask-no">{{ active.id }} · {{ active.statusText }}</text>
        <text class="ask-sub">{{ active.performDate }} {{ active.timeSlot }} · {{ active.venue && active.venue.name }}</text>
        <text class="ask-tip">重新申请会进入新的填写流程；新单提交那一刻，这张单会被自动废弃。</text>
        <view class="ask-acts">
          <button class="ghost-btn half" @click="lookActive">查看我的预约</button>
          <button class="pb-inline half" @click="reApply">重新申请</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import NightSky from '@/components/NightSky.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import TabBar from '@/components/TabBar.vue'
import { get, getSilent } from '@/utils/request'
import { store, newApply, requireLogin, isLoggedIn } from '@/store'

const ico = (p) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#4A6CF7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${p}</svg>`

export default {
  components: { NightSky, DroneLogo, TabBar },
  data() {
    return {
      tiers: [],
      flows: [
        { name: '选择方案', desc: '架次/图案/日期', icon: ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') },
        { name: '在线支付', desc: '微信/支付宝', icon: ico('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>') },
        { name: '商户接单', desc: '专业团队筹备', icon: ico('<path d="M20 6 9 17l-5-5"/>') },
        { name: '惊艳表演', desc: '点亮夜空', icon: ico('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>') }
      ],
      cases: [
        { title: '世纪求婚 · 300 架', meta: '滨江世纪广场 · 「嫁给我吧」', img: '/api/media/photo/case-marry' },
        { title: '品牌之夜 · 500 架', meta: '奥体中心 · 企业 LOGO 定制', img: '/api/media/photo/case-brand' },
        { title: '生日惊喜 · 100 架', meta: '小区广场 · 星辰图案', img: '/api/media/photo/case-birthday' },
        { title: '城市灯光节 · 1000 架', meta: '城市阳台 · 城市之光', img: '/api/media/photo/case-city' }
      ],
      // 进行中的咨询单（服务端 /api/consults/active）：点「立即预约表演」前先提示，入口徽标也用它
      active: null,
      activeCount: 0,
      askShow: false,
      pendingDrones: 0
    }
  },
  computed: {
    brandName() { return store.profile?.brand?.appName || '星穹 SkyShow' },
    slogan() { return store.profile?.brand?.slogan || '无人机编队灯光表演 · 一站式预约' }
  },
  onShow() {
    if (!store.pricing) {
      get('/config/pricing').then(d => {
        store.pricing = d
        this.tiers = d.priceRules.tiers
      }).catch(() => {})
    } else {
      this.tiers = store.pricing.priceRules.tiers
    }
    // 品牌档案兜底（App onLaunch 已拉取，这里防止时序竞争导致的空值）
    if (!store.profile) get('/config/profile').then(d => { store.profile = d }).catch(() => {})
    this.refreshActive()
  },
  methods: {
    dotCount(drones) { return Math.min(10, Math.max(3, Math.round(drones / 100))) },
    /** 拉「进行中的咨询单」：入口徽标 + 点预约时的前置提示（未登录时静默失败） */
    refreshActive() {
      getSilent('/consults/active').then(d => {
        this.active = d.active || null
        this.activeCount = d.active ? 1 : 0
      }).catch(() => { this.active = null; this.activeCount = 0 })
    },
    goMine() { uni.navigateTo({ url: '/pages/consult/index' }) },
    // 2026-11-02 用户要求：下次点「预约表演」时，若已经有在预约的单，先提示「你已在预约中，是否跳转查看」。
    // 不直接开新流程 —— 用户可能是想回去看进度，直接被覆盖掉草稿就白填了。
    async goCreate(drones) {
      // 登录门（2026-11-03 用户要求）：没登录不允许点进预约流程。
      // 首页 CTA 与架次档位卡都走这里，所以一处拦全部入口。
      if (!requireLogin('/pages/apply/venue')) return
      this.pendingDrones = (Number.isFinite(drones) && drones > 0) ? drones : 0
      if (isLoggedIn()) {
        try {
          const d = await getSilent('/consults/active')
          if (d.active) { this.active = d.active; this.askShow = true; return }
        } catch (e) { /* 网络/未登录：当作没有进行中的单，正常进流程 */ }
      }
      this.startApply()
    },
    startApply() {
      const a = newApply()
      if (this.pendingDrones > 0) a.need.droneCount = this.pendingDrones
      store.apply = a
      // 2026-10-28 六次调整（用户要求）：告知不再是流程的第一步 —— 直接进第 1 步选场地，
      // 重大条款在点击下一步时集中逐条确认；《申请说明》通过每页右下角的悬浮按钮随时回看。
      uni.navigateTo({ url: '/pages/apply/venue' })
    },
    lookActive() { this.askShow = false; this.goMine() },
    reApply() { this.askShow = false; this.startApply() }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--bg); }
.hero { padding: 30rpx 40rpx 50rpx; }
.brand { display: flex; align-items: center; gap: 14rpx; }
.brand-name { color: #E8ECFF; font-size: var(--fs-6); font-weight: var(--fw-bold); letter-spacing: 2rpx; }
.hero-main { display: flex; flex-direction: column; align-items: center; margin-top: 56rpx; }
.slogan { color: #fff; font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: 4rpx; margin-top: 40rpx; }
.slogan-sub { color: rgba(232, 236, 255, .65); font-size: var(--fs-4); margin-top: 14rpx; letter-spacing: 2rpx; }
.cta {
  margin-top: 44rpx;
  display: flex; align-items: center; gap: 16rpx;
  background: linear-gradient(135deg, var(--primary), #7C9BFF);
  color: #fff; font-size: var(--fs-7); font-weight: var(--fw-bold);
  padding: 24rpx 64rpx; border-radius: 999rpx; border: none;
  box-shadow: 0 0 40rpx rgba(74, 108, 247, .65), inset 0 0 20rpx rgba(255,255,255,.15);
  animation: pulse 2.4s ease-in-out infinite;
}
.cta::after { border: none; }
.cta-arrow { font-size: var(--fs-9); }
/* 我的预约快捷入口：CTA 下一行，高度 ≥88rpx 保证可点；有进行中的单时带青色徽标 */
.mine-link {
  display: flex; align-items: center; gap: 12rpx;
  min-height: 88rpx; margin-top: 20rpx; padding: 0 28rpx;
  border-radius: 999rpx; background: rgba(255,255,255,.08); border: 1rpx solid rgba(255,255,255,.16);
}
.ml-t { color: #E8ECFF; font-size: var(--fs-3); font-weight: var(--fw-semibold); }
.ml-badge { color: var(--cyan); font-size: var(--fs-2); background: rgba(61,224,192,.12); padding: 6rpx 12rpx; border-radius: 999rpx; }
.ml-arrow { color: rgba(232,236,255,.6); font-size: var(--fs-4); margin-left: auto; }
/* 已有进行中咨询单时的询问层 */
.mask { position: fixed; inset: 0; background: rgba(10,14,32,.6); display: flex; align-items: center; justify-content: center; z-index: 90; padding: 48rpx; }
.ask { width: 100%; max-width: 620rpx; background: #fff; border-radius: 24rpx; padding: 32rpx 24rpx 24rpx; display: flex; flex-direction: column; gap: 12rpx; }
.ask-t { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.ask-no { font-size: var(--fs-4); color: var(--primary); font-weight: var(--fw-bold); }
.ask-sub { font-size: var(--fs-3); color: var(--text-2); }
.ask-tip { font-size: var(--fs-2); color: var(--text-3); line-height: 1.6; }
.ask-acts { display: flex; gap: 16rpx; margin-top: 16rpx; }
.half { flex: 1; min-height: 88rpx; border-radius: 999rpx; font-size: var(--fs-3); font-weight: var(--fw-bold); }
.ghost-btn { border: 2rpx solid var(--primary); background: rgba(74,108,247,.06); color: var(--primary); }
.ghost-btn::after { border: none; }
.pb-inline { border: none; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; }
.pb-inline::after { border: none; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 30rpx rgba(74,108,247,.5), inset 0 0 20rpx rgba(255,255,255,.12); }
  50% { box-shadow: 0 0 60rpx rgba(74,108,247,.85), inset 0 0 24rpx rgba(255,255,255,.2); }
}
.hero-stats {
  margin-top: 60rpx;
  display: flex; align-items: center; justify-content: space-around;
  background: rgba(255, 255, 255, .06);
  border: 1rpx solid rgba(255, 255, 255, .1);
  border-radius: 24rpx; padding: 26rpx 0;
  backdrop-filter: blur(6px);
}
.stat { display: flex; flex-direction: column; align-items: center; gap: 6rpx; }
.num { color: #fff; font-size: var(--fs-9); font-weight: var(--fw-heavy); }
.plus { color: #3DE0C0; font-size: var(--fs-5); }
.lbl { color: rgba(232, 236, 255, .55); font-size: var(--fs-2); }
.divider { width: 1rpx; height: 56rpx; background: rgba(255, 255, 255, .12); }

.section { padding: 36rpx 30rpx 0; }
.flow { display: flex; }
.flow-item { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.flow-icon {
  width: 88rpx; height: 88rpx; border-radius: 28rpx;
  background: #fff; box-shadow: 0 8rpx 24rpx rgba(74,108,247,.12);
  display: flex; align-items: center; justify-content: center;
}
.flow-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); margin-top: 14rpx; }
.flow-desc { font-size: var(--fs-1); color: var(--text-3); margin-top: 4rpx; }
.flow-line { position: absolute; top: 44rpx; left: 68%; width: 64%; height: 2rpx; background: linear-gradient(90deg, #D6DEFC, transparent); }

.tier-scroll { white-space: nowrap; }
.tier-row { display: inline-flex; gap: 20rpx; padding: 6rpx 2rpx 16rpx; }
.tier-card {
  width: 250rpx; flex-shrink: 0;
  background: #fff; border-radius: 24rpx; padding: 26rpx;
  box-shadow: 0 8rpx 30rpx rgba(26,29,46,.06);
  display: flex; flex-direction: column; gap: 8rpx;
  border: 2rpx solid transparent;
}
.tier-card:active { border-color: var(--primary); }
.tier-dots { height: 34rpx; overflow: hidden; }
.tdot { color: var(--primary); font-size: var(--fs-2); margin-right: 6rpx; }
.tier-num { font-size: var(--fs-11); font-weight: var(--fw-heavy); color: var(--text-1); }
.tier-unit { font-size: var(--fs-3); font-weight: var(--fw-medium); color: var(--text-2); }
.tier-price { color: var(--primary-deep); font-size: var(--fs-6); font-weight: var(--fw-bold); }
.per { font-size: var(--fs-2); color: var(--text-3); font-weight: 400; }
.tier-desc { font-size: var(--fs-2); color: var(--text-3); white-space: normal; }

.case-scroll { white-space: nowrap; }
.case-row { display: inline-flex; gap: 20rpx; padding: 6rpx 2rpx 16rpx; }
.case-card {
  width: 300rpx; flex-shrink: 0; border-radius: 24rpx; overflow: hidden;
  background: #fff; box-shadow: 0 8rpx 30rpx rgba(26,29,46,.06);
}
.case-img { width: 300rpx; height: 190rpx; display: block; }
.case-info { padding: 18rpx 20rpx 22rpx; display: flex; flex-direction: column; gap: 4rpx; }
.case-title { font-size: var(--fs-4); font-weight: var(--fw-bold); }
.case-meta { font-size: var(--fs-1); color: var(--text-3); }
.tip { text-align: center; color: var(--text-4); font-size: var(--fs-1); margin-top: 40rpx; }
</style>
