// 弹窗 + 逐条确认：填报页只保留输入与选项，不在选择途中打断。
// 本步未确认条款统一在「下一步 / 提交 / 签署」时阻断弹出；右下角 AckDock 统一回看。
import { store, pendingForPage, APPLY_PAGES } from '@/store'
import { clauseOf } from '@/engine/disclosure'

export default {
  data() {
    return { pop: { show: false, title: '', lines: [], sec: '', touch: [], must: false } }
  },
  computed: {
    // 这一页是第几步：门只拦「这一步及之前真的遇到的条款」。按当前页面路由算，不读 flow 的 step——
    // 直接跳到第 5 步时 flow step 还停在 1，门会一条都不拦（这就是之前「没确认也能提交」的漏法）。
    ackStep() {
      const ps = (typeof getCurrentPages === 'function' ? getCurrentPages() : [])
      const route = ps.length ? (ps[ps.length - 1].route || '') : ''
      const i = APPLY_PAGES.indexOf((route.split('/').pop() || ''))
      return i >= 0 ? i + 1 : (store.apply && store.apply.step) || 1
    },
    pendSet() { return new Set(pendingForPage(this.ackStep)) }
  },
  methods: {
    keysOf(t) { return Array.isArray(t) ? t : (t ? [t] : []) },
    // must = true：这个弹窗是「阻断式」——这一屏的条款没确认完不能关，只能逐条确认。
    // 用在门（下一步 / 提交 / 签署）上：门的作用就是拦人，弹窗能关就等于没拦。
    // risk = 预约风险块（{ group, lines, acked, at, user }）：超出预报期的日期允许预约，但要用户明确同意。
    open(t, title, lines, sec, must, risk) {
      this.pop = { show: true, title, lines, sec: sec || '', touch: this.keysOf(t), must: !!must, risk: risk || null }
    },
    // 门：每一步的「下一步」都要先过这个门（不止提交与签署）。
    // 把本单触发但还没确认的条款一次性摆出来，逐条确认；弹窗阻断式，确认完才能继续。
    gate() {
      return this.gateWithWeather(null)
    },
    // 带天气风险的门：条款和「天气未公布」的预约风险放在同一个弹窗里（不叠第二层弹窗）。
    gateWithWeather(risk) {
      const pend = pendingForPage(this.ackStep)
      const needRisk = !!(risk && !risk.acked)
      if (!pend.length && !needRisk) return true
      // 不再叠 toast：弹窗本身就是拦截，toast 会浮在弹窗正文上把条款文字盖住（用户截图里就是那样）。
      // 「还欠几条」写在弹窗标题里，正文逐条列出，确认完才能关。
      if (pend.length) this.open(pend, `还有 ${pend.length} 条未确认`, [], clauseOf(pend[0]).group, true, risk || null)
      else this.open([], '天气未公布 · 需确认预约风险', [], '时段与审批', true, risk)
      return false
    }
  }
}
