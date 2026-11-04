<template>
  <!-- 预约日历：满档/休整/过期置灰 -->
  <view class="cal card">
    <view class="cal-head">
      <view class="nav" @click="shift(-1)" :class="{ off: !canPrev }">‹</view>
      <text class="ym">{{ year }} 年 {{ month }} 月</text>
      <view class="nav" @click="shift(1)">›</view>
    </view>
    <view class="week-row">
      <text v-for="w in weeks" :key="w" class="week">{{ w }}</text>
    </view>
    <view class="grid">
      <view v-for="n in firstWeekday" :key="'p' + n" class="cell pad"></view>
      <view
        v-for="d in daysInMonth"
        :key="d.date"
        class="cell"
        :class="{ sel: d.date === value, off: d.disabled }"
        @click="pick(d)"
      >
        <text class="day">{{ d.day }}</text>
        <text v-if="d.tag" class="tag" :class="d.tagCls">{{ d.tag }}</text>
      </view>
    </view>
    <view class="legend">
      <view class="lg"><view class="dot ok"></view><text>可预约</text></view>
      <view class="lg"><view class="dot full"></view><text>满档</text></view>
      <view class="lg"><view class="dot closed"></view><text>休整日</text></view>
    </view>
  </view>
</template>

<script>
function pad(n) { return String(n).padStart(2, '0') }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

export default {
  name: 'Calendar',
  props: {
    value: { type: String, default: '' },
    schedule: { type: Object, default: () => ({}) }, // date -> {booked, limit, closed}
    windowDays: { type: Number, default: 60 }
  },
  data() {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      weeks: ['日', '一', '二', '三', '四', '五', '六']
    }
  },
  computed: {
    todayStr() { return fmt(new Date()) },
    maxStr() { const d = new Date(); d.setDate(d.getDate() + this.windowDays); return fmt(d) },
    canPrev() {
      const now = new Date()
      return this.year > now.getFullYear() || (this.year === now.getFullYear() && this.month > now.getMonth() + 1)
    },
    daysInMonth() {
      const count = new Date(this.year, this.month, 0).getDate()
      const list = []
      for (let i = 1; i <= count; i++) {
        const date = `${this.year}-${pad(this.month)}-${pad(i)}`
        const sch = this.schedule[date]
        let disabled = false, tag = '', tagCls = ''
        if (date <= this.todayStr) { disabled = true }
        else if (date > this.maxStr) { disabled = true }
        else if (sch && sch.closed) { disabled = true; tag = '休'; tagCls = 'closed' }
        else if (sch && sch.booked >= sch.limit) { disabled = true; tag = '满'; tagCls = 'full' }
        else if (sch && sch.booked > 0) { tag = `余${sch.limit - sch.booked}`; tagCls = 'left' }
        list.push({ day: i, date, disabled, tag, tagCls })
      }
      return list
    },
    firstWeekday() {
      return new Date(this.year, this.month - 1, 1).getDay()
    }
  },
  methods: {
    shift(n) {
      if (n < 0 && !this.canPrev) return
      let m = this.month + n, y = this.year
      if (m < 1) { m = 12; y-- }
      if (m > 12) { m = 1; y++ }
      this.month = m; this.year = y
    },
    pick(d) {
      if (d.disabled) {
        if (d.tag === '满') uni.showToast({ title: '该日期已满档', icon: 'none' })
        else if (d.tag === '休') uni.showToast({ title: '该日期为休整日', icon: 'none' })
        return
      }
      this.$emit('select', d.date)
    }
  }
}
</script>

<style scoped>
.cal { padding: 24rpx; }
.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.ym { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.nav {
  width: 56rpx; height: 56rpx; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--fs-9); color: var(--primary); background: rgba(74,108,247,.08);
}
.nav.off { color: var(--text-4); background: var(--bg-2); }
.week-row { display: flex; margin-bottom: 8rpx; }
.week { flex: 1; text-align: center; font-size: var(--fs-2); color: var(--text-3); }
.grid { display: flex; flex-wrap: wrap; }
.cell {
  width: 14.2857%;
  padding: 10rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
  border-radius: 16rpx;
}
.cell.pad { background: transparent; }
.day { font-size: var(--fs-4); font-weight: var(--fw-medium); }
.cell.sel { background: linear-gradient(135deg, var(--primary), var(--primary-2)); box-shadow: 0 6rpx 16rpx rgba(74,108,247,.35); }
.cell.sel .day, .cell.sel .tag { color: #fff; }
.cell.off .day { color: var(--text-4); }
.tag { font-size: var(--fs-1); color: var(--primary); }
.tag.left { color: var(--success); }
.tag.full { color: var(--danger); }
.tag.closed { color: var(--text-3); }
.cell.off .tag { color: var(--text-4); }
.legend { display: flex; gap: 28rpx; margin-top: 14rpx; padding-top: 14rpx; border-top: 1rpx solid var(--bg-2); }
.lg { display: flex; align-items: center; gap: 8rpx; font-size: var(--fs-2); color: var(--text-3); }
.dot { width: 14rpx; height: 14rpx; border-radius: 50%; }
.dot.ok { background: var(--success); }
.dot.full { background: var(--danger); }
.dot.closed { background: var(--text-4); }
</style>
