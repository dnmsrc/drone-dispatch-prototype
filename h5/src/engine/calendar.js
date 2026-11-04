/**
 * 日历判定 —— 日期状态不是「余量」，而是三个排他资源的交集结果：
 *   空域时段（同一空域同一时段只能有一个航行服务提供方提供管制类服务，CCAR-92）
 *   × 场地（场地 × 日 × 时段 粒度）
 *   × 机队。
 *
 * 状态含义（2026-11-02 用户要求，按真实口径重排）：
 *   ok      = 可提交申请（预报期内，没有需要提醒的风险）
 *   risk    = 可提交申请，但当天可能调整（预报有风险 / 预报不适宜；当日决定权在公安机关）
 *   unknown = 超出预报期，天气未公布 → 可预约，但下单前必须让用户同意改期风险
 *   —— 天气（risk / 不适宜）只影响颜色提示，不再封日：预报有误差是允许的，
 *      当天的照常 / 推迟 / 取消由现场实际情况与公安机关决定（2026-11-02 用户口径）。
 *   weather = 保留状态名，历史上「预报不达标 → 不可排」的硬封日规则已废止，不再产生该状态
 *   lead    = 提前量不足（按工作日算：区级 7-10 工作日、市级 10-15 工作日，+ 虚拟场地勘察 1 工作日）
 *   ban     = 政府公告的临时管制空域冲突（只能在审批阶段核对）
 *   notice  = 县级公安的活动管控通告（覆盖演出前后各 1 小时；演出前 2 天才出现）
 *   full    = 该场地当日该时段已被占用
 *   closed  = 场地检修日 / 该时段容量为 0
 *   past    = 已过去（不渲染、不可选）
 */
import { CITIES, ANNOUNCEMENTS, addDays, fmtDate } from './policy.js'
import { DEFAULT_SLOTS, normSlotIds, shortSlot, slotHitsWindow } from './slotRange.js'
import { slotWeather, effectiveHorizon, horizonText, todayStr } from './weather.js'

// 演示种子：相对今天的已占用记录（将来由后端「资源占用记录」驱动，粒度到 场地 × 日 × 时段）
const SEED_OCCUPANCY = [
  { venue: 'V01', offset: 5, slot: '20:00-21:00', count: 1 },
  { venue: 'V02', offset: 8, slot: '19:00-20:00', count: 1 },
  { venue: 'V02', offset: 8, slot: '20:00-21:00', count: 1 },
  { venue: 'V03', offset: 11, slot: '21:00-22:00', count: 1 },
  { venue: 'V06', offset: 14, slot: '20:00-21:00', count: 2 },
  { venue: 'V07', offset: 17, slot: '19:00-20:00', count: 1 }
]

// 检修日：部分场地周一不接（容量 0）
const MAINTENANCE_WEEKDAY = [1]

// 默认三段整点区间（一个时段 = 一个名额）；后台可按日期任意增删
const SLOTS = DEFAULT_SLOTS

/** 可提交的状态（unknown 需要在下单前确认改期风险，但日期本身可选） */
export const OPEN_STATUS = ['ok', 'risk', 'unknown']
export const STATUS_TEXT = {
  ok: '可提交申请',
  risk: '可提交申请（当天可能调整）',
  unknown: '天气未公布，可预约',
  lead: '提前量不足（按工作日计算）',
  ban: '政府公告临时管制冲突',
  notice: '活动管控通告冲突',
  full: '该场地当日该时段已被占用',
  closed: '场地检修日',
  offslot: '该时段当日未开放接单',
  weather: '预报不达标，不可安排派单',
  past: '已过去的日期'
}
/** 日历格子上的短标签（≤3 字，格子只有 1/7 屏宽，长标签会换行） */
export const SHORT_TAG = {
  lead: '提前', ban: '管制', notice: '管控', full: '已占用',
  closed: '检修', weather: '天气', unknown: '待定', past: '已过', offslot: '未开放'
}

// 日期 → 天数差（本地时区，不走 UTC，避免跨时区把日期算错一天）
function diffDays(from, to) {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function isWorkday(dateStr) {
  const wd = new Date(`${dateStr}T00:00:00`).getDay()
  return wd >= 1 && wd <= 5
}
/** 从现在到目标日期的「工作日」数（不含今天，含目标日）：法定节假日另计，页面上要如实标注 */
function workdaysAhead(today, date) {
  let n = 0
  for (let d = addDays(today, 1); d <= date; d = addDays(d, 1)) if (isWorkday(d)) n++
  return n
}

/**
 * 生成可申请窗口（默认 60 天）。
 * 从明天开始：今天及以前一律不渲染、不可选（用户要求：已经过去的时间直接不可选，不用展示详情）。
 */
export function calendarDays({ venue, drones, windowDays = 60, slots = SLOTS, today = new Date(), slotsByDate = null }) {
  const city = CITIES.find(c => c.code === venue.city) || CITIES[0]
  const ap = city.approval
  const large = drones >= ap.largeDrones || venue.airspace === 'controlled'
  const leadDays = large ? ap.largeLeadDays[1] : ap.leadDays[1]
  const leadRange = large ? ap.largeLeadDays : ap.leadDays
  const surveyDays = venue.virtual ? 1 : 0
  const needLead = leadDays + surveyDays
  const tToday = todayStr()
  const todayFmt = fmtDate(today)
  const horizon = effectiveHorizon()
  const list = []

  for (let i = 1; i <= windowDays; i++) {
    const date = addDays(new Date(today), i)
    const wd = new Date(`${date}T00:00:00`).getDay()
    const cap = venue.dailyCapacity || 1
    const ahead = workdaysAhead(todayFmt, date)
    const leadShort = Math.max(0, needLead - ahead)

    // 时段列表由后台档期配置驱动：某日单独配过 → 就用那一组（含任意起止的整点区间）；
    // 没配过的日子 → 用默认时段（默认值本身也来自后台配置）
    const dayCfg = slotsByDate && slotsByDate[date]
    const daySlots = dayCfg ? normSlotIds(dayCfg) : slots
    const slotList = daySlots.map(slot => {
      const booked = SEED_OCCUPANCY
        .filter(o => o.venue === venue.id && addDays(new Date(today), o.offset) === date && o.slot === slot)
        .reduce((s, o) => s + o.count, 0)
      const wx = slotWeather({ date, slot, cityCode: city.code, today: todayFmt, horizon })

      let status = 'ok', tag = '', note = ''
      if (wx.status === 'past') {
        status = 'past'; tag = SHORT_TAG.past; note = '已过去的日期不可选'
      } else if (MAINTENANCE_WEEKDAY.includes(wd) && cap <= 1) {
        status = 'closed'; tag = SHORT_TAG.closed; note = '该场地周一为检修日，不接场'
      } else if (booked >= (venue.slotCapacity || 1)) {
        status = 'full'; tag = SHORT_TAG.full; note = `该场地当日 ${shortSlot(slot)} 时段已被占用（场地 × 日 × 时段 排他，非全局）`
      } else {
        const ban = ANNOUNCEMENTS.find(a => a.city === city.code && addDays(new Date(today), a.offset) === date)
        if (ban && hitsSlot(ban, slot)) {
          status = ban.kind === 'notice' ? 'notice' : 'ban'
          tag = ban.kind === 'notice' ? SHORT_TAG.notice : SHORT_TAG.ban
          note = `${ban.source}：${ban.reason}（${ban.scope}${ban.window ? ` · 管控时段 ${ban.window[0]}-${ban.window[1]}` : ''}）`
        } else if (ahead < needLead) {
          status = 'lead'
          tag = SHORT_TAG.lead
          note = `需提前 ${needLead} 个工作日（${leadRange.join('-')} 工作日${surveyDays ? ' + 勘察 1' : ''}）；本日仅提前 ${ahead} 个工作日，还差 ${leadShort} 个`
        } else if (wx.status === 'block') {
          // 预报不适宜也允许先选（2026-11-02 用户：天气只做粗略参考，不跟踪到时段，不封日）：
          // 照常 / 推迟 / 取消由当天现场情况与公安机关决定，预报误差是允许的
          status = 'risk'
          tag = ''
          note = `${wx.detail}；预报仅供参考，当日是否举行由公安机关按现场情况决定，可能提前或推迟`
        } else if (wx.status === 'unknown') {
          status = 'unknown'; tag = SHORT_TAG.unknown; note = `${wx.detail}；可预约，但需同意因天气改期的后果`
        } else if (wx.status === 'risk') {
          status = 'risk'; tag = wx.kindShort; note = wx.detail
        } else {
          status = 'ok'; tag = wx.kindShort
        }
      }
      return {
        slot, status, tag, note, booked, cap: venue.slotCapacity || 1,
        kind: wx.kind || '', kindShort: wx.kindShort || '', tempC: wx.tempC, windMs: wx.windMs,
        horizonDays: wx.horizonDays, open: OPEN_STATUS.includes(status), wx
      }
    })

    const openSlots = slotList.filter(s => s.open)
    const blocking = slotList.filter(s => !s.open)
    let dayStatus = 'ok'
    let dayTag = ''
    let dayNote = ''
    if (openSlots.length) {
      const rep = slotList.find(s => s.status === 'ok') || slotList.find(s => s.status === 'risk') || slotList.find(s => s.status === 'unknown')
      dayStatus = slotList.some(s => s.status === 'ok') ? 'ok' : slotList.some(s => s.status === 'risk') ? 'risk' : 'unknown'
      // 天气具体是什么就写什么（晴/多云/阴/小雨…），不再笼统标「天气」
      dayTag = rep.status === 'unknown' ? SHORT_TAG.unknown : (rep.kindShort || '可安排')
      dayNote = `${openSlots.map(s => shortSlot(s.slot)).join(' / ')} 可提交`
    } else if (!slotList.length) {
      // 该日一个时段都没配（停接）：没有可渲染的时段，整日不可选
      dayStatus = 'offslot'
      dayTag = SHORT_TAG.offslot
      dayNote = '该日暂不接单'
    } else {
      const order = ['offslot', 'ban', 'notice', 'weather', 'lead', 'full', 'closed', 'past']
      const first = order.map(k => slotList.find(s => s.status === k)).find(Boolean) || slotList[0]
      dayStatus = first.status
      dayTag = first.tag
      dayNote = first.status === 'offslot' ? '该日暂不接单' : first.note
    }

    list.push({
      date, day: new Date(`${date}T00:00:00`).getDate(), weekday: wd,
      status: dayStatus, tag: dayTag, note: dayNote,
      slots: slotList, openSlots, blocking,
      disabled: !openSlots.length,
      horizonDays: horizon,
      inHorizon: diffDays(tToday, date) <= horizon,
      weatherNote: horizonText()
    })
  }
  return list
}

function hitsSlot(ban, slot) {
  // 时段是区间：与管制窗口只要有一段时间重叠就算命中（端点相接不算）
  return slotHitsWindow(slot, ban.window)
}

export function dayInfo(days, date) {
  return days.find(d => d.date === date) || null
}

export function slotInfo(days, date, slot) {
  const d = dayInfo(days, date)
  if (!d) return null
  return d.slots.find(s => s.slot === slot) || null
}
