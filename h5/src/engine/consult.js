/**
 * 咨询单 / 人工派单 —— 用户侧的展示口径。
 *
 * 2026-11-02 用户定稿：咨询派单必须由人工客服在 Web 管理端审核确认，用户侧不能自己推进。
 * 因此这里只有「状态 → 阶段 / 文案 / 按钮」的映射，没有创建单号、创建派单这类会叫人误解为
 * 「用户能派单」的函数：单号与派单全部由服务端（mock-server）生成，契约见 docs/consult-workflow.md。
 *
 * 用户能做的只有两件事：提交咨询单、确认客服给出的派单。
 * 接待（PENDING → RECEIVED）与创建派单（RECEIVED → DISPATCHED）只发生在管理端。
 */

export const ROUTE_TO_CONSULT = [
  { key: 'BLOCKED', label: '场地物理条件不达标', why: '不是价格问题，是接不了单——需减架数、换场地或现场整改' },
  { key: 'SURVEY', label: '无实测数据，需实地勘察', why: '判定结论以现场勘察为准，勘察前不能出正式报价' },
  { key: 'OVER_CAP', label: '架数超过该场地上限', why: '场地面积与净空决定最多能飞多少架' },
  { key: 'FIRST_EVAL', label: '官方可行性评估未做过', why: '初次活动前须由公安机关会同空管、气象、无线电管理等部门评估' },
  { key: 'BORDER', label: '边境地区或机场净空', why: '需取得有权的空中交通管理机构批准，航测航摄需省人民政府同意' },
  { key: 'CROWD', label: '1000 人以上大型群众性活动', why: '需安全许可证，承办者应在活动日 20 日前向公安机关申请' }
]

export function needsConsult(judgment, need) {
  const reasons = []
  if (!judgment) return reasons
  if (judgment.conclusion === 'BLOCKED') reasons.push(ROUTE_TO_CONSULT[0])
  if (judgment.conclusion === 'SURVEY') reasons.push(ROUTE_TO_CONSULT[1])
  if (judgment.maxDrones && need.droneCount > judgment.maxDrones) reasons.push(ROUTE_TO_CONSULT[2])
  if (judgment.officialEvalDone === false) reasons.push(ROUTE_TO_CONSULT[3])
  if (judgment.city.border || judgment.venue.airportZone) reasons.push(ROUTE_TO_CONSULT[4])
  if ((need.audience || 0) >= 1000) reasons.push(ROUTE_TO_CONSULT[5])
  return reasons
}

/** 服务端状态文案（与 mock-server 的 CONSULT_STATUS_TEXT 一字不差；服务端返回 statusText 时以服务端为准） */
export const STATUS_TEXT = {
  PENDING: '待客服接待',
  RECEIVED: '客服已接待·拟方案',
  DISPATCHED: '已派单·待你确认',
  CONFIRMED: '已确认派单',
  REJECTED: '客服已驳回',
  ABANDONED: '已自动废弃'
}

/** 服务端状态 → 用户侧阶段（页面按阶段决定能说什么、能点哪里） */
export const PHASE_OF = {
  PENDING: 'waiting',
  RECEIVED: 'received',
  DISPATCHED: 'dispatched',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  ABANDONED: 'abandoned'
}

/** 「进行中」：用户下次再点预约表演时要提示的那张单（含已确认、还在走签约付款的） */
export const ACTIVE_STATUS = ['PENDING', 'RECEIVED', 'DISPATCHED', 'CONFIRMED']

export function isActive(c) {
  return !!c && ACTIVE_STATUS.includes(c.status)
}
export function phaseOf(c) {
  return c ? (PHASE_OF[c.status] || 'unknown') : 'draft'
}

/**
 * 底部主按钮文案。前四个阶段里，只有「已派单」和「已确认」能往下走：
 *   draft       用户还没提交 → 只能先提交
 *   waiting     等客服接待 → 点也只会提示，不跳转
 *   received    等客服创建派单 → 点也只会提示
 *   dispatched  客服给了派单 → 用户确认后进第 6 步
 *   confirmed   已经确认过（重进流程时）→ 直接进第 6 步
 */
export const DOOR_TEXT = {
  draft: '先提交咨询单',
  waiting: '等待客服接待',
  received: '等待客服创建派单',
  dispatched: '确认派单 · 去签署合同',
  confirmed: '已确认派单 · 去签署合同',
  rejected: '已驳回 · 重新申请',
  abandoned: '已废弃 · 重新申请',
  unknown: '等待客服处理'
}

/** 服务端给 ISO 时间，展示成本地 YYYY-MM-DD HH:mm（不依赖引擎的 fmtClock：这里不是航班/天光时间） */
export function fmtStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
