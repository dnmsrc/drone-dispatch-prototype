// 专打 run.mjs 剩下的那条：operator 点「开始执行」后「完成订单」按钮不出现。
// 三种可能：(i) 抽屉按钮点击没生效（message box 根本不出现）(ii) 确认+POST 成功但抽屉内容没刷新（应用 bug）
// (iii) POST 被状态机拒（4xx，比如「仅已接单订单可开始执行」）—— 这条探针一次分清楚。
// 用法：cd tools/e2e && node probe-start-exec.mjs
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ADMIN = 'http://localhost:8080'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const out = (label, obj) => console.log('--- ' + label + '\n' + JSON.stringify(obj, null, 1))

// 以下三个辅助函数从 tools/e2e/run.mjs 原样搬来，保证和走查的行为完全一致（判据不改才谈得上复现）
async function type(page, sel, value) {
  return page.evaluate((s, v) => {
    const el = document.querySelector(s); if (!el) return false
    el.focus(); el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur(); return true
  }, sel, value)
}
async function clickText(page, texts, scope = '') {
  return page.evaluate((texts, scope) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return false
    const els = [...root.querySelectorAll('button, .tab, .reason, .slot, .venue-item, .cell, .mini, .oc-item, [class*=btn], .el-button, .el-dropdown-menu__item')]
    for (const t of texts) {
      const el = els.find(e => (e.innerText || '').includes(t) && e.getClientRects().length > 0)
      if (el) { el.click(); return t }
    }
    return false
  }, texts, scope)
}
async function clickExact(page, text, scopeSel) {
  return page.evaluate((t, scope) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return false
    const btn = [...root.querySelectorAll('button, .el-button')].find(x => (x.innerText || '').trim() === t && x.getClientRects().length > 0)
    if (btn) { btn.click(); return true }
    return false
  }, text, scopeSel)
}
const waitSel = (page, sel, timeout = 10000) => page.waitForSelector(sel, { timeout }).then(() => true).catch(() => false)

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 180000, slowMo: 30,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1520,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const net = []
page.on('response', async (r) => {
  const u = r.url()
  if (!u.includes('/api/admin/') && !u.includes('/api/orders')) return
  let body = null
  try { body = await r.json() } catch (e) {}
  const rec = { m: r.request().method(), url: u.replace('http://localhost:8080', ''), status: r.status() }
  if (body) {
    rec.msg = body.message || body.msg || ''
    rec.orderStatus = (body.data && body.data.order && body.data.order.status) || (body.data && body.data.status) || ''
  }
  net.push(rec); console.log('  [net]', rec.m, rec.url, '->', rec.status, rec.msg ? '(' + rec.msg + ')' : '')
})
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 160)))

// 抽屉里所有按钮与状态文本
const drawerState = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-drawer')].find(x => x.getClientRects().length > 0)
  if (!d) return { drawer: false }
  const st = (document.querySelector('.el-descriptions') || d).innerText || ''
  return {
    drawer: true,
    buttons: [...d.querySelectorAll('button, .el-button')].map(b => (b.innerText || '').trim()).filter(Boolean),
    statusLine: (st.match(/状态[^\n]{0,40}/) || [''])[0].replace(/\s+/g, ' ').trim(),
    tags: [...d.querySelectorAll('.el-tag')].map(t => (t.innerText || '').trim()).filter(Boolean).slice(0, 6)
  }
})

// —— 登录（operator，和走查完全一致：账号/密码/验证码 1234）——
await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
await waitSel(page, 'input[placeholder="请输入账号"]')
await type(page, 'input[placeholder="请输入账号"]', 'operator')
await type(page, 'input[placeholder="请输入密码"]', 'operator123')
await type(page, 'input[placeholder="验证码"]', '1234')
await clickText(page, ['登 录', '登录'])
const okLogin = await page.waitForFunction(() => document.body.innerText.includes('管理后台') && location.pathname !== '/login', { timeout: 12000, polling: 200 }).then(() => true).catch(() => false)
out('① 登录', { ok: okLogin, hash: await page.evaluate(() => location.pathname), tokenLen: await page.evaluate(() => ((localStorage.getItem('token') || localStorage.getItem('admin_token') || '') + '').length) })
if (!okLogin) { await browser.close(); process.exit(1) }
await sleep(800)

// —— 找一张「已接单」的订单开详情（不靠首行假设）——
await page.goto(`${ADMIN}/order/list`, { waitUntil: 'networkidle2' })
await waitSel(page, '.el-table__row', 10000)
await sleep(1200)
const picked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(r => r.getClientRects().length > 0)
  const row = rows.find(r => (r.innerText || '').includes('已接单'))
  if (!row) return { err: '没有状态含「已接单」的行', statuses: rows.slice(0, 12).map(r => ((r.innerText || '').match(/待接单|已接单|执行中|已完成|已取消|退款|驳回|拒绝/) || ['?'])[0]) }
  const id = ((r => r)(row.innerText.match(/D\d{8}-\d{4}/) || [''])[0])
  const b = [...row.querySelectorAll('button, .el-button')].find(x => (x.innerText || '').includes('详情'))
  if (!b) return { err: '行内没有详情按钮', id }
  b.click(); return { id }
})
out('② 选中的订单', picked)
if (picked.err) { await browser.close(); process.exit(1) }
await waitSel(page, '.el-drawer', 8000); await sleep(900)
out('③ 开抽屉后（点之前）', await drawerState())

// —— ④ 点「开始执行」——
const clicked = await clickExact(page, '开始执行', '.el-drawer')
await sleep(700)
const box = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.el-message-box')].filter(bx => bx.getClientRects().length > 0)
  if (!boxes.length) return { visible: false, domCount: document.querySelectorAll('.el-message-box').length }
  const b = boxes[0]
  const title = (b.querySelector('.el-message-box__title') || {}).innerText || ''
  const msg = (b.querySelector('.el-message-box__content') || {}).innerText || ''
  return { visible: true, title: title.trim(), message: msg.trim().slice(0, 60), buttons: [...b.querySelectorAll('button')].map(x => (x.innerText || '').trim()) }
})
out('④ 点了「开始执行」之后（clicked=' + clicked + '）', { drawer: await drawerState(), messageBox: box })

// —— ⑤ 在确认框里点确认（和走查同一套文案：['开始执行','确定']）——
const confirmed = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.el-message-box')].filter(bx => bx.getClientRects().length > 0)
  if (!boxes.length) return 'no visible box'
  const btn = [...boxes[0].querySelectorAll('button')].find(x => /开始执行|确定/.test((x.innerText || '').trim()))
  if (!btn) return 'no matching button'
  btn.click(); return (btn.innerText || '').trim()
})
await sleep(1500)
const toast = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.el-message')].filter(x => x.getClientRects().length > 0)
  return t.map(x => (x.innerText || '').trim().slice(0, 50))
})
out('⑤ 确认之后', { confirmed, drawer: await drawerState(), toast, stillOpenBox: await page.evaluate(() => [...document.querySelectorAll('.el-message-box')].filter(bx => bx.getClientRects().length > 0).length) })

// —— ⑥ 再用 API 复核一次订单真实状态（绕开 UI，看状态机到底走到哪一步）——
const apiCheck = await page.evaluate(async (oid) => {
  const tk = localStorage.getItem('token') || localStorage.getItem('admin_token') || ''
  const r = await fetch('/api/admin/orders/' + oid, { headers: { Authorization: 'Bearer ' + tk } })
  const j = await r.json().catch(() => null)
  return { status: r.status, orderStatus: (j && j.data && j.data.order && j.data.order.status) || (j && j.data && j.data.status) || '', timelineTail: ((j && j.data && j.data.order && j.data.order.timeline) || []).slice(-3).map(x => x.text) }
}, picked.id)
out('⑥ GET /api/admin/orders/' + picked.id, apiCheck)
out('⑦ 全程 admin POST/GET 记录', net.slice(-6))

await sleep(1200)
await browser.close()
