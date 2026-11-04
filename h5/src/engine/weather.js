/**
 * 天气层 —— 判断「每日是否安排派单」和「当日照常 / 推迟 / 取消」。
 *
 * 三层数据，不能只用一层：
 *   1) 预报层（15 天）→ 按时段给出具体天气；超出预报期一律「待定」，允许预约但要用户同意改期风险
 *   2) 预警层 → 必须按预警的生命周期、时间字段和实际影响区域处理，不能按「某城市今天有预警」处理
 *   3) 当日决策点 → 输出三态，并保留公安人工覆盖入口（武汉规范第二十一条）
 *
 * 数据来源（2026-11-02 用户要求接入真实数据）：
 *   - 默认走 engine/weatherSource.js 的 Open-Meteo（免 key，逐小时 + 16 天）；拿不到（离线/超时）才用本文件 mock；
 *   - 正式版建议换华风爱科 WeatherCN（权威预警 + 影响区域，500 次/天）或和风天气 QWeather（30 天预报，按量计费）。
 */

import { liveSlot, liveHorizon, liveSource, liveDays } from './weatherSource.js'
import { DEFAULT_SLOTS, slotStart, slotEnd } from './slotRange.js'

export const PROVIDERS = [
  { key: 'weathercn', name: '华风爱科 WeatherCN', role: '权威源（预警 + 影响区域）', quota: '500 次/天、5 次/秒（认证个人开发者）', doc: 'https://platform.weathercn.com/doc/api/weather-alert.html' },
  { key: 'qweather', name: '和风天气 QWeather', role: '逐小时预报 + 30 天预报 + 分钟级降水', quota: '天气和基础服务组 0-50000 次/月免费，之后 0.0007 元/次', doc: 'https://dev.qweather.com/docs/finance/pricing/' },
  { key: 'open-meteo', name: 'Open-Meteo', role: '演示默认（免 key，逐小时 + 16 天）', quota: '公开接口，非商用免费', doc: 'https://open-meteo.com/en/docs' }
]

/** 阈值：规范硬标准（武汉规范第八条）与运营上限（一飞智控 5 m/s）要分开 */
export const THRESHOLDS = {
  windHardMaxMs: 8,
  windOperationalMaxMs: 5,
  tempMinC: -5,
  humidityMax: 90,
  visibilityMinKm: 2,
  bannedWeather: ['雨', '雪', '冰雹', '雾', '雷电'],
  nightOnly: true,
  note: '夜间或低能见度飞行须开启灯光系统并确保处于良好工作状态（条例第三十二条第七项）'
}

/** 决策点：T-30 预判（排期）→ T-1 确认 → T-2h 当日决策 */
export const DECISION_POINTS = [
  { key: 'T30', label: '排期预判（提前 20-30 天启动申请）', action: '日历按时段标具体天气；超出预报期标「待定」' },
  { key: 'T1', label: '批复后确认（前 1 日 21:00 前批复）', action: '逐小时预报核对申请时段' },
  { key: 'T2H', label: '当日决策点', action: '照常 / 推迟 / 取消；公安机关根据现场整体态势决定' }
]

// 官方逐日预报的事实口径：中国气象局对外发布 15 天预报（7 天内更可靠）。
// 超出这段不展示具体天气、统一「待定」，允许预约但必须让用户同意「因天气不确定改期」的后果。
export const FORECAST_HORIZON_DAYS = 15
export const FORECAST_HORIZON_TEXT = '逐日预报覆盖未来 15 天（7 天内更可靠）'

export const HORIZON_NOTE = '超出预报期，天气未公布；可预约，但需同意因天气改期的后果'

const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = ((h ^ s.charCodeAt(i)) * 16777619) >>> 0
  return h
}

export function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** date - today 的天数差（date 在后为正） */
export function dayDiff(today, date) {
  if (!date) return 0
  const a = new Date(`${today}T00:00:00`)
  const b = new Date(`${date}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** 当前可用的预报天数：接了真实数据就用接口覆盖天数（至少 15），否则用内置 15 天 */
export function effectiveHorizon() {
  return Math.max(FORECAST_HORIZON_DAYS, liveHorizon())
}

export function horizonText() {
  const h = effectiveHorizon()
  return `逐日预报覆盖未来 ${h} 天${liveSource() ? `（${liveSource()} 实时数据）` : '（7 天内更可靠）'}`
}

function classify(f) {
  const hard = []
  const reasons = []
  if (Number(f.windMs) >= THRESHOLDS.windHardMaxMs) hard.push(`风速 ${f.windMs} m/s ≥ 规范上限 ${THRESHOLDS.windHardMaxMs} m/s`)
  if (Number(f.tempC) < THRESHOLDS.tempMinC) hard.push(`温度 ${f.tempC}℃ 低于 ${THRESHOLDS.tempMinC}℃`)
  if (Number(f.humidity) >= THRESHOLDS.humidityMax) hard.push(`湿度 ${f.humidity}% ≥ ${THRESHOLDS.humidityMax}%`)
  if (f.visibilityKm != null && Number(f.visibilityKm) < THRESHOLDS.visibilityMinKm) hard.push(`能见度 ${f.visibilityKm} km < ${THRESHOLDS.visibilityMinKm} km`)
  // 天气代码里的雨雪雾雷雹：一律硬拦（不再只认「雨」这一个字）
  if (/雨|雪|冰雹|雾|雷电/.test(f.kind || '')) hard.push(`禁止天气：${f.kind}`)
  if (!hard.length && Number(f.windMs) >= THRESHOLDS.windOperationalMaxMs) reasons.push(`风速 ${f.windMs} m/s 超运营上限 ${THRESHOLDS.windOperationalMaxMs} m/s（规范允许，机队上限更严）`)
  if (!hard.length && Number(f.precipProb) >= 40) reasons.push(`降水概率 ${f.precipProb}%`)
  if (!hard.length && f.visibilityKm != null && Number(f.visibilityKm) < 3) reasons.push(`能见度 ${f.visibilityKm} km 偏低`)
  return { hard, reasons }
}

/**
 * 演示用确定性预报（真实数据不可用时兜底）：同一入参必须返回同一结果，便于复现。
 * 注意用无符号右移：`>>` 会把 32 位 hash 的最高位当符号位，生成负温度 / 负能见度 → 整月被误判成禁止天气。
 */
export function forecastOf(date, slot, cityCode) {
  // 时段是整点区间：天气按「开始小时」取，19:00-20:00 与旧的 19:00 得到同一份预报
  const h = hash(`${date}|${slotStart(slot) || '20:00'}|${cityCode}`)
  const windMs = +(((h % 100) / 100) * 9).toFixed(1)
  const tempC = Math.round(-3 + ((h >>> 7) % 22))
  const humidity = 55 + ((h >>> 13) % 45)
  const visibilityKm = +(((h >>> 19) % 40) / 10 + 1.6).toFixed(1)
  const precipProb = ((h >>> 23) % 100)
  const storm = ((h >>> 27) % 100) < 9
  const fog = visibilityKm < 2
  const rain = precipProb >= 60
  const snow = tempC < -5 && precipProb >= 40
  const hail = ((h >>> 29) % 100) < 4 && storm

  let kind = '晴'
  if (snow) kind = '雪'
  else if (hail) kind = '冰雹'
  else if (storm) kind = '雷阵雨'
  else if (rain) kind = '小雨'
  else if (fog) kind = '雾'
  else if (humidity >= 85 || precipProb >= 40) kind = '阴'
  else if (((h >>> 11) % 100) < 35) kind = '多云'
  const kindShort = kind === '雷阵雨' ? '雷阵雨' : kind

  const base = { date, slot, cityCode, windMs, tempC, humidity, visibilityKm, precipProb, kind, kindShort, source: '演示 mock · 正式版走 WeatherCN / QWeather / Open-Meteo' }
  const { hard, reasons } = classify(base)
  return { ...base, kinds: hard.length ? [kind] : [], hard, reasons, status: hard.length ? 'block' : reasons.length ? 'risk' : 'ok' }
}

/**
 * 排期用：某日某时段到底什么天气、能不能排。
 * 返回 status:
 *   past    = 已过去（不展示、不可选）
 *   block   = 预报硬阈值命中，不可排
 *   risk    = 预报有风险但可排（当日决定权在公安机关）
 *   ok      = 可排
 *   unknown = 超出可预报期（天气未公布）→ 可预约，但下单前必须让用户同意改期风险
 */
export function slotWeather({ date, slot, cityCode, today = todayStr(), horizon = effectiveHorizon() }) {
  const diff = dayDiff(today, date)
  if (diff < 1) {
    return { date, slot, status: 'past', kind: '', kindShort: '已过', diff, horizonDays: horizon, detail: '已过去的日期不再展示，也不可选', source: 'none' }
  }
  if (diff > horizon) {
    return {
      date, slot, status: 'unknown', kind: '', kindShort: '待定', diff, horizonDays: horizon,
      detail: `超出预报期（${horizon} 天），天气未公布`, source: liveSource() || 'none'
    }
  }
  const live = liveSlot(date, slot)
  const f = live
    ? { ...live, date, slot, cityCode, kind: live.kind, kindShort: live.kindShort, precipProb: live.precipProb, visibilityKm: live.visibilityKm }
    : forecastOf(date, slot, cityCode)
  const { hard, reasons } = classify(f)
  const status = hard.length ? 'block' : reasons.length ? 'risk' : 'ok'
  return {
    date, slot, status, kind: f.kind, kindShort: f.kindShort, diff, horizonDays: horizon,
    tempC: f.tempC, windMs: f.windMs, humidity: f.humidity, precipProb: f.precipProb, visibilityKm: f.visibilityKm,
    hard, reasons, detail: hard.concat(reasons).join('；') || `${f.kind} ${f.tempC}℃ · 风 ${f.windMs} m/s`,
    source: f.source || (liveSource() || 'mock')
  }
}

/**
 * 日级天气（2026-11-02 用户要求）：填报页不再逐小时报天气，只给「这一天大致是什么天」。
 * 预报本身可能不准，所以只做聚合：三个时段里有一个命中硬阈值 → 这天按不可排；否则取最坏的「风险」态；
 * 温度给三个时段的平均（整数），不细到小时，也不承诺精确。
 */
export function dateWeather({ date, cityCode, today = todayStr(), horizon = effectiveHorizon(), slots = DEFAULT_SLOTS }) {
  const diff = dayDiff(today, date)
  const base = {
    date, kind: '', kindShort: '', tempC: null, tempMin: null, tempMax: null,
    windMs: null, horizonDays: horizon, slots: []
  }
  if (diff < 1) return { ...base, status: 'past', detail: '已过去' }
  if (diff > horizon) return { ...base, status: 'unknown', detail: `超出预报期（${horizon} 天），天气未公布` }

  const list = slots.map(slot => slotWeather({ date, slot, cityCode, today, horizon }))
  const temps = list.map(x => x.tempC).filter(v => v != null)
  const tempC = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null
  const windMs = list.length ? Math.round(Math.max(...list.map(x => x.windMs || 0)) * 10) / 10 : null
  const block = list.find(x => x.status === 'block')
  const risk = list.find(x => x.status === 'risk')
  // 展示用的「大致天气」取 20:00（主演出时段）那一段，不取最坏时段：
  // 天级天气只回答「这天大概什么天」，能不能排由各时段状态自己决定（一天里有坏时段不代表整天不能约）
  const rep = list.find(x => slotStart(x.slot) === '20:00') || list[0] || {}
  const status = block ? 'block' : risk ? 'risk' : 'ok'
  return {
    ...base, status, kind: rep.kind || '', kindShort: rep.kindShort || '', tempC,
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
    windMs, slots: list,
    detail: block ? block.detail : risk ? risk.detail : `${rep.kind || '晴'} ${tempC == null ? '' : tempC + '℃'}`
  }
}

/** 预警必须带生命周期与影响区域，不能当静态信息处理 */
export function warningsOf(date, cityCode) {
  const f = forecastOf(date, '20:00-21:00', cityCode)
  if (!f.kinds.length) return []
  const h = hash(`warn|${date}|${cityCode}`)
  const level = ['蓝色', '黄色', '橙色', '红色'][h % 4]
  return f.kinds.map(k => ({
    type: k,
    level,
    start: `${date} ${String(18 + (h % 4)).padStart(2, '0')}:00`,
    end: `${date} ${String(21 + (h % 3)).padStart(2, '0')}:00`,
    area: `${cityCode} 影响区域（按实际影响区域判定，不按行政区划静态处理）`,
    source: 'WeatherCN alerts/v1'
  }))
}

/**
 * 当日决策点：三态 + 人工覆盖入口。
 * 决定权在公安机关（武汉规范第二十一条），系统只能给建议态。
 */
export function decide({ date, slot, cityCode, override = null }) {
  const f = forecastOf(date, slot, cityCode)
  const warnings = warningsOf(date, cityCode).filter(w => inWindow(w, slot))
  let suggested = '照常'
  if (f.hard.length) suggested = '取消'
  else if (f.reasons.length || warnings.length) suggested = '推迟'

  return {
    point: 'T2H',
    forecast: f,
    warnings,
    suggested,
    final: override || suggested,
    authority: '公安机关根据活动当日现场整体态势决定活动进行与否（武汉规范第二十一条）',
    priority: '通常约定延期优先于退费；不可抗力须及时通知对方并在合理期限内提供证明（民法典第五百九十条）',
    perItem: '天气按环节否决：同一活动中无人机环节取消、其它环节照常（2026-10-01 实际案例）'
  }
}

function inWindow(w, slot) {
  const s = slotStart(slot) || '20:00'
  return w.start.slice(11) <= s && s <= w.end.slice(11)
}

/** 排期用日级摘要（兼容旧调用）：取 20:00 时段，只在预报期内给结论 */
export function scheduleCheck(date, cityCode) {
  const w = slotWeather({ date, slot: '20:00-21:00', cityCode })
  return {
    status: w.status === 'block' ? 'block' : w.status === 'risk' ? 'risk' : w.status === 'unknown' ? 'unknown' : 'ok',
    hard: w.hard || [], reasons: w.reasons || [], kind: w.kind || '', detail: w.detail,
    horizonDays: w.horizonDays,
    note: w.status === 'unknown' ? '超出预报期：天气未公布，可预约但需同意改期风险；当日决定权在公安机关' : '预报层只标记，不封死日期；当日决定权在公安机关',
    live: !!liveDays()
  }
}
