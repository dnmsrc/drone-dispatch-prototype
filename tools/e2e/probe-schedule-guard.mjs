// 档期约束 + 条目视觉验证（2026-11-03 用户口径二次修正）：
//   ① 已订时段不可删（榜单无删除按钮 + 锁图标；后端也拒撤回）；
//   ② 已订日期不可设为休整日（按钮置灰 + 后端拒）；
//   ③ 批量配置不允许覆盖已单独配置过的日期，已配置/休整日不可重复选择（多选拦截 + 后端拒）；
//   ④ 条目视觉：撑满弹窗宽度、条间距 12px、右侧操作贴右（右侧不留大片空白）。
// 每项都有结构化判据；结束前清理演示数据。
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
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const post = async (p, b) => (await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(b) })).json()
const daysOf = async m => (await (await fetch(`${API}/api/admin/schedule?month=${m}`, { headers: H })).json()).data.days

const out = {}
const checks = {}

/* ============ A. 接口级三条约束 ============ */
const d0 = await daysOf('2026-11')
const bookedDay = d0.find(x => x.booked > 0 && !x.closed)        // 11-01
const closedDay = d0.find(x => x.closed)                          // 11-10
const bookedSlot = bookedDay && Object.keys(bookedDay.bookedSlots)[0]
out.fixture = { bookedDay: bookedDay && bookedDay.date, bookedSlot, closedDay: closedDay && closedDay.date }

out.A1_close_booked = await post('/api/admin/schedule/close', { date: bookedDay.date, closed: true })
checks.A1 = out.A1_close_booked.code !== 0 && /不能设为休整日/.test(out.A1_close_booked.msg)

// 造一个「已单独配置」的日期（11-16），再批量覆盖它
const D1 = '2026-11-16', D2 = '2026-11-17'
await post('/api/admin/schedule/slots', { dates: [D1], slots: ['18:00-19:00'], mode: 'single' })
out.A2_bulk_overwrite = await post('/api/admin/schedule/slots', { dates: [D1, D2], slots: ['19:00-20:00'], mode: 'bulk' })
checks.A2 = out.A2_bulk_overwrite.code !== 0 && /已单独配置过时段/.test(out.A2_bulk_overwrite.msg)

out.A3_single_rewrite = await post('/api/admin/schedule/slots', { dates: [D1], slots: ['18:00-19:00'], mode: 'single' })
checks.A3 = out.A3_single_rewrite.code === 0

out.A4_bulk_closed = await post('/api/admin/schedule/slots', { dates: [closedDay.date], slots: ['19:00-20:00'], mode: 'bulk' })
checks.A4 = out.A4_bulk_closed.code !== 0 && /休整日/.test(out.A4_bulk_closed.msg)

// 已订时段不可撤回（单日删掉已订段，后端自动保留并回 blocked）
out.A5_drop_booked = await post('/api/admin/schedule/slots', {
  dates: [bookedDay.date],
  slots: bookedDay.slots.filter(s => s !== bookedSlot),
  mode: 'single'
})
checks.A5 = out.A5_drop_booked.code === 0 && (out.A5_drop_booked.data.blocked || []).some(b => b.slot === bookedSlot)
const afterDrop = (await daysOf('2026-11')).find(x => x.date === bookedDay.date)
checks.A6 = afterDrop.slots.includes(bookedSlot)

/* ============ B. UI 判据 ============ */
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 40, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1680, height: 1000 })
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
const openDialog = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  if (!d) return null
  const body = d.querySelector('.el-dialog__body') || d
  const items = [...d.querySelectorAll('.slot-item')]
  const br = body.getBoundingClientRect()
  const rects = items.map(it => {
    const r = it.getBoundingClientRect()
    const btn = it.querySelector('.el-button')
    const icon = it.querySelector('.slot-lock')
    const act = (btn || icon)
    const ar = act ? act.getBoundingClientRect() : null
    return {
      text: it.innerText.replace(/\s+/g, ' ').trim(),
      booked: it.classList.contains('booked'),
      hasDeleteBtn: !!btn,
      hasLock: !!icon,
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top),
      height: Math.round(r.height), width: Math.round(r.width),
      actRight: ar ? Math.round(ar.right) : null
    }
  })
  const gaps = []
  for (let i = 1; i < items.length; i++) {
    gaps.push(Math.round(items[i].getBoundingClientRect().top - items[i - 1].getBoundingClientRect().bottom))
  }
  return {
    title: (d.querySelector('.el-dialog__title') || {}).innerText || '',
    bodyLeft: Math.round(br.left), bodyRight: Math.round(br.right), bodyWidth: Math.round(br.width),
    items: rects, gaps,
    rightGap: rects.map(r => (r.actRight == null ? null : r.right - r.actRight)),
    rightSlack: rects.map(r => r.right - (r.actRight == null ? r.right : r.actRight)),
    text: d.innerText.replace(/\s+/g, ' ').slice(0, 400)
  }
})

// 登录并进入档期页
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
await page.evaluate(({ token, admin }) => {
  localStorage.setItem('admin_token', token)
  localStorage.setItem('admin_info', JSON.stringify(admin))
}, { token, admin: login.data.admin })
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1600)

// ── B1：打开已订日期详情（11-11）：已订条目无删除按钮 + 锁 + 按钮置灰
const openDayByNum = async num => page.evaluate(n => {
  const cell = [...document.querySelectorAll('.day-cell:not(.empty)')].find(c => {
    const dn = c.querySelector('.day-num')
    return dn && dn.innerText.trim() === String(n)
  })
  if (cell) { cell.click(); return true }
  return false
}, num)

await openDayByNum(Number(bookedDay.date.slice(8)))
await sleep(1400)
out.dayDialog = await openDialog()
await page.screenshot({ path: '../../shots/v7-9-day-dialog-guard.png' })

const di = out.dayDialog.items
checks.B1 = !!di && di.filter(i => i.booked).length === 1 &&
  di.filter(i => i.booked).every(i => i.hasDeleteBtn === false && i.hasLock === true)
checks.B2 = !!di && di.filter(i => i.booked).every(i => /不可删/.test(i.text)) &&
  di.filter(i => !i.booked).every(i => i.hasDeleteBtn === true)
checks.B3 = await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  const btn = d && [...d.querySelectorAll('button')].find(b => b.innerText.includes('设为休整日'))
  return !!btn && (btn.disabled || btn.classList.contains('is-disabled'))
})
checks.B4 = out.dayDialog.bodyWidth > 0 && di.every(i => i.width >= out.dayDialog.bodyWidth - 30)
checks.B5 = out.dayDialog.gaps.every(g => g === 12)
checks.B6 = di.every((i, idx) => i.actRight != null && i.right - i.actRight <= 20)

// 关掉单日弹窗
await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  const btn = d && [...d.querySelectorAll('button')].find(b => b.innerText.trim() === '关闭')
  btn && btn.click()
})
await sleep(700)

// ── B2：多选：已单独配置的日期不可重复选择（D1），休整日不可选（11-10）
await clickText('多选')
await sleep(600)

const clickDayNum = async num => page.evaluate(n => {
  const cell = [...document.querySelectorAll('.day-cell:not(.empty)')].find(c => {
    const dn = c.querySelector('.day-num')
    return dn && dn.innerText.trim() === String(n)
  })
  if (cell) { cell.click(); return true }
  return false
}, num)

await clickDayNum(3)   // 今天是 11-03，过去日期
await sleep(400)
out.toastPast = await toastText()
await clickDayNum(Number(D1.slice(8)))
await sleep(500)
out.toastLocked = await toastText()
out.afterLockedClick = await page.evaluate(() => ({
  picked: document.querySelectorAll('.day-cell.picked').length,
  lockedCells: document.querySelectorAll('.day-cell.locked').length,
  badges: [...document.querySelectorAll('.day-cell .badge-set')].map(e => e.innerText.trim())
}))
checks.B7 = /已单独配置过时段/.test(out.toastLocked) && out.afterLockedClick.picked === 0
checks.B8 = out.afterLockedClick.lockedCells > 0 && out.afterLockedClick.badges.includes('已配')
await page.screenshot({ path: '../../shots/v7-11-multi-locked.png' })

// 全选本月：跳过已配置/休整日，提示里有跳过数
await clickText('全选本月')
await sleep(2500)
out.toastRange = await toastText()
out.rangeSel = await page.evaluate(() => {
  const picked = new Set([...document.querySelectorAll('.day-cell.picked')].map(c => c.querySelector('.day-num').innerText.trim()))
  return { count: document.querySelectorAll('.day-cell.picked').length, has16: picked.has('16'), has10: picked.has('10') }
})
checks.B9 = /跳过/.test(out.toastRange) && out.rangeSel.has16 === false && out.rangeSel.has10 === false

// ── B3：批量弹窗视觉（双列网格：同一行横向间距 12、换行纵向间距 12、两端贴边）
await clickText('配置接单时段')
await sleep(1500)
out.bulkDialog = await openDialog()
await page.screenshot({ path: '../../shots/v7-10-bulk-spacing.png' })
const bi = out.bulkDialog.items
checks.B10 = bi.length === 3 &&
  Math.round(bi[1].left - bi[0].right) === 12 &&                        // 同行横向间距
  Math.round(bi[2].top - (bi[0].top + bi[0].height)) === 12             // 换行纵向间距
checks.B11 = Math.abs(bi[1].right - out.bulkDialog.bodyRight) <= 2 &&   // 右列贴右边
  Math.abs(bi[0].width - bi[1].width) <= 1                              // 两列等宽
checks.B12 = bi.every(i => i.actRight != null && i.right - i.actRight <= 20)
// 批量弹窗里点「确认」应被后端拒绝（选中集合里可能还有未拦截的跨月日期，这里只验证 UI 未崩）
await clickText('取消', '.el-dialog button')
await sleep(600)
await clickText('退出多选')
await sleep(600)

// ── B4：休整日单日弹窗：不显示时段编辑区，只给提示
await openDayByNum(Number(closedDay.date.slice(8)))
await sleep(1300)
out.closedDialog = await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  return d ? {
    hasSlotEditor: !!d.querySelector('.slot-list'),
    hasClosedTip: !!d.querySelector('.slot-closed-tip'),
    text: d.innerText.replace(/\s+/g, ' ').slice(0, 200)
  } : null
})
checks.B13 = out.closedDialog && out.closedDialog.hasSlotEditor === false && out.closedDialog.hasClosedTip === true
await page.screenshot({ path: '../../shots/v7-12-closed-day.png' })
await page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  const btn = d && [...d.querySelectorAll('button')].find(b => b.innerText.trim() === '关闭')
  btn && btn.click()
})
await sleep(600)

await browser.close()

/* ============ C. 清理 ============ */
const clean = []
for (const d of [D1, D2]) clean.push((await post('/api/admin/schedule/slots', { dates: [d], slots: null, mode: 'single' })).msg)
out.cleanup = clean
const after = await daysOf('2026-11')
out.stateAfter = {
  closed: after.filter(x => x.closed).map(x => x.date),
  overridden: after.filter(x => x.slotsOverridden).map(x => x.date),
  bookedDaySlots: after.find(x => x.date === bookedDay.date).slots
}
checks.C1 = out.stateAfter.overridden.length === 0 && out.stateAfter.closed.length === 1
checks.C2 = out.stateAfter.bookedDaySlots.includes(bookedSlot)

out.errors = errors
out.checks = checks
out.failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
console.log(JSON.stringify(out, null, 1))
console.log(`\n判据：${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} 通过`, out.failed.length ? `失败: ${out.failed.join(',')}` : '（全绿）')
