// API 客户端 + 数据准备/清理：用例的前置数据一律走真实接口造，不直接改 db.json。
//
// 约定：
//   - call() 永不抛网络/业务错误，返回统一结构 { code, msg, data }；期望失败（负控）直接看 code。
//   - ok() 是「必须成功」的包装，code !== 0 抛带 msg 的错（失败信息能直接定位）。
//   - 所有造数都带 runId 标记（联系人姓名/备注），排查时能从数据里认出哪条是测试造的。
//   - 清理策略：mock-server 没有删订单接口，所以**每条用例开始时 reset 到种子态**（run-suite 自动做），
//     用例内部的临时配置（档期时段/特殊日/字典价）必须在用例内还原，不能留到下一次运行。
import { H5, ADMIN, API } from './browser.mjs'
import { adminLoginApi, userLoginApi } from './auth.mjs'

/** 统一 HTTP 客户端。base 默认 8090（API + H5 同源）。 */
export class ApiClient {
  constructor(base = API, opts = {}) {
    this.base = base.replace(/\/$/, '')
    this.token = opts.token || ''
  }
  setToken(tk) { this.token = tk || ''; return this }

  /** 发请求，永不抛。返回 { http, code, msg, data }。 */
  async call(path, opts = {}) {
    const { method = 'GET', body, token = this.token, query } = opts
    let url = this.base + (path.startsWith('/api') ? path : '/api' + path)
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString()
      url += (url.includes('?') ? '&' : '?') + qs
    }
    try {
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      const text = await r.text()
      let j
      try { j = JSON.parse(text) } catch (e) { j = { code: -2, msg: '响应不是 JSON：' + text.slice(0, 120) } }
      return { http: r.status, ...j }
    } catch (e) {
      return { http: 0, code: -1, msg: '请求失败：' + String(e.message || e).slice(0, 160) }
    }
  }

  /** 必须成功：code !== 0 抛错。 */
  async ok(path, opts = {}) {
    const j = await this.call(path, opts)
    if (j.code !== 0) throw new Error(`[API] ${opts.method || 'GET'} ${path} -> code=${j.code} ${j.msg || ''}`)
    return j.data
  }
}

/** 格式化本地日期 YYYY-MM-DD（与 mock-server 的 fmtDate 同口径，按本机时区）。 */
export function dateStr(offsetDays = 0, from = new Date()) {
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + offsetDays)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 今天（YYYY-MM-DD）。 */
export const today = () => dateStr(0)

/** 管理端接口客户端（默认连 8080，但 8090 的 API 与管理端接口是同一份，用 8080 更贴近页面）。 */
export function makeAdminClient(base = ADMIN) {
  return new ApiClient(base)
}

/** H5 接口客户端（8090）。 */
export function makeH5Client(base = H5) {
  return new ApiClient(base)
}

/** 取管理端 token（admin/admin123），返回 ApiClient（已带 token）。 */
export async function adminClient(base = ADMIN, opts = {}) {
  const { token } = await adminLoginApi(base, opts)
  return new ApiClient(base, { token })
}

/** 取用户 token，返回 ApiClient（已带 token）+ user。 */
export async function userClient(base = H5, opts = {}) {
  const { token, user } = await userLoginApi(base, opts)
  return { api: new ApiClient(base, { token }), token, user }
}

/** 重置演示数据到种子态（清掉上一轮残留的订单/咨询/配置改动）。返回 reset 接口的 msg。 */
export async function resetDemoData(api) {
  const j = await api.call('/api/config/reset', { method: 'POST', body: {} })
  if (j.code !== 0) throw new Error('重置演示数据失败：' + JSON.stringify(j).slice(0, 160))
  return j.msg || '演示数据已重置'
}

/** 读某天档期（GET /api/schedule?from&to，免登录）。 */
export async function getScheduleDay(api, date) {
  const d = await api.call('/api/schedule', { query: { from: date, to: date } })
  if (d.code !== 0) throw new Error('读档期失败：' + (d.msg || ''))
  return (d.data.days || [])[0]
}

/**
 * 往后找一天「有可选时段」的日期：跳过休整日、跳过已订满时段的日子。
 * 种子数据里有 +7 天休整日、+9 天 20:00 已被占 —— 所以下单不能盲写日期/时段。
 */
export async function pickOpenSlot(api, opts = {}) {
  const { fromOffset = 2, maxOffset = 20 } = opts
  for (let i = fromOffset; i <= maxOffset; i++) {
    const date = dateStr(i)
    const day = await getScheduleDay(api, date)
    if (!day || day.closed) continue
    if (!day.openSlots || !day.openSlots.length) continue
    return { date, slot: day.openSlots[0], day }
  }
  throw new Error(`未来 ${maxOffset} 天内没有可用时段（fromOffset=${fromOffset}）`)
}

const DEFAULT_VENUE = {
  type: 'preset', id: 'V01', name: '滨江世纪广场',
  address: '杭州市滨江区江南大道100号', city: '杭州'
}

/** 造一张订单（不支付）。body 可覆盖任意字段，时间/时段默认自动挑可用名额。 */
export async function createOrder(api, opts = {}) {
  const { runId = 'suite', performInDays = null, timeSlot = null, droneCount = 200, duration = 15, extra = {} } = opts
  let date, slot
  if (performInDays != null && timeSlot) {
    date = dateStr(performInDays)
    slot = timeSlot
  } else {
    const picked = await pickOpenSlot(api)
    date = picked.date
    slot = timeSlot || picked.slot
  }
  const body = {
    droneCount,
    duration,
    patternPreset: ['heart'],
    customText: '',
    addons: [],
    occasion: '自动化测试',
    performDate: date,
    timeSlot: slot,
    venue: DEFAULT_VENUE,
    contact: { name: `自动化-${runId}`, phone: '13800001234' },
    idempotencyKey: `suite-${runId}-${Date.now()}`,
    ...extra
  }
  const j = await api.call('/api/orders', { method: 'POST', body })
  if (j.code !== 0) throw new Error(`下单失败：code=${j.code} ${j.msg || ''}`)
  return j.data.order
}

/** 造一张已支付订单（进入 PENDING_ACCEPT）。 */
export async function createPaidOrder(api, opts = {}) {
  const order = await createOrder(api, opts)
  const pay = await api.call(`/api/orders/${order.id}/pay`, { method: 'POST', body: { channel: 'WECHAT', success: true } })
  if (pay.code !== 0) throw new Error(`支付失败：code=${pay.code} ${pay.msg || ''}`)
  return { order: pay.data.order, prePay: order }
}

/** 读订单（用户视角）。 */
export async function getOrder(api, orderId) {
  const j = await api.call(`/api/orders/${orderId}`)
  if (j.code !== 0) throw new Error(`读订单失败：${j.msg}`)
  return j.data.order
}

/** 退款试算。 */
export async function refundPreview(api, orderId) {
  const j = await api.call(`/api/orders/${orderId}/refund-preview`, { method: 'POST', body: {} })
  if (j.code !== 0) throw new Error(`退款试算失败：${j.msg}`)
  return j.data.preview
}

/** 申请退款。 */
export async function applyRefund(api, orderId, reason = '自动化测试-时间冲突') {
  const j = await api.call(`/api/orders/${orderId}/refund`, { method: 'POST', body: { reason } })
  if (j.code !== 0) throw new Error(`申请退款失败：code=${j.code} ${j.msg || ''}`)
  return j.data.order
}

// ---------------- 咨询单 / 派单 ----------------

/** 用用户接口提交咨询单（PENDING）。默认带 abandonActive:true 避免撞「进行中的单」冲突。 */
export async function createConsult(api, opts = {}) {
  const { runId = 'suite', performDate = dateStr(9), timeSlot = '19:00-20:00', venue = DEFAULT_VENUE, droneCount = 200, quoteTotal = 28800, note } = opts
  const body = {
    performDate,
    timeSlot,
    venue,
    need: { droneCount, duration: 15, contentMode: 'template', audience: 600 },
    quote: { total: quoteTotal },
    note: note || `自动化测试 ${runId}`,
    abandonActive: true
  }
  const j = await api.call('/api/consults', { method: 'POST', body })
  if (j.code !== 0) throw new Error(`提交咨询单失败：code=${j.code} ${j.msg || ''}`)
  return j.data.consult
}

/** 客服接待（PENDING → RECEIVED）。 */
export async function receiveConsult(adminApi, consultId) {
  const j = await adminApi.call(`/api/admin/consults/${consultId}/receive`, { method: 'POST', body: {} })
  if (j.code !== 0) throw new Error(`接待失败：${j.msg}`)
  return j.data.consult
}

/** 客服创建派单（六项必填，RECEIVED → DISPATCHED）。 */
export const DISPATCH_TERMS = {
  approvalOwner: '承飞方（乙方）负责空域申请与备案',
  approvalFailLiability: '乙方未按时取得批复 → 乙方全责退还已付费用',
  subcontractApproved: '是（甲方书面同意）',
  depositNature: '预付款（未约定定金条款，不适用定金罚则）',
  insuranceAmount: 1000000,
  scaleBasis: '投入规模（实际投入的机队数）'
}

export async function dispatchConsult(adminApi, consultId, opts = {}) {
  const body = {
    quoteLo: opts.quoteLo ?? 30000,
    quoteHi: opts.quoteHi ?? 42000,
    note: opts.note || '自动化测试派单',
    terms: { ...DISPATCH_TERMS, ...(opts.terms || {}) }
  }
  const j = await adminApi.call(`/api/admin/consults/${consultId}/dispatch`, { method: 'POST', body })
  if (j.code !== 0) throw new Error(`创建派单失败：code=${j.code} ${j.msg || ''}`)
  return j.data.consult
}

/** 用户确认派单（DISPATCHED → CONFIRMED）。 */
export async function confirmDispatch(userApi, consultId) {
  const j = await userApi.call(`/api/consults/${consultId}/confirm-dispatch`, { method: 'POST', body: {} })
  if (j.code !== 0) throw new Error(`确认派单失败：${j.msg}`)
  return j.data.consult
}

/** 用户的咨询单列表。 */
export async function myConsults(userApi) {
  const j = await userApi.call('/api/consults/mine')
  if (j.code !== 0) throw new Error(`读咨询单列表失败：${j.msg}`)
  return j.data.list || []
}

/** 管理端读单张咨询单（含 timeline / reject / dispatch）。 */
export async function adminConsultDetail(adminApi, consultId) {
  const j = await adminApi.call(`/api/admin/consults/${consultId}`)
  if (j.code !== 0) throw new Error(`读咨询单失败：${j.msg}`)
  return j.data.consult
}

/** 管理端看板数据。 */
export async function getDashboard(adminApi) {
  const j = await adminApi.call('/api/admin/dashboard')
  if (j.code !== 0) throw new Error(`读看板失败：${j.msg}`)
  return j.data
}

// ---------------- 档期 / 字典 ----------------

/** 管理端读某月档期。 */
export async function getScheduleMonth(adminApi, month) {
  const j = await adminApi.call('/api/admin/schedule', { query: { month } })
  if (j.code !== 0) throw new Error(`读档期失败：${j.msg}`)
  return j.data
}

/** 批量/单日设置时段；slots=null 表示恢复默认。 */
export async function setSlots(adminApi, dates, slots, mode = 'single') {
  return adminApi.call('/api/admin/schedule/slots', { method: 'POST', body: { dates, mode, slots } })
}

/** 设置/取消特殊日标注（name 空 = 取消）。 */
export async function setHoliday(adminApi, date, name) {
  return adminApi.call('/api/admin/schedule/holiday', { method: 'POST', body: { date, name } })
}

/** 读字典项。 */
export async function dictItems(adminApi, type) {
  const j = await adminApi.call(`/api/admin/dict/${type}/items`)
  if (j.code !== 0) throw new Error(`读字典 ${type} 失败：${j.msg}`)
  return j.data.list
}

/** 按 key 改字典项的值（改价联动用）。返回原值与新值。 */
export async function updateDictItemByKey(adminApi, type, key, value) {
  const list = await dictItems(adminApi, type)
  const item = list.find((i) => String(i.key) === String(key))
  if (!item) throw new Error(`字典 ${type} 里没有 key=${key} 的项（现有：${list.map((i) => i.key).join(',')}）`)
  const j = await adminApi.call(`/api/admin/dict/${type}/items/${item.id}`, { method: 'PUT', body: { value } })
  if (j.code !== 0) throw new Error(`改字典值失败：${j.msg}`)
  return { id: item.id, oldValue: item.value, newValue: value, item: j.data.item }
}

/** 读 H5 计价视图（举报价档位/退款阶梯）。 */
export async function getPricing(api) {
  const j = await api.call('/api/config/pricing')
  if (j.code !== 0) throw new Error(`读计价配置失败：${j.msg}`)
  return j.data
}

/** 读当前用户（校验 token 有效）。 */
export async function whoAmI(api) {
  const j = await api.call('/api/auth/me')
  return j
}

/** 读当前管理端身份。 */
export async function adminWhoAmI(adminApi) {
  const j = await adminApi.call('/api/admin/me')
  return j
}
