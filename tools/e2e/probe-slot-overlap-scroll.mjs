// 2026-11-03 用户口径 · 三次修正验证：
//   ① 相同/有覆盖的时段不许选（UI 拦截 + 后端拒绝；首尾相接合法）；
//   ② 多选状态下不要出现内容滚动条（批量弹窗与单日弹窗都要压在视口内）。
// 判据全部结构化，跑完清理演示数据（复位默认时段）。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://localhost:8080'
const API = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const login = await (await fetch(`${API}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
})).json()
if (login.code !== 0) throw new Error('admin 登录失败: ' + login.msg)
const token = login.data.token
const admin = login.data.admin
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const post = async (p, b) => (await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(b) })).json()
const put = async (p, b) => (await fetch(API + p, { method: 'PUT', headers: H, body: JSON.stringify(b) })).json()
const daysOf = async m => (await (await fetch(`${API}/api/admin/schedule?month=${m}`, { headers: H })).json()).data.days

const out = {}
const checks = {}
const DEF = ['19:00-20:00', '20:00-21:00', '21:00-22:00']
const SIX = ['18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00', '22:00-23:00', '23:00-24:00']

/* ================= A. 接口层：重叠一律拒绝，首尾相接放行 ================= */
const D = '2026-11-14'   // 无订单、未休整、未单独配置
out.A1_same = await post('/api/admin/schedule/slots', { dates: [D], slots: ['19:00-20:00', '19:00-20:00'], mode: 'single' })
checks.A1 = out.A1_same.code === 0 // 去重后只剩一段，属于同一段提交两次 → 允许（不是两个不同段）
out.A2_partial = await post('/api/admin/schedule/slots', { dates: [D], slots: ['19:00-21:00', '20:00-22:00'], mode: 'single' })
checks.A2 = out.A2_partial.code !== 0 && /重叠/.test(out.A2_partial.msg)
out.A3_contain = await post('/api/admin/schedule/slots', { dates: [D], slots: ['19:00-22:00', '20:00-21:00'], mode: 'single' })
checks.A3 = out.A3_contain.code !== 0 && /重叠/.test(out.A3_contain.msg)
out.A4_adjacent = await post('/api/admin/schedule/slots', { dates: [D], slots: ['19:00-20:00', '20:00-21:00', '21:00-22:00'], mode: 'single' })
checks.A4 = out.A4_adjacent.code === 0
out.A5_default_overlap = await put('/api/admin/config', { defaultSlots: ['19:00-21:00', '20:00-22:00'] })
checks.A5 = out.A5_default_overlap.code !== 0 && /重叠/.test(out.A5_default_overlap.msg)

// 与「已有订单的时段」重叠：11-11 已订 B（如 20:00-21:00），开一个前后各扩一小时的区间把它整段覆盖 → 后端必须拒
const bookedDay = (await daysOf('2026-11')).find(x => x.date === '2026-11-11')
out.fixture = { bookedDay: bookedDay.date, bookedSlots: Object.keys(bookedDay.bookedSlots) }
const B = out.fixture.bookedSlots[0] || '20:00-21:00'
const bh = Number(B.slice(0, 2))
const pad = n => String(n).padStart(2, '0')
out.A6_cover_booked = await post('/api/admin/schedule/slots', {
  dates: ['2026-11-11'], slots: [`${pad(bh - 1)}:00-${pad(bh + 1)}:00`], mode: 'single'
})
checks.A6 = out.A6_cover_booked.code !== 0 && /重叠/.test(out.A6_cover_booked.msg) && /已有订单/.test(out.A6_cover_booked.msg)

/* ================= B. UI 层 ================= */
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 40, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('[pageerror] ' + e.message.slice(0, 160)))
page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 160)) })

const toastText = () => page.evaluate(() => {
  const t = [...document.querySelectorAll('[class*="toast"], .el-message')].filter(e => e.getClientRects().length)
  return t.map(e => e.innerText.replace(/\s+/g, ' ')).join(' | ')
})
const clickText = async (t, sel = 'button') => page.evaluate((t, sel) => {
  const el = [...document.querySelectorAll(sel)].find(e => e.innerText && e.innerText.trim().includes(t) && e.getClientRects().length)
  if (el) { el.click(); return true }
  return false
}, t, sel)
const openDay = n => page.evaluate(num => {
  const cell = [...document.querySelectorAll('.day-cell:not(.empty)')].find(c => {
    const dn = c.querySelector('.day-num')
    return dn && dn.innerText.trim() === String(num)
  })
  if (cell) { cell.click(); return true }
  return false
}, n)
const closeDialog = async () => {
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
    const btn = d && [...d.querySelectorAll('button')].filter(b => ['关闭', '取消'].includes(b.innerText.trim())).pop()
    if (btn) btn.click()
  })
  await sleep(600)
}

/** 弹窗度量：整页/遮罩不滚动 +（可选）弹窗内部是否被限高 */
const dlgBox = () => page.evaluate(() => {
  const overlay = document.querySelector('.el-overlay-dialog')
  const dlg = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  if (!dlg) return null
  const body = dlg.querySelector('.el-dialog__body')
  const r = dlg.getBoundingClientRect()
  const items = [...dlg.querySelectorAll('.slot-item')]
  const gapsV = []
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].getBoundingClientRect(), b = items[i].getBoundingClientRect()
    gapsV.push({ sameRow: Math.abs(a.top - b.top) < 2, x: Math.round(b.left - a.right), y: Math.round(b.top - a.bottom) })
  }
  return {
    vh: window.innerHeight,
    docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    overlayScroll: overlay ? overlay.scrollHeight - overlay.clientHeight : 0,
    overlayHasBar: overlay ? overlay.scrollHeight > overlay.clientHeight + 1 : false,
    bodyScroll: body ? body.scrollHeight - body.clientHeight : 0,
    bodyHasBar: body ? body.scrollHeight > body.clientHeight + 1 : false,
    top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
    items: items.map(it => it.innerText.replace(/\s+/g, ' ').trim()),
    gaps: gapsV,
    slotText: items.map(it => it.querySelector('.slot-time') && it.querySelector('.slot-time').innerText.trim()),
    gridCols: body && body.querySelector('.slot-list') ? getComputedStyle(body.querySelector('.slot-list')).gridTemplateColumns : null
  }
})

/** 在弹窗里用 el-time-select 挑一个时间（idx=0 开始 / 1 结束） */
async function pickTime(idx, label) {
  await page.evaluate(i => {
    const w = [...document.querySelectorAll('.el-dialog .el-select__wrapper')]
    if (w[i]) w[i].click()
  }, idx)
  await sleep(500)
  const hit = await page.evaluate(t => {
    const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.getClientRects().length)
    const el = items.find(e => e.innerText.trim() === t) || items.find(e => e.innerText.trim().startsWith(t))
    if (el) { el.click(); return true }
    return false
  }, label)
  await sleep(400)
  return hit
}

await page.setViewport({ width: 1366, height: 768 })
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
await page.evaluate(({ t, a }) => {
  localStorage.setItem('admin_token', t)
  localStorage.setItem('admin_info', JSON.stringify(a))
}, { t: token, a: admin })
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1600)

// ── B1：单日（11-04，默认 3 段）——弹窗外层不许出现滚动条
await openDay(4)
await sleep(1200)
out.b1 = await dlgBox()
await page.screenshot({ path: '../../shots/v7-16-day-noscroll.png' })
checks.B1 = !!out.b1 && out.b1.overlayHasBar === false && out.b1.docScroll === 0 && out.b1.bodyHasBar === false &&
  out.b1.bottom <= out.b1.vh - 4
out.b1Items = out.b1 && out.b1.slotText

// ── B2：加一个与已有段重叠的时段（19:00-20:00 已在；加 19:00-21:00）→ 拒绝 + toast
await pickTime(0, '19:00')
await pickTime(1, '21:00')
await clickText('添加时段')
await sleep(700)
out.b2Toast = await toastText()
out.b2After = await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  return [...d.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim())
})
checks.B2 = /重叠/.test(out.b2Toast) && out.b2After.length === 3 && !out.b2After.includes('19:00 – 21:00')
await page.screenshot({ path: '../../shots/v7-19-overlap-blocked.png' })

// ── B3：加一个首尾相接的时段（18:00-19:00）→ 允许（这条是负控的反面：不该被误拦）
await pickTime(0, '18:00')
await pickTime(1, '19:00')
await clickText('添加时段')
await sleep(700)
out.b3Toast = await toastText()
out.b3After = await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  return [...d.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim())
})
checks.B3 = out.b3After.length === 4 && out.b3After.some(t => t.replace(/\s/g, '').includes('18:00–19:00'))

// ── B4：加完全相同的段（19:00-20:00）→ 拒绝
await pickTime(0, '19:00')
await pickTime(1, '20:00')
await clickText('添加时段')
await sleep(700)
out.b4Toast = await toastText()
out.b4After = await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  return [...d.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim())
})
checks.B4 = (/重叠|已在列表/.test(out.b4Toast)) && out.b4After.length === 4

// 恢复该日默认（清掉 B3 加的段）
await post('/api/admin/schedule/slots', { dates: ['2026-11-04'], slots: null, mode: 'single' })
await closeDialog()
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1400)

// ── B5/B6：批量弹窗（3 段 / 6 段）——都不出现滚动条；条目不重叠展示
await put('/api/admin/config', { defaultSlots: DEF })
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1400)
await clickText('多选')
await sleep(500)
for (const n of [4, 5, 6]) { await openDay(n); await sleep(250) }
await clickText('配置接单时段')
await sleep(1300)
out.b5 = await dlgBox()
await page.screenshot({ path: '../../shots/v7-16-bulk-noscroll.png' })
checks.B5 = !!out.b5 && out.b5.overlayHasBar === false && out.b5.docScroll === 0 && out.b5.bodyHasBar === false &&
  out.b5.bottom <= out.b5.vh - 4
checks.B6 = !!out.b5 && out.b5.gaps.filter(g => g.sameRow).every(g => g.x === 12) &&
  out.b5.gaps.filter(g => !g.sameRow).every(g => g.y === 12) &&
  (out.b5.gridCols || '').split(' ').length === 2
await closeDialog()

// 6 段：接口改默认时段后重开页面
await put('/api/admin/config', { defaultSlots: SIX })
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1400)
await clickText('多选')
await sleep(500)
for (const n of [4, 5, 6]) { await openDay(n); await sleep(250) }
await clickText('配置接单时段')
await sleep(1400)
out.b7 = await dlgBox()
await page.screenshot({ path: '../../shots/v7-16-bulk6-noscroll.png' })
checks.B7 = !!out.b7 && out.b7.overlayHasBar === false && out.b7.docScroll === 0 && out.b7.items.length === 6 &&
  out.b7.bottom <= out.b7.vh - 4 && out.b7.bodyHasBar === false
await closeDialog()

/* ================= C. 清理 ================= */
await put('/api/admin/config', { defaultSlots: DEF })
await post('/api/admin/schedule/slots', { dates: ['2026-11-14'], slots: null, mode: 'single' })
await post('/api/admin/schedule/slots', { dates: ['2026-11-11'], slots: null, mode: 'single' })
const restored = await daysOf('2026-11')
out.C1 = { defaultSlots: (await (await fetch(`${API}/api/admin/config`, { headers: H })).json()).data.defaultSlots }
out.C1_has14 = restored.find(x => x.date === '2026-11-14').slotsOverridden
checks.C1 = JSON.stringify(out.C1.defaultSlots) === JSON.stringify(DEF) && out.C1_has14 === false

out.errors = errors.slice(0, 6)
checks.noErrors = errors.filter(e => !/favicon|404 \(Not Found\)/.test(e)).length === 0

const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
console.log('CHECKS ' + Object.entries(checks).map(([k, v]) => `${k}=${v ? 'PASS' : 'FAIL'}`).join(' '))
console.log('FAILED: ' + (failed.length ? failed.join(',') : 'none'))
console.log(JSON.stringify({ fixture: out.fixture, checks, detail: {
  A1: out.A1_same && out.A1_same.code, A2: out.A2_partial.msg, A3: out.A3_contain.msg,
  A4: out.A4_adjacent && out.A4_adjacent.code, A5: out.A5_default_overlap.msg, A6: out.A6_cover_booked.msg,
  b1: out.b1 && { h: out.b1.h, bottom: out.b1.bottom, vh: out.b1.vh, overlay: out.b1.overlayHasBar, bodyBar: out.b1.bodyHasBar },
  b2: out.b2Toast, b3: out.b3After, b4: out.b4After,
  b5: out.b5 && { h: out.b5.h, bottom: out.b5.bottom, vh: out.b5.vh, overlay: out.b5.overlayHasBar, bodyBar: out.b5.bodyHasBar, grid: out.b5.gridCols, gaps: out.b5.gaps },
  b7: out.b7 && { h: out.b7.h, bottom: out.b7.bottom, vh: out.b7.vh, overlay: out.b7.overlayHasBar, bodyBar: out.b7.bodyHasBar },
  errors: out.errors
} }, null, 2))
await browser.close()
process.exit(failed.length ? 1 : 0)
