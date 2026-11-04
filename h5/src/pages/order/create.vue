<template>
  <view class="page">
    <NavBar title="预约表演" />

    <scroll-view scroll-y class="body" :scroll-top="scrollTop">
      <!-- 架次档位 -->
      <view class="sec card" id="sec-tier">
        <view class="sec-title">选择架次<text class="sec-sub">{{ form.droneCount }} 架</text></view>
        <view class="tier-grid">
          <view
            v-for="t in tiers" :key="t.drones"
            class="tier" :class="{ on: form.droneCount === t.drones }"
            @click="form.droneCount = t.drones"
          >
            <view class="tier-dots"><text v-for="n in dotCount(t.drones)" :key="n">✦</text></view>
            <text class="tier-num">{{ t.drones }}<text class="u"> 架</text></text>
            <text class="tier-price">¥{{ t.price.toLocaleString() }}</text>
            <text class="tier-desc">{{ t.desc }}</text>
          </view>
        </view>
      </view>

      <!-- 表演时长 -->
      <view class="sec card">
        <view class="sec-title">表演时长</view>
        <view class="seg">
          <view
            v-for="d in durations" :key="d.minutes"
            class="seg-item" :class="{ on: form.duration === d.minutes }"
            @click="form.duration = d.minutes"
          >
            <text class="seg-name">{{ d.minutes }} 分钟</text>
            <text class="seg-price">{{ d.extra ? '+' + d.extra.toLocaleString() : '含在基础价' }}</text>
          </view>
        </view>
      </view>

      <!-- 图案定制 -->
      <view class="sec card" id="sec-pattern">
        <view class="sec-title">图案与内容定制<text class="sec-sub">预设图案免费任选</text></view>
        <view class="pattern-grid">
          <view
            v-for="p in patterns" :key="p.key"
            class="pattern" :class="{ on: form.patternPreset.includes(p.key) }"
            @click="togglePattern(p.key)"
          >
            <view class="pattern-icon" v-html="patternIcon(p.key)"></view>
            <text class="pattern-name">{{ p.label }}</text>
          </view>
        </view>

        <view class="opt-row" @click="form.useText = !form.useText">
          <view class="opt-info">
            <text class="opt-name">定制文字</text>
            <text class="opt-desc">最多 10 字，如「嫁给我吧」「XX 生日快乐」</text>
          </view>
          <text class="opt-price">+¥{{ pricing.customTextPrice.toLocaleString() }}</text>
          <view class="switch" :class="{ on: form.useText }"><view class="knob"></view></view>
        </view>
        <input
          v-if="form.useText"
          v-model="form.customText"
          class="text-input"
          maxlength="10"
          placeholder="请输入定制文字（10 字以内）"
          placeholder-class="ph"
        />

        <view class="opt-row" @click="form.useLogo = !form.useLogo">
          <view class="opt-info">
            <text class="opt-name">LOGO / 图片定制</text>
            <text class="opt-desc">上传企业 LOGO 或定制图案参考图</text>
          </view>
          <text class="opt-price">+¥{{ pricing.customLogoPrice.toLocaleString() }}</text>
          <view class="switch" :class="{ on: form.useLogo }"><view class="knob"></view></view>
        </view>
        <view v-if="form.useLogo" class="logo-box">
          <view v-if="form.logoPreview" class="logo-preview">
            <image :src="form.logoPreview" mode="aspectFit" class="logo-img" />
            <text class="logo-name">{{ form.customLogo }}</text>
            <text class="logo-del" @click.stop="clearLogo">✕</text>
          </view>
          <view v-else class="logo-upload" @click.stop="chooseLogo">
            <text class="up-icon">＋</text>
            <text class="up-text">点击上传图片</text>
          </view>
        </view>
      </view>

      <!-- 附加服务 -->
      <view class="sec card">
        <view class="sec-title">附加服务<text class="sec-sub">可多选</text></view>
        <view class="addon-grid">
          <view
            v-for="a in addons" :key="a.key"
            class="addon" :class="{ on: form.addons.includes(a.key) }"
            @click="toggleAddon(a.key)"
          >
            <view class="addon-check"><view v-if="form.addons.includes(a.key)" class="gck"></view></view>
            <text class="addon-name">{{ a.label }}</text>
            <text class="addon-price">+¥{{ a.price.toLocaleString() }}</text>
            <text class="addon-desc">{{ addonDesc(a.key) }}</text>
          </view>
        </view>
      </view>

      <!-- 日期时段 -->
      <view class="sec" id="sec-date">
        <view class="sec-title" style="padding: 0 6rpx">表演日期<text class="sec-sub">每日限 {{ dailyLimit }} 场，约满即止</text></view>
        <Calendar :value="form.performDate" :schedule="scheduleMap" :window-days="60" @select="onDate" />
        <view class="slots card">
          <text class="slots-label">表演时段</text>
          <view class="slot-row">
            <view
              v-for="s in timeSlots" :key="s"
              class="slot" :class="{ on: form.timeSlot === s, off: !form.performDate }"
              @click="pickSlot(s)"
            >{{ s }}</view>
          </view>
          <text v-if="!form.performDate" class="slots-tip">请先选择日期</text>
        </view>
      </view>

      <!-- 表演场地 -->
      <view class="sec card" id="sec-venue">
        <view class="sec-title">表演场地</view>
        <!-- 2026-10-28（用户要求）：场地只有管理端维护的固定预设场地，用户不能地图选点或手动输入 -->
        <text class="venue-fixed-note">只开放固定预设场地（有实测档案），不能自选位置或手动输入。</text>

        <view class="venue-list">
          <view
            v-for="v in venues" :key="v.id"
            class="venue-item" :class="{ on: form.venue.name === v.name }"
            @click="pickVenue(v)"
          >
            <view class="venue-radio"></view>
            <view class="venue-info">
              <text class="venue-name">{{ v.name }}</text>
              <text class="venue-addr">{{ v.address }}</text>
            </view>
          </view>
          <view v-if="!venues.length" class="venue-empty">暂无可用场地（管理端维护的固定场地）</view>
        </view>
      </view>

      <!-- 联系人 -->
      <view class="sec card" id="sec-contact">
        <view class="sec-title">联系人信息</view>
        <input v-model="form.contact.name" class="text-input" placeholder="联系人姓名" placeholder-class="ph" />
        <input v-model="form.contact.phone" class="text-input" type="number" maxlength="11" placeholder="手机号（11 位）" placeholder-class="ph" />
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <!-- 底部实时价格条 -->
    <view class="price-bar">
      <view class="pb-left">
        <text class="pb-label">预估总价</text>
        <text class="pb-price">¥{{ totalPrice.toLocaleString() }}</text>
      </view>
      <button class="pb-btn" @click="submit">下一步 · 确认订单</button>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import Calendar from '@/components/Calendar.vue'
import { get, post } from '@/utils/request'
import { store, isLoggedIn } from '@/store'

const P_ICONS = {
  heart: '<path d="M12 20s-7-4.5-9-9c-1.2-2.8.5-6 3.5-6 2 0 3.5 1.2 4.5 3 1-1.8 2.5-3 4.5-3 3 0 4.7 3.2 3.5 6-2 4.5-9 9-9 9z"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9 8l3-4 3 4M9 8h6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6L12 16.8 6.6 19.7l1.1-6L3.2 9.4l6.1-.8z"/>',
  phoenix: '<path d="M4 18c6-1 8-4 8-9 3 1 4 4 3 7 2-1 3-3 3-6 2 3 1 7-2 9-3.5 2.3-9 1.5-12-1z"/>',
  rose: '<circle cx="12" cy="9" r="4"/><path d="M12 13v8M9 17c1.5 1.2 4.5 1.2 6 0"/>',
  moon: '<path d="M19 13.5A7.5 7.5 0 1 1 10.5 5 6 6 0 0 0 19 13.5z"/>'
}

export default {
  components: { NavBar, Calendar },
  data() {
    return {
      pricing: { customTextPrice: 2000, customLogoPrice: 5000 },
      tiers: [], durations: [], addons: [], patterns: [], timeSlots: ['19:00-20:00', '20:00-21:00', '21:00-22:00'],
      venues: [], dailyLimit: 3,
      scheduleMap: {},
      scrollTop: 0,
      form: {
        droneCount: 300,
        duration: 10,
        patternPreset: ['heart'],
        useText: false, customText: '',
        useLogo: false, customLogo: '', logoPreview: '',
        addons: [],
        performDate: '', timeSlot: '',
        venue: { type: '', name: '', address: '', lng: 0, lat: 0 },
        contact: { name: '', phone: '' }
      }
    }
  },
  computed: {
    totalPrice() {
      let total = 0
      const t = this.tiers.find(x => x.drones === this.form.droneCount)
      if (t) total += t.price
      const d = this.durations.find(x => x.minutes === this.form.duration)
      if (d) total += d.extra
      if (this.form.useText && this.form.customText.trim()) total += this.pricing.customTextPrice
      if (this.form.useLogo && this.form.customLogo) total += this.pricing.customLogoPrice
      for (const k of this.form.addons) {
        const a = this.addons.find(x => x.key === k)
        if (a) total += a.price
      }
      return total
    }
  },
  onLoad() {
    // 首页带档位进入（仅接受合法架次数，消费后即清除草稿）
    if (store.draft && Number.isFinite(store.draft.droneCount) && store.draft.droneCount > 0) {
      this.form.droneCount = store.draft.droneCount
    }
    store.draft = null
    this.loadPricing()
    this.loadSchedule()
  },
  methods: {
    dotCount(d) { return Math.min(8, Math.max(3, Math.round(d / 120))) },
    patternIcon(k) {
      const on = this.form.patternPreset.includes(k)
      const color = on ? '#4A6CF7' : '#9AA0B5'
      return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${P_ICONS[k] || ''}</svg>`
    },
    addonDesc(k) {
      return { music: '与编队动作同步的专属配乐', narration: '专业主持人现场解说', aerial: '双机位航拍，成片回传', urgent: '48 小时内优先安排场次' }[k] || ''
    },
    loadPricing() {
      const apply = (d) => {
        store.pricing = d
        this.pricing = d.priceRules
        this.tiers = d.priceRules.tiers
        this.durations = d.priceRules.durations
        this.addons = d.priceRules.addons
        this.patterns = d.priceRules.patterns
        this.timeSlots = d.priceRules.timeSlots
        this.venues = d.venues
        this.dailyLimit = d.dailyLimit
      }
      if (store.pricing) apply(store.pricing)
      else get('/config/pricing').then(apply).catch(() => {})
    },
    loadSchedule() {
      const pad = (n) => String(n).padStart(2, '0')
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const from = fmt(new Date())
      const to = fmt(new Date(Date.now() + 60 * 86400000))
      get(`/schedule?from=${from}&to=${to}`).then(d => {
        const map = {}
        for (const day of d.days) map[day.date] = day
        this.scheduleMap = map
      }).catch(() => {})
    },
    togglePattern(k) {
      const i = this.form.patternPreset.indexOf(k)
      if (i >= 0) this.form.patternPreset.splice(i, 1)
      else this.form.patternPreset.push(k)
    },
    toggleAddon(k) {
      const i = this.form.addons.indexOf(k)
      if (i >= 0) this.form.addons.splice(i, 1)
      else this.form.addons.push(k)
    },
    chooseLogo() {
      // 演示：仅本地预览，文件名随订单保存；真实环境上传 OSS 后存 URL
      uni.chooseImage({
        count: 1,
        success: (res) => {
          this.form.logoPreview = res.tempFilePaths[0]
          const f = res.tempFiles && res.tempFiles[0]
          this.form.customLogo = (f && f.name) || 'custom-logo.png'
        }
      })
    },
    clearLogo() { this.form.logoPreview = ''; this.form.customLogo = '' },
    onDate(date) { this.form.performDate = date },
    pickSlot(s) {
      if (!this.form.performDate) { uni.showToast({ title: '请先选择日期', icon: 'none' }); return }
      this.form.timeSlot = s
    },
    // 只能从固定预设场地里挑（2026-10-28 用户要求：不支持地图选点与手动输入）
    pickVenue(v) {
      this.form.venue = { type: 'preset', name: v.name, address: v.address, lng: v.lng, lat: v.lat }
    },
    scrollToSec(id) {
      uni.pageScrollTo({ selector: id, duration: 200 })
    },
    validate() {
      const f = this.form
      if (!f.droneCount) return '请选择架次档位'
      if (!f.patternPreset.length && !(f.useText && f.customText.trim()) && !(f.useLogo && f.customLogo)) return '请至少选择一种图案或定制内容'
      if (!f.performDate) return '请选择表演日期'
      if (!f.timeSlot) return '请选择表演时段'
      if (!f.venue.name || !f.venue.address) return '请从固定场地里选一个表演场地'
      if (!f.contact.name.trim()) return '请填写联系人姓名'
      if (!/^1\d{10}$/.test(f.contact.phone)) return '请填写正确的 11 位手机号'
      return ''
    },
    submit() {
      if (!isLoggedIn()) { uni.navigateTo({ url: '/pages/login/login' }); return }
      const err = this.validate()
      if (err) { uni.showToast({ title: err, icon: 'none' }); return }
      const f = this.form
      store.draft = {
        droneCount: f.droneCount,
        duration: f.duration,
        patternPreset: f.patternPreset,
        customText: f.useText ? f.customText.trim() : '',
        customLogo: f.useLogo ? f.customLogo : '',
        addons: f.addons,
        performDate: f.performDate,
        timeSlot: f.timeSlot,
        venue: f.venue,
        contact: f.contact,
        estTotal: this.totalPrice
      }
      uni.navigateTo({ url: '/pages/order/confirm' })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
.sec { margin: 24rpx 24rpx 0; }
.ph { color: var(--text-4); }

.tier-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18rpx; }
.tier {
  border: 2rpx solid var(--line); border-radius: 20rpx; padding: 20rpx;
  display: flex; flex-direction: column; gap: 4rpx;
  transition: all .15s;
}
.tier.on { border-color: var(--primary); background: linear-gradient(180deg, rgba(74,108,247,.08), rgba(74,108,247,.02)); box-shadow: 0 6rpx 18rpx rgba(74,108,247,.15); }
.tier-dots { height: 28rpx; color: #B9C4EA; font-size: var(--fs-1); letter-spacing: 3rpx; overflow: hidden; }
.tier.on .tier-dots { color: var(--primary); }
.tier-num { font-size: var(--fs-9); font-weight: var(--fw-heavy); }
.tier-num .u { font-size: var(--fs-2); font-weight: var(--fw-medium); color: var(--text-2); }
.tier-price { color: var(--primary-deep); font-weight: var(--fw-bold); font-size: var(--fs-4); }
.tier-desc { font-size: var(--fs-1); color: var(--text-3); }

.seg { display: flex; background: var(--bg-2); border-radius: 18rpx; padding: 8rpx; gap: 8rpx; }
.seg-item { flex: 1; border-radius: 14rpx; padding: 16rpx 0; display: flex; flex-direction: column; align-items: center; gap: 2rpx; }
.seg-item.on { background: #fff; box-shadow: 0 4rpx 14rpx rgba(26,29,46,.1); }
.seg-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.seg-item.on .seg-name { color: var(--primary); }
.seg-price { font-size: var(--fs-1); color: var(--text-3); }

.pattern-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; }
.pattern { border: 2rpx solid var(--line); border-radius: 18rpx; padding: 20rpx 0; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.pattern.on { border-color: var(--primary); background: rgba(74,108,247,.06); }
.pattern-name { font-size: var(--fs-3); color: var(--text-2); }
.pattern.on .pattern-name { color: var(--primary); font-weight: var(--fw-semibold); }

.opt-row { display: flex; align-items: center; gap: 16rpx; padding: 22rpx 0; border-top: 1rpx solid var(--bg-2); margin-top: 18rpx; }
.opt-info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; }
.opt-name { font-size: var(--fs-5); font-weight: var(--fw-semibold); }
.opt-desc { font-size: var(--fs-2); color: var(--text-3); }
.opt-price { color: var(--primary-deep); font-weight: var(--fw-bold); font-size: var(--fs-3); }
.switch { width: 84rpx; height: 46rpx; border-radius: 999rpx; background: #E3E6F0; position: relative; transition: background .2s; }
.switch.on { background: var(--primary); }
.knob { position: absolute; top: 4rpx; left: 4rpx; width: 38rpx; height: 38rpx; border-radius: 50%; background: #fff; transition: left .2s; box-shadow: 0 2rpx 6rpx rgba(0,0,0,.15); }
.switch.on .knob { left: 42rpx; }
.text-input {
  margin-top: 16rpx; background: var(--bg); border-radius: 16rpx;
  padding: 20rpx 24rpx; font-size: var(--fs-5); border: 2rpx solid transparent;
  height: 88rpx; box-sizing: border-box; /* 显式高度：否则 H5 内部原生 input 塌缩为 0，无法点击输入 */
}
.text-input:focus { border-color: var(--primary); background: #fff; }

.logo-box { margin-top: 16rpx; }
.logo-upload {
  border: 2rpx dashed var(--text-4); border-radius: 18rpx; padding: 40rpx 0;
  display: flex; flex-direction: column; align-items: center; gap: 8rpx;
}
.up-icon { font-size: var(--fs-11); color: var(--text-3); }
.up-text { font-size: var(--fs-3); color: var(--text-3); }
.logo-preview { display: flex; align-items: center; gap: 18rpx; background: var(--bg); border-radius: 16rpx; padding: 16rpx; }
.logo-img { width: 96rpx; height: 96rpx; border-radius: 12rpx; background: #fff; }
.logo-name { flex: 1; font-size: var(--fs-3); color: var(--text-2); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.logo-del { color: var(--danger); font-size: var(--fs-7); padding: 0 16rpx; }

.addon-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.addon { border: 2rpx solid var(--line); border-radius: 18rpx; padding: 20rpx; position: relative; display: flex; flex-direction: column; gap: 4rpx; }
.addon.on { border-color: var(--primary); background: rgba(74,108,247,.05); }
.addon-check {
  position: absolute; top: 14rpx; right: 14rpx;
  width: 34rpx; height: 34rpx; border-radius: 50%;
  border: 2rpx solid #D5DAEA; color: #fff; font-size: var(--fs-2);
  display: flex; align-items: center; justify-content: center;
}
.addon.on .addon-check { background: var(--primary); border-color: var(--primary); }
.addon-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.addon-price { color: var(--primary-deep); font-size: var(--fs-3); font-weight: var(--fw-bold); }
.addon-desc { font-size: var(--fs-1); color: var(--text-3); }

.slots { margin-top: 20rpx; display: flex; flex-direction: column; gap: 14rpx; }
.slots-label { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.slot-row { display: flex; gap: 16rpx; }
.slot {
  flex: 1; text-align: center; padding: 18rpx 0; border-radius: 999rpx;
  border: 2rpx solid var(--line); font-size: var(--fs-4); font-weight: var(--fw-semibold); color: var(--text-2);
}
.slot.on { border-color: var(--primary); background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; box-shadow: 0 6rpx 16rpx rgba(74,108,247,.3); }
.slot.off { color: var(--text-4); }
.slots-tip { font-size: var(--fs-2); color: var(--text-4); }

.venue-fixed-note { font-size: var(--fs-1); color: var(--text-3); line-height: 1.7; margin-bottom: 14rpx; }
.venue-tabs { display: flex; background: var(--bg-2); border-radius: 14rpx; padding: 6rpx; margin-bottom: 20rpx; }
.vtab { flex: 1; text-align: center; padding: 14rpx 0; font-size: var(--fs-3); border-radius: 10rpx; color: var(--text-2); }
.vtab.on { background: #fff; color: var(--primary); font-weight: var(--fw-bold); box-shadow: 0 2rpx 8rpx rgba(26,29,46,.08); }
.venue-list { display: flex; flex-direction: column; gap: 14rpx; }
.venue-item { display: flex; align-items: center; gap: 16rpx; border: 2rpx solid var(--line); border-radius: 16rpx; padding: 18rpx; }
.venue-item.on { border-color: var(--primary); background: rgba(74,108,247,.05); }
.venue-radio { width: 30rpx; height: 30rpx; border-radius: 50%; border: 2rpx solid #D5DAEA; }
.venue-item.on .venue-radio { border-color: var(--primary); background: radial-gradient(circle, var(--primary) 45%, transparent 50%); }
.venue-info { display: flex; flex-direction: column; gap: 2rpx; }
.venue-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.venue-addr { font-size: var(--fs-2); color: var(--text-3); }
.venue-empty { text-align: center; color: var(--text-3); font-size: var(--fs-3); padding: 30rpx 0; }

.map-panel {
  position: relative; height: 320rpx; border-radius: 18rpx; overflow: hidden;
  background: linear-gradient(160deg, #182247, #0E1530);
}
.map-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(122,143,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(122,143,255,.12) 1px, transparent 1px);
  background-size: 48rpx 48rpx;
}
.map-road { position: absolute; background: rgba(255,255,255,.14); border-radius: 6rpx; }
.map-road.r1 { left: -20rpx; right: -20rpx; top: 58%; height: 14rpx; transform: rotate(-6deg); }
.map-road.r2 { top: -20rpx; bottom: -20rpx; left: 30%; width: 12rpx; transform: rotate(10deg); }
.map-river { position: absolute; right: -60rpx; top: -40rpx; width: 220rpx; height: 420rpx; background: rgba(61,224,192,.12); border-radius: 50%; transform: rotate(20deg); }
.map-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(232,236,255,.75); font-size: var(--fs-4); letter-spacing: 2rpx; }
.map-badge {
  position: absolute; right: 14rpx; bottom: 12rpx;
  background: rgba(11,16,38,.7); color: rgba(232,236,255,.6);
  font-size: var(--fs-1); padding: 6rpx 14rpx; border-radius: 999rpx;
}
.map-pin { position: absolute; transform: translate(-50%, -100%); }
.pin-dot { width: 28rpx; height: 28rpx; border-radius: 50% 50% 50% 0; background: var(--primary); transform: rotate(-45deg); border: 4rpx solid #fff; box-shadow: 0 4rpx 12rpx rgba(0,0,0,.35); }
.pin-pulse { position: absolute; left: 50%; bottom: -8rpx; width: 40rpx; height: 12rpx; border-radius: 50%; background: rgba(74,108,247,.4); transform: translateX(-50%); animation: pulse-pin 1.6s ease-out infinite; }
@keyframes pulse-pin { from { transform: translateX(-50%) scale(.6); opacity: .8; } to { transform: translateX(-50%) scale(1.6); opacity: 0; } }
.map-result { margin-top: 16rpx; background: var(--bg); border-radius: 14rpx; padding: 18rpx 20rpx; display: flex; flex-direction: column; gap: 4rpx; }
.mr-name { font-size: var(--fs-3); font-weight: var(--fw-bold); color: var(--primary); }
.mr-addr { font-size: var(--fs-3); color: var(--text-2); }

.addr-wrap { position: relative; }
.suggest {
  position: absolute; left: 0; right: 0; top: 108rpx; z-index: 20;
  background: #fff; border-radius: 14rpx; box-shadow: 0 12rpx 36rpx rgba(26,29,46,.14);
  overflow: hidden;
}
.sg-loading { display: block; padding: 22rpx; color: var(--text-3); font-size: var(--fs-3); text-align: center; }
.sg-item { padding: 18rpx 22rpx; border-bottom: 1rpx solid var(--bg-2); display: flex; flex-direction: column; gap: 2rpx; }
.sg-item:last-child { border-bottom: none; }
.sg-name { font-size: var(--fs-4); font-weight: var(--fw-semibold); }
.sg-addr { font-size: var(--fs-2); color: var(--text-3); }

.price-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  max-width: 480px; margin: 0 auto;
  background: rgba(255,255,255,.97); backdrop-filter: blur(10px);
  border-top: 1rpx solid var(--line);
  display: flex; align-items: center; gap: 24rpx;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.pb-left { display: flex; flex-direction: column; }
.pb-label { font-size: var(--fs-1); color: var(--text-3); }
.pb-price { font-size: var(--fs-10); font-weight: var(--fw-heavy); color: var(--text-1); }
.pb-btn {
  flex: 1; border: none; border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0;
  box-shadow: 0 8rpx 22rpx rgba(74,108,247,.35);
}
.pb-btn::after { border: none; }
</style>
