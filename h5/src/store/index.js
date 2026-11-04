import { reactive, watch } from 'vue'
import { VENUES, venueOf } from '../engine/venues.js'
import { judge } from '../engine/judge.js'
import { quote as calcQuote } from '../engine/pricing.js'
import { calendarDays, dayInfo } from '../engine/calendar.js'
import { CLAUSES, hashOf } from '../engine/contract.js'
import { DISCLOSURE_VERSION, clauseOf, contentHash, confirmedClauses, pendingTouches } from '../engine/disclosure.js'

// 轻量全局状态：用户、计价配置、下单草稿、业务档案（品牌）、申请单草稿
// 草稿按「会话」存，不是按「本地」存：
//   演示中途 F5 会丢内存态 —— 之前第 2 步之后刷新就白屏（页面 setup 比 StepBar 先跑，
//   直接读 store.apply.need 时它是 null）。存到 sessionStorage 后刷新能恢复，
//   关掉标签页 / 换一次演示则重新开始，不会把上一次演示的草稿带进来。
// 用 window.sessionStorage 而不是 uni.setStorageSync：后者在 H5 是 localStorage，跨会话。
// 注意：APPLY_KEY / storeSpace 必须在 store 初始化之前声明——loadApply() 在 store 里被调用，
// 放在后面会踩 TDZ（之前被 try/catch 吞掉，表现为「刷新后草稿读不出来」）。
const APPLY_KEY = 'apply_draft'
function storeSpace() {
  return (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage : null
}

export const store = reactive({
  token: '',
  user: null,
  pricing: null,      // /api/config/pricing 缓存
  profile: null,      // /api/config/profile 缓存（品牌/业务名，通用模板业务档案驱动）
  draft: null,        // 下单草稿（create -> confirm 传递）
  apply: loadApply() || newApply()   // 申请单草稿（场地 → 规模与内容 → 日期时段 → 报价区间 → 咨询派单 → 合同 → 付款 → 进度）
})

/** 步骤号 → 页面名（与 h5/src/pages/apply 下的文件名一致） */
export const APPLY_PAGES = ['venue', 'need', 'date', 'quote', 'consult', 'contract', 'pay', 'progress']

export function newApply() {
  return {
    step: 1,
    acks: [],   // 逐条确认事件：[{ v, at, user, hash, clause, touch }]，按说明版本绑定（版本变了要重新确认）
    wxAcks: [], // 天气未公布时的预约风险确认：[{ v, date, slot, at, user, hash, horizonDays, source }]
    need: {
      droneCount: 100, duration: 10,
      contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1,
      addons: [], audience: 200
    },
    venue: null,
    date: '', slot: '',
    anchor: 'flex',   // 第 3 步的求解方向：flex = 锁场地解日期；fixed = 锁日期解场地
    judgment: null,
    quote: null,
    consult: null,
    dispatch: null,
    contract: null,
    payment: null
  }
}

function loadApply() {
  const s = storeSpace()
  if (!s) return null
  try {
    const raw = s.getItem(APPLY_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d !== 'object') return null
    // 老草稿可能缺字段（原型结构会变），按当前结构补齐，缺什么补什么
    return Object.assign(newApply(), d)
  } catch (e) { return null }
}

function saveApply(a) {
  const s = storeSpace()
  if (!s || !a) return
  try { s.setItem(APPLY_KEY, JSON.stringify(a)) } catch (e) { /* 隐私模式 / 配额满：丢了就丢了，不影响渲染 */ }
}

// 任何页面改草稿都写回，不用每页各自记得存（deep watch）
watch(store, (v) => { saveApply(v.apply) }, { deep: true })

export function ensureApply() {
  if (!store.apply) store.apply = newApply()
  return store.apply
}

/**
 * 页面进入时的兜底（各申请页 data() 调用，参数 = 该页对应的步骤号）。
 * 只在两种情况下补齐上游产物：
 *   1) 本次会话第一次进申请页 —— 刷新后草稿可能整个丢了，页面读 a.venue / a.judgment 会崩；
 *   2) 回看已经走过的步骤（草稿 step 比这页大）—— 缺什么补什么。
 * 正常走流程时不补：用户还没挑的场地、日期、时段不该被预填。
 * 补的是「缺失」，已有的一律不动（同 hydrateTo）。
 */
/** 1 基：哪些步骤的产物是「推导出来的结论」（可重算），哪些是「用户填的选择」（不能预置） */
const DERIVED = [false, false, true, false, true, true, true, true]

let coldEntry = true
export function hydrateForPage(step) {
  const a = ensureApply()
  // 2026-10-28 六次调整（用户要求）：这里不再有「先确认才能填报」的门。
  // 告知不再是流程的第一步，也不在填写途中打断：本步条款在点击下一步/提交/签署时逐条确认，
  // 只看「本单真的触发了哪几条」，不看全部 17 条。
  if (coldEntry) {
    coldEntry = false
    hydrateTo(step)
    a.step = step   // 冷进入时把「当前步」对齐到正在看的页，否则步骤条会亮在第 1 步而页面显示的是第 4 步的内容
  } else if (a.step > step) {
    hydrateTo(step)
  } else if (DERIVED[step] && !stepFilled(step)) {
    // 回退后重走：用户填的选择还在，缺的「结论」按当前上游重算（用户填的步骤不预置）
    hydrateTo(step)
  }
  return a
}

function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function accountName() {
  const u = store.user
  return u ? (u.nickname || u.id || '未登录') : '未登录'
}

/**
 * 逐条确认：每次门里点「确认本条」是一个独立事件
 * （版本 + 条款号 + 触点 + 时间戳 + 账号 + 内容哈希）。
 * 已确认不可撤销——留痕的意义就是「当时确实确认过」，撤销会让记录变成可篡改的。
 * 返回 { ok, clause }；ok=false 表示这一条已经确认过（不重复写）。
 */
export function confirmClause(touch) {
  const a = ensureApply()
  const c = clauseOf(touch)
  if (!c) return { ok: false, clause: null }
  if (!confirmedClauses(a.acks, DISCLOSURE_VERSION).includes(c.n)) {
    a.acks.push({ v: DISCLOSURE_VERSION, at: nowStamp(), user: accountName(), hash: contentHash(), clause: c.n, touch })
    return { ok: true, clause: c }
  }
  return { ok: false, clause: c }
}

/** 本单适用但尚未确认的触点（门用这个）—— 只看已经走到的那几步里触发的条款，不是全量 17 条。 */
export function pendingForPage(step) {
  const a = ensureApply()
  return pendingTouches(a, null, step || a.step)
}

/**
 * 天气未公布（超出逐日预报期）时的预约风险确认（2026-11-02 用户要求）：
 * 允许预约，但必须让用户明确同意「因天气不确定导致改期」的后果。
 * 记录 = 说明版本 + 日期 + 时段 + 时间戳 + 账号 + 内容哈希 + 当时的预报期，按日期×时段绑定：
 * 换日期或换时段就要重新确认，不能拿一条旧记录覆盖新选择。
 */
export function ackWeatherRisk({ date, slot, horizonDays, source }) {
  const a = ensureApply()
  const hit = (a.wxAcks || []).find(e => e && e.date === date && e.slot === slot && e.v === DISCLOSURE_VERSION)
  if (hit) return hit
  const rec = {
    v: DISCLOSURE_VERSION, date, slot, at: nowStamp(), user: accountName(),
    hash: contentHash(), horizonDays: horizonDays || 0, source: source || ''
  }
  a.wxAcks.push(rec)
  return rec
}

export function wxAckOf(date, slot) {
  const a = ensureApply()
  return (a.wxAcks || []).filter(e => e && e.date === date && e.slot === slot && e.v === DISCLOSURE_VERSION).pop() || null
}

/**
 * 某一步是否「已编写」—— 判据是这一步的产物数据在不在，不是它有没有被访问过。
 * 访问过但没产出数据的步骤仍算未编写（点了也看不出东西）。
 *   7 付款 / 8 进度 的产物是「签约节点已付」，所以要看到付款记录才算已编写。
 */
export function stepFilled(step) {
  const a = store.apply
  if (!a) return false
  const paid = !!(a.contract && a.contract.paidNodes && a.contract.paidNodes.length)
  switch (step) {
    case 1: return !!a.venue
    case 2: return !!(a.venue && a.need && a.judgment)
    case 3: return !!(a.venue && a.need && a.judgment && a.date && a.slot)
    case 4: return !!(a.venue && a.need && a.judgment && a.date && a.quote)
    case 5: return !!(a.consult && ['DISPATCHED', 'CONFIRMED'].includes(a.consult.status))
    case 6: return !!a.contract
    case 7: return !!(a.contract && paid)
    case 8: return !!(a.contract && a.quote && paid)
    default: return false
  }
}

/**
 * 用户在某一步改了选择：他填的东西一律保留（2026-10-28 用户要求：数据保留，只是要重新走一遍确认），
 * 只作废「由上游推导出来的结论」——判定单、报价、咨询派单、合同、付款记录。
 * 参数是「被改动的那一步」，不是下一步。改完之后只能从这一步重新往下走（步骤条只允许点当前之前的步骤）。
 * 依赖链（2026-10-28 顺序调整后）：判定 = 场地(1) × 规模与内容(2)；报价 = 判定 + 日期时段(3)。
 * 改场地时已选的规模与日期不丢，但规模可能超出新场地的上限、日期可能要重确认。
 */
export function invalidateFrom(changedStep) {
  const a = store.apply
  if (!a) return
  if (changedStep <= 2) a.judgment = null
  if (changedStep <= 3) a.quote = null
  if (changedStep <= 5) { a.consult = null; a.dispatch = null }
  if (changedStep <= 6) a.contract = null
  else if (a.contract) a.contract.paidNodes = []
}

function pad(n) { return String(n).padStart(2, '0') }

function seedContract(a, paid) {
  const d = new Date()
  const content = [a.quote.total, a.venue.name, a.date, a.slot, '演示签署人', CLAUSES.map(c => c.key).join(',')].join('|')
  return {
    no: 'HT' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + hashOf(content).slice(0, 6).toUpperCase(),
    subject: 'person',
    name: '演示签署人',
    idno: '530************01X',
    agent: '',
    phone: '138****0000',
    clauses: CLAUSES.map(c => c.key),
    hash: hashOf(content),
    time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    ca: '演示环境未接入 CA · 正式版由依法设立的电子认证服务提供者签发',
    paidNodes: paid ? ['SIGN'] : [],
    seed: true
  }
}

/**
 * 把演示往深里做：跳到第 n 步时，把 1..n 步缺的产物按真实算法补全（不是塞假数字）。
 * 补的是「缺失」，已有的一律不动，所以预生成后用户自己改选择也不会覆盖他的决定
 * （改选择要走 invalidateFrom 主动作废下游）。
 * 预置出来的对象带 seed 标记，页面上要区分「用户填的」和「演示预置的」时可以用它。
 */
export function hydrateTo(step) {
  const a = ensureApply()
  const need = a.need

  // 第 1 步产物是场地（用户选，不预置）；只有冷进入第 2 步及以后才补一个有实测档案的默认场地
  if (step >= 2 && !a.venue) {
    a.venue = venueOf('V02') || VENUES[0]
    a.judgment = null
  }
  // 第 2 步产物：判定单 = 场地 × 规模 × 观众（规模与内容是用户填的，不预置）
  if (step >= 2 && a.venue && !a.judgment) {
    a.judgment = judge({ venue: a.venue, drones: need.droneCount, date: a.date || '', audience: need.audience })
  }

  // 第 3 步产物：日期与申请时段（时段是排他资源，只能取可安排的那一个）
  if (step >= 3 && a.venue && (!a.date || !a.slot)) {
    const days = calendarDays({ venue: a.venue, drones: need.droneCount })
    let day = a.date ? dayInfo(days, a.date) : null
    if (!day || !day.openSlots.length) day = days.find(x => x.status === 'ok') || days.find(x => !x.disabled)
    if (day) {
      a.date = day.date
      a.slot = (day.openSlots[0] || { slot: '20:00-21:00' }).slot
    }
  }

  // 第 4 步产物：报价区间（判定结果驱动，含判定费）
  if (step >= 4 && !a.quote && a.venue && a.judgment && a.date) {
    a.quote = calcQuote({ need, venue: a.venue, judgment: a.judgment, date: a.date })
  }

  // 第 5 步产物：咨询单 + 派单（2026-11-02 用户：必须先提交咨询单、等客服在管理端接待并创建派单，
  // 用户侧不能自己推进）。所以这里什么都不预置——冷进入第 5 步就是「未提交」，
  // 已提交的单由服务端返回，用 restoreFromConsult 恢复进草稿。

  // 第 6 步产物：已签署的合同；跳到第 8 步时顺带把签约节点标为已付（否则进度页与付款记录不一致）
  if (step >= 7 && !a.contract && a.quote && a.venue && a.date) {
    a.contract = seedContract(a, step >= 8)
  }

  return a
}

/**
 * 把服务端的一张咨询单恢复进当前草稿：刷新后继续同一次申请、或在「我的预约」点「继续办理」。
 * 恢复的是这张单依赖的上游产物（场地/日期/规模/报价总额），判定单与报价明细按当前上游重算（已有的不动）。
 * 用户「重新申请」不走这里，走 newApply()。
 */
export function restoreFromConsult(c) {
  if (!c) return null
  const a = ensureApply()
  if (c.venue) a.venue = { ...c.venue }
  if (c.performDate) a.date = c.performDate
  if (c.timeSlot) a.slot = c.timeSlot
  if (c.need) a.need = Object.assign(newApply().need, c.need)
  if (c.quote) a.quote = Object.assign({ total: 0, lines: [], detail: [], fee: null }, { total: c.quote.total, fee: c.quote.fee || null })
  hydrateTo(5)
  a.consult = c
  a.dispatch = c.dispatch || null
  a.step = 5
  return a
}

/** 用户侧拿到的咨询单只用来展示与判定阶段，写回草稿统一走这里，避免页面各写一份 */
export function setConsult(c) {
  const a = ensureApply()
  a.consult = c || null
  a.dispatch = (c && c.dispatch) || null
  return a
}

export function setLogin(token, user) {
  store.token = token
  store.user = user
  uni.setStorageSync('token', token)
  uni.setStorageSync('user', user)
}

export function logout() {
  store.token = ''
  store.user = null
  uni.removeStorageSync('token')
  uni.removeStorageSync('user')
  // 退出 = 这一段演示结束：草稿也跟着清，下一个登录的人不该看到上一个会话的申请单
  store.apply = newApply()
  const s = storeSpace()
  if (s) { try { s.removeItem(APPLY_KEY) } catch (e) {} }
}

export function isLogin() {
  return !!store.token
}

/**
 * 当前是否已登录：内存优先、storage 兜底（2026-11-03 用户报告「明明登录了点提交还提示登录」）。
 * store.token 只在 App.onLaunch 与登录成功时写入；页面 / 组件若在更早的时机读它，会读到空值，
 * 于是「已登录」被误判成「未登录」。这里两处都读，命中 storage 时顺手把内存补齐。
 * 注意：这只回答「本机有没有登录凭证」，不回答「凭证在服务端还有效」——后者由 40100 处理。
 */
export function tokenNow() {
  let t = ''
  try { t = (typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('token') : '') || '' } catch (e) { t = '' }
  if (t && !store.token) store.token = t
  return store.token || t
}

export function isLoggedIn() { return !!tokenNow() }

/**
 * 登录门（2026-11-03 用户要求：没登录不允许点进预约）。
 * 未登录 → 提示 + 去登录页，并把「登录后回哪里」带过去（登录成功直接回到原入口，不绕回首页）。
 * 返回 true 表示已登录、调用方可以继续。
 */
export function requireLogin(redirect) {
  if (isLoggedIn()) return true
  const back = redirect || '/pages/apply/venue'
  uni.showToast({ title: '请先登录再预约', icon: 'none' })
  setTimeout(() => {
    // 跳走前先收掉 toast：uni 的 toast 是全局容器，跨页跳转后会在新页面上留一块空壳（视觉上是灰块）
    try { uni.hideToast() } catch (e) {}
    uni.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent(back) })
  }, 420)
  return false
}
