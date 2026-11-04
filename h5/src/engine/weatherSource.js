/**
 * 真实天气数据源（可插拔）—— 2026-11-02 用户要求「天气不能是假的：具体什么天气、按时段、只报能报的那几天」。
 *
 * 部署口径：
 *   演示/内测用 Open-Meteo：免费、免 key、跨域可用，逐小时（含天气代码、温度、湿度、降水概率、风速）+ 16 天逐日；
 *   正式版换成华风爱科 WeatherCN（权威预警 + 实际影响区域）或和风天气 QWeather（30 天预报），两者要 key + 企业认证；
 *   合同里写「以气象主管机构发布为准」，API 数据只作内部排期依据（《申请说明》风险与后果归属组）。
 *
 * 失败即回退：超时 / 离线 / 接口变更 / 代码表变化 → 返回 null，weather.js 用确定性 mock 顶上。
 * 这样填报流程不会因为天气接口挂掉而阻塞，e2e 在无网络时依旧可复现（这是判据要求，不是偷懒）。
 */
import { slotStart } from './slotRange.js'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const HOURLY = ['weather_code', 'temperature_2m', 'relative_humidity_2m', 'precipitation_probability', 'wind_speed_10m'].join(',')
const CACHE_KEY = 'wx_live_v1'
const TTL_MS = 30 * 60 * 1000
const SLOT_HOURS = { '19:00': '19', '20:00': '20', '21:00': '21' }

// WMO 4677 天气代码 → 具体天气（按时段显示的就是它，不再是笼统的「天气」两个字）
const CODE_TABLE = [
  [0, '晴', '晴'], [1, '晴间多云', '多云'], [2, '多云', '多云'], [3, '阴', '阴'],
  [45, '雾', '雾'], [48, '雾凇', '雾'],
  [51, '毛毛雨', '毛毛雨'], [53, '毛毛雨', '毛毛雨'], [55, '毛毛雨', '毛毛雨'],
  [56, '冻雨', '冻雨'], [57, '冻雨', '冻雨'],
  [61, '小雨', '小雨'], [63, '中雨', '中雨'], [65, '大雨', '大雨'],
  [66, '冻雨', '冻雨'], [67, '冻雨', '冻雨'],
  [71, '小雪', '小雪'], [73, '中雪', '中雪'], [75, '大雪', '大雪'], [77, '雪粒', '雪粒'],
  [80, '阵雨', '阵雨'], [81, '阵雨', '阵雨'], [82, '强阵雨', '阵雨'],
  [85, '阵雪', '阵雪'], [86, '阵雪', '阵雪'],
  [95, '雷阵雨', '雷阵雨'], [96, '雷阵雨伴冰雹', '冰雹'], [99, '雷阵雨伴冰雹', '冰雹']
]

export function kindOf(code) {
  const row = CODE_TABLE.find(r => r[0] === Number(code))
  if (row) return { kind: row[1], kindShort: row[2] }
  return { kind: '阴', kindShort: '阴' }
}

const snapshot = { key: '', at: 0, days: null, error: '', source: '' }
const waiters = new Set()

export function onLiveWeather(fn) {
  waiters.add(fn)
  return () => waiters.delete(fn)
}
function notify() { waiters.forEach(fn => { try { fn(!!snapshot.days) } catch (e) {} }) }

/** 已拉到的真实预报（逐日，含 19/20/21 点三个时段）；没拉到返回 null */
export function liveDays() { return snapshot.days }

/** 真实数据能覆盖多少天；未接入返回 0（由 weather.js 用内置预报期） */
export function liveHorizon() { return snapshot.days ? snapshot.days.length : 0 }

export function liveSource() { return snapshot.days ? snapshot.source : '' }

export function liveError() { return snapshot.error }

/** 某日某时段的具体天气（真实数据）；超出覆盖范围或未接入返回 null */
export function liveSlot(date, slot) {
  if (!snapshot.days) return null
  const d = snapshot.days.find(x => x.date === date)
  if (!d || !d.slots) return null
  // 时段是整点区间（"19:00-20:00"），真实预报按小时存 → 用开始小时取，19 点段不受"半到整"改造影响
  const key = slotStart(slot) || '20:00'
  return d.slots[key] || null
}

function parseHourly(json) {
  const h = (json && json.hourly) || {}
  const times = h.time || []
  const byDate = new Map()
  for (let i = 0; i < times.length; i++) {
    const m = /^(\d{4}-\d{2}-\d{2})T([01][0-9]):/.exec(String(times[i]))
    if (!m) continue
    const date = m[1]
    const hour = m[2]
    const slot = Object.keys(SLOT_HOURS).find(s => SLOT_HOURS[s] === hour)
    if (!slot) continue
    if (!byDate.has(date)) byDate.set(date, { date, slots: {} })
    const k = kindOf((h.weather_code || [])[i])
    byDate.get(date).slots[slot] = {
      date, slot, code: Number((h.weather_code || [])[i] || 0),
      kind: k.kind, kindShort: k.kindShort,
      tempC: num((h.temperature_2m || [])[i], 0),
      humidity: num((h.relative_humidity_2m || [])[i], 0),
      precipProb: num((h.precipitation_probability || [])[i], 0),
      windMs: +(((num((h.wind_speed_10m || [])[i], 0)) / 3.6)).toFixed(1), // km/h → m/s
      visibilityKm: null, // 该免费模型不提供能见度，改用天气代码判定（雨雪雾雷雹一律硬拦）
      source: 'open-meteo'
    }
  }
  return [...byDate.values()].sort((a, b) => a.date < b.date ? -1 : 1)
}

function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function cacheGet(key) {
  try {
    const raw = (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage.getItem(CACHE_KEY) : ''
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || o.key !== key || Date.now() - o.at > TTL_MS) return null
    return o.days
  } catch (e) { return null }
}
function cacheSet(key, days, source) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), days, source }))
    }
  } catch (e) { /* 隐私模式 / 配额满：不回退算失败 */ }
}

async function fetchJson(url, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => { if (ctrl) ctrl.abort() }, timeoutMs)
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return await res.json()
  } finally { clearTimeout(timer) }
}

/**
 * 拉某城市（按经纬度）的逐小时预报。
 * key = 城市码 + 经纬度；同一会话内 30 分钟复用，避免每次进页面都打接口。
 */
export async function loadLiveWeather({ cityCode, lat, lon, timeoutMs = 7000 }) {
  const key = `${cityCode}|${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
  if (snapshot.days && snapshot.key === key && Date.now() - snapshot.at <= TTL_MS) return snapshot.days
  const cached = cacheGet(key)
  if (cached) {
    snapshot.key = key; snapshot.at = Date.now(); snapshot.days = cached; snapshot.error = ''; snapshot.source = 'open-meteo(cache)'
    notify()
    return cached
  }
  const url = `${ENDPOINT}?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lon).toFixed(4)}`
    + `&hourly=${HOURLY}&timezone=Asia%2FShanghai&forecast_days=16`
  try {
    const json = await fetchJson(url, timeoutMs)
    const days = parseHourly(json)
    if (!days.length) throw new Error('返回数据里没有可用的逐小时记录')
    snapshot.key = key; snapshot.at = Date.now(); snapshot.days = days; snapshot.error = ''; snapshot.source = 'open-meteo'
    cacheSet(key, days, snapshot.source)
    notify()
    return days
  } catch (e) {
    snapshot.key = key; snapshot.at = Date.now(); snapshot.days = null
    snapshot.error = (e && e.message) || '天气接口不可用'
    snapshot.source = ''
    notify()
    return null
  }
}

/** 主动清空（换场地/换城市后强制重拉时用） */
export function resetLiveWeather() {
  snapshot.key = ''; snapshot.at = 0; snapshot.days = null; snapshot.error = ''; snapshot.source = ''
  notify()
}
