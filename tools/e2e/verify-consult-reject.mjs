// 客服驳回判据（2026-11-04 补）：docs/consult-workflow.md §管理端
//   「POST /api/admin/consults/:id/reject body { reason }」：非 CONFIRMED 状态可驳回 → REJECTED，
//   驳回原因必须落库（用户可见），且时间轴要留痕；用户侧「我的预约」要能读到「已驳回 + 原因」。
// 全部走真实 UI（admin:8080「咨询受理」的行内「驳回」→ 输入原因 → 确认驳回）+ 真实 API 断言。
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

// 0. 重置演示数据 + 拿双端 token
const adminLogin = await call('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })
const atk = adminLogin.data.token
await call('POST', '/api/config/reset', {}, atk)
const userLogin = await call('POST', '/api/auth/wechat-login', { nickname: '微信用户_8848', avatar: '/api/media/avatar/wechat-demo' })
const utk = userLogin.data.token

// 1. 造一张 PENDING 咨询单（真实用户接口，不是造数据库）
const created = await call('POST', '/api/consults', {
  performDate: '2026-12-05',
  timeSlot: '19:00-20:00',
  venue: { id: 'V01', name: '海埂大坝观景平台', type: 'preset', address: '昆明市西山区海埂大坝', city: '昆明' },
  need: { droneCount: 300, duration: 15, contentMode: 'template', audience: 800 },
  quote: { total: 18800 },
  abandonActive: true
}, utk)
const cid = created.data && created.data.consult && created.data.consult.id
check('用户提交一张咨询单（PENDING）', created.code === 0 && /^C\d/.test(cid || ''), `cid=${cid}`)

// 2. 管理端真实 UI：切「待接待」→ 该单行内「驳回」
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 20,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000', '--window-position=0,0']
})
const adminPage = await browser.newPage()
await adminPage.setViewport({ width: 1280, height: 900 })
adminPage.on('pageerror', e => console.log('  [admin pageerror]', e.message.slice(0, 200)))
await adminPage.evaluateOnNewDocument((tk, info) => {
  localStorage.setItem('admin_token', tk)
  localStorage.setItem('admin_info', info)
}, atk, JSON.stringify(adminLogin.data.admin))
await adminPage.goto(`${ADMIN}/consult`, { waitUntil: 'networkidle2' })
await sleep(2200)

const adminGrab = () => adminPage.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(e => e.getClientRects().length)
  return {
    url: location.pathname,
    title: (document.querySelector('.card-title') || {}).innerText || '',
    tabs: [...document.querySelectorAll('.el-tabs__item')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()),
    rows: rows.map(r => (r.innerText || '').replace(/\s+/g, ' ').trim()),
    msg: [...document.querySelectorAll('.el-message')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').trim()).join(' | '),
    box: [...document.querySelectorAll('.el-message-box')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ')
  }
})
const adminClick = (text, scope) => adminPage.evaluate((t, s) => {
  const root = s ? [...document.querySelectorAll(s)].find(e => e.getClientRects().length) : document
  if (!root) return false
  const norm = x => (x || '').replace(/\s+/g, '')
  const el = [...root.querySelectorAll('button, .el-tabs__item, a')].filter(e => e.getClientRects().length).find(e => norm(e.innerText).includes(norm(t)))
  if (!el) return false
  el.click(); return true
}, text, scope)
const rowClick = (cnoText, btnText) => adminPage.evaluate((c, b) => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(e => e.getClientRects().length)
  const row = rows.find(r => (r.innerText || '').includes(c))
  if (!row) return { ok: false, why: 'row not found' }
  const norm = x => (x || '').replace(/\s+/g, '')
  const btn = [...row.querySelectorAll('button')].find(e => norm(e.innerText).includes(norm(b)))
  if (!btn) return { ok: false, why: 'btn not found' }
  btn.click(); return { ok: true }
}, cnoText, btnText)
const tabClick = label => adminPage.evaluate((l) => {
  const items = [...document.querySelectorAll('.el-tabs__item')].filter(e => e.getClientRects().length)
  const el = items.find(e => (e.innerText || '').replace(/\s+/g, '').startsWith(l))
  if (!el) return { ok: false }
  el.click(); return { ok: true }
}, label)

let a = await adminGrab()
check('管理端「咨询受理」工作台可用', /咨询受理/.test(a.title) && a.url === '/consult', `${a.title} @${a.url}`)
if (!a.rows.some(r => r.includes(cid))) {
  const tab = await tabClick('待接待')
  await sleep(900)
  a = await adminGrab()
  check('切到「待接待」页签能看到这张单', a.rows.some(r => r.includes(cid)), tab.ok ? a.rows.slice(0, 3).join(' // ') : '页签未找到')
}

// 产品口径（2026-11-03 admin 端）：驳回只出现在「已接待（RECEIVED）」的单上，
// 待接待（PENDING）只有「接待」。所以驳回判据必须先真实走一遍客服接待。
const rec = await rowClick(cid, '接待')
check('待接待行点「接待」', rec.ok, JSON.stringify(rec))
await sleep(800)
a = await adminGrab()
check('接待前弹二次确认框（不是无声改状态）', /接待确认/.test(a.box) && /确认接待/.test(a.box), a.box.slice(0, 120))
await adminClick('确认接待', '.el-message-box')
await sleep(1600)
a = await adminGrab()
check('接待成功（该单进入已接待）', /已接待/.test(a.msg) || a.rows.some(r => /已接待/.test(r)), a.msg || a.rows.slice(0, 2).join(' // '))

// 接待成功后该单离开「待接待」队列，切到「已接待」页签才能继续操作它。
await tabClick('已接待')
await sleep(1200)
a = await adminGrab()
check('「已接待」页签里出现该单', a.rows.some(r => r.includes(cid)), a.rows.slice(0, 2).join(' // '))

const rej = await rowClick(cid, '驳回')
check('已接待单行内有「驳回」按钮', rej.ok, JSON.stringify(rej))
await sleep(900)
a = await adminGrab()
check('点驳回先弹原因输入框（不是无声驳回）', /驳回咨询单/.test(a.box) && /请填写驳回原因/.test(a.box), a.box.slice(0, 140))

const REASON = '场地档期冲突，请改约其他日期（自动判据）'
const typed = await adminPage.evaluate((v) => {
  const box = [...document.querySelectorAll('.el-message-box')].find(e => e.getClientRects().length)
  if (!box) return false
  const el = box.querySelector('textarea, input[type="text"]')
  if (!el) return false
  el.value = v
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}, REASON)
check('原因填进输入框（真实 DOM 事件）', typed, REASON.slice(0, 20) + '…')
const confirmBtn = await adminClick('确认驳回', '.el-message-box')
check('客服点「确认驳回」', confirmBtn)
await sleep(1800)
a = await adminGrab()
check('驳回成功并提示（管理端）', /已驳回/.test(a.msg) || a.rows.some(r => /已驳回/.test(r)), a.msg || a.rows.slice(0, 2).join(' // '))

// 3. 服务端断言：状态 REJECTED + 原因落库 + 时间轴留痕
const sv = await call('GET', `/api/admin/consults/${cid}`, null, atk)
const consult = sv.data && (sv.data.consult || sv.data)
check('服务端状态变 REJECTED', consult && consult.status === 'REJECTED', consult ? consult.status : JSON.stringify(sv).slice(0, 120))
check('驳回原因落库（用户可见）', consult && consult.reject && consult.reject.reason === REASON, consult && consult.reject ? consult.reject.reason : JSON.stringify(sv).slice(0, 120))
check('驳回人/时间留痕', consult && consult.reject && consult.reject.by && consult.reject.at, consult && consult.reject ? `${consult.reject.by} · ${consult.reject.at}` : '')
const tl = (consult && consult.timeline) || []
check('时间轴多出一条「客服驳回」记录', tl.some(t => /客服驳回/.test(t.text || '')), tl.map(t => t.text).join(' | ').slice(0, 140))

// 4. 用户侧：我的预约要能看到「已驳回 + 原因」
const mine = await call('GET', '/api/consults/mine', null, utk)
const list = (mine.data && (mine.data.items || mine.data.list)) || []
const one = list.find(x => x.id === cid)
check('用户「我的预约」接口列出这张已驳回单', !!one, one ? `${one.id} · ${one.status} · ${one.statusText}` : `items=${list.length}`)
check('用户侧状态文案是「已驳回」', one && (one.statusText === '已驳回' || /已驳回/.test(one.statusText || '')), one ? one.statusText : '')
check('用户侧能看到驳回原因', one && /场地档期冲突/.test(JSON.stringify(one.reject || one.reason || '')), JSON.stringify(one && (one.reject || one.reason) || '').slice(0, 120))

// 5. 负控：已驳回的单不能再驳回（状态机不可倒退）
const again = await call('POST', `/api/admin/consults/${cid}/reject`, { reason: '再驳一次' }, atk)
check('负控：已驳回的单不能再驳回', again.code !== 0, `code=${again.code} ${again.msg || ''}`)
const empty = await call('POST', `/api/admin/consults/${cid}/reject`, { reason: '' }, atk)
check('负控：驳回原因必填（空原因被拒）', empty.code !== 0, `code=${empty.code} ${empty.msg || ''}`)

await adminPage.screenshot({ path: path.join(SHOTS, 'consult-reject.png') }).catch(() => {})
await browser.close()
console.log(`\n失败 ${fails.length} 项${fails.length ? '：' + fails.join(' / ') : ''}`)
process.exit(fails.length ? 1 : 0)
