/**
 * 计价引擎（10 要素）—— 演示种子，将来由后端字典 + 政策库驱动。
 *
 * 10 项真实计价要素：① 机队规模 ② 表演时长 ③ 内容复杂度（画面数量 / 2D-3D / 静态动态 / 矩阵数）
 * ④ 场地条件（空域审批难度、场地搭建、后勤保障）⑤ 档期系数 ⑥ 合规成本（代办费 + 保险费）
 * ⑦ 判定费（按实际难度）⑧ 附加内容 ⑨ 人员与差旅 ⑩ 加急。
 *
 * 注意：政务审批环节全程不收费，所以合规成本只计「代办费 + 保险费 + 资质审核费」，不能写成政府收费；
 * 严禁「空域解禁费」「违规审批费」这类非法收费。
 *
 * 架次基础价按 2025-2026 公开锚点校准（单价随规模递减，因为客户买的不是一架飞机而是一整套机群）：
 *   执耳科技（2026-06-23）：500 架基础报价区间 10-18 万；1000 架 18-30 万。
 *   腾云航空公开价目（不含空域）：200 台 16 万；室内 16 台 1.8 万。
 *   应援类（2026-05-25）：单次 5 万-500 万，核心取决于数量（50-3000 架）、场地审批复杂度与定制化。
 *   高端政府项目锚点：某 1050 万项目平均每架出场费超过 7600 元（2024-03）。
 */
import { CITIES } from './policy.js'
import { judgeFee } from './judgeFee.js'

export const TIERS = [
  { drones: 100, unitPrice: 600, price: 60000, range: [50000, 80000], desc: '小型告白、生日惊喜' },
  { drones: 200, unitPrice: 500, price: 100000, range: [80000, 160000], desc: '婚礼、周年庆典（腾云公开价 16 万不含空域）' },
  { drones: 300, unitPrice: 420, price: 126000, range: [100000, 180000], desc: '大型求婚、品牌发布' },
  { drones: 500, unitPrice: 300, price: 150000, range: [100000, 180000], desc: '企业年会、城市活动（执耳锚点 10-18 万）' },
  { drones: 1000, unitPrice: 240, price: 240000, range: [180000, 300000], desc: '大型节庆、城市级表演（执耳锚点 18-30 万）' }
]

/** 时长：10 分钟标准场，15-20 分钟精品场（主流），25-30 分钟大型秀；时长越长单分钟成本越低但总量更高 */
export const DURATIONS = [
  { minutes: 10, mult: 1.00, rate: 0, extra: 0, label: '10 分钟（标准场）' },
  { minutes: 15, mult: 1.30, rate: 0.30, extra: 45000, label: '15 分钟（主流精品场）' },
  { minutes: 20, mult: 1.60, rate: 0.60, extra: 90000, label: '20 分钟（主流精品场）' },
  { minutes: 25, mult: 1.95, rate: 0.95, extra: 142500, label: '25 分钟（大型秀，约 15 分钟的 1.5 倍）' },
  { minutes: 30, mult: 2.30, rate: 1.30, extra: 195000, label: '30 分钟（大型秀）' }
]

export const CONTENT_MODES = [
  { key: 'template', label: '预设模板', rate: 0, desc: '平台模板库任选，含在基础价内' },
  { key: 'deep', label: '深度定制', rate: 0.35, desc: '按画面数量、2D/3D、静态/动态量化，+30~50%' },
  { key: 'matrix', label: '多矩阵编排', rate: 0.60, desc: '多矩阵同时展开，按矩阵数翻倍计' }
]

export const SCREEN_BANDS = [
  { key: 'low', label: '≤3 个画面', rate: 0.18 },
  { key: 'mid', label: '4-8 个画面', rate: 0.35 },
  { key: 'high', label: '9 个以上画面', rate: 0.50 }
]


/** 不在档位表上的规模（如 400 架）按单价曲线线性插值：客户买的是整套机群，单价随规模递减 */
export function tierOf(drones) {
  const exact = TIERS.find(x => x.drones === drones)
  if (exact) return exact
  const keys = TIERS.map(x => x.drones).sort((a, b) => a - b)
  if (drones < keys[0]) return { ...TIERS[0], drones, unitPrice: TIERS[0].unitPrice, price: Math.round(drones * TIERS[0].unitPrice) }
  const lo = keys.filter(k => k <= drones).pop()
  const hi = keys.filter(k => k >= drones)[0]
  const a = TIERS.find(x => x.drones === lo), b = TIERS.find(x => x.drones === hi)
  const unit = a.unitPrice + (b.unitPrice - a.unitPrice) * (drones - lo) / (hi - lo)
  return { ...a, drones, unitPrice: Math.round(unit), price: Math.round(drones * unit) }
}

export const ADDONS = [
  { key: 'music', label: '专属音乐编曲', price: 1000, desc: '与编队动作同步的专属配乐' },
  { key: 'narration', label: '现场旁白解说', price: 2000, desc: '专业主持人现场解说' },
  { key: 'aerial', label: '双机位航拍记录', price: 3000, desc: '成片回传；国界线我方一侧 25000 m 内航测航摄需省人民政府同意' },
  { key: 'module', label: '选配模块（烟花 / 降落伞 / 孔明灯）', price: 4000, desc: '按模块数量计，需单独审批' },
  { key: 'urgent', label: '加急服务', price: 0, rate: 0.35, desc: '3-7 工作日完成全流程，加收 20-50%（按合规成本计），需提前与代办机构约定' }
]

// 兜底时段（配置没加载到之前用的默认值）：整点区间，一个时段 = 一个名额
export const TIME_SLOTS = ['19:00-20:00', '20:00-21:00', '21:00-22:00']

const HOLIDAYS = ['10-01', '10-02', '10-03', '12-24', '12-25', '12-31', '01-01', '02-14', '05-01', '05-02', '05-03', '06-18', '07-07']

function peakRate(date) {
  const d = new Date(date)
  const m = d.getMonth() + 1
  const wd = d.getDay()
  const md = `${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let rate = 0, parts = []
  if ([11, 12, 1, 2].includes(m)) { rate += 0.15; parts.push('旺季 +15%（行业区间 10-20%）') }
  if (wd === 5 || wd === 6) { rate += 0.05; parts.push('周五/周六 +5%') }
  if (HOLIDAYS.includes(md)) { rate += 0.10; parts.push('节假日 +10%') }
  return { rate, parts }
}

/** 责任保险：行业实操要求保额不低于 100 万元 */
function insuranceOf(drones) {
  if (drones <= 100) return 3000
  if (drones <= 200) return 5000
  if (drones <= 300) return 8000
  if (drones <= 500) return 12000
  return 20000
}

export function quote({ need, venue, judgment, date }) {
  const city = judgment.city
  const lines = []
  const add = (group, label, detail, amount) => { if (amount > 0) lines.push({ group, label, detail, amount }) }

  // 1 机队规模（架数字段统一用 need.droneCount，与下单页 / 订单库 / 判定单同名）
  const tier = tierOf(need.droneCount)
  add('基础', `投入 ${tier.drones} 架基础价（含 10 分钟）`, `${tier.desc} · 市场区间 ${tier.range[0]}-${tier.range[1]}`, tier.price)

  // 2 表演时长
  const dur = DURATIONS.find(d => d.minutes === need.duration) || DURATIONS[0]
  add('基础', `时长 ${need.duration} 分钟`, dur.label, Math.round(tier.price * (dur.mult - 1)))

  // 3 内容复杂度（量化：画面数量 / 2D-3D / 静态动态 / 矩阵数）
  const mode = CONTENT_MODES.find(m => m.key === need.contentMode) || CONTENT_MODES[0]
  let contentRate = mode.rate
  const cparts = [mode.label]
  if (mode.key !== 'template') {
    const band = SCREEN_BANDS.find(b => b.key === need.screens)
    if (band) { contentRate = band.rate; cparts.push(band.label) }
    if (need.dimension === '3D') { contentRate += 0.12; cparts.push('3D +12%（演示系数）') }
    if (need.motion === 'dynamic') { contentRate += 0.15; cparts.push('动态编队 +15%（演示系数）') }
    if (mode.key === 'matrix' && need.matrix >= 3) { contentRate = Math.max(contentRate, 1.0); cparts.push(`${need.matrix} 矩阵 +100%`) }
    else if (mode.key === 'matrix' && need.matrix === 2) { contentRate = Math.max(contentRate, 0.6); cparts.push('双矩阵 +60%') }
    contentRate = Math.min(contentRate, 1.5)
  }
  add('内容', '内容复杂度', cparts.join(' · '), Math.round(tier.price * contentRate))

  // 4 附加内容
  for (const k of need.addons || []) {
    const a = ADDONS.find(x => x.key === k)
    if (a && a.price) add('附加', a.label, a.desc, a.price)
  }

  // 5 档期系数
  const peak = peakRate(date)
  add('档期', '档期系数', peak.parts.length ? peak.parts.join(' + ') : '平日，无附加系数', Math.round(tier.price * peak.rate))

  // 6 场地条件
  const venueParts = []
  let venueFee = 0
  if (venue.border) { venueFee += 25000; venueParts.push('边境地区审批路径 +25000（需有权空管机构批准）') }
  else if (venue.airspace === 'controlled') { venueFee += 8000; venueParts.push('管制空域审批难度 +8000') }
  else venueParts.push('适飞空域，无附加')
  if (!venue.circleOk) { venueFee += 3000; venueParts.push('圈层防护补建 +3000') }
  if (!venue.virtual && venue.clearRadiusM < 500) { venueFee += 4000; venueParts.push('净空清场与改线 +4000') }
  if (venue.distanceToCityKm > 30) { venueFee += 6000; venueParts.push('跨市后勤保障 +6000') }
  else if (venue.distanceToCityKm > 10) { venueFee += 2000; venueParts.push('郊区后勤保障 +2000') }
  if (String(venue.power).includes('发电机')) { venueFee += 1500; venueParts.push('自备发电 +1500') }
  add('场地', '场地条件', venueParts.join(' · '), venueFee)

  // 7 判定费（按实际难度，签约后免除）
  const fee = judgeFee({ venue, drones: need.droneCount })
  if (fee.payable > 0) {
    add('判定', `判定费（按实际难度）${fee.capped ? ` · 封顶 ${fee.cap}` : ''}`,
      `${fee.factors.map(f => `${f.label} ${f.amount}`).join(' · ')}${fee.capped ? `（原始 ${fee.raw}，按行业惯例封顶）` : ''}`,
      fee.payable)
  }

  // 8 合规成本（政务环节不收费，只计代办费 + 保险费 + 资质审核费）
  const compParts = []
  let compFee = 0
  const apLevel = judgment.approval.level
  const agency = apLevel.includes('市级') ? 12000 : 5000
  compFee += agency; compParts.push(`空域申请代办费 ${agency}（行业区间 5000-30000）`)
  const ins = insuranceOf(need.droneCount)
  compFee += ins; compParts.push(`第三方责任险 ${ins}（保额不低于 100 万，强制项）`)
  compFee += 2000; compParts.push('资质审核费 2000')
  const audience = need.audience || 0
  if (audience >= 1000) { compFee += 6000; compParts.push(`大型群众性活动安全许可证代办 6000（${audience} 人，承办者应在活动日 20 日前申请）`) }
  if (!need.usesSpecificFrequency) { compFee += 2000; compParts.push('无线电频率许可代办 2000（使用国家确定的特定频率且取得型号核准的无需许可）') }
  add('合规', '合规成本', compParts.join(' · '), compFee)

  // 9 加急（按合规成本加收 20-50%）
  if ((need.addons || []).includes('urgent')) {
    const rate = ADDONS.find(a => a.key === 'urgent').rate
    add('加急', '加急服务', `3-7 工作日完成全流程，按合规成本加收 ${Math.round(rate * 100)}%`, Math.round(compFee * rate))
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  return {
    lines, total, city, audience, approvalLevel: apLevel, leadDays: judgment.approval.leadDays,
    fee, tier,
    note: '线上报价为区间预估；正式报价与派单由客服在需求沟通后创建。判定费在签约后免除，免除部分抵作价款。'
  }
}
