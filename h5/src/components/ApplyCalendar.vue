<template>
  <!-- 申请日历：状态不是「余量」，而是三个排他资源（空域时段 × 场地 × 机队）的交集结果。
       一次只渲染一个月（2026-11-02 用户指出「怎么超过 40 天了」）。
       视觉口径（2026-11-02 用户第二轮）：
         · 格子不再堆「日期 + 状态文字」，只有一个小圆 + 日期数字，靠圆底色与字色区分状态；
         · 提前量不足 / 已占用 / 管制 / 检修 一律置灰，格子上不再写「提前」「管制」等字；
         · 天气只给「这一天大概什么天」：预报不适宜也只是橙色（可能改期），不再封日；
         · 天气未公布（超出预报期）用中性灰，可点、可预约，不写「待定」；
         · 图例只留 4 项，一眼能对上格子颜色。 -->
  <view class="cal card">
    <view class="cal-head">
      <view class="nav" @click="shift(-1)" :class="{ off: !canPrev }">‹</view>
      <text class="ym">{{ cur.year }} 年 {{ cur.month }} 月</text>
      <view class="nav" @click="shift(1)" :class="{ off: !canNext }">›</view>
    </view>
    <view class="week-row">
      <text v-for="w in weeks" :key="w" class="week">{{ w }}</text>
    </view>
    <view class="grid">
      <view v-for="n in pad" :key="'p' + n" class="cell pad"></view>
      <view
        v-for="d in cur.cells" :key="d.date"
        class="cell" :class="[toneOf(d), { sel: d.date === value, off: d.disabled }]"
        :data-st="d.status"
        @click="pick(d)"
      >
        <view class="dotbg"><text class="day">{{ d.day }}</text></view>
      </view>
    </view>
    <view class="legend">
      <view class="lg"><view class="dot ok"></view><text>可提交</text></view>
      <view class="lg"><view class="dot risk"></view><text>可能改期</text></view>
      <view class="lg"><view class="dot soft"></view><text>天气未公布</text></view>
      <view class="lg"><view class="dot dead"></view><text>不可选</text></view>
    </view>
  </view>
</template>

<script>
function pad2(n) { return String(n).padStart(2, '0') }

export default {
  name: 'ApplyCalendar',
  props: {
    value: { type: String, default: '' },
    days: { type: Array, default: () => [] }
  },
  data() {
    return { idx: 0, weeks: ['日', '一', '二', '三', '四', '五', '六'] }
  },
  computed: {
    // 按真正存在的月份切片，每月只渲染自己的格子：60 天窗口 → 3 个月 × 各自的 28~31 格
    months() {
      const out = []
      for (const d of this.days) {
        const ym = d.date.slice(0, 7)
        let m = out.find(x => x.ym === ym)
        if (!m) {
          m = { ym, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)), cells: [], enabled: 0 }
          out.push(m)
        }
        m.cells.push(d)
        if (!d.disabled) m.enabled++
      }
      return out
    },
    cur() { return this.months[this.idx] || { year: 0, month: 0, cells: [] } },
    pad() {
      // 用「这一格真实是哪一天」的星期几做偏移，而不是「月初 1 号」的星期几。
      const first = this.cur.cells && this.cur.cells[0]
      if (!first) return 0
      return new Date(`${first.date}T00:00:00`).getDay()
    },
    canPrev() { return this.idx > 0 },
    canNext() { return this.idx < this.months.length - 1 }
  },
  watch: {
    value() { this.jumpToValue() },
    months() { this.jumpToValue() }
  },
  mounted() { this.jumpToValue() },
  methods: {
    // 打开日历就落在「有可选日期的月份」：第一月可能整月被提前量封死，落在那里等于给用户看一片灰
    jumpToValue() {
      const ms = this.months
      if (!ms.length) { this.idx = 0; return }
      if (this.value) {
        const i = ms.findIndex(m => this.value.startsWith(m.ym))
        if (i >= 0) { this.idx = i; return }
      }
      const firstOpen = ms.findIndex(m => m.enabled > 0)
      if (firstOpen >= 0) this.idx = firstOpen
    },
    shift(n) {
      if (n < 0 && !this.canPrev) return
      if (n > 0 && !this.canNext) return
      this.idx += n
    },
    // 视觉三态：绿 = 可提交；橙 = 可提交但当天可能调整（预报有风险/不适宜，天气只做参考）；
    // 中性灰 = 天气未公布（可预约）；灰掉（无底色、浅灰字）= 不可选（提前量不足 / 已占用 / 管制 / 检修 / 已过）
    toneOf(d) {
      if (d.disabled) return 'dead'
      if (d.status === 'ok') return 'ok'
      if (d.status === 'risk') return 'risk'
      return 'soft'
    },
    pick(d) {
      if (d.status === 'past') return
      if (d.disabled) { uni.showToast({ title: d.note || '该日期不可提交', icon: 'none' }); return }
      this.$emit('select', d.date)
    }
  }
}
</script>

<style scoped>
.cal { padding: 24rpx; }

.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.ym { font-size: var(--fs-6); font-weight: var(--fw-bold); }
/* 翻页按钮保持 88rpx 可点目标（44px），只是不再抢视觉 */
.nav { width: 88rpx; height: 88rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: var(--fs-9); color: var(--primary); background: rgba(74,108,247,.06); }
.nav.off { color: var(--text-4); background: transparent; }
.week-row { display: flex; margin-bottom: 4rpx; }
.week { flex: 1; text-align: center; font-size: var(--fs-1); color: var(--text-3); line-height: 36rpx; }

/* 一格 = 44px 命中区（88rpx）× 1/7 屏宽，里面只放一个 60rpx 的圆：不挤、也满足可点目标 */
.grid { display: flex; flex-wrap: wrap; }
.cell { width: 14.2857%; min-height: 88rpx; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border-radius: 16rpx; }
.cell.pad { background: transparent; }
.dotbg { width: 60rpx; height: 60rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.day { font-size: var(--fs-3); font-weight: var(--fw-semibold); color: var(--text-2); }

/* 状态：圆底色 + 字色（图例圆点同色），一处定义两处生效 */
.cell.ok .dotbg { background: rgba(43,182,115,.14); }
.cell.ok .day { color: #1B8E5B; }
.cell.risk .dotbg { background: rgba(232,131,58,.14); }
.cell.risk .day { color: #B45A18; }
/* 天气未公布（待定）：中性灰，可点、可预约，不用琥珀色、不写「待定」 */
.cell.soft .dotbg { background: rgba(26,29,46,.06); }
.cell.soft .day { color: #7C8291; }
/* 不可选：直接置灰（无底色 + 浅灰字），不写「提前」「管制」这类标记 */
.cell.dead .dotbg { background: transparent; }
.cell.dead .day { color: #C4C8D2; }
/* 选中：主色实心圆（后写，权重相同情况下覆盖上面所有状态） */
.cell.sel .dotbg { background: linear-gradient(135deg, var(--primary), var(--primary-2)); box-shadow: 0 4rpx 12rpx rgba(74,108,247,.32); }
.cell.sel .day { color: #fff; }

.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx 20rpx; margin-top: 12rpx; padding-top: 16rpx; border-top: 1rpx solid var(--bg-2); }
.lg { display: flex; align-items: center; gap: 8rpx; font-size: var(--fs-1); color: var(--text-3); white-space: nowrap; }
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; flex: none; }
.dot.ok { background: #2BB673; }
.dot.risk { background: #E8833A; }
.dot.soft { background: #AEB3BF; }
.dot.dead { background: #C4C8D2; }
</style>
