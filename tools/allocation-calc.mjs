/**
 * 年框 + 分摊测算 —— 演示用例跑一遍（可命令行跑，也可被 H5 页面 import）
 *
 *   node tools/allocation-calc.mjs
 *
 * 用例：云南定点场地（V02 海埂大坝）· 400 架 / 15 分钟 / 13 个画面 / 观众 1200 人 / 票价 40 元
 * 分摊：主客户保留 5 画面，场地方 3、赞助商 3、宣发方 2；游客按票购买入场权。
 */
import { runCase, frameworkSummary, scheduleFeasibility, showWindows, ALLOC_TYPES, CAPACITY, DARK_DEFINITIONS, LABOR, HULL_INSURANCE, OVERHEAD, DIRECT_COST_SPLIT } from '../h5/src/engine/allocation.js'

const PARTIES = [
  { key: 'main', label: '主客户（年框签约主体）', type: 'sponsor', screens: 5 },
  { key: 'venue', label: '场地方', type: 'venue', screens: 3 },
  { key: 'sponsor', label: '赞助商', type: 'sponsor', screens: 3 },
  { key: 'media', label: '宣发方', type: 'media', screens: 2 },
  { key: 'audience', label: '游客', type: 'audience', screens: 0, audience: 1200, ticketPrice: 40 }
]

const money = n => n.toLocaleString('zh-CN')
const line = (c = '─', n = 78) => c.repeat(n)

const r = runCase({ parties: PARTIES })

console.log('用例：云南定点场地 ' + r.venue.name + ' · 400 架 / 15 分钟 / 13 画面 / 观众 1200 / 票价 40 元')
console.log(line())
console.log('【1】单场售价（现有 10 要素引擎）')
for (const l of r.quote.lines) console.log(`  ${l.group.padEnd(4)} ${money(l.amount).padStart(9)}  ${l.label}`)
console.log(`  ${'合计'.padEnd(4)} ${money(r.quote.total).padStart(9)}`)

console.log(line())
console.log('【2】成本四层（13,000 只是直接运营层）')
for (const l of r.cost.layers) console.log(`  ${money(l.amount).padStart(9)}  ${l.label}  —  ${l.note}`)
console.log(`  ${money(r.cost.total).padStart(9)}  单场全成本`)
console.log(`  13,000 覆盖的只有直接运营层；合规 + 人力 + 机身险 + 管理分摊 ${money(r.cost.total - DIRECT_COST_SPLIT.reduce((s, c) => s + c.amount, 0))} 在 13,000 之外`)

console.log(line())
console.log('【3】分摊：两个池（画面位池 + 固定池）')
for (const anchor of [['市场售价口径', r.market], ['年框价口径（13,000/场）', r.framework]]) {
  const a = anchor[1]
  console.log(`  ${anchor[0]}：单价 ${money(a.unit)}/画面 · 画面位池 ${money(a.screenPool)} · 固定池 ${money(a.fixedPool)}`)
  for (const row of a.rows) {
    console.log(`    ${row.label.padEnd(26)} 画面 ${String(row.screens).padStart(2)} × ${money(a.unit)} = ${money(row.screenAmount).padStart(7)} + 固定池 ${(row.fixedWeight * 100).toFixed(1).padStart(5)}% = ${money(row.fixedAmount).padStart(8)} → ${money(row.total).padStart(9)}`)
  }
  console.log(`    各方分摊合计 ${money(a.allocated)}（应等于单场价 ${money(a.price)}，差额 ${money(a.residual)}${a.balanced ? ' ✓' : ' ✗ 需补固定池权重'}）`)
  console.log(`    游客票 ${money(a.ticket)}（1200 人 × 40 元；门票归运营方时是分摊之外的收入）`)
  const margin = a.revenue - r.cost.total
  console.log(`    单场：收入 ${money(a.revenue)} − 全成本 ${money(r.cost.total)} = 毛利 ${money(margin)}`)
  const fw = frameworkSummary({ pricePerShow: a.price, costPerShow: r.cost.total, ticketRevenuePerShow: a.ticket })
  console.log(`    年框 ${fw.billable} 场 + ${fw.giftShows} 赠场：收入 ${money(fw.revenue)} / 成本 ${money(fw.cost)} / 毛利 ${money(fw.margin)}（摊到每场 ${money(fw.marginPerShow)}）`)
}

console.log(line())
console.log('【4】天光窗口（昆明，航海昏影终 −12° 为「全暗」定义，几何值 ±5 分钟）')
console.log(`  ${'月份'.padEnd(6)} ${'全暗'.padEnd(7)} ${'白天场'.padEnd(8)} ${'夜间场可排'.padEnd(12)} 备注`)
for (let m = 1; m <= 12; m++) {
  const w = showWindows(new Date(2026, m - 1, 15), { lat: 24.96, lon: 102.69 })
  const night = w.windows.filter(x => x.kind !== '白天' && x.ok).length
  const day = w.windows.filter(x => x.kind === '白天' && x.ok).length
  const over = w.windows.filter(x => x.kind !== '白天' && !x.ok)
  console.log(`  ${String(m).padStart(2)}月`.padEnd(6) + ` ${w.darkLabel}`.padEnd(7) + ` ${day}`.padEnd(8) + ` ${night}`.padEnd(12) + (over.length ? `第 ${over.length} 场超 ${CAPACITY.curfew}（${over[0].note}）` : '两场都在管控内'))
}
const tight = []
for (let m = 1; m <= 12; m++) {
  const w = showWindows(new Date(2026, m - 1, 15), { lat: 24.96, lon: 102.69, capacity: { ...CAPACITY, gapMin: 120 } })
  if (w.windows.filter(x => x.kind !== '白天' && x.ok).length === 2) tight.push(m)
}
console.log(`  敏感性：间隔取 90 分钟（回收30+摆放45+缓冲15）时满 2 场的月份见上表；若间隔取 120 分钟（含观众离场），只有 ${tight.join('/')} 月能排满 2 场`)

console.log(line())
console.log('【5】排布可行性')
const f = scheduleFeasibility({ shows: 200 })
console.log(`  可安排日 ${f.feasibleDays} 天（按逐月雨日扣减，昆明干湿季：5-10 月占全年降水约 85%）`)
console.log(`  按白天1+夜间2 的容量上限 = ${f.capacity} 场；200 场至少需要 ${f.minDaysNeeded} 个可安排日`)
console.log(`  瓶颈是审批提前量：前 20 日备案 + 各部门 7 日核实 + 审批 ${f.approvalLeadDays.approvalDistrict}（<1000 架且适飞）/ ${f.approvalLeadDays.approvalCity}（>1000 架或管制空域）`)
console.log(`  ${f.note}`)

console.log(line())
console.log('【6】口径待确认（模型里的演示假设）')
console.log('  13,000 拆分：' + DIRECT_COST_SPLIT.map(c => `${c.label} ${money(c.amount)}`).join(' / '))
console.log('  人力：飞手 ' + LABOR.pilot.resident + '（驻场摊薄）+ 志愿者 ' + LABOR.volunteer.perPerson + '×4 + 保险 ' + LABOR.volunteerInsurance + ' + 保障 ' + LABOR.groundCrew)
console.log('  机身险 ' + HULL_INSURANCE + ' · 管理分摊 ' + OVERHEAD)
console.log('  全暗定义：' + DARK_DEFINITIONS.map(d => `${d.key} ${d.label}`).join(' / '))
console.log('  分摊类型：' + ALLOC_TYPES.map(t => t.label).join(' / '))
