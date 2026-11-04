/**
 * 判定费 —— 按实际难度动态定价，签约成功免除。
 *
 * 为什么不能写死一个数：判定费本质是「为履行合同已产生的成本」。
 * (2025)鄂01民终396号 认定成本可扣除，但必须同时满足三个条件：
 *   1) 支出专为案涉合同履行产生；
 *   2) 有充分证据证明已实际支出；
 *   3) 金额符合行业惯例、具备合理性。
 * 所以判定费要按「实际要做什么」算，并且每条都要留证据字段；双方约定免除的，按约定免除。
 *
 * 免除规则：合同签署 + 签约节点付款后免除，免除部分抵作价款（报价单里显示为「判定费（签约后免除）」）。
 */

export const FEE_BASE = {
  surveyed: 0,     // 已有实测档案的场地：判定不产生新增成本
  virtual: 1200    // 需实地勘察：按 1 个工作日人工成本起算
}

export const FEE_CAP = 3000   // 行业惯例上限（对应「金额合理性」条件）

export const FEE_FACTORS = [
  { key: 'survey', label: '实地勘察（约 1 个工作日）', amount: 0, note: '已有实测档案的场地不产生新增成本' },
  { key: 'travel', label: '跨区/跨市差旅', amount: 0, tiers: [[30, 800], [10, 300]], note: '按场地距城市中心距离' },
  { key: 'border', label: '边境地区或机场净空', amount: 600, note: '需取得有权的空中交通管理机构批准；国界线我方一侧 25000 m 内航测航摄需省人民政府同意' },
  { key: 'emc', label: '电磁环境复杂', amount: 400, note: '场地及周边存在大功率雷达、电台、信号发射塔、高压线、变电站、大型钢架结构等干扰源' },
  { key: 'scale', label: '1000 架及以上现场勘查', amount: 500, note: '1000 架次及以上由市级公安机关组织安全监管（武汉规范第四条）' },
  { key: 'circle', label: '需补圈层防护方案', amount: 300, note: '核心区 → 10 m 隔离区（≥2 m 不透视硬质、保安 ≥10 m/人）→ 20 m 缓冲区（≥1.5 m 硬质、保安 ≥5 m/人）→ 缓冲区外软质（保安 ≥3 m/人）' },
  { key: 'firstEval', label: '官方可行性评估未做过', amount: 400, note: '公安机关会同空管、气象、无线电管理等部门在初次活动前评估（武汉规范第十八条）；同一场地二次活动不重做' }
]

export function judgeFee({ venue, drones }) {
  const factors = []
  let total = 0

  const base = venue.virtual ? FEE_BASE.virtual : FEE_BASE.surveyed
  if (base > 0) factors.push({ key: 'survey', label: '实地勘察（约 1 个工作日）', amount: base, detail: '无实测净空与面积数据，需现场测量并出具判定单' })
  total += base

  const dist = Number(venue.distanceToCityKm || 0)
  for (const [min, amt] of (FEE_FACTORS.find(f => f.key === 'travel').tiers)) {
    if (dist > min) { factors.push({ key: 'travel', label: '跨区/跨市差旅', amount: amt, detail: `场地距城市中心 ${dist} km` }); total += amt; break }
  }

  if (venue.border || venue.airportZone) {
    factors.push({ key: 'border', label: '边境地区或机场净空', amount: 600, detail: venue.border ? '边境地区管制空域，需有权空管机构批准' : `位于${(venue.cityAirport && venue.cityAirport.name) || '机场'}净空保护区域` })
    total += 600
  }
  if (venue.emcComplex) { factors.push({ key: 'emc', label: '电磁环境复杂', amount: 400, detail: '存在强电磁干扰源' }); total += 400 }
  if (drones >= 1000) { factors.push({ key: 'scale', label: '1000 架及以上现场勘查', amount: 500, detail: '由市级公安机关组织安全监管' }); total += 500 }
  if (!venue.circleOk) { factors.push({ key: 'circle', label: '需补圈层防护方案', amount: 300, detail: '硬质隔离与保安密度需补建' }); total += 300 }
  if (venue.officialEvalDone === false) { factors.push({ key: 'firstEval', label: '官方可行性评估未做过', amount: 400, detail: '初次活动前由公安机关会同空管、气象、无线电管理等部门评估' }); total += 400 }

  const capped = total > FEE_CAP
  const payable = Math.min(total, FEE_CAP)

  return {
    factors,
    raw: total,
    payable,
    capped,
    cap: FEE_CAP,
    evidence: {
      exclusive: true,
      proof: venue.virtual ? '勘察工时记录 + 现场照片 + 判定单编号' : '已有场地档案（无新增支出，不计费）',
      industryStandard: true
    },
    waived: {
      condition: '合同签署完成 + 签约节点付款',
      effect: '判定费免除，免除部分抵作价款',
      basis: '双方约定优先（民法典第五百六十六条允许按约定处理已履行部分）'
    },
    note: '判定与审批是两个环节：判定解决「这个场地物理上能不能飞」，审批解决「这块空域这段时间给不给你」。判定费不是政府收费——政务审批环节全程不收费。'
  }
}
