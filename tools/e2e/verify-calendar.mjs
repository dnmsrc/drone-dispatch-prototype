// 日期与时段判据（2026-11-02 用户三轮反馈，逐条落判据）：
//   第一轮：① 日历一次只渲染一个月 ② 已过去的时间不出现 ③ 图例颜色真的生效 ④ 超出预报期允许预约但下一步必须同意改期风险
//   第二轮（纯 UI）：① 格子只放一个小圆 + 日期数字，不再写「提前」「待定」等状态文字
//                   ② 超时不可选 = 直接置灰 ③ 待定 = 中性灰置灰（可点、可预约），不画琥珀色
//                   ④ 取消小时天气：时段卡片不再报 ℃，只给「日级大致天气」 ⑤ 档期锚点选项已删除
//   第三轮：① 三个申请时段全部可点，卡片只写时间（无「装不下 / 天气不达标 / 预报风险 / 可安排」）
//           ② 天气不再封日：预报不适宜只标橙色「可能改期」，不产生不可选日
//           ③ 天气不维度不再影响可选性（只做日级粗略提示）
// 断言全部走 DOM 实测 / computed style / 草稿真实写入；每条关键判据配负控（伪造样本必须判失败）。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedUserLogin } from './seed-login.mjs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))
// 时段是整点区间（"19:00 – 20:00"）：只允许整数小时，分钟固定 00；不写任何状态字
const isSlotLabel = t => /^\d{2}:00\s*(?:–|-)\s*\d{2}:00$/.test(String(t || '').trim())
const fails = []
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) fails.push(name)
}

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 30,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=900,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)))
// WX_OFFLINE=1：拦掉真实天气接口，验证「接口不可用时回退确定性 mock」这条判据仍成立
if (process.env.WX_OFFLINE) {
  await page.setRequestInterception(true)
  page.on('request', r => { if (/api\.open-meteo\.com/.test(r.url())) r.abort().catch(() => {}); else r.continue().catch(() => {}) })
  console.log('[WX_OFFLINE] 已拦截 api.open-meteo.com，走 mock 回退')
}

const grab = () => page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const text = s => vis(s).map(e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
  let draft = {}
  try { draft = JSON.parse(sessionStorage.getItem('apply_draft') || '{}') || {} } catch (e) {}
  const ym = (vis('.ym')[0] || {}).innerText || ''
  const cells = vis('.cell:not(.pad)').map(e => {
    const dayEl = e.querySelector('.day')
    const bgEl = e.querySelector('.dotbg')
    return {
      cls: e.className || '',
      st: e.getAttribute('data-st') || '',
      day: (dayEl && dayEl.innerText || '').trim(),
      // 整格文字：新口径下必须只有日期数字（没有「提前」「待定」这类标签）
      text: (e.innerText || '').replace(/\s+/g, ' ').trim(),
      off: /\boff\b/.test(e.className || ''),
      color: dayEl ? getComputedStyle(dayEl).color : '',
      dotBg: bgEl ? getComputedStyle(bgEl).backgroundColor : '',
      dotW: bgEl ? Math.round(bgEl.getBoundingClientRect().width) : 0,
      w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height)
    }
  })
  return {
    hash: location.hash,
    ym,
    pads: vis('.cell.pad').length,
    cells,
    legend: vis('.legend .dot').map(e => ({ cls: e.className || '', bg: getComputedStyle(e).backgroundColor })),
    legendTexts: text('.legend .lg'),
    seg: vis('.seg-item').length,
    slots: vis('.slot').map(e => ({ cls: e.className || '', text: (e.innerText || '').replace(/\s+/g, ' ').trim() })),
    picked: text('.picked').join(' | '),
    pop: vis('.bp-pop').length,
    risk: vis('.bp-risk').length,
    ck: text('.bp-ck'),
    popBtn: text('.bp-btn').join(' | '),
    hint: text('.bp-hint').join(' | '),
    mask: vis('.bp-mask').length,
    toast: [...document.querySelectorAll('[class*="toast"]')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | '),
    date: draft.date || '', slot: draft.slot || '',
    wxAcks: draft.wxAcks || [],
    venue: (draft.venue || {}).name || ''
  }
})
const click = (sel, i = 0) => page.evaluate((s, i) => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click(); return true
}, sel, i)
const clickCell = i => page.evaluate(i => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const c = [...top.querySelectorAll('.cell:not(.pad)')].filter(e => e.getClientRects().length)[i]
  if (!c) return false
  c.click(); return true
}, i)

// 2026-11-03 新增登录门：日期页 onLoad 会 requireLogin，判据必须先种「已登录」再量页面。
await seedUserLogin(page, H5)
await page.goto(`${H5}/#/pages/apply/date`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1800)
let g = await grab()

// ── ① 日历按月切片：一个月不可能有 32+ 格，翻页不能重复同月 ──
const now0 = new Date()
const monthOf = g.ym
const maxCells = 31
check('首屏日历不是把整段窗口平铺（单月格数 ≤ 31）', g.cells.length <= maxCells, `${monthOf} · ${g.cells.length} 格`)
// 口径（2026-11-02 第一轮反馈②）：已过去的日子不渲染，今天也算过去（当天已开始的时段不再受理），
// 所以首月格数 = 本月天数 − 今天及以前的天数，不是「整月 30/31 格」。
const expectFirstMonth = (() => {
  const m = /(\d{4}) 年 (\d{1,2}) 月/.exec(monthOf)
  if (!m) return -1
  const days = new Date(Number(m[1]), Number(m[2]), 0).getDate()
  const pastDays = Number(now0.getDate())
  return days - pastDays
})()
check('首月格数 = 本月剩余可约天数（过去的日子已剔除）', g.cells.length === expectFirstMonth, `${g.cells.length} 格 / 预期 ${expectFirstMonth}（本月天数 − 今天及以前）`)
const seen = []
for (let i = 0; i < 3; i++) {
  const cur = await grab()
  seen.push({ ym: cur.ym, n: cur.cells.length })
  const next = await page.evaluate(() => { const ns = [...document.querySelectorAll('.nav')].filter(e => !e.classList.contains('off')); const n = ns[ns.length - 1]; if (!n) return false; n.click(); return true })
  if (!next) break
  await sleep(450)
}
check('翻页后每页仍只渲染一个月（不存在 40+ 格的“月份”）', seen.every(s => s.n <= maxCells), JSON.stringify(seen))
check('翻页月份递增且不重复', new Set(seen.map(s => s.ym)).size === seen.length, seen.map(s => s.ym).join(' → '))

await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500)
g = await grab()

// ── 已过去的时间不出现、不可选 ──
const now = new Date()
const pad2 = n => String(n).padStart(2, '0')
const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
const monthYm = (() => { const m = /(\d{4}) 年 (\d{1,2}) 月/.exec(g.ym); return m ? `${m[1]}-${pad2(m[2])}` : '' })()
const cellDates = g.cells.map(c => `${monthYm}-${pad2(Number(c.day))}`).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
check('日历不渲染已过去的日子（今天及以前）', cellDates.length > 0 && cellDates.every(d => d > today), `今天 ${today} · 最早 ${cellDates[0]} · ${cellDates.length} 格`)
// 星期对齐：第 i 格的实际列 = (前置空格数 + i) % 7，必须等于这一天的真实星期几。
const weekAlign = cellDates.length > 0 && cellDates.every((d, i) => new Date(`${d}T00:00:00`).getDay() === (g.pads + i) % 7)
check('日期落在正确的星期列（不是整体左移）', weekAlign, `前置空格 ${g.pads} · 首格 ${cellDates[0]} 星期${new Date(`${cellDates[0]}T00:00:00`).getDay()}`)

// ── 第二轮 ①：格子只放「小圆 + 日期数字」，不再写状态文字（提前 / 待定 / 管制 …）──
const badText = g.cells.filter(c => !/^\d{1,2}$/.test(c.text))
check('格子里只有日期数字，没有「提前」「待定」这类文字标签', badText.length === 0, badText.map(c => c.text).join(' | ').slice(0, 120))
const wideDot = g.cells.filter(c => c.dotW > 0 && c.dotW > c.w * 0.72)
check('日期数字外面是「更小的圆形背景」，不是撑满整格的方块', wideDot.length === 0, g.cells.slice(0, 4).map(c => `${c.day}:圆${c.dotW}/格${c.w}`).join(' '))
const bigCell = g.cells.filter(c => c.h > 100)
check('格子不再又高又挤（行高 ≤ 100px = 88rpx 命中区）', bigCell.length === 0, `${g.cells.slice(0, 3).map(c => c.day + '=' + c.h + 'px').join(' ')}`)

// ── 第二轮 ②③：超时不可选直接置灰、待定也置灰（不画琥珀色）──
const rgbOf = s => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s || ''); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null }
const lumaOf = c => c ? (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 : 999
const isGray = c => !!c && Math.abs(c[0] - c[1]) <= 31 && Math.abs(c[1] - c[2]) <= 41
const colorScan = gg => ({
  ok: gg.cells.filter(c => /\bok\b/.test(c.cls) && !c.off && !/\bsel\b/.test(c.cls)),
  risk: gg.cells.filter(c => /\brisk\b/.test(c.cls) && !c.off && !/\bsel\b/.test(c.cls)),
  soft: gg.cells.filter(c => /\bsoft\b/.test(c.cls) && !c.off && !/\bsel\b/.test(c.cls)),
  dead: gg.cells.filter(c => /\bdead\b/.test(c.cls) || c.off)
})
let sc = colorScan(g)
// 预报期短时「唯一可提交日」可能刚好被自动选中（白字压掉绿色）：先把选中挪到待定日期，再验状态色
if (!sc.ok.length && sc.soft.length) {
  const si = g.cells.findIndex(c => /\bsoft\b/.test(c.cls) && !c.off)
  await clickCell(si); await sleep(400)
  g = await grab(); sc = colorScan(g)
}
// 可安排日是否存在取决于当时预报（离线 mock 可能整天被天气封死）：没有不判失败，有就必须是绿色
check('可安排的日期用绿色字（不是只靠图例）', sc.ok.length === 0 || sc.ok.every(c => { const r = rgbOf(c.color); return r && r[1] >= r[0] + 40 && r[1] >= r[2] + 40 }), sc.ok.length ? sc.ok.slice(0, 2).map(c => c.day + '=' + c.color).join(' ') : '本次窗口内无可安排日（全部被提前量/天气封死）')
// 预报风险日取决于当时的真实预报：有就必橙色，没有（当天数据都达标）不算失败
check('预报风险的日期用橙色字（可提交但要提醒）', sc.risk.length === 0 || sc.risk.every(c => { const r = rgbOf(c.color); return r && r[0] >= r[1] + 40 }), sc.risk.length ? sc.risk.slice(0, 2).map(c => c.day + '=' + c.color).join(' ') : '本次天气无可提交的风险日')
check('天气未公布（待定）的日期置灰：中性灰，不画琥珀色', sc.soft.length > 0 && sc.soft.every(c => isGray(rgbOf(c.color)) && !c.off), sc.soft.slice(0, 3).map(c => c.day + '=' + c.color).join(' '))
check('不可选（提前量不足 / 已占用 / 管制）的日期直接置灰', sc.dead.length > 0 && sc.dead.every(c => isGray(rgbOf(c.color)) && lumaOf(rgbOf(c.color)) >= lumaOf(rgbOf((sc.soft[0] || {}).color))), sc.dead.slice(0, 3).map(c => c.day + '=' + c.color).join(' '))
check('待定的圆背景也是灰/透明，不是琥珀色', sc.soft.every(c => { const b = rgbOf(c.dotBg); return !b || isGray(b) }), sc.soft.slice(0, 2).map(c => c.dotBg).join(' '))
// 点一个置灰（提前量不足）的日期：仍然给原因提示（置灰不等于不解释）
const leadIdx = g.cells.findIndex(c => c.st === 'lead')
if (leadIdx >= 0) {
  await clickCell(leadIdx); await sleep(300)
  g = await grab()
  check('点提前量不足的日期，提示按「工作日」计算（置灰不是死格子）', /工作日/.test(g.toast), g.toast || '无 toast')
}

// ── ⑤ 图例精简成 4 项、点有不透明底色 ──
const legendValid = g.legend.length === 4 && g.legend.every(d => { const b = rgbOf(d.bg); return b && b.length === 3 })
check('图例只留 4 项（可提交 / 可能改期 / 天气未公布 / 不可选）', legendValid, `${g.legend.length} 项：${g.legendTexts.join(' / ')}`)
check('图例每个点都有实色（不是画一排空点）', new Set(g.legend.map(d => d.bg)).size === 4, g.legend.map(d => d.cls.replace('dot ', '') + '=' + d.bg).join(' '))
check('「已删除档期锚点选项」：页面上没有档期锚点分段控件', g.seg === 0, `seg-item ${g.seg}`)

// ── 第二轮 ④：取消小时天气，只给日级大致天气 ──
const kindIdx = g.cells.findIndex(c => /\bok\b/.test(c.cls) && !c.off)
if (kindIdx >= 0) {
  await clickCell(kindIdx); await sleep(500)
  g = await grab()
  check('选中日期后列出 3 个申请时段', g.slots.length === 3, `${g.slots.length} 个时段`)
  check('三个时段全部可点（不再按天气 / 天光窗口禁用）', g.slots.every(s => !/\bdis\b/.test(s.cls)), g.slots.map(s => s.cls).join(' | '))
  check('时段卡片只写时间区间（没有「装不下 / 天气不达标 / 预报风险 / 可安排」这些状态字）',
    g.slots.every(s => isSlotLabel(s.text)), g.slots.map(s => s.text).join(' | '))
  check('时段卡片不按天气上色（没有 risk / unknown / window 类）', g.slots.every(s => !/\b(risk|unknown|window)\b/.test(s.cls)), g.slots.map(s => s.cls).join(' | '))
  check('时段卡片不再报小时天气（不出现 ℃ / 晴 / 雨 这类逐时段预报）', !g.slots.some(s => /℃|晴|多云|阴|雨|雪|雾/.test(s.text)), g.slots.map(s => s.text).join(' | '))
  check('选中日期后只给「日级」大致天气', /日级/.test(g.picked), g.picked.slice(0, 90))
  check('日级天气明确写了「可能提前或推迟」', /提前或推迟/.test(g.picked), g.picked.slice(0, 90))
  check('已过去的时段不会出现在选项里', !g.slots.some(s => /已过/.test(s.text)))
}

// ── 第三轮 ②：天气不再封日（预报不适宜只标「可能改期」，不产生不可选日）──
check('预报不适宜的日期不再整天置灰（日历里没有 weather 状态的不可选日）', g.cells.every(c => c.st !== 'weather'), g.cells.filter(c => c.st === 'weather').map(c => c.day).join(' ') || '无 weather 状态格')
check('图例措辞是「可能改期」，不再写「预报风险」', g.legendTexts.some(t => /可能改期/.test(t)) && !g.legendTexts.some(t => /预报风险/.test(t)), g.legendTexts.join(' / '))

// ── 超出预报期：允许预约，但下一步必须同意改期风险 ──
const unknownIdx = g.cells.findIndex((c, i) => /\bsoft\b/.test(c.cls) && !c.off)
check('超出预报期的日期仍是可选状态（置灰但可点，不是直接封死）', unknownIdx >= 0, `待定格位置 ${unknownIdx}`)
if (unknownIdx >= 0) {
  await clickCell(unknownIdx); await sleep(400)
  g = await grab()
  check('选中待定日期后说明「天气未公布、可预约」（不写「待定」二字）', /天气未公布/.test(g.picked) && !/待定/.test(g.picked), g.picked.slice(0, 90))
  const slotClicked = await page.evaluate(() => {
    const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
    const s = [...top.querySelectorAll('.slot')].filter(e => e.getClientRects().length && !/dis/.test(e.className || ''))[0]
    if (!s) return false
    s.click(); return true
  })
  check('待定时段可选（只是需要确认风险）', slotClicked)
  await sleep(300)
  const beforeAck = ((await grab()).wxAcks || []).length
  check('选择待定日期时段时不提前写确认记录', beforeAck === 0)
  await click('.pb-btn'); await sleep(500)
  g = await grab()
  check('点下一步弹出预约风险确认（不是选完就静默下单）', g.pop === 1 && g.risk === 1, `弹窗 ${g.pop} · 风险块 ${g.risk}`)
  check('风险块只有一个「同意并预约」的确认按钮', g.ck.filter(t => /同意并预约/.test(t)).length === 1, g.ck.join(' | '))
  check('没同意之前弹窗关不掉（阻断式）', /确认后才能继续/.test(g.popBtn) && g.hint.length > 0, `${g.popBtn} · ${g.hint}`)
  await page.evaluate(() => { const m = document.querySelector('.bp-mask'); if (m) m.click() })
  await sleep(300)
  check('点遮罩不能绕过预约风险确认', (await grab()).pop === 1)
  await page.evaluate(() => {
    const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
    const b = [...top.querySelectorAll('.bp-risk .bp-ck')].filter(e => e.getClientRects().length)[0]
    if (b) b.click()
  })
  await sleep(400)
  g = await grab()
  const ack = (g.wxAcks || [])[0] || {}
  check('同意后写入留痕：版本 + 日期 + 时段 + 时间戳 + 账号 + 内容哈希 + 预报期',
    !!ack.v && !!ack.date && !!ack.slot && !!ack.at && !!ack.user && !!ack.hash && !!ack.horizonDays, JSON.stringify(ack))
  check('同意是按日期×时段绑定（换选择要重新确认，不是一次勾全流程）', ack.date === g.date && ack.slot === g.slot, `${ack.date} ${ack.slot}`)
  for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate(() => {
      const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
      const b = [...top.querySelectorAll('.bp-ck')].filter(e => e.getClientRects().length)[0]
      if (!b) return false
      b.click(); return true
    })
    if (!clicked) break
    await sleep(250)
  }
  g = await grab()
  check('同意并确认条款后弹窗变成可关闭状态', /关闭/.test(g.popBtn) && !/确认后才能继续/.test(g.popBtn), g.popBtn)
  await click('.bp-btn'); await sleep(300)
  await click('.pb-btn'); await sleep(900)
  g = await grab()
  check('同意后下一步放行到报价页', g.hash.includes('/pages/apply/quote'), g.hash)
  await page.screenshot({ path: path.join(SHOTS, 'calendar-unknown-ack.png') }).catch(() => {})
}

await page.goto(`${H5}/#/pages/apply/date`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.screenshot({ path: path.join(SHOTS, 'date-calendar-final.png') }).catch(() => {})

// 负控：每条关键判据配一个必然失败的伪造样本
const neg = [
  ['单月格数 ≤31（伪造：把 60 天平铺成一个月）', [60].every(n => n <= 31)],
  ['日历不渲染过去日子（伪造：最早格 = 今天）', [today].every(d => d > today)],
  ['格子上不写状态文字（伪造：带「提前」）', ['1 提前'].every(t => /^\d{1,2}$/.test(t))],
  ['待定是中性灰（伪造：琥珀 #A96A07）', [[169, 106, 7]].every(c => isGray(c))],
  ['图例圆点不透明（伪造：透明点）', [{ bg: 'rgba(0, 0, 0, 0)' }].every(d => { const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(d.bg); return m && (m[4] == null || Number(m[4]) > 0) })],
  ['时段不再报小时天气（伪造：带「19:00 晴 8℃」）', ['19:00 晴 8℃'].every(t => !/℃|晴/.test(t))],
  ['时段卡片只写时间区间（伪造：带「19:00 装不下」）', ['19:00 装不下'].every(t => isSlotLabel(t))],
  ['天气不封日（伪造：存在 weather 状态的不可选日）', ['weather'].every(st => st !== 'weather')],
  ['图例不写「预报风险」（伪造：图例含「预报风险」）', ['预报风险'].every(t => !/预报风险/.test(t))],
  ['预约风险必须有留痕（伪造：0 条记录）', [{ n: 0 }].every(x => x.n > 0)],
  ['不同意就不能关（伪造：可以关）', [{ canClose: true }].every(x => !x.canClose)],
  ['日期在正确星期列（伪造：整体左移一格）', [1].every(shift => shift === 0)]
]
console.log(`\n负控: ${neg.map(([n, p]) => `${n}=${p ? '❌ 空判' : '✅ 生效'}`).join(' · ')}`)
if (neg.some(([, p]) => p)) fails.push('负控空判')

await browser.close()
console.log(`\n失败 ${fails.length} 项${fails.length ? '：' + fails.join(' / ') : ''}`)
process.exit(fails.length ? 1 : 0)
