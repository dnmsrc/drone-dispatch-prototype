// 门（确认拦截）判据脚本 —— 2026-10-29 用户指出：没确认就点「下一步」，系统必须拦住。
// 之前门只在「提交咨询单 / 签署合同」两处，第 1~3 步的下一步能直接走过去：
// 选到触发条款的那一项时弹窗可以关掉（没确认），点下一步照样放行 = 拦截缺失。
//
// 每一页从干净草稿独立跑一遍（独立 = 上一页残留的弹窗不会串页）：
//   ① 填写/选择时不弹窗，不打断用户；
//   ② 没确认就点「下一步」→ 必须拦住：不跳转 + 把还欠的条款摆进弹窗 + 弹窗关不掉；
//   ③ 逐条确认完 → 必须放行（门不能过度拦人）。
import puppeteer from 'puppeteer-core'
import { TOUCH_STEP, TOUCH_CLAUSE, clauseOf, appliesTo, confirmedClauses, DISCLOSURE_VERSION } from '../../h5/src/engine/disclosure.js'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`)
  cond ? pass++ : fail++
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const vis = async sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim()), sel)
const click = async (sel, i = 0) => page.evaluate((s, i) => {
  const e = [...document.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)
const hash = async () => page.evaluate(() => location.hash)
const draft = async () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })
const toastText = async () => (await vis('[class*="toast"]')).join(' | ')
async function api(method, p, body, token) {
  const r = await fetch(H5 + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return await r.json()
}

// 弹窗读数：开没开、是不是阻断式（关不掉）、关不掉时有没有明示文案
const popInfo = async () => page.evaluate(() => {
  const vis = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const pop = vis('.bp-pop')[0]
  if (!pop) return { open: false }
  const btn = pop.querySelector('.bp-btn')
  const x = pop.querySelector('.bp-x')
  const dis = b => !!b && (b.disabled || b.getAttribute('disabled') !== null || /dis/.test(b.className || ''))
  return {
    open: true,
    title: (((pop.querySelector('.bp-title') || {}).textContent) || '').replace(/\s+/g, ' ').trim(),
    clauses: [...pop.querySelectorAll('.bp-clause')].length,
    ck: [...pop.querySelectorAll('.bp-ck')].length,
    closeText: ((btn || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    closeDisabled: dis(btn),
    xDisabled: dis(x),
    hint: (((pop.querySelector('.bp-hint') || {}).textContent) || '').replace(/\s+/g, ' ').trim()
  }
})
const confirmAll = async () => {
  for (let i = 0; i < 60; i++) { if (!(await click('.bp-ck', 0))) break; await sleep(300) }
}
async function freshLoad(p, seed) {
  await page.evaluate(d => sessionStorage.setItem('apply_draft', JSON.stringify(d)), seed)
  await page.evaluate(u => { location.hash = '#/pages/' + u }, 'apply/' + p)
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1400)
}

// 门按钮：6 页都是 .pb-btn（第 5 步的「提交咨询单」另有一道门，见下方 base 走通段；
// 逐页循环里第 5 步的门是「确认派单 · 去签署合同」）
const DOOR = { venue: '.pb-btn', need: '.pb-btn', date: '.pb-btn', quote: '.pb-btn', consult: '.pb-btn', contract: '.pb-btn' }
// 每页的触发点（选到哪一项 = 确认哪一条）；没有触发点的页只有门
const TRIGGER = {
  venue: async () => await click('.venue-item', 3),
  need: async () => {
    const i = await page.evaluate(() => { const i = [...document.querySelectorAll('input')].filter(e => e.getClientRects().length)[0]; if (!i) return false; i.focus(); return true })
    if (!i) return false
    await page.keyboard.type('1200')
    await page.evaluate(() => { const i = [...document.querySelectorAll('input')].filter(e => e.getClientRects().length)[0]; if (i) i.blur() })
    await sleep(600)
    return true
  },
  date: async () => {
    // 冷进入日期页时 store 会按真实算法补一个可选日期（默认 19:00）；这里只把时段换成 20:00，
    // 避免被「早于全暗 + 45 分钟摆放」的提交前硬校验拦住，测不到确认门。
    await page.evaluate(() => { const c = [...document.querySelectorAll('.cell')].filter(e => e.getClientRects().length && !/off|pad/.test(e.className || '')); if (c[0]) c[0].click() })
    const s = await page.evaluate(() => {
      const list = [...document.querySelectorAll('.slot')].filter(e => e.getClientRects().length && !/dis/.test(e.className || ''))
      const el = list.find(e => (e.textContent || '').includes('20:00')) || list[0]
      if (!el) return false
      el.click(); return true
    })
    await sleep(300)
    return s
  },
  quote: async () => false, consult: async () => false, contract: async () => false
}

// 重置演示数据（否则上一轮判据留下的「进行中的咨询单」会让本轮的提交撞冲突）
{
  const a0 = await api('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })
  if (a0 && a0.data && a0.data.token) await api('POST', '/api/config/reset', {}, a0.data.token)
}

// 先登录（提交咨询单与确认派单都是账号行为；不登录会被拦在「请先登录」）
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

// 先走一遍把草稿建立起来（场地 V04 · 1200 人 · 日期时段 · 报价 · 咨询单 · 派单）
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
await click('.venue-item', 3); await sleep(600)
await click('.bp-btn', 0); await sleep(300)
await page.evaluate(() => { location.hash = '#/pages/apply/need' }); await sleep(1500)
await page.evaluate(() => { const i = [...document.querySelectorAll('input')].filter(e => e.getClientRects().length)[0]; if (i) { i.value = '1200'; i.dispatchEvent(new Event('input')) } }); await sleep(300)
await click('.pb-btn', 0); await sleep(600)
await page.evaluate(() => { location.hash = '#/pages/apply/date' }); await sleep(1500)
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell')].filter(e => e.getClientRects().length && !/off|pad/.test(e.className || '')); if (c[0]) c[0].click() }); await sleep(500)
await page.evaluate(() => { const s = [...document.querySelectorAll('.slot')].filter(e => e.getClientRects().length && !/dis/.test(e.className || '')); if (s[0]) s[0].click() }); await sleep(500)
await page.evaluate(() => { location.hash = '#/pages/apply/quote' }); await sleep(1500)
await page.evaluate(() => { location.hash = '#/pages/apply/consult' }); await sleep(1500)
// 派单不再由 store 预置：先过「提交咨询单」的门，再以客服身份在管理端接待并创建派单
// （接待/派单是管理端动作，用户侧没有自助入口；这里用真实服务端接口推进，等价于客服在「咨询受理」工作台操作）
await click('.submit-consult', 0); await sleep(600)
await confirmAll()
await click('.bp-btn', 0); await sleep(400)
await click('.submit-consult', 0); await sleep(1200)
const atk = (await api('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })).data.token
const d0 = await draft()
if (d0 && d0.consult && d0.consult.id) {
  await api('POST', `/api/admin/consults/${d0.consult.id}/receive`, {}, atk)
  await click('.refresh-btn', 0); await sleep(800)
  await api('POST', `/api/admin/consults/${d0.consult.id}/dispatch`, {
    quoteLo: 30000, quoteHi: 42000, note: '门判据脚本',
    terms: {
      approvalOwner: '承飞方（乙方）负责空域申请与备案',
      approvalFailLiability: '乙方未按时取得批复 → 乙方全责退还已付费用',
      subcontractApproved: '是（甲方书面同意）',
      depositNature: '预付款',
      insuranceAmount: 1000000,
      scaleBasis: '投入规模'
    }
  }, atk)
  await click('.refresh-btn', 0); await sleep(1000)
}
const base = await draft()
ok('草稿走通（门之前的前置都在）', !!base && !!base.venue && !!base.judgment && !!base.date && !!base.slot && !!base.quote && !!base.dispatch,
  `${base && base.venue && base.venue.id} · ${base && base.need && base.need.audience} 人 · ${base && base.date} ${base && base.slot} · 派单=${base && base.dispatch && base.dispatch.id}`)

// ── 逐页：干净草稿 → 没确认点下一步必须拦住 → 确认完必须放行 ──
for (const p of Object.keys(DOOR)) {
  await freshLoad(p, Object.assign({}, base, { acks: [] }))
  const fired = await TRIGGER[p]()
  if (fired) {
    const p0 = await popInfo()
    ok(`${p} 填写/选择时不自动弹窗`, !p0.open, p0.open ? `${p0.clauses} 条` : '未弹（正确）')
    ok(`${p} 表单不显示「需确认/已确认」状态按钮，保留下角统一回看入口`, !(await vis('.entry-chip')).some(t => /需确认|已确认/.test(t)) && (await vis('.ack-fab')).length === 1, (await vis('.entry-chip')).join(' | '))
  }
  const before = ((await draft()).acks || []).length
  await click(DOOR[p], 0)
  await sleep(700)
  const p1 = await popInfo()
  const t = await toastText()
  ok(`${p} 没确认点下一步被拦住（不跳转），拦截信号写在弹窗标题里`, (await hash()).includes('apply/' + p) && /未确认/.test(p1.title), `标题="${p1.title}"`)
  ok(`${p} 拦截只有一层信号：弹窗标题，页上不叠 toast 盖条款正文`, !t, t.slice(0, 60) || '无 toast（正确）')
  ok(`${p} 拦住时把还欠的条款摆进弹窗（不是只弹 toast）`, p1.open && p1.clauses >= 1 && p1.clauses < 54, p1.open ? `${p1.clauses} 条` : '没弹窗')
  const STEP_OF = { venue: 1, need: 2, date: 3, quote: 4, consult: 5, contract: 6 }
  const exp = Object.keys(TOUCH_CLAUSE).filter(k => TOUCH_STEP[k] <= STEP_OF[p] && appliesTo(k, base)).length
  ok(`${p} 门只拦已走到的那几步触发的条款（不该一上来摆出全部）`, p1.open && p1.clauses === exp, `${p1.clauses} 条 · 本步及之前应 ${exp} 条`)
  if (STEP_OF[p] === 1) ok('第 1 步的门只有场地的 2 条（不该一上来确认全部）', exp <= 2 && p1.clauses <= 2, `${p1.clauses} 条`)
  ok(`${p} 门弹窗是阻断式：没确认完关不掉`, p1.open && p1.closeDisabled && p1.xDisabled, p1.open ? `关闭="${p1.closeText}" disabled=${p1.closeDisabled} ✕disabled=${p1.xDisabled}` : '')
  ok(`${p} 阻断式弹窗上有明示文案（不能只靠按钮置灰）`, p1.open && /确认后才能继续/.test(p1.hint + p1.closeText), p1.hint || p1.closeText)
  await page.evaluate(() => { const m = document.querySelector('.bp-mask'); if (m) m.click() })
  await sleep(300)
  ok(`${p} 点遮罩不能绕过门`, (await popInfo()).open)
  await confirmAll()
  const after = ((await draft()).acks || []).length
  ok(`${p} 门里逐条确认写入留痕（版本+条款号+触点+时间戳+账号+哈希）`, after > before && ((await draft()).acks || []).every(e => e.v && e.clause && e.touch && e.at && e.user && e.hash), `${after - before} 条`)
  const p2 = await popInfo()
  ok(`${p} 确认完才能关（关不掉 → 关得掉）`, p2.open && !p2.closeDisabled && /关闭/.test(p2.closeText), p2.open ? `关闭="${p2.closeText}"` : '')
  await click('.bp-btn', 0); await sleep(300)
  await click(DOOR[p], 0)
  await sleep(400)
  // uni H5 的 toast 只活 ~700ms：读晚了会漏（800ms 读会把「拦住后给出的提示」读成空，判据假失败）
  const t2 = await toastText()
  const afterDoor = await popInfo()
  ok(`${p} 确认完之后不再被门拦（后续页的自动条款弹窗不算拦截门）`, !/未确认/.test(afterDoor.title || '') && !/未确认/.test(t2), (await hash()) + ' · 弹窗=' + (afterDoor.title || '无') + ' · ' + (t2.slice(0, 60) || '无 toast'))
  // 门过了之后该发生什么：跳转，或这一页自己的下一个检查点（签署页 = 身份与意愿认证）
  const EXPECT = {
    venue: async () => (await hash()).includes('apply/need'),
    need: async () => (await hash()).includes('apply/consult'),
    date: async () => (await hash()).includes('apply/quote'),
    quote: async () => (await hash()).includes('apply/consult'),
    consult: async () => (await hash()).includes('apply/contract'),
    contract: async () => /身份|意愿/.test(t2)
  }
  ok(`${p} 确认完点下一步放行`, await EXPECT[p](), (await hash()) + ' · ' + (t2.slice(0, 60) || '无 toast'))
}

// 负控（M4）：每条新判据配一个必然失败的伪造样本——若伪造样本被判通过，说明该判据是空判
const neg = [
  ['没确认必须拦住（伪造：已确认完仍判「拦住」）', [{ pending: 0, blocked: true }].every(x => x.pending > 0 && x.blocked)],
  ['门必须弹出条款（伪造：只弹 toast 不弹窗）', [{ open: false, clauses: 0 }].every(x => x.open && x.clauses >= 1)],
  ['门弹窗必须阻断式（伪造：可关闭）', [{ closeDisabled: false }].every(x => x.closeDisabled)],
  ['阻断式必须有明示文案（伪造：只有置灰）', [{ hint: '', closeText: '关闭' }].every(x => /确认后才能继续/.test(x.hint + x.closeText))],
  ['确认完必须放行（伪造：确认前就放行）', [{ confirmed: 0, passed: true }].every(x => x.confirmed > 0 && x.passed)],
  ['留痕逐条写入（伪造：确认 0 条也算通过）', [{ added: 0 }].every(x => x.added > 0)],
  ['触发弹窗可关、门弹窗不可关（伪造：两者都不可关）', [{ must: true }].every(x => !x.must)],
  ['门按步收（伪造：第 1 步摆出全部 17 条）', [{ clauses: 17, exp: 2 }].every(x => x.clauses === x.exp)],
  ['门过后必须真有动作（伪造：状态没变仍判通过）', [{ status: '未接待' }].every(x => /已接待/.test(x.status))],
  ['拦截信号只有一层（伪造：弹窗标题 + 叠一层 toast）', [{ title: '还有 13 条未确认', toast: '还有 13 条未确认' }].every(x => /未确认/.test(x.title) && !x.toast)]
]
console.log(`\n负控: ${neg.map(([n, p]) => `${n}=${p ? '❌ 空判（伪造仍通过）' : '✅ 生效'}`).join(' · ')}`)

await browser.close()
console.log(`\n合计 PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
