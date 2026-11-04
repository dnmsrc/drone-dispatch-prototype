/**
 * 付款 = 里程碑模型（节点 + 比例 + 触发条件），不是「一次付清」。
 *
 * 退款不是固定百分比。(2025)鄂01民终396号（武汉中院，2025-02-20）确立的口径：
 *   合同解除后，退还未实际履行部分的服务费，但有权扣除为履行合同已产生的合理、必要成本。
 *   成本扣除必须同时满足三个条件：
 *     1) 支出专为案涉合同履行产生；
 *     2) 有充分证据证明已实际支出；
 *     3) 金额符合行业惯例、具备合理性。
 *   责任划分：双方对前置行政审批均未充分预估风险、均未尽合理审查义务，且审批义务约定不明确 →
 *   双方共同承担，互不支付违约金或赔偿利息。
 *
 * 两条必须分开的概念：
 *   预付款 ≠ 定金。未明确约定「定金」条款，解除时只能要求退还未履行部分的款项，无法适用定金罚则（民法典第五百八十七条）。
 *   转包成本要事先书面同意，否则可能因「属于受托方自身经营行为」不被认定为共同履约成本。
 *
 * 审批失败的处理顺序：先改期，改期不成才解除。改期 = 重新备案 + 重新审批
 * （武汉规范第七条：不得擅自由变更经备案的活动内容、地点等关键要素）。
 */

export const MILESTONES = [
  { key: 'SIGN', name: '签约', ratio: 0.20, trigger: '电子合同签署完成', refundable: false, note: '签约节点性质由合同约定：写成「定金」才适用定金罚则；写成「预付款」则解除时只能退还未履行部分' },
  { key: 'APPROVAL', name: '空域审批通过', ratio: 0.20, trigger: '取得批复并锁定档期（前 1 日 21:00 前批复）', refundable: true },
  { key: 'REHEARSAL', name: '试飞成功', ratio: 0.10, trigger: '活动前小架次边框或彩排测试通过，含应急情况处置（武汉规范第十三条）', refundable: true },
  { key: 'ACCEPT', name: '验收合格并清场', ratio: 0.40, trigger: '按派单载明的投入规模核对到场机队数，误差 ≤5%；编队精度 ≤1 m、灯光音乐同步率 ≥98%', refundable: true },
  { key: 'DELIVERY', name: '交付视频', ratio: 0.10, trigger: '成片交付', refundable: true }
]

export const ACCEPTANCE = [
  { label: '数量误差', value: '≤ 5%' },
  { label: '编队精度', value: '≤ 1 m' },
  { label: '灯光音乐同步率', value: '≥ 98%' }
]

/** 约定阶梯（仅在用户主动取消且合同明确约定时适用） */
export const LADDER = [
  { minHours: 168, ratio: 0.9, label: '距表演 7 天以上，退 90%' },
  { minHours: 72, ratio: 0.5, label: '距表演 3-7 天，退 50%' },
  { minHours: 24, ratio: 0.2, label: '距表演 1-3 天，退 20%' },
  { minHours: 0, ratio: 0, label: '距表演不足 24 小时，不可退款' }
]

export const PENALTY = { label: '逾期付款违约金', rate: 0.005, unit: '每日', note: '仅在合同明确约定且对方违约时计；约定不明 → 互不支付违约金或赔偿利息' }

export const COST_RULE = {
  conditions: [
    { key: 'exclusive', label: '支出专为案涉合同履行产生' },
    { key: 'evidence', label: '有充分证据证明已实际支出（合同、转账凭证、沟通记录、工作成果交付凭证）' },
    { key: 'reasonable', label: '金额符合行业惯例、具备合理性' }
  ],
  subcontract: { key: 'subcontractApproved', label: '转包须事先征得委托方书面同意，否则该费用不被认定为共同履约成本' }
}

export const BRANCHES = [
  { key: 'USER', label: '用户主动取消', note: '已完成节点（已发生成本）不可退；未开始节点按约定阶梯退；定金条款适用时定金不退' },
  { key: 'WEATHER', label: '天气不可抗力', note: '决策点为「照常 / 推迟 / 取消」，通常延期优先于退费；不可抗力须及时通知对方并在合理期限内提供证明（民法典第五百九十条）；迟延履行后发生不可抗力不免除责任' },
  { key: 'APPROVAL_FAIL', label: '审批失败', note: '先改期（改期 = 重新备案 + 重新审批）；改期不成才解除 → 退还未履行部分 − 可证明的专属成本；约定明确由承飞方负责且未按时取得 → 承飞方全责退还已付 + 违约金；约定不明 → 双方共同承担、互不违约金或利息' },
  { key: 'VENUE', label: '场地不可用', note: '因甲方未取得场地管理方同意证明 → 定金条款适用时定金不退；因政府公告临时管制 → 已付全额退' }
]

export const RESCHEDULE = {
  basis: '武汉规范第七条：不得擅自由变更经备案的活动内容、地点等关键要素',
  steps: ['重新备案（活动前 20 日）', '各部门 7 日内核实', '报空中交通管理机构重新审批', '前 1 日 12:00 前提交飞行计划，前 1 日 21:00 前批复'],
  note: '改期不是改一个日期字段：已发生成本不变，新档期要重新走备案与审批；已付节点按原节点继续有效'
}

export function ladderOf(hours) {
  return LADDER.find(l => hours >= l.minHours) || LADDER[LADDER.length - 1]
}

export function hoursUntil(date, slot) {
  // 时段是整点区间（"19:00-20:00"）：倒计时按开始时刻算
  const d = new Date(`${date} ${String(slot || '20:00').slice(0, 5)}`)
  return Math.max(0, Math.round((d.getTime() - Date.now()) / 3600000))
}

/** 成本是否可扣除：三条件 + 转包同意 */
export function costDeductible(cost) {
  const ok = cost.exclusive && cost.evidence && cost.reasonable
  if (!ok) return false
  if (cost.subcontract && !cost.subcontractApproved) return false
  return true
}

export function rescheduleOption({ city, drones, date, slot }) {
  const ap = city.approval
  const large = drones >= ap.largeDrones
  return {
    possible: true,
    earliestDays: 20 + 7 + (large ? ap.largeLeadDays[0] : ap.leadDays[0]),
    level: large ? ap.largePolice : ap.police,
    note: RESCHEDULE.basis + '；' + RESCHEDULE.steps.join(' → ')
  }
}

/**
 * @param total 报价总额
 * @param paidNodes 已完成并付款的节点 key 数组
 * @param costs 已发生成本清单（每条带三条件与转包同意）
 * @param branch 分支
 * @param responsibility 责任：PERFORMER / SHARED / CLIENT / GOVERNMENT（约定不明时按 SHARED）
 * @param depositNature 签约节点性质：deposit（定金） / prepayment（预付款）
 * @param agreementExplicit 审批义务与责任是否在合同中明确约定
 */
export function settle({ total, paidNodes, costs = [], date, slot, branch = 'USER', responsibility = 'SHARED', depositNature = 'prepayment', agreementExplicit = false }) {
  const hours = hoursUntil(date, slot)
  const ladder = ladderOf(hours)
  const rows = paidNodes.map(k => {
    const m = MILESTONES.find(x => x.key === k)
    const amount = Math.round(total * m.ratio)
    let ratio = ladder.ratio
    let why = ladder.label

    if (branch === 'WEATHER') {
      ratio = 1; why = '天气不可抗力：未消耗部分全额退（通常约定延期优先于退费）'
    } else if (branch === 'APPROVAL_FAIL') {
      if (agreementExplicit && responsibility === 'PERFORMER') { ratio = 1; why = '合同明确约定由承飞方负责且未按时取得 → 承飞方全责退还已付' }
      else { ratio = 1; why = '先改期；改期不成解除 → 退还未履行部分，扣除可证明的专属成本' }
    } else if (branch === 'VENUE') {
      if (responsibility === 'GOVERNMENT') { ratio = 1; why = '政府公告临时管制导致场地不可用 → 已付全额退' }
      else if (responsibility === 'CLIENT') {
        ratio = depositNature === 'deposit' ? 0 : ladder.ratio
        why = depositNature === 'deposit' ? '因甲方未取得场地许可 → 定金条款适用，定金不退' : '因甲方未取得场地许可 → 预付款无担保性质，按约定阶梯退'
      }
    }

    if (!m.refundable && branch === 'USER' && depositNature === 'deposit') { ratio = 0; why = '定金条款适用（民法典第五百八十七条）：给付方违约无权请求返还' }
    if (!m.refundable && branch === 'USER' && depositNature !== 'deposit') { why = '预付款无担保性质：按约定阶梯退，不适用定金罚则' }

    return { key: m.key, name: m.name, amount, ratio, refund: Math.round(amount * ratio), why }
  })

  const deductible = costs.filter(costDeductible)
  const notDeductible = costs.filter(c => !costDeductible(c))
  const baseRefund = rows.reduce((s, r) => s + r.refund, 0)
  const refund = Math.max(0, baseRefund - deductible.reduce((s, c) => s + c.amount, 0))

  const penalty = (agreementExplicit && (responsibility === 'PERFORMER' || responsibility === 'CLIENT'))
    ? Math.round(refund * PENALTY.rate)
    : 0
  const penaltyWhy = penalty ? `合同明确约定责任方违约 → 按每日 ${PENALTY.rate * 100}% 计` : '审批义务与责任约定不明 → 双方共同承担，互不支付违约金或赔偿利息（(2025)鄂01民终396号）'

  return {
    hours, ladder, branch, responsibility, agreementExplicit, depositNature,
    rows, costs, deductible, notDeductible,
    baseRefund, refund, penalty, penaltyWhy,
    rescheduleFirst: branch === 'APPROVAL_FAIL',
    legalBasis: ['民法典第五百六十六条第一款（解除后恢复原状）', '民法典第五百九十二条第一款（双方违约各自承担责任）', '民法典第五百九十条（不可抗力部分或全部免除责任，须及时通知并在合理期限内提供证明）', depositNature === 'deposit' ? '民法典第五百八十七条（定金罚则）' : '未约定定金条款，不适用定金罚则']
  }
}

/** 兼容旧调用：默认按约定阶梯 + 约定不明 */
export function refundOf({ total, paidNodes, date, slot, branch = 'USER', responsibility = 'PERFORMER', costs = [], depositNature = 'prepayment', agreementExplicit = false }) {
  return settle({ total, paidNodes, costs, date, slot, branch, responsibility, depositNature, agreementExplicit })
}
