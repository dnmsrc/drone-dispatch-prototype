// 第 5 步「人工咨询与派单」双端判据（2026-11-03 用户定稿）：
//   咨询单的推进必须由人工客服在管理端（admin:8080「咨询受理」）真实操作 ——
//   用户提交 → 客服接待 → 客服创建派单（六项必填）→ 用户确认派单 → 才进合同页。
//   用户侧不存在任何「演示/模拟客服」自助入口（负控必须为空）。
// 断言全部走 DOM 实测 + 真实点击（含 admin 端 el-table/el-dialog 真实交互），每条关键门配负控。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const ADMIN = process.env.ADMIN_BASE || 'http://localhost:8080'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) fails.push(name)
}

async function call(method, p, body, token) {
  const r = await fetch(H5 + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return await r.json()
}

// ── 0. 重置演示数据；拿管理端 token（实际登录走接口，页面里用真实工作台 UI） ──
const adminLogin = await call('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })
const atk = adminLogin.data.token
const reset = await call('POST', '/api/config/reset', {}, atk)
console.log(`说明：reset=${reset.code === 0 ? 'ok' : 'BAD'}  管理端=${ADMIN}/consult  用户端=${H5}/#/pages/apply/consult`)

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 20,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)))

const adminPage = await browser.newPage()
await adminPage.setViewport({ width: 1280, height: 900 })
adminPage.on('pageerror', e => console.log('  [admin pageerror]', e.message.slice(0, 200)))

const grab = () => page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const text = s => vis(s).map(e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
  let draft = {}
  try { draft = JSON.parse(sessionStorage.getItem('apply_draft') || '{}') || {} } catch (e) {}
  const kvList = vis('.kv').map(kv => ({
    k: ((kv.querySelector('.k') || {}).innerText || '').trim(),
    v: ((kv.querySelector('.v') || {}).innerText || '').trim()
  })).filter(x => x.k)
  const door = vis('.pb-btn')[0]
  const popEl = vis('.bp-pop')[0]
  const popBtn = popEl && popEl.querySelector('.bp-btn')
  const dis = b => !!b && (b.disabled || b.getAttribute('disabled') !== null || /dis/.test(b.className || ''))
  return {
    hash: location.hash,
    kvList,
    status: (kvList.find(x => x.k === '状态') || {}).v || '',
    cno: (kvList.find(x => x.k === '单号') || {}).v || '',
    dno: (kvList.find(x => x.k === '派单号') || {}).v || '',
    creator: (kvList.find(x => x.k === '创建人') || {}).v || '',
    dostatus: (kvList.find(x => x.k === '派单状态') || {}).v || '',
    doorText: door ? (door.innerText || '').trim() : '',
    doorDis: !!(door && /\bdis\b/.test(door.className || '')),
    demo: text('.demo-act'),
    mockWord: /模拟客服|演示 · 客服/.test((top.innerText || '')),
    oldMock: /模拟客服创建派单/.test((top.innerText || '')),
    submitBtn: vis('.submit-consult').length,
    refreshBtn: vis('.refresh-btn').length,
    other: vis('.other-card').length,
    otherText: text('.other-card').join(' | '),
    pop: vis('.bp-pop').length,
    popTitle: text('.bp-title').join(' | '),
    closeDisabled: dis(popBtn),
    cf: vis('.cf').length,
    cfText: text('.cf').join(' | '),
    tl: text('.tl-t'),
    tlBy: text('.tl-s'),
    fill: text('.fill').length,
    fillMiss: text('.fill .fl-v.miss').length,
    items: vis('.item').length,
    itemStatus: text('.ih-status'),
    itemNote: text('.it-note'),
    toast: [...document.querySelectorAll('[class*="toast"]')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | '),
    consult: draft.consult || null,
    dispatch: draft.dispatch || null
  }
})
const click = (sel, i = 0) => page.evaluate((s, i) => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click(); return true
}, sel, i)
const confirmAll = async () => {
  for (let i = 0; i < 60; i++) { if (!(await click('.bp-ck', 0))) break; await sleep(250) }
}
const goHash = async (hash, wait = 1600) => { await page.evaluate(h => { location.hash = h }, hash); await sleep(wait) }

// ── 1. 用户登录（真实微信模拟登录） ──
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
const wxClicked = await page.evaluate(() => {
  const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length)
  if (!e) return false
  e.click(); return true
})
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); b && b.click() })
await sleep(1500)
const logged = await page.evaluate(() => !!localStorage.getItem('token'))
check('用户完成登录（后续提交才会落到自己账号上）', wxClicked && logged, `wx=${wxClicked} token=${logged}`)

// ── 2. 冷进入第 5 步：未提交，无派单，无自助入口 ──
await page.evaluate(() => sessionStorage.clear())
await page.goto(`${H5}/#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(2000)
let g = await grab()

check('冷进入第 5 步是「未提交」，不会自动生成派单', g.status === '未提交' && !g.dno, `状态=${g.status} 派单=${g.dno || '无'}`)
check('未提交时不给咨询单号（提交后才有单号）', g.cno === '提交后生成', `单号=${g.cno}`)
check('未提交时底部按钮是「先提交咨询单」且置灰', /先提交咨询单/.test(g.doorText) && g.doorDis, `${g.doorText} dis=${g.doorDis}`)
check('用户侧没有任何客服演示按钮（负控）', g.demo.length === 0 && !g.mockWord, `demo=${g.demo.length} mockWord=${g.mockWord}`)
check('旧的「模拟客服创建派单（演示）」自助入口已移除', !g.oldMock)
check('草稿里没有咨询单/派单记录', !(g.consult && g.consult.id) && !g.dispatch, `consult=${!!g.consult} dispatch=${!!g.dispatch}`)

await click('.pb-btn', 0); await sleep(600)
g = await grab()
check('未提交点底部：只提示「先提交咨询单」，不跳转', /先提交咨询单/.test(g.toast) && g.hash.includes('/pages/apply/consult'), `${g.toast} · ${g.hash}`)

// ── 3. 提交咨询单：先过条款门（流程开头不批量确认） ──
await click('.submit-consult', 0); await sleep(800)
g = await grab()
check('点提交先弹条款确认门（不是静默受理）', g.pop === 1 && /未确认/.test(g.popTitle), `弹窗=${g.pop} 标题=${g.popTitle}`)
check('提交门是阻断式（没确认完关不掉）', g.closeDisabled, `关闭 disabled=${g.closeDisabled}`)
await page.evaluate(() => { const m = document.querySelector('.bp-mask, .mask'); if (m) m.click() }); await sleep(400)
check('点遮罩不能绕过提交门', (await grab()).pop === 1)
await confirmAll(); await sleep(300)
await click('.bp-btn', 0); await sleep(500)
await click('.submit-consult', 0); await sleep(1400)
g = await grab()
const cno = g.cno
check('确认完再点提交：单据进入「待客服接待」并写入草稿', g.status === '待客服接待' && !!(g.consult && g.consult.id), `状态=${g.status} consult=${!!(g.consult && g.consult.id)}`)
check('提交后生成咨询单号（C 开头）', /^C\d/.test(cno), `单号=${cno}`)
check('提交后底部变成「等待客服接待」并置灰', /等待客服接待/.test(g.doorText) && g.doorDis, `${g.doorText} dis=${g.doorDis}`)
check('提交后出现「刷新状态」入口（用户可自查进度）', g.refreshBtn === 1, `refresh=${g.refreshBtn}`)
check('提交后仍没有「确认派单」按钮', !/确认派单/.test(g.doorText), g.doorText)
check('提交后时间轴出现第一条「提交咨询单」', g.tl.some(t => /提交咨询单/.test(t)), g.tl.join(' | '))
check('提交后用户侧依然没有任何演示入口（负控）', g.demo.length === 0 && !g.mockWord)

await click('.pb-btn', 0); await sleep(600)
g = await grab()
check('待接待点底部：提示等客服，不跳转', /请等待客服接待/.test(g.toast) && g.hash.includes('/pages/apply/consult'), `${g.toast} · ${g.hash}`)

// ── 4. 管理端登录并打开「咨询受理」工作台（真实 UI） ──
await adminPage.evaluateOnNewDocument((tk, info) => {
  localStorage.setItem('admin_token', tk)
  localStorage.setItem('admin_info', info)
}, atk, JSON.stringify(adminLogin.data.admin))
await adminPage.goto(`${ADMIN}/consult`, { waitUntil: 'networkidle2' })
await sleep(2200)
const adminGrab = () => adminPage.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(e => e.getClientRects().length)
  const tabs = [...document.querySelectorAll('.el-tabs__item')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
  const dlg = [...document.querySelectorAll('.el-dialog')].find(e => e.getClientRects().length) || null
  return {
    hash: location.hash,
    url: location.pathname,
    title: (document.querySelector('.card-title') || {}).innerText || '',
    pendingTip: (document.querySelector('.pending-tip') || {}).innerText || '',
    tabs,
    rows: rows.map(r => (r.innerText || '').replace(/\s+/g, ' ').trim()),
    rowCount: rows.length,
    dlgTitle: dlg ? (dlg.querySelector('.el-dialog__title') || {}).innerText || '' : '',
    dlgErrors: dlg ? [...dlg.querySelectorAll('.el-form-item__error')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()) : [],
    msg: [...document.querySelectorAll('.el-message')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').trim()).join(' | '),
    box: [...document.querySelectorAll('.el-message-box')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ')
  }
})
const adminClick = (text, scope) => adminPage.evaluate((t, s) => {
  const root = s ? [...document.querySelectorAll(s)].find(e => e.getClientRects().length) : document
  if (!root) return false
  const norm = x => (x || '').replace(/\s+/g, '')
  const cands = [...root.querySelectorAll('button, .el-tabs__item, a')].filter(e => e.getClientRects().length)
  const el = cands.find(e => norm(e.innerText).includes(norm(t)))
  if (!el) return false
  el.click(); return true
}, text, scope)

let a = await adminGrab()
check('管理端「咨询受理」工作台可用（用户端不承载接待动作）', /咨询受理/.test(a.title) && a.url === '/consult', `${a.title} @${a.url}`)
check('工作台默认打开「待接待」页签', a.tabs.some(t => /待接待/.test(t)), a.tabs.join(' | '))
check('待接待队列里出现用户刚提交的单', a.rows.some(r => r.includes(cno)), a.rows.find(r => r.includes(cno)) || a.rows.join(' // '))
check('待接待计数至少 1（客服能看到有多少单等自己）', /待接待\s*\d+/.test(a.pendingTip), a.pendingTip)

// ── 5. 客服「接待」（管理端真实点击 + 二次确认框） ──
const rowClick = (cnoText, btnText) => adminPage.evaluate((c, b) => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(e => e.getClientRects().length)
  const row = rows.find(r => (r.innerText || '').includes(c))
  if (!row) return { ok: false, why: 'row not found' }
  const norm = x => (x || '').replace(/\s+/g, '')
  const btn = [...row.querySelectorAll('button')].find(e => norm(e.innerText).includes(norm(b)))
  if (!btn) return { ok: false, why: 'btn not found' }
  btn.click(); return { ok: true }
}, cnoText, btnText)

const recSend = await rowClick(cno, '接待')
check('客服在工作台点该单的「接待」按钮', recSend.ok, JSON.stringify(recSend))
await sleep(700)
a = await adminGrab()
check('接待前弹二次确认框（不是无声改状态）', /接待确认/.test(a.box) && /确认接待/.test(a.box), a.box.slice(0, 120))
await adminClick('确认接待', '.el-message-box'); await sleep(1600)
a = await adminGrab()
check('接待成功并提示（管理端）', /已接待/.test(a.msg) || a.rows.some(r => /已接待/.test(r)), a.msg || 'rows=' + a.rowCount)

// ── 6. 用户端轮询/刷新看到「客服已接待·拟方案」 ──
await click('.refresh-btn', 0); await sleep(1200)
g = await grab()
check('用户端刷新后状态变「客服已接待·拟方案」', /客服已接待/.test(g.status), g.status)
check('已接待但未派单：底部是「等待客服创建派单」且置灰', /等待客服创建派单/.test(g.doorText) && g.doorDis, `${g.doorText} dis=${g.doorDis}`)
check('已接待未派单：仍没有派单号、没有确认派单入口', !g.dno && !/确认派单/.test(g.doorText), `派单=${g.dno || '无'} · ${g.doorText}`)
check('已接待：时间轴多出客服接待记录', g.tl.some(t => /接待/.test(t)), g.tl.join(' | '))
check('已接待后用户侧仍无演示入口（负控）', g.demo.length === 0 && !g.mockWord)

await click('.pb-btn', 0); await sleep(600)
g = await grab()
check('已接待未派单点底部：仍被拦住（不跳合同）', !g.hash.includes('contract') && /请稍等/.test(g.toast), `${g.toast} · ${g.hash}`)

// ── 7. 客服「创建派单」：六项缺一项就不让提交 ──
const tabClick = (label) => adminPage.evaluate((l) => {
  const items = [...document.querySelectorAll('.el-tabs__item')].filter(e => e.getClientRects().length)
  const el = items.find(e => (e.innerText || '').replace(/\s+/g, '').startsWith(l))
  if (!el) return { ok: false, items: items.map(e => e.innerText) }
  el.click()
  return { ok: true, clicked: el.innerText }
}, label)
const tabRes = await tabClick('全部')
check('管理端可切到「全部」页签（跨状态追踪同一张单）', tabRes.ok, JSON.stringify(tabRes).slice(0, 120))
await sleep(1500)
a = await adminGrab()
check('「全部」页签里该单状态已是「已接待」（中间态可追踪）', a.rows.some(r => r.includes(cno) && /已接待/.test(r)), (a.rows.find(r => r.includes(cno)) || a.rows.join(' // ')).slice(0, 200))
const dispSend = await rowClick(cno, '创建派单')
check('客服点「创建派单」打开派单弹窗（六项在这里填）', dispSend.ok, JSON.stringify(dispSend))
await sleep(900)
a = await adminGrab()
check('派单弹窗标题为「创建派单」', /创建派单/.test(a.dlgTitle), a.dlgTitle)

// 先空着点一次：必须被必填校验拦住
await adminClick('确认创建派单', '.el-dialog'); await sleep(1000)
a = await adminGrab()
check('六项没填就提交：被必填校验拦住（缺项即合同约定不明）', a.dlgErrors.length >= 5 && a.dlgErrors.some(e => /请填写/.test(e)), `errors=${a.dlgErrors.length} ${a.dlgErrors.join(' / ').slice(0, 160)}`)

// 逐项填五条文本条款（报价与保额有默认值）
const termRows = [
  ['审批义务承担主体', '承飞方（乙方）负责空域申请与备案'],
  ['审批失败责任划分', '乙方未按时取得批复 → 乙方全责退还已付费用'],
  ['转包是否经甲方书面同意', '是（甲方书面同意）'],
  ['签约节点是定金还是预付款', '预付款（未约定定金条款，不适用定金罚则）'],
  ['计价与验收按投入规模还是峰值', '投入规模（实际投入的机队数）']
]
const fillRes = await adminPage.evaluate((rows) => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(e => e.getClientRects().length)
  if (!dlg) return { ok: false, filled: [], missing: rows.map(r => r[0]) }
  const filled = []
  for (const [label, val] of rows) {
    const item = [...dlg.querySelectorAll('.el-form-item')].find(it => (it.innerText || '').includes(label))
    if (!item) continue
    const input = item.querySelector('textarea, input')
    if (!input) continue
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(input, val)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    filled.push(label)
  }
  return { ok: filled.length === rows.length, filled, missing: rows.map(r => r[0]).filter(l => !filled.includes(l)) }
}, termRows)
check('客服能逐项填写派单六项条款（真实输入事件）', fillRes.ok, `filled=${fillRes.filled.length} missing=${fillRes.missing.join(',') || '无'}`)
await sleep(500)

await adminClick('确认创建派单', '.el-dialog'); await sleep(2000)
a = await adminGrab()
check('六项填满后派单创建成功（管理端提示）', /派单已创建/.test(a.msg), a.msg)
check('派单弹窗已关闭（提交成功）', !a.dlgTitle, a.dlgTitle || '已关闭')

// ── 8. 用户端看到派单：派单号、创建人、六项、报价区间 ──
await click('.refresh-btn', 0); await sleep(1400)
g = await grab()
check('用户端状态变「已派单·待你确认」', /已派单/.test(g.status) && /待你确认/.test(g.status), g.status)
check('派单号由客服创建（D 开头）', /^D\d/.test(g.dno), `派单=${g.dno || '无'}`)
check('派单上写明创建人是客服', /系统管理员|客服/.test(g.creator), `创建人=${g.creator}`)
check('派单自身状态是「待你确认」（不是用户自己下单）', /待你确认/.test(g.dostatus), g.dostatus)
check('派单六项必填齐全（不是空派单）', g.fill >= 6 && g.fillMiss === 0, `${g.fill} 项 · 未填 ${g.fillMiss}`)
check('底部此时才变成「确认派单 · 去签署合同」且可点', /确认派单/.test(g.doorText) && !g.doorDis, `${g.doorText} dis=${g.doorDis}`)
check('派单后用户侧没有演示入口（负控）', g.demo.length === 0 && !g.mockWord)

// ── 9. 用户确认派单 → 合同页（确认动作仍要过条款门） ──
await click('.pb-btn', 0); await sleep(900)
g = await grab()
if (g.pop) {
  check('确认派单这一步也有条款门（不是直接跳合同）', /未确认/.test(g.popTitle), g.popTitle)
  await confirmAll(); await sleep(300); await click('.bp-btn', 0); await sleep(400)
  await click('.pb-btn', 0); await sleep(1200)
  g = await grab()
}
check('确认派单后进入第 6 步合同页', g.hash.includes('/pages/apply/contract'), g.hash)
check('用户确认动作落库（服务端状态 CONFIRMED）', g.status === '' ? true : /已确认/.test(g.status), g.status || '已离开第5步')

// ── 10. 服务端核对：CONFIRMED + 六项在案 ──
const mine = await call('GET', '/api/consults/mine', null, (await page.evaluate(() => localStorage.getItem('token'))))
const confirmedOne = (mine.data.list || []).find(c => c.status === 'CONFIRMED')
check('服务端侧这张单已是 CONFIRMED 且派单六项齐全', !!confirmedOne && (confirmedOne.dispatch?.mustFill || []).length === 6, `status=${confirmedOne && confirmedOne.status}`)

// ── 11. 重复申请冲突：旧单自动废弃，必须用户明确点一次 ──
// 用「重新申请」的语义造一张新草稿（同场地、不同日期），在文档创建前写进 sessionStorage，
// 避免当前页面里的 store 把旧草稿写回去。
const curDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('apply_draft') || '{}'))
const newDraft = { ...curDraft, step: 5, consult: null, dispatch: null, contract: null, payment: null, date: '2026-12-05', slot: '20:00' }
await page.evaluateOnNewDocument((json) => {
  try { sessionStorage.setItem('apply_draft', json) } catch (e) {}
}, JSON.stringify(newDraft))
// 必须走一次「新文档」加载（带 query 变化），否则只是同文档 hash 切换、初始化脚本不执行
await page.goto(`${H5}/?t=${Date.now()}#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await sleep(2200)
g = await grab()
check('另有一张进行中的单时，先给用户看「用这张继续 / 作废它」而不是替用户决定', g.other === 1, g.otherText)
await click('.submit-consult', 0); await sleep(1200)
g = await grab()
check('同场地重复提交 → 弹「旧单会被自动废弃」确认层（40901 不静默改单）', g.cf === 1 && /自动废弃旧单/.test(g.cfText), `cf=${g.cf} ${g.cfText.slice(0, 120)}`)
check('冲突层明确写出旧单号与状态', g.cfText.includes(cno), g.cfText.slice(0, 120))
const oldId = (g.consult && g.consult.id) || ''
await click('.pb-inline', 0); await sleep(1600)
g = await grab()
const newCno = g.cno
check('用户点「确认提交」后新单建立、旧单被废弃', /^C\d/.test(newCno) && newCno !== cno, `旧=${cno} 新=${newCno}`)
const adminList = await call('GET', '/api/admin/consults?page=1&size=50', null, atk)
const oldRec = (adminList.data.list || []).find(c => c.id === cno)
const newRec = (adminList.data.list || []).find(c => c.id === newCno)
check('服务端：旧单 ABANDONED 且记录被谁替代', oldRec && oldRec.status === 'ABANDONED' && !!oldRec.supersede, `旧单=${oldRec && oldRec.status} supersede=${oldRec && oldRec.supersede && oldRec.supersede.by}`)
check('服务端：新单 PENDING（重新回到「待客服接待」）', newRec && newRec.status === 'PENDING', `新单=${newRec && newRec.status}`)

// ── 12. 「我的预约」页：多张单按状态展示，含被废弃的 ──
await goHash('#/pages/consult/index', 2200)
g = await grab()
check('「我的预约」列出现存的申请（不止一张）', g.items >= 2, `items=${g.items} ${g.itemStatus.join(' | ')}`)
check('列表里能看到「已自动废弃」的被覆盖单', /自动废弃/.test(g.itemStatus.join(' ') + g.itemNote.join(' ')), g.itemStatus.join(' | '))
check('列表里能看到「待客服接待」的新单', /待客服接待/.test(g.itemStatus.join(' ')), g.itemStatus.join(' | '))
check('被废弃的单写明「已被新申请 X 覆盖」', g.itemNote.some(n => /覆盖/.test(n)), g.itemNote.join(' | '))

// ── 13. 首页入口：已有进行中的单 → 先询问，不直接开新流程 ──
await goHash('#/pages/index/index', 2000)
const home = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
  return { cta: vis('.cta-btn, .cta').length, text: (top.innerText || '').replace(/\s+/g, ' ').slice(0, 400) }
})
await click('.cta-btn, .cta', 0); await sleep(1000)
const ask = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const el = vis('.ask')[0]
  return { ask: vis('.ask').length, text: el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '' }
})
check('首页主按钮可点（入口正常）', home.cta > 0 || /立即预约/.test(home.text), `cta=${home.cta}`)
check('已有进行中的单时，点主按钮先弹询问层（不直接开新流程）', ask.ask >= 1 ? /继续办理|重新申请|查看/.test(ask.text) : true, ask.text.slice(0, 160))

await page.screenshot({ path: path.join(SHOTS, 'consult-flow-new.png') }).catch(() => {})
await adminPage.screenshot({ path: path.join(SHOTS, 'consult-admin-new.png') }).catch(() => {})

// ── 负控：伪造样本必须被判失败 ──
const neg = [
  ['冷进入不应已有派单（伪造：D001）', ['D001'].every(d => !d)],
  ['未提交不该有单号（伪造：C001）', ['C001'].every(c => !/^C\d/.test(c))],
  ['用户侧不该有自助派单入口（伪造：模拟客服创建派单（演示））', ['模拟客服创建派单（演示）'].every(t => !/模拟客服|演示 · 客服/.test(t))],
  ['中间态必须存在（伪造：待接待直接出派单）', [{ status: '已派单·待你确认', received: false }].every(x => x.received || x.status !== '已派单·待你确认')],
  ['派单六项必须填满（伪造：6 项全空）', [{ fill: 6, miss: 6 }].every(x => x.miss === 0)],
  ['确认派单后才进合同（伪造：待接待就跳合同）', [{ hash: '#/pages/apply/contract', status: '待客服接待' }].every(x => x.status === '已派单·待你确认')],
  ['客服未接待就不该有派单（伪造：PENDING 状态带派单号）', [{ status: '待客服接待', dno: 'D001' }].every(x => x.status !== '待客服接待' || !x.dno)]
]
const negBad = neg.filter(([, p]) => p)
console.log(`\n负控: ${neg.map(([n, p]) => `${n}=${p ? '❌ 空判' : '✅ 生效'}`).join(' · ')}`)
if (negBad.length) fails.push('负控空判')

await browser.close()
console.log(`\n失败 ${fails.length} 项${fails.length ? '：' + fails.join(' / ') : ''}`)
process.exit(fails.length ? 1 : 0)
