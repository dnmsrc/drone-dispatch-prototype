/**
 * 年框 + 分摊测算引擎（演示种子，将来由后端字典驱动）
 *
 * 这条业务线把「一个客户 = 一单 = 一场」改成四层对象：
 *   年框 FrameworkContract → 场次执行单 ShowInstance → 分摊方 AllocationParty → 画面位分配 ScreenSlot
 * 沿用项目原语「资源 × 时间 = 一单」：画面位是第四类排他资源（画面位 × 场次 = 分配单），
 * 与空域时段 / 场地 / 机队同构，不需要另起炉灶。
 *
 * 成本四层：直接运营 → 全成本 → 售价 → 分摊。
 * 分摊必须分两个池，只按画面数分摊算不平：
 *   固定池 = 不可归到单个画面的部分（基础 + 时长 + 档期 + 场地 + 判定 + 合规）；
 *   画面位池 = 内容复杂度线，按画面数分摊。
 *
 * 天光窗口按几何算法（Spencer/Meeus 均时差 + 时角），未计大气折射与地平线遮挡，误差 ±5 分钟；
 * 官方 twilight 口径含折射（−0.835°），比这里的几何值晚 3-5 分钟。
 */
import { quote, tierOf } from './pricing.js'
import { venueOf } from './venues.js'
import { judge } from './judge.js'

/* ---------- 1. 直接运营成本：13,000 的拆分（演示假设，口径待确认） ---------- */
export const DIRECT_COST_SPLIT = [
  { key: 'lease', label: '无人机租赁', amount: 7000, note: '400 架次机队按年摊提；年框下是驻场机队，不是逐场租赁' },
  { key: 'loss', label: '炸机损耗', amount: 2500, note: '按损耗率计提，与机身险是两回事（第三者责任险不保机身）' },
  { key: 'platform', label: '编舞平台', amount: 3500, note: '航线编程 + 灯光程序 + 画面素材' }
]

/* ---------- 2. 人力（10 要素第 9 项，现有模型只有描述没有实现） ---------- */
export const LABOR = {
  pilot: { resident: 800, perShow: 1500, note: '持照飞手：CAAC 操控员执照 + 运营合格证（CCAR-92，2024-01-01 起）+ 实名登记' },
  volunteer: { headcount: [3, 4], perPerson: 180, note: '仅地面摆放/回收；充电、装填、起飞确认属操作环节须持照，志愿者不能执行' },
  volunteerInsurance: 130,
  groundCrew: 400,
  note: '志愿者不是员工，需要单独的责任界定与人身意外保障'
}
export const HULL_INSURANCE = 1500
export const OVERHEAD = 8000

/* ---------- 3. 天光窗口 ---------- */
export const DARK_DEFINITIONS = [
  { key: 'civil', altDeg: -6, label: '民用昏影终（−6°）', note: '官方常用口径，天未全黑，画面对比不足' },
  { key: 'nautical', altDeg: -12, label: '航海昏影终（−12°）', note: '演示默认「天空全暗」：肉眼基本全黑，画面可用' },
  { key: 'astronomical', altDeg: -18, label: '天文昏影终（−18°）', note: '真正全暗，高对比画面需要这一档' }
]

const RAD = Math.PI / 180

/** 太阳位置（Meeus 轨道法，精度约 1 分钟）：赤纬 + 均时差，两者必须同源 */
export function sunPosition(date) {
  const n = dayOfYear(date)
  const Mdeg = (359.99995 / 365.25698) * (n - 1)
  const Ldeg = (280.46645 + Mdeg) % 360
  const Cdeg = 1.915 * Math.sin(Mdeg * RAD) + 0.020 * Math.sin(2 * Mdeg * RAD) + 0.0003 * Math.sin(3 * Mdeg * RAD)
  const lamDeg = Ldeg + Cdeg
  const OmDeg = (125.04 - (1948.134 / 365.25) * n) % 360
  const lamA = lamDeg - 0.00569 - 0.00478 * Math.sin(OmDeg * RAD)
  const epsDeg = 23.439 - 0.0000004 * n
  const decl = Math.asin(Math.sin(lamA * RAD) * Math.sin(epsDeg * RAD)) * 180 / Math.PI
  const ra = ((Math.atan2(Math.cos(epsDeg * RAD) * Math.sin(lamA * RAD), Math.cos(lamA * RAD)) * 180 / Math.PI) + 360) % 360
  return { n, L: Ldeg, ra, decl, eot: 4 * (Ldeg - ra) }
}

export function equationOfTime(date) { return sunPosition(date).eot }
export function solarDeclination(date) { return sunPosition(date).decl }

function dayOfYear(date) {
  const d = new Date(date)
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000)
}

/** 真太阳正午在标准钟面上的时刻（分钟），UTC+8 标准子午线 120°E */
export function solarNoonClock(date, lon) {
  return 720 + (120 - lon) * 4 - equationOfTime(date)
}

/** 某高度角对应的时角（分钟）；极昼/极夜返回 null */
function hourAngle(date, lat, altDeg) {
  const d = sunPosition(date).decl * RAD
  const phi = lat * RAD
  const c = (Math.sin(altDeg * Math.PI / 180) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
  if (c > 1) return null
  if (c < -1) return null
  return Math.acos(c) * 180 / Math.PI * 4
}

export function fmtClock(minutes) {
  const x = Math.round(((minutes % 1440) + 1440) % 1440)
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

export function sunsetAt(date, { lat, lon }) {
  const h = hourAngle(date, lat, 0)
  return h === null ? null : solarNoonClock(date, lon) + h
}

/** 天空全暗时刻（昏影终）—— 按定义取高度角 */
export function darkAt(date, { lat, lon, definition = 'nautical' }) {
  const def = DARK_DEFINITIONS.find(x => x.key === definition) || DARK_DEFINITIONS[1]
  const h = hourAngle(date, lat, def.altDeg)
  return {
    date, lat, lon, definition: def.key, label: def.label,
    minutes: h === null ? null : solarNoonClock(date, lon) + h,
    sunset: sunsetAt(date, { lat, lon }),
    note: '几何值，未计大气折射与地平线遮挡，误差 ±5 分钟'
  }
}

/* ---------- 4. 容量规则（白天 1 / 夜间 2） ---------- */
export const CAPACITY = {
  dayMax: 1,
  nightMax: 2,
  setupMin: 45,      // 摆放与检查
  showMin: 15,       // 表演时长
  teardownMin: 30,   // 回收
  gapMin: 90,       // 同日两场之间：回收 30 + 重新摆放 45 + 缓冲 15（取 120 会少排一场，见 CLI 敏感性）
  curfew: '23:00',   // 噪音与现场管控截止（含观众离场）
  dayWindow: ['16:00', '17:30'],
  note: '白天效果不好，最多 1 场；夜间须天空全暗后，最多 2 场'
}

/** 某日可排场次窗口：白天 1 + 夜间按天光与截止时刻推算 */
export function showWindows(date, { lat, lon, definition = 'nautical', capacity = CAPACITY }) {
  const dark = darkAt(date, { lat, lon, definition })
  if (dark.minutes === null) return { date, windows: [], note: '该纬度按所选定义不存在全暗窗口' }
  const curfew = Number(capacity.curfew.slice(0, 2)) * 60 + Number(capacity.curfew.slice(3, 5))
  const dayStart = Number(capacity.dayWindow[0].slice(0, 2)) * 60 + Number(capacity.dayWindow[0].slice(3, 5))
  const dayEnd = dayStart + capacity.showMin
  const windows = [{
    kind: '白天', start: dayStart, end: dayEnd, latest: dayEnd + capacity.teardownMin,
    ok: true, note: '白天最多 1 场，画面效果差，通常只在冬季白天短时才现实'
  }]
  for (let i = 1; i <= capacity.nightMax; i++) {
    const start = dark.minutes + capacity.setupMin + (i - 1) * capacity.gapMin
    const end = start + capacity.showMin
    const latest = end + capacity.teardownMin
    windows.push({
      kind: `夜间${i}`, start, end, latest, ok: latest <= curfew,
      note: latest > curfew ? `回收完成 ${fmtClock(latest)} 超管控截止 ${capacity.curfew}` : `全暗 ${fmtClock(dark.minutes)} 后开演`
    })
  }
  return { date, dark: dark.minutes, darkLabel: fmtClock(dark.minutes), windows, curfew }
}

/* ---------- 5. 分摊方类型 ---------- */
export const ALLOC_TYPES = [
  { key: 'venue', label: '场地方', settlement: '画面位抵扣', note: '以场地 + 空域协调换画面；场地费转为抵扣，不是现金' },
  { key: 'sponsor', label: '赞助商', settlement: '按画面位购买', note: '画面数 × 单价，需明确画面归属与能否跨年复用' },
  { key: 'media', label: '宣发方', settlement: '按画面位购买', note: '画面数 × 单价，通常带投放量承诺' },
  { key: 'subsidy', label: '政府补贴 / 消费券', settlement: '立项 + 专款专用 + 核销', note: '政务审批环节全程不收费，不能写成政府承担商业成本；核销周期决定现金流' },
  { key: 'audience', label: '游客', settlement: '按票购买入场权', note: '观众数 × 票价；「游客承担较少费用」成立与否全看这两个数' }
]

/* ---------- 6. 单场测算 ---------- */
/** 画面数 → 计价档位带（现有计价引擎按带 key 取系数，画面位单价按实际画面数摊） */
export function screenBandOf(count) {
  if (count <= 3) return 'low'
  if (count <= 8) return 'mid'
  return 'high'
}

export function showCost({ show, venue, q, mode = 'resident' }) {
  const layers = []
  const add = (label, amount, note) => { if (amount > 0) layers.push({ label, amount, note }) }
  for (const c of DIRECT_COST_SPLIT) add(`直接运营 · ${c.label}`, c.amount, c.note)
  const pilot = mode === 'resident' ? LABOR.pilot.resident : LABOR.pilot.perShow
  add('人力 · 持照飞手', pilot, LABOR.pilot.note)
  add('人力 · 志愿者', LABOR.volunteer.perPerson * (show.volunteers || LABOR.volunteer.headcount[1]), LABOR.volunteer.note)
  add('人力 · 志愿者人身意外', LABOR.volunteerInsurance, '第三者责任险不保人身与机身')
  add('人力 · 现场保障/安全员', LABOR.groundCrew, '圈层防护保安配置按人计（武汉规范第十五条）')
  add('合规 · 机身险', HULL_INSURANCE, '炸机损耗是价格项，机身险是责任项，两者不能混')
  add('管理分摊', OVERHEAD, '销售、平台、电池折旧、驻场物流')
  const comp = (q.lines || []).find(l => l.group === '合规')
  if (comp) add('合规 · 代办+保险+资质', comp.amount, comp.detail)
  const venueLine = (q.lines || []).find(l => l.group === '场地')
  if (venueLine) add('场地 · 占用与协调', venueLine.amount, venueLine.detail)
  return { layers, total: layers.reduce((s, l) => s + l.amount, 0) }
}

/**
 * 分摊：两个池
 *   画面位池 = price × contentShare，按画面数分摊；
 *   固定池 = price − 画面位池，按权重分摊（默认权重 = 画面数占比，可逐方覆盖）。
 */
export function allocate({ show, venue, q, price, parties, contentShare, fixedWeights = {} }) {
  const screens = show.screenCount || show.screens
  const share = contentShare !== undefined ? contentShare : contentShareOf(q)
  const screenPool = Math.round(price * share)
  const fixedPool = price - screenPool
  const unit = Math.round(screenPool / screens)
  const rows = parties.filter(p => p.screens > 0).map(p => {
    const w = fixedWeights[p.key] !== undefined ? fixedWeights[p.key] : p.screens / screens
    const fixedAmount = Math.round(w * fixedPool)
    return {
      key: p.key, label: p.label, type: p.type, screens: p.screens, unit,
      screenAmount: p.screens * unit, fixedWeight: +w.toFixed(4), fixedAmount,
      total: p.screens * unit + fixedAmount, note: p.note || ''
    }
  })
  const allocated = rows.reduce((s, r) => s + r.total, 0)
  const ticket = parties.filter(p => p.audience && p.ticketPrice).reduce((s, p) => s + p.audience * p.ticketPrice, 0)
  return {
    price, screens, contentShare: +share.toFixed(4), screenPool, fixedPool, unit,
    rows, allocated, residual: price - allocated, balanced: Math.abs(price - allocated) < 1,
    ticket, revenue: allocated + ticket
  }
}

function contentShareOf(q) {
  const content = (q.lines || []).find(l => l.group === '内容')
  const total = q.lines.reduce((s, l) => s + l.amount, 0)
  return total ? content.amount / total : 0
}

/* ---------- 7. 年框汇总 ---------- */
export function frameworkSummary({ shows = 200, giftShows = 8, pricePerShow, costPerShow, ticketRevenuePerShow = 0 }) {
  const billable = shows
  const totalShows = shows + giftShows
  const revenue = billable * pricePerShow + billable * ticketRevenuePerShow
  const cost = totalShows * costPerShow
  return {
    billable, giftShows, totalShows,
    pricePerShow, costPerShow, ticketRevenuePerShow,
    revenue, cost, margin: revenue - cost,
    marginPerShow: Math.round((revenue - cost) / totalShows),
    note: '赠场是否计入成本、门票归谁，都会改变这个数'
  }
}

/* ---------- 8. 排布可行性（季节天气概率 + 审批提前量） ---------- */
/** 昆明逐月雨日（演示假设，按干湿季分布：5-10 月占全年降水约 85%，11-4 月约 15%） */
export const KM_RAIN_DAYS_BY_MONTH = [4, 5, 6, 7, 10, 16, 20, 19, 15, 10, 6, 1.2]

export function scheduleFeasibility({ shows = 200, lat = 24.96, lon = 102.69, venueSlotCapacity = 1 }) {
  const rows = []
  let feasibleDays = 0, capacity = 0
  for (let m = 1; m <= 12; m++) {
    const mid = new Date(2026, m - 1, 15)
    const w = showWindows(mid, { lat, lon })
    const nightOk = w.windows.filter(x => x.kind !== '白天' && x.ok).length
    const dayOk = w.windows.filter(x => x.kind === '白天' && x.ok).length
    const rain = KM_RAIN_DAYS_BY_MONTH[m - 1]
    const days = Math.max(0, Math.round(30.4 - rain))
    feasibleDays += days
    const cap = dayOk + nightOk
    capacity += cap * days
    rows.push({ month: m, rainDays: rain, feasibleDays: days, dark: w.darkLabel, nightMax: nightOk, dayMax: dayOk, capacity: cap * days })
  }
  return {
    rows, feasibleDays, capacity,
    showsNeeded: shows,
    minDaysNeeded: Math.ceil(shows / (CAPACITY.dayMax + CAPACITY.nightMax)),
    approvalLeadDays: { filing: 20, verify: 7, approvalDistrict: '7-10 工作日', approvalCity: '10-15 工作日' },
    note: '瓶颈不是天气容量，是逐场审批：200 场 ×（前 20 日备案 + 7 日核实 + 7-15 工作日审批）跑不动；云南草案第四条「探索特定区域便捷飞行」是这条线最大的政策抓手——定点场地一次可行性评估（同一场地二次活动不重做）+ 周期备案 + 逐场报备'
  }
}

/* ---------- 9. 演示用例：跑一遍并把结果挂到页面 ---------- */
export function runCase({ venueId = 'V02', date = '2026-12-21', drones = 400, duration = 15, screens = 13, parties, ticketPrice = 40, volunteers = 4 }) {
  const venue = venueOf(venueId)
  const need = {
    droneCount: drones, duration, screens: screenBandOf(screens), screenCount: screens,
    contentMode: 'deep', motion: 'dynamic', dimension: '2D',
    scene: 'scenic', audience: 1200, addons: [], usesSpecificFrequency: venue.usesSpecificFrequency
  }
  const judgment = judge({ venue, drones, date, audience: need.audience })
  const q = quote({ need, venue, judgment, date })
  const show = { ...need, volunteers, venueId }
  const cost = showCost({ show, venue, q })
  const market = allocate({ show, venue, q, price: q.total, parties, contentShare: contentShareOf(q) })
  const framework = allocate({ show, venue, q, price: 13000, parties, contentShare: contentShareOf(q) })
  return { venue, need, judgment, quote: q, cost, market, framework }
}
