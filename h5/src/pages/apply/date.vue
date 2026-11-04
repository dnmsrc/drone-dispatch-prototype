<template>
  <view class="page">
    <NavBar title="申请单 · 日期与时段" />
    <StepBar :current="3" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <SecHead title="表演日期" :sub="cityOf(venue.city).name" />
        <ApplyCalendar :value="date" :days="days" @select="onDate" />
        <view v-if="picked" class="picked" :class="toneClass">
          <text class="pk-status">{{ statusText }}</text>
          <text class="pk-note">{{ pickedNote }}</text>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="申请时段" />
        <view class="slot-row">
          <view
            v-for="s in slotList" :key="s.slot"
            class="slot" :class="{ on: slot === s.slot, dis: !s.open }"
            @click="onSlot(s)"
          >
            <text class="sl-t">{{ fmtSlot(s.slot) }}</text>
            <text v-if="s.label" class="sl-s">{{ s.label }}</text>
          </view>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" :class="{ dis: !date || !slot }" @click="next">
        {{ !date ? '请选择日期' : !slot ? '请选择申请时段' : '下一步 · 看报价区间' }}
      </button>
    </view>

    <BasisPop
      :show="pop.show" :title="pop.title" :lines="pop.lines" :touch="pop.touch" :sec="pop.sec"
      :must="pop.must" :risk="pop.risk"
      @close="pop.show = false" @risk-ack="ackWx" @risk-skip="skipWx"
    />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import ackPop from '@/mixins/ackPop'
import ApplyCalendar from '@/components/ApplyCalendar.vue'
import { store, invalidateFrom, hydrateForPage, ackWeatherRisk, wxAckOf } from '@/store'
import { calendarDays, dayInfo, STATUS_TEXT } from '@/engine/calendar'
import { dateWeather } from '@/engine/weather'
import { cityOf } from '@/engine/policy'
import { TIME_SLOTS } from '@/engine/pricing'
import { fmtSlot } from '@/engine/slotRange'
import { loadLiveWeather, liveSource } from '@/engine/weatherSource'
import { getSilent } from '@/utils/request'

// 只在「排他资源本身冲突」时给一句短说明（≤5 字、单行），且不出现在默认视图里：
// 天气类（预报不适宜 / 预报风险）不再产生任何卡片文字，也不再禁选（2026-11-02 用户口径）。
const SLOT_LABEL = {
  lead: '提前不足', ban: '管制', notice: '管控', full: '已占用',
  closed: '检修', past: '已过', wait: '先选日期', offslot: '未开放'
}

export default {
  components: { NavBar, StepBar, BasisPop, ApplyCalendar, SecHead },
  mixins: [ackPop],
  data() {
    const a = hydrateForPage(3)
    return {
      need: a.need, venue: a.venue,
      date: a.date, slot: a.slot,
      // 真实天气是异步拉的：拉到后 tick 加 1 让日历按真实数据重算（拉不到就用引擎里的确定性 mock，不阻塞填报）
      wxTick: 0, wxLive: false,
      // 运营在后台「档期管理」里配置的每日可接单时段（整点区间）：{ '2026-11-20': ['19:00-20:00','22:00-23:00'] }
      slotsByDate: {}, schTick: 0
    }
  },
  computed: {
    days() {
      // 依赖 wxTick / schTick，真实天气与后台档期到位后日历自动重算
      const t = this.wxTick
      void t
      const s = this.schTick
      void s
      return calendarDays({ venue: this.venue, drones: this.need.droneCount, slotsByDate: this.slotsByDate })
    },
    // 日级天气：填报页只给「这一天大致是什么天」，不再逐小时列 19/20/21 的天气与温度
    dayWx() {
      if (!this.date) return null
      return dateWeather({ date: this.date, cityCode: cityOf(this.venue.city).code })
    },
    picked() { return dayInfo(this.days, this.date) },
    // 可选时段（2026-11-02 用户口径）：不再跟踪时段天气、不再用天光窗口预判「装不下」，
    // 三个时段一律让用户自己选——当天照常 / 推迟 / 取消由现场实际情况决定，天气预报的误差是允许的。
    // 只有排他资源本身冲突（管制 / 占用 / 检修 / 提前量不足 / 已过）才不可点，且卡片上不写原因，点了才解释。
    slotList() {
      if (!this.picked) return TIME_SLOTS.map(s => ({ slot: s, status: 'wait', open: false, label: '先选日期' }))
      return this.picked.slots.map(s => ({ ...s, label: s.open ? '' : (SLOT_LABEL[s.status] || '') }))
    },
    // 状态颜色只看「这一天」：绿 = 可提交、橙 = 可提交但当天可能调整、中性灰 = 天气未公布；红 = 不可选日
    toneClass() {
      if (!this.picked) return ''
      if (this.picked.disabled) return 'dead'
      return this.picked.status
    },
    statusText() {
      if (!this.picked) return ''
      if (!this.slotList.some(s => s.open)) return '本日无可用时段'
      const st = this.picked.status
      if (st === 'unknown') return STATUS_TEXT.unknown
      if (st === 'risk') return '可提交申请（当天可能调整）'
      return STATUS_TEXT.ok
    },
    // 日级天气（2026-11-02 用户：取消更细的小时天气，只要大致是什么天；预报可能不准，允许提前或推迟）
    pickedNote() {
      if (!this.picked) return ''
      if (this.picked.disabled) return this.picked.note
      const w = this.dayWx
      if (!w) return ''
      if (w.status === 'unknown') return `日级天气未公布（超出 ${w.horizonDays} 天预报期），可预约，可能提前或推迟`
      const t = w.tempC == null ? '' : ` ${w.tempC}℃`
      return `日级预报：${w.kind}${t} · 可能提前或推迟`
    }
  },
  mounted() {
    // 草稿里的日期可能是上一次演示留下的（已过去 / 超出窗口）：清掉，不让它变成「选了但不可选」
    if (this.date && !this.picked) {
      this.date = ''; this.slot = ''
      store.apply.date = ''; store.apply.slot = ''
    }
    this.syncSlot()
    // 预取真实天气（Open-Meteo，免 key）与后台档期时段。失败就留在默认口径，不弹任何错误。
    this.prefetchWeather()
    this.prefetchSchedule()
  },
  methods: {
    cityOf,
    fmtSlot,
    prefetchWeather() {
      if (!this.venue) return
      const city = cityOf(this.venue.city)
      const lat = this.venue.lat, lon = this.venue.lng
      loadLiveWeather({ cityCode: city.code, lat, lon }).then(days => {
        this.wxLive = !!days
        this.wxTick++
        if (days) this.syncSlot()
      }).catch(() => {})
    },
    // 后台「档期管理」配置的可接单时段：用户端按配置渲染时段（缺的时段不出现，整日没配 = 停接）
    prefetchSchedule() {
      const pad = n => String(n).padStart(2, '0')
      const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const from = fmt(new Date())
      const to = fmt(new Date(Date.now() + 62 * 86400000))
      getSilent(`/schedule?from=${from}&to=${to}`).then(d => {
        if (!d || !Array.isArray(d.days)) return
        const map = {}
        for (const day of d.days) if (Array.isArray(day.slots)) map[day.date] = day.slots
        this.slotsByDate = map
        this.schTick++
        this.syncSlot()
      }).catch(() => {})
    },
    // 选择对齐：没有日期 / 日期不可选 → 落到第一个可提交日；时段不可选 → 落到第一个可点时段
    syncSlot() {
      const day = dayInfo(this.days, this.date)
      if (!day || day.disabled) {
        const first = this.days.find(d => !d.disabled)
        if (first) {
          this.date = first.date; store.apply.date = first.date
          this.slot = ''; store.apply.slot = ''
        }
      }
      const cur = this.slotList.find(x => x.slot === this.slot)
      if (!cur || !cur.open) {
        const ok = this.slotList.find(x => x.open)
        this.slot = ok ? ok.slot : ''
        store.apply.slot = this.slot
      }
    },
    onDate(d) {
      // 换日期 = 第 3 步的产物变了，报价、派单、合同都得重算；日期本身是用户填的，不丢
      invalidateFrom(3)
      this.date = d; store.apply.date = d
      this.slot = ''; store.apply.slot = ''
      // 自动落到第一个可点时段：用户不用在「选完日期再点一次时段」上多走一步
      const ok = this.slotList.find(x => x.open)
      if (ok) { this.slot = ok.slot; store.apply.slot = ok.slot }
    },
    onSlot(s) {
      if (!s.open) { uni.showToast({ title: s.label || '该时段暂不可选', icon: 'none' }); return }
      this.slot = s.slot; store.apply.slot = s.slot
    },
    // 天气未公布（超出预报期）的预约风险：不在选择时打断，统一在「下一步」这一道门里确认
    wxNeed() {
      const s = this.slotList.find(x => x.slot === this.slot)
      return !!(s && s.status === 'unknown')
    },
    riskPayload() {
      const ex = wxAckOf(this.date, this.slot)
      const hz = this.picked ? this.picked.horizonDays : 0
      return {
        group: '时段与审批',
        lines: [
          `${this.date} ${this.slot} 超出逐日天气预报覆盖范围（系统仅覆盖未来 ${hz} 天），天气未公布，无法判断是否适飞。`,
          '若因天气改期：改期 = 重新审批，重新申请与加急费用（3–7 工作日加收 20–50%）由甲方承担；定金 30–50% 不可退（《申请说明》「费用与付款」组）。',
          '当日是否举行由公安机关根据现场整体态势决定；因不可抗力或主管部门决定推迟、取消的，按合同的不可抗力与变更条款处理。'
        ],
        acked: !!ex,
        at: ex ? ex.at : '',
        user: ex ? ex.user : ''
      }
    },
    ackWx() {
      const rec = ackWeatherRisk({
        date: this.date, slot: this.slot,
        horizonDays: this.picked ? this.picked.horizonDays : 0,
        source: liveSource() || 'mock'
      })
      // 弹窗内就地变成留痕状态（版本 + 日期时段 + 时间戳 + 账号 + 内容哈希），不留 toast
      this.pop = { ...this.pop, risk: { ...(this.pop.risk || {}), acked: true, at: rec.at, user: rec.user } }
    },
    // 不同意就要换日期：关掉弹窗并清空选择，回到选择状态（不跳转、不留确认记录）
    skipWx() {
      this.pop.show = false
      this.date = ''; this.slot = ''
      store.apply.date = ''; store.apply.slot = ''
      invalidateFrom(3)
    },
    next() {
      if (!this.date || !this.slot) { uni.showToast({ title: '请选择日期与申请时段', icon: 'none' }); return }
      const s = this.slotList.find(x => x.slot === this.slot)
      if (!s || !s.open) { uni.showToast({ title: (s && s.label) || '请重新选择申请时段', icon: 'none' }); return }
      // 本步未确认条款 + 天气未公布的预约风险，统一在点击下一步时弹出确认。
      if (!this.gateWithWeather(this.wxNeed() ? this.riskPayload() : null)) return
      store.apply.step = 4
      uni.navigateTo({ url: '/pages/apply/quote' })
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。 */
.sec { margin: 24rpx; }
/* 标题行与入口收进共用组件（2026-10-29 十次调整）：SecHead = 竖条 + 标题（左）+ 入口（右），
   EntryChip = 唯一的入口形态（88rpx 胶囊）。页里不再写 .sec-title / .sec-link / .kv-info / .ack。 */
.picked { margin-top: 16rpx; background: var(--bg); border-radius: 14rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 8rpx; }
/* 状态色只看「这一天」：可提交绿、当天可能调整橙、天气未公布中性灰、不可排红 */
.picked.ok .pk-status { color: #1B8E5B; }
.picked.unknown .pk-status { color: #6B7280; }
.picked.risk .pk-status { color: #B45A18; }
.picked.lead .pk-status, .picked.weather .pk-status, .picked.ban .pk-status, .picked.notice .pk-status, .picked.full .pk-status, .picked.closed .pk-status, .picked.dead .pk-status { color: var(--danger); }
.pk-status { font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--primary); }
.pk-note { font-size: var(--fs-2); color: var(--text-2); line-height: 1.6; }
.slot-row { display: flex; flex-wrap: wrap; gap: 16rpx; }
/* 时段卡只写时间区间，不写任何天气/窗口状态字（2026-11-02 用户：时段都让用户自己选）；
   2026-11-03：时段改成「起-止」区间后单条更宽，改用换行流式布局，两个一行，时段多了也不挤 */
.slot { flex: 1 1 300rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 16rpx 8rpx; border-radius: 16rpx; border: 2rpx solid var(--line); box-sizing: border-box; min-height: 88rpx; }
.slot.on { border-color: var(--primary); background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; }
/* 不可点只可能是排他资源冲突（管制 / 占用 / 检修 / 提前不足 / 已过），不是天气 */
.slot.dis { background: var(--bg-2); }
.sl-t { display: block; font-size: var(--fs-4); font-weight: var(--fw-bold); }
.sl-s { display: block; font-size: var(--fs-1); color: var(--text-3); margin-top: 4rpx; }
.slot.on .sl-s { color: rgba(255,255,255,.8); }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.pb-btn.dis { background: #E3E6F0; color: var(--text-3); }
</style>
