/**
 * 时段区间工具（与 h5/src/engine/slotRange.js 同一口径，后台单独一份避免跨包引用）
 *
 * 一个「时段」= 一个整点区间，形如 "19:00-20:00"；分钟固定 00，只能配整点。
 * 起止可任意挑（18:00 / 22:00 都行），不区分「默认列表」——管理员增删即生效。
 */
const SLOT_RE = /^([01]\d|2[0-3]):00-(([01]\d|2[0-3]|24):00)$/

function pad2(n) { return String(n).padStart(2, '0') }

function hourAfter(hhmm) {
  const h = Number(hhmm.slice(0, 2))
  return h >= 23 ? '24:00' : `${pad2(h + 1)}:00`
}

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

/** "19:00-20:00" → "19:00 – 20:00" */
export function fmtSlot(s) {
  const id = normSlotId(s)
  return id ? `${id.slice(0, 5)} – ${id.slice(6)}` : ''
}

/** 窄位置用："19-20" */
export function shortSlot(s) {
  const id = normSlotId(s)
  return id ? `${id.slice(0, 2)}-${id.slice(6, 8)}` : ''
}

export const DEFAULT_SLOTS = ['19:00-20:00', '20:00-21:00', '21:00-22:00']

/** 时段选择器的整点选项：00:00 ~ 23:00，步长 1 小时（"只允许选择整数"） */
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => `${pad2(i)}:00`)
