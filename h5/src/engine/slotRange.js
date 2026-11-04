/**
 * 时段区间工具（2026-11-03 用户口径）
 *
 * 一个「时段」= 一个整点区间，形如 "19:00-20:00"；分钟固定 00。
 * 用户原话：「时间段应该是我选择时间可以随意配置中间时间的……配置时间段时，只允许选择整数」
 * → 起止都可以任意挑（18:00 / 19:00 / 22:00 都行），但不允许 19:30 这种半点值。
 *
 * 口径不变：一个时段 = 一个可接单名额（同一日期同一时段只能接一单）。
 * 旧数据里 "20:00" 这种单点写法一律按一小时区间解释（"20:00-21:00"），由 normSlotId 兜底。
 */
const SLOT_RE = /^([01]\d|2[0-3]):00-(([01]\d|2[0-3]|24):00)$/

function pad2(n) { return String(n).padStart(2, '0') }

/** 单点到区间的兜底：23:00 之后是 24:00（次日零点），不是 00:00（否则区间倒挂） */
function hourAfter(hhmm) {
  const h = Number(hhmm.slice(0, 2))
  return h >= 23 ? '24:00' : `${pad2(h + 1)}:00`
}

/** 归一化：合法区间原样返回；"20:00" → "20:00-21:00"；非法 → '' */
export function normSlotId(s) {
  if (typeof s !== 'string') return ''
  const raw = s.trim()
  if (SLOT_RE.test(raw)) return raw.slice(6) > raw.slice(0, 5) ? raw : ''
  // 容错：历史上被写坏的 "19-20:00"（漏了 :00）也顺手修正
  const bad = raw.match(/^([01]\d|2[0-3])-(([01]\d|2[0-3]):00)$/)
  if (bad) return `${bad[1]}:00-${bad[2]}`
  const m = raw.match(/^([01]\d|2[0-3]):00$/)
  return m ? `${m[0]}-${hourAfter(m[0])}` : ''
}

export function normSlotIds(list) {
  return (Array.isArray(list) ? list : []).map(normSlotId).filter(Boolean)
}

export function slotStart(s) {
  const id = normSlotId(s)
  return id ? id.slice(0, 5) : ''
}

export function slotEnd(s) {
  const id = normSlotId(s)
  return id ? id.slice(6) : ''
}

/** 展示用："19:00-20:00" → "19:00 – 20:00" */
export function fmtSlot(s) {
  const id = normSlotId(s)
  return id ? `${id.slice(0, 5)} – ${id.slice(6)}` : ''
}

/** 日历格子/标签这类窄位置用："19-20" */
export function shortSlot(s) {
  const id = normSlotId(s)
  return id ? `${id.slice(0, 2)}-${id.slice(6, 8)}` : ''
}

/** 时段与管制/管控窗口（"19:00" ~ "21:00"）是否重叠 —— 半开区间，端点相接不算重叠 */
export function slotHitsWindow(s, win) {
  const id = normSlotId(s)
  if (!id) return false
  if (!win) return true
  return id.slice(0, 5) < win[1].slice(0, 5) && win[0].slice(0, 5) < id.slice(6)
}

/** 全局默认可接单时段（夜间三段，每段一小时 = 每段一个名额） */
export const DEFAULT_SLOTS = ['19:00-20:00', '20:00-21:00', '21:00-22:00']

/** 整点选项（"只允许选择整数"的唯一来源：00:00 ~ 23:00，步长 1 小时） */
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => `${pad2(i)}:00`)
