<template>
  <view class="page">
    <NavBar title="申请单 · 人工咨询与派单" />
    <StepBar :current="5" />

    <scroll-view scroll-y class="body">
      <!-- 另有一张进行中的单（与本单不是同一次申请）：先让用户选，不替用户决定 -->
      <view v-if="other" class="sec card other-card">
        <text class="oc-t">你还有一张进行中的咨询单 {{ other.id }}</text>
        <text class="oc-s">{{ other.statusText }} · {{ other.performDate }} {{ other.timeSlot }} · {{ other.venue && other.venue.name }}</text>
        <view class="oc-acts">
          <button class="ghost-btn half" @click="useOther">用这张单继续</button>
          <button class="ghost-btn half" @click="abandonOther">作废它 · 提交本次</button>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="咨询单" entry="为什么" @tap="open('why', '为什么不能自助下单', reasonLines(), '费用与付款')" />
        <view class="kv"><text class="k">单号</text><text class="v">{{ record ? record.id : '提交后生成' }}</text></view>
        <view class="kv"><text class="k">状态</text><text class="v on">{{ statusText }}</text></view>
        <view v-if="record" class="kv"><text class="k">提交时间</text><text class="v">{{ fmtStamp(record.submittedAt) }}</text></view>
        <view v-if="record && record.receivedBy" class="kv">
          <text class="k">接待客服</text>
          <text class="v">{{ record.receivedBy }} · {{ fmtStamp(record.receivedAt) }}</text>
        </view>
        <view class="kv"><text class="k">判定结论</text><text class="v">{{ judgment.conclusionText }}</text></view>
        <view class="kv"><text class="k">自助下单</text><text class="v">{{ reasons.length ? '不可以' : '可以' }}</text></view>
        <view v-if="reasons.length" class="chip-list">
          <text v-for="(r, i) in reasons" :key="i" class="chip">{{ r.label }}</text>
        </view>
        <template v-if="!record">
          <textarea v-model="note" class="text-input" placeholder="补充说明（现场情况、观众密度、审批历史等）" placeholder-class="ph" />
          <button class="ghost-btn submit-consult" :class="{ dis: submitting }" @click="submit(false)">{{ submitting ? '提交中…' : '提交咨询单' }}</button>
        </template>
        <button v-else class="ghost-btn refresh-btn" @click="sync(false)">刷新状态</button>
      </view>

      <view class="sec card">
        <SecHead title="判定费" sub="按难度" entry="依据" @tap="open('feeWaiver', '判定费与免除条件', feeLines(), '场地与判定')" />
        <view v-for="(f, i) in fee.factors" :key="i" class="kv">
          <view class="gk"><text class="k">{{ f.label }}</text><text class="kd">{{ f.detail }}</text></view>
          <text class="v">¥{{ f.amount }}</text>
        </view>
        <view class="kv"><text class="k">判定费合计</text><text class="v price">¥{{ fee.payable }}</text></view>
      </view>

      <view class="sec card">
        <SecHead title="派单" entry="依据" @tap="open('quoteRange', '报价区间口径', quoteLines(), '费用与付款')" />
        <view v-if="!dispatch" class="empty">
          <text class="em-t">{{ record ? '等待客服创建派单' : '客服受理后才会有派单' }}</text>
          <text class="em-s">{{ emptySub }}</text>
        </view>
        <view v-else>
          <view class="kv"><text class="k">派单号</text><text class="v">{{ dispatch.id }}</text></view>
          <view class="kv"><text class="k">创建人</text><text class="v">{{ dispatch.createdBy }} · {{ fmtStamp(dispatch.createdAt) }}</text></view>
          <view class="kv"><text class="k">报价区间</text><text class="v price">¥{{ dispatch.quoteRange[0].toLocaleString() }} - ¥{{ dispatch.quoteRange[1].toLocaleString() }}</text></view>
          <view class="kv"><text class="k">派单状态</text><text class="v on">{{ dispatch.status === 'CONFIRMED' ? '已确认' : '待你确认' }}</text></view>
          <view v-if="dispatch.confirmedAt" class="kv"><text class="k">确认时间</text><text class="v">{{ fmtStamp(dispatch.confirmedAt) }}</text></view>
          <view class="fill-list">
            <view v-for="m in dispatch.mustFill" :key="m.key" class="fill">
              <text class="fl-t">{{ m.label }}</text>
              <text class="fl-v" :class="{ miss: !m.value }">{{ m.value === null ? '未填写 · 必须补' : showVal(m) }}</text>
            </view>
          </view>
          <view v-if="dispatch.note" class="dispatch-note">
            <text class="dn-k">客服备注</text>
            <text class="dn-v">{{ dispatch.note }}</text>
          </view>
        </view>
      </view>

      <!-- 处理进度：客服的每一次受理动作都在这里留痕（用户侧只读） -->
      <view v-if="timeline.length" class="sec card">
        <SecHead title="处理进度" />
        <view class="tl">
          <view v-for="(e, i) in timeline" :key="i" class="tl-row">
            <text class="tl-dot" :class="{ last: i === timeline.length - 1 }"></text>
            <view class="tl-main">
              <text class="tl-t">{{ e.text }}</text>
              <text class="tl-s">{{ fmtStamp(e.at) }} · {{ e.by }}</text>
            </view>
          </view>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" :class="{ dis: !canGo }" @click="next">{{ doorText }}</button>
    </view>

    <!-- 重复申请：旧单会被自动废弃，必须让用户明确点一次 -->
    <view v-if="conflictShow" class="mask" @click="conflictShow = false">
      <view class="cf" @click.stop>
        <text class="cf-t">你已有一张进行中的咨询单</text>
        <text class="cf-s">{{ conflict.active.id }} · {{ conflict.active.statusText }}</text>
        <text class="cf-s">{{ conflictLine }}</text>
        <text class="cf-warn">继续提交会自动废弃旧单（{{ conflict.active.id }}），废弃后客服工作台不再受理它。</text>
        <view class="cf-acts">
          <button class="ghost-btn half" @click="conflictShow = false">取消</button>
          <button class="pb-inline half" @click="submitAnyway">确认提交</button>
        </view>
      </view>
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
import { store, hydrateForPage, newApply, restoreFromConsult, setConsult, isLoggedIn } from '@/store'
import { getSilent, postSilent } from '@/utils/request'
import { needsConsult, phaseOf, isActive, STATUS_TEXT, DOOR_TEXT, fmtStamp } from '@/engine/consult'

/**
 * 第 5 步「人工咨询与派单」的用户视角（2026-11-02 用户定稿）。
 *
 * 这张单的推进顺序由服务端管理，用户侧只能做两件事：
 *   1) 提交咨询单（PENDING，进客服工作台的待接待队列）；
 *   2) 客服派单之后「确认派单」（DISPATCHED → CONFIRMED）。
 * 接待与创建派单发生在管理端（admin:8080 的「咨询受理」），页面上不再有任何「演示」按钮，
 * 也不存在用户可点的「让客服派单」入口——底部按钮在前三个阶段点下去只会提示等待。
 *
 * 页面状态来自服务端（提交前的展示口径用本地判定与报价）：
 *   未提交 → 等接待 → 等派单 → 待确认 → 已确认；被驳回/被废弃则只能重新申请。
 */
export default {
  components: { NavBar, StepBar, BasisPop, SecHead },
  mixins: [ackPop],
  data() {
    const a = hydrateForPage(5)
    const rec = a.consult && a.consult.id ? a.consult : null
    return {
      record: rec,
      dispatch: (rec && rec.dispatch) || null,
      note: '',
      submitting: false,
      syncing: false,
      lastSync: '',
      other: null,             // 另一张进行中的单（与本单不是同一次申请）
      conflict: null,          // 提交时服务端返回的 40901 冲突数据
      conflictShow: false,
      need: a.need,
      venue: a.venue,
      judgment: a.judgment || { conclusion: '', conclusionText: '', checks: [] },
      date: a.date,
      slot: a.slot,
      quoteTotal: a.quote ? a.quote.total : 0,
      fee: (a.quote && a.quote.fee) || { factors: [], payable: 0, waived: { condition: '', effect: '' } },
      reasons: needsConsult(a.judgment || {}, a.need)
    }
  },
  computed: {
    phase() { return this.record ? phaseOf(this.record) : 'draft' },
    statusText() { return this.record ? (this.record.statusText || STATUS_TEXT[this.record.status] || this.record.status) : '未提交' },
    doorText() { return DOOR_TEXT[this.phase] || DOOR_TEXT.unknown },
    canGo() { return ['dispatched', 'confirmed', 'rejected', 'abandoned'].includes(this.phase) },
    timeline() { return (this.record && this.record.timeline) || [] },
    emptySub() {
      if (!this.record) return `提交后由客服在工作台受理；报价区间 ¥${this.quoteTotal.toLocaleString()} 仅供预估，不构成要约`
      return '客服已在工作台收到这张单，接待后会在这里出具派单（报价区间与六项条款由客服填写）'
    },
    conflictLine() {
      const c = this.conflict
      if (!c || !c.active) return ''
      const bits = []
      if (c.sameSlot) bits.push(`与本单是同一日期时段（${c.active.performDate} ${c.active.timeSlot}）`)
      if (c.sameVenue) bits.push(`与本单是同一场地（${c.active.venue && c.active.venue.name}）`)
      if (!bits.length) bits.push('同时只允许一张进行中的咨询单')
      return bits.join('；')
    }
  },
  // 进页面拉一次并开始轮询；页面隐藏后停掉（客服在管理端操作，用户停在这一页就能看到状态变化）
  onLoad() { this.sync(true) },
  onShow() { this.startPoll() },
  onHide() { this.stopPoll() },
  onUnload() { this.stopPoll() },
  methods: {
    fmtStamp,
    startPoll() {
      this.stopPoll()
      this.sync(true)
      // 客服在管理端操作后，用户停在这一页就能看到状态变化；5 秒一次，接口静默不弹 toast
      this.timer = setInterval(() => this.sync(true), 5000)
    },
    stopPoll() { if (this.timer) { clearInterval(this.timer); this.timer = null } },
    applyRecord(c) {
      this.record = c || null
      this.dispatch = (c && c.dispatch) || null
      setConsult(c)
    },
    // 同一张申请（同日同时段同场地）→ 恢复进草稿继续看；否则只当作「另一张进行中的单」给用户选
    sameAsCurrent(c) {
      return !!c && c.performDate === this.date && c.timeSlot === this.slot &&
        !!(c.venue && this.venue && (c.venue.id === this.venue.id || c.venue.name === this.venue.name))
    },
    async sync(quiet) {
      if (this.syncing) return
      this.syncing = true
      try {
        if (this.record && this.record.id) {
          const d = await getSilent(`/consults/${this.record.id}`)
          this.applyRecord(d.consult)
        } else {
          const d = await getSilent('/consults/active')
          const act = d.active
          this.other = null
          if (!act) return
          if (this.sameAsCurrent(act)) { restoreFromConsult(act); this.applyRecord(act) }
          else this.other = act
        }
        this.lastSync = this.nowText()
      } catch (e) {
        // 未登录 / 没网：停在「未提交」，不打扰用户；点提交时再提示登录
        if (!quiet && e && e.msg) uni.showToast({ title: e.msg, icon: 'none' })
      } finally {
        this.syncing = false
      }
    },
    nowText() {
      const d = new Date()
      const p = n => String(n).padStart(2, '0')
      return `${p(d.getHours())}:${p(d.getMinutes())}`
    },
    reasonLines() { return this.reasons.map(r => `${r.label} — ${r.why}`) },
    feeLines() { return [`本单判定费 ¥${this.fee.payable}`, `${this.fee.waived.condition} → ${this.fee.waived.effect}`] },
    quoteLines() { return [`本单预估区间 ¥${this.quoteTotal.toLocaleString()}`, '正式报价与派单由客服在需求沟通后出具，用户不能自助下单。'] },
    payload(force) {
      return {
        need: this.need,
        venue: this.venue,
        performDate: this.date,
        timeSlot: this.slot,
        judgment: { conclusion: this.judgment.conclusion, conclusionText: this.judgment.conclusionText, checks: this.judgment.checks },
        quote: { total: this.quoteTotal, fee: this.fee },
        reasons: this.reasons,
        note: this.note,
        abandonActive: !!force
      }
    },
    // 门在 mixins/ackPop.js 的 gate()：本单触发的重大条款没确认完，不能提交咨询单
    async submit(force) {
      if (this.submitting) return
      if (!this.gate()) return
      if (!isLoggedIn()) {
        uni.showToast({ title: '请先登录再提交咨询单', icon: 'none' })
        setTimeout(() => uni.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/apply/consult') }), 400)
        return
      }
      this.submitting = true
      try {
        const d = await postSilent('/consults', this.payload(force))
        this.applyRecord(d.consult)
        this.other = null
        uni.showToast({ title: '咨询单已提交，客服将在工作时间内接待', icon: 'none' })
      } catch (r) {
        if (r && r.code === 40901 && r.data) { this.conflict = r.data; this.conflictShow = true }
        else if (r && r.code === 40100) {
          // 登录凭证在服务端失效（token 过期 / 服务端重启）：说清原因并回登录页，登录后回到本页继续提交。
          // 原来的通用提示是「请先登录」，用户明明登录着时会以为前端又拦了一次（2026-11-03 用户报告）。
          uni.showToast({ title: '登录状态已失效，请重新登录', icon: 'none', duration: 2600 })
          setTimeout(() => uni.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/apply/consult') }), 700)
        }
        else uni.showToast({ title: (r && r.msg) || '提交失败', icon: 'none' })
      } finally {
        this.submitting = false
      }
    },
    submitAnyway() { this.conflictShow = false; this.submit(true) },
    useOther() {
      restoreFromConsult(this.other)
      uni.redirectTo({ url: '/pages/apply/consult' })
    },
    abandonOther() {
      const o = this.other
      if (!o) return
      this.conflict = {
        active: { id: o.id, statusText: o.statusText, performDate: o.performDate, timeSlot: o.timeSlot, venue: o.venue },
        sameVenue: !!(o.venue && this.venue && (o.venue.id === this.venue.id || o.venue.name === this.venue.name)),
        sameSlot: o.performDate === this.date && o.timeSlot === this.slot
      }
      this.conflictShow = true
    },
    async confirmDispatch() {
      if (!this.gate()) return
      try {
        const d = await postSilent(`/consults/${this.record.id}/confirm-dispatch`, {})
        this.applyRecord(d.consult)
        uni.showToast({ title: '派单已确认', icon: 'success' })
        this.goContract()
      } catch (r) {
        uni.showToast({ title: (r && r.msg) || '确认失败', icon: 'none' })
      }
    },
    goContract() {
      store.apply.step = 6
      uni.navigateTo({ url: '/pages/apply/contract' })
    },
    restart() {
      uni.showModal({
        title: '重新申请',
        content: '将回到第 1 步重新填写，这张单不会被翻新；确认要重新申请吗？',
        success: (r) => {
          if (!r.confirm) return
          store.apply = newApply()
          uni.navigateTo({ url: '/pages/apply/venue' })
        }
      })
    },
    showVal(m) { return typeof m.value === 'number' ? `¥${m.value.toLocaleString()}` : m.value },
    next() {
      const ph = this.phase
      if (ph === 'draft') { uni.showToast({ title: '先提交咨询单', icon: 'none' }); return }
      if (ph === 'waiting') { uni.showToast({ title: '请等待客服接待（接待在客服工作台进行）', icon: 'none' }); return }
      if (ph === 'received') { uni.showToast({ title: '客服已接待，正在创建派单，请稍等', icon: 'none' }); return }
      if (ph === 'unknown') { uni.showToast({ title: '等待客服处理', icon: 'none' }); return }
      if (ph === 'rejected' || ph === 'abandoned') { this.restart(); return }
      if (ph === 'dispatched') { this.confirmDispatch(); return }
      if (ph === 'confirmed') { this.goContract(); return }
    }
  }
}
</script>

<style scoped>
.page { height: 100vh; background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
.body { flex: 1; min-height: 0; }
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。 */
.sec { margin: 24rpx; }
/* 标题行与入口共用 SecHead / EntryChip，页里不再各写一份 */
.kv { display: flex; align-items: center; gap: 16rpx; min-height: 88rpx; }
.gk { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; }
.kv > .k { flex: none; min-width: 116rpx; white-space: nowrap; color: var(--text-3); font-size: var(--fs-2); }
.kd { font-size: var(--fs-1); color: var(--text-3); }
.v { flex: 1 1 auto; min-width: 116rpx; color: var(--text-1); font-size: var(--fs-3); }
/* 金额与状态值用主色的深阶（--primary-deep）：--primary 在白色上只有 4.36:1，达不到正文 4.5:1；
   深阶 #3553C8 是 7.2:1。判据 audit-unify.mjs D 项。 */
.v.on { color: var(--primary-deep); font-weight: var(--fw-bold); }
.v.price { font-weight: var(--fw-bold); color: var(--primary-deep); }
.chip-list { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }
.chip { font-size: var(--fs-2); color: var(--danger); background: rgba(245,108,108,.1); padding: 8rpx 16rpx; border-radius: 999rpx; }
.text-input { margin-top: 16rpx; background: var(--bg); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: var(--fs-4); height: 140rpx; box-sizing: border-box; }
.ph { color: var(--text-4); }
.ghost-btn { margin-top: 16rpx; border: 2rpx solid var(--primary); background: rgba(74,108,247,.06); color: var(--primary); border-radius: 999rpx; font-size: var(--fs-4); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.ghost-btn::after { border: none; }
.ghost-btn.dis { opacity: .6; }
/* 刷新只是「立即查一次」，弱化为次级按钮 */
.refresh-btn { border-color: var(--line); color: var(--text-2); background: transparent; font-size: var(--fs-3); min-height: 88rpx; }
.empty { background: var(--bg); border-radius: 14rpx; padding: 20rpx; display: flex; flex-direction: column; gap: 8rpx; }
.em-t { font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--danger); }
.em-s { font-size: var(--fs-2); color: var(--text-2); line-height: 1.7; }
.fill-list { display: flex; flex-direction: column; gap: 12rpx; margin-top: 16rpx; }
.fill { border-left: 6rpx solid var(--primary); background: var(--bg); border-radius: 12rpx; padding: 16rpx; display: flex; flex-direction: column; gap: 4rpx; min-width: 116rpx; }
.fl-t { font-size: var(--fs-3); font-weight: var(--fw-bold); }
.fl-v { font-size: var(--fs-3); color: var(--success); }
.fl-v.miss { color: var(--danger); }
.dispatch-note { margin-top: 16rpx; padding: 16rpx; background: var(--bg-2); border-radius: 12rpx; display: flex; flex-direction: column; gap: 4rpx; }
.dn-k { font-size: var(--fs-2); color: var(--text-3); }
.dn-v { font-size: var(--fs-3); color: var(--text-1); }
/* 处理进度（时间轴）：点 + 竖线用伪元素画，最后一个点不再连线下半段 */
.tl { display: flex; flex-direction: column; }
.tl-row { display: flex; gap: 16rpx; min-height: 88rpx; padding-bottom: 8rpx; }
.tl-dot { flex: none; width: 16rpx; height: 16rpx; border-radius: 50%; background: var(--primary); margin-top: 12rpx; box-shadow: 0 0 0 6rpx rgba(74,108,247,.12); }
.tl-dot.last { background: var(--success); box-shadow: 0 0 0 6rpx rgba(43,164,113,.14); }
.tl-main { flex: 1; min-width: 116rpx; display: flex; flex-direction: column; gap: 4rpx; padding-bottom: 20rpx; border-bottom: 1rpx solid var(--bg-2); }
.tl-row:last-child .tl-main { border-bottom: none; }
.tl-t { font-size: var(--fs-3); color: var(--text-1); }
.tl-s { font-size: var(--fs-1); color: var(--text-3); }
/* 另有一张进行中的单：提示条 + 两个等宽按钮 */
.other-card { border-left: 6rpx solid var(--warn); }
.oc-t { font-size: var(--fs-4); font-weight: var(--fw-bold); color: var(--warn); }
.oc-s { display: block; margin-top: 8rpx; font-size: var(--fs-2); color: var(--text-2); }
.oc-acts { display: flex; gap: 16rpx; margin-top: 16rpx; }
.half { flex: 1; margin-top: 0; font-size: var(--fs-3); }
.price-bar { flex: none; background: rgba(255,255,255,.97); border-top: 1rpx solid var(--line); padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom)); }
.pb-btn { width: 100%; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-6); font-weight: var(--fw-bold); padding: 20rpx 0; min-height: 88rpx; box-sizing: border-box; }
.pb-btn::after { border: none; }
.pb-btn.dis { background: #E3E6F0; color: var(--text-3); }
/* 重复申请确认层 */
.mask { position: fixed; inset: 0; background: rgba(10,14,32,.5); display: flex; align-items: center; justify-content: center; z-index: 90; padding: 48rpx; }
.cf { width: 100%; max-width: 620rpx; background: #fff; border-radius: 24rpx; padding: 32rpx 24rpx 24rpx; display: flex; flex-direction: column; gap: 12rpx; }
.cf-t { font-size: var(--fs-6); font-weight: var(--fw-bold); }
.cf-s { font-size: var(--fs-3); color: var(--text-2); line-height: 1.6; }
.cf-warn { font-size: var(--fs-2); color: var(--danger); line-height: 1.6; margin-top: 4rpx; }
.cf-acts { display: flex; gap: 16rpx; margin-top: 16rpx; }
.pb-inline { flex: 1; border: none; border-radius: 999rpx; background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; font-size: var(--fs-3); font-weight: var(--fw-bold); min-height: 88rpx; }
.pb-inline::after { border: none; }
</style>
