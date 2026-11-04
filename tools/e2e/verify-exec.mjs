// 定点验证：接单→开始执行→完成订单（管理端 UI） + 现场照片/评价（H5 UI）
// 订单用 API 直接创建并支付（该链路已在 run.mjs 多次验证）
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const results = []
const log = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

async function api(url, opts = {}, token) {
  const r = await fetch('http://localhost:8090/api' + url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  const d = await r.json()
  if (d.code !== 0) throw new Error(url + ' -> ' + d.msg)
  return d.data
}

// ---- 准备数据 ----
const adminLogin = await api('/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
await api('/config/reset', { method: 'POST', body: {} }, adminLogin.token)
const u = await api('/auth/wechat-login', { method: 'POST', body: {} })
const d = new Date(); d.setDate(d.getDate() + 1)
const performDate = d.toISOString().slice(0, 10)
const order = await api('/orders', { method: 'POST', body: { droneCount: 200, duration: 15, patternPreset: ['heart', 'text'], customText: '生日快乐', performDate, timeSlot: '20:00', venue: { type: 'preset', name: '滨江世纪广场', address: '杭州市滨江区江南大道100号' }, contact: { name: '执行验证', phone: '13800008888' }, idempotencyKey: 'exec-' + Date.now() } }, u.token)
await api(`/orders/${order.order.id}/pay`, { method: 'POST', body: { channel: 'WECHAT', success: true } }, u.token)
const ORDER_ID = order.order.id
console.log('订单已创建并支付:', ORDER_ID)

const b = await puppeteer.launch({ executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 30, args: ['--no-sandbox', '--window-size=1520,1000', '--window-position=0,0'] })
const admin = await b.newPage()
await admin.setViewport({ width: 1440, height: 900 })
admin.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 150)))

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `exec-${name}.png`) }).catch(() => {})

// 管理端登录
await admin.goto('http://localhost:8080/login', { waitUntil: 'networkidle2' })
await admin.evaluate(() => {
  const set = (s, v) => { const el = document.querySelector(s); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })) } }
  set('input[placeholder="请输入账号"]', 'operator')
  set('input[placeholder="请输入密码"]', 'operator123')
  set('input[placeholder="验证码"]', '1234')
  ;[...document.querySelectorAll('button')].find(x => x.innerText.includes('登'))?.click()
})
await sleep(2500)
log('operator 登录', await admin.evaluate(() => location.pathname !== '/login'))

// 抽屉操作
await admin.goto('http://localhost:8080/order/list', { waitUntil: 'networkidle2' })
await sleep(1500)
await admin.evaluate(() => [...document.querySelectorAll('.el-table button')].find(x => x.innerText.includes('详情') && x.getClientRects().length > 0)?.click())
await sleep(1800)

async function drawerAction(btnText, boxText) {
  const has = await admin.evaluate((t) => {
    const btn = [...document.querySelectorAll('.el-drawer button')].find(x => (x.innerText || '').trim() === t && x.getClientRects().length > 0)
    if (btn) { btn.click(); return true } return false
  }, btnText)
  if (!has) return log(`点击「${btnText}」`, false, '按钮不存在')
  await sleep(900)
  const ok = await admin.evaluate((t) => {
    const box = [...document.querySelectorAll('.el-message-box')].find(bx => bx.getClientRects().length > 0)
    if (!box) return 'nobox'
    const btn = [...box.querySelectorAll('button')].find(x => (x.innerText || '').trim() === t)
    if (btn) { btn.click(); return true } return false
  }, boxText)
  if (ok !== true) return log(`确认「${boxText}」`, false, String(ok))
  await sleep(2200)
  return true
}

if (await drawerAction('接单', '确认接单')) {
  const st = await admin.evaluate(() => (document.querySelector('.el-drawer') || {}).innerText?.match(/已接单·待执行/)?.[0])
  log('接单 → 已接单·待执行', !!st)
}
await shot(admin, '01-accepted')

if (await drawerAction('开始执行', '开始执行')) {
  const st = await admin.evaluate(() => (document.querySelector('.el-drawer') || {}).innerText?.match(/执行中/)?.[0])
  log('开始执行 → 执行中', !!st)
}
await shot(admin, '02-inservice')

// 完成订单（无确认框，弹窗内按钮）
const hasComplete = await admin.evaluate(() => {
  const btn = [...document.querySelectorAll('.el-drawer button')].find(x => (x.innerText || '').trim() === '完成订单' && x.getClientRects().length > 0)
  if (btn) { btn.click(); return true } return false
})
await sleep(1200)
await shot(admin, '03-complete-dialog')
if (hasComplete) {
  const done = await admin.evaluate(() => {
    const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length > 0)
    if (!dlg) return 'nodlg'
    const btn = [...dlg.querySelectorAll('button')].find(x => x.innerText.includes('自动生成'))
    if (btn) { btn.click(); return true } return false
  })
  await sleep(2500)
  const st = await admin.evaluate(() => (document.querySelector('.el-drawer') || {}).innerText?.match(/已完成/)?.[0])
  log('完成订单（自动生成照片）→ 已完成', !!st, String(done))
  await shot(admin, '04-completed')
}

// ---- H5：现场照片 + 评价 ----
const h5 = await b.newPage()
await h5.setViewport({ width: 480, height: 900 })
await h5.goto('http://localhost:8090/#/pages/index/index', { waitUntil: 'networkidle2' })
await h5.evaluate((token, user) => { localStorage.setItem('token', token); localStorage.setItem('user', user) }, u.token, JSON.stringify(u.user))

await h5.goto(`http://localhost:8090/#/pages/order/gallery?id=${ORDER_ID}`, { waitUntil: 'networkidle2' })
await h5.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
const gal = await h5.evaluate(() => ({ photos: document.querySelectorAll('.photo-grid image, .photo-grid img').length || document.querySelectorAll('[class*=photo]').length, text: document.body.innerText.slice(0, 60) }))
log('H5 现场照片页', gal.photos > 0 || gal.text.includes('照片'), JSON.stringify(gal).slice(0, 100))
await shot(h5, '05-gallery')

await h5.goto(`http://localhost:8090/#/pages/order/review?id=${ORDER_ID}`, { waitUntil: 'networkidle2' })
await h5.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await h5.evaluate(() => { const s = document.querySelectorAll('.star'); s[4] && s[4].click() })
await sleep(300)
await h5.evaluate(() => {
  const ta = document.querySelector('textarea')
  if (ta) { ta.focus(); ta.value = '定点验证：执行与回传链路完整，效果很棒！'; ta.dispatchEvent(new Event('input', { bubbles: true })) }
})
await shot(h5, '06-review')
await h5.evaluate(() => { const b = [...document.querySelectorAll('button, [class*=btn]')].find(x => x.innerText.includes('提交评价') && x.getClientRects().length > 0); b && b.click() })
await sleep(2200)
const reviewed = await api(`/orders/${ORDER_ID}`, {}, u.token)
log('H5 提交评价 → 已评价', reviewed.order.status === 'REVIEWED', 'status=' + reviewed.order.status)
await shot(h5, '07-reviewed')

await b.close()
const failed = results.filter(r => !r.ok)
console.log(`\n===== 定点验证完成：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length ? 2 : 0)
