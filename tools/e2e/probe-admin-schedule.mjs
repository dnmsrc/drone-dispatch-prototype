// 档期管理改版 v2 验证（2026-11-03 用户口径修正）：
//   ① 时段是「起-止」整点区间（可随意配置中间时间），不是三个单点时刻；
//   ② 选好的时段直接渲染成条目，不再用复选框二次勾选；可随意删除/新增；
//   ③ 配置时段只允许选整数（整点），半点值在后端直接拒绝。
// 截图 + 结构化判据；脚本结束前用接口把演示数据恢复成默认，不留脏数据。
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
const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 40, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1680, height: 1000 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })

const out = {}
const txt = async sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }, sel)
const clickText = async (t, sel = 'button') => page.evaluate((t, sel) => {
  const els = [...document.querySelectorAll(sel)]
  const el = els.find(e => e.innerText && e.innerText.trim().includes(t) && e.getClientRects().length)
  if (el) { el.click(); return true }
  return false
}, t, sel)

// ── 登录（直接注入 token，避免演示验证码）
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
await page.evaluate(({ token, admin }) => {
  localStorage.setItem('admin_token', token)
  localStorage.setItem('admin_info', JSON.stringify(admin))
}, { token, admin: login.data.admin })
out.loggedIn = await page.evaluate(() => !!localStorage.getItem('admin_token'))

// ── 档期页
await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
await sleep(1500)
out.hasOldLimit = await page.evaluate(() => document.body.innerText.includes('默认限单数'))
out.gridCells = await page.evaluate(() => document.querySelectorAll('.day-cell:not(.empty)').length)
out.cellSlotsText = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.day-cell')].find(c => c.querySelector('.day-slots'))
  return el ? el.querySelector('.day-slots').innerText.trim() : null
})

// ── 多选：全选本月 → 取消一天
out.multiBtn = await clickText('多选')
await sleep(500)
out.selectMonth = await clickText('全选本月')
await sleep(700)
const beforePick = await page.evaluate(() => document.querySelectorAll('.day-cell.picked').length)
await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.day-cell.picked')]
  if (cells.length) cells[cells.length - 1].click()
})
await sleep(500)
out.deselectOne = { before: beforePick, after: await page.evaluate(() => document.querySelectorAll('.day-cell.picked').length) }

// ── 批量弹窗：时段直接渲染成条目（无复选框、无单点勾选）
out.openBulk = await clickText('配置接单时段')
await sleep(1300)
const slotItems = () => page.evaluate(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length && d.innerText.includes('配置接单时段'))
  if (!dlg) return { visible: false }
  return {
    visible: true,
    items: [...dlg.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim()),
    checkboxes: dlg.querySelectorAll('.el-checkbox').length,
    pickers: dlg.querySelectorAll('.slot-picker .el-select').length,
    text: dlg.innerText.replace(/\s+/g, ' ').slice(0, 240)
  }
})
out.bulkDialog = await slotItems()
await page.screenshot({ path: '../../shots/v7-1-bulk-dialog-slots.png' })

// ── 删除一段：三条 → 两条
const delOk = await page.evaluate(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length && d.innerText.includes('配置接单时段'))
  const btn = dlg && dlg.querySelector('.slot-item .el-button')
  if (btn) { btn.click(); return true }
  return false
})
await sleep(400)
out.afterDeleteOne = { clicked: delOk, items: (await slotItems()).items }

// ── 选择器只给整点选项（"只允许选择整数"）
const openPicker = async idx => {
  await page.evaluate(i => {
    const w = [...document.querySelectorAll('.slot-picker .el-select__wrapper')][i]
    w && w.click()
  }, idx)
  await sleep(450)
}
const visibleOptions = () => page.evaluate(() => [...document.querySelectorAll('.el-select-dropdown__item')]
  .filter(x => x.getClientRects().length).map(x => x.innerText.trim()))

await openPicker(0)
const opts = await visibleOptions()
out.pickerOptions = { count: opts.length, allWholeHour: opts.every(t => /^[0-2]\d:00$/.test(t)), sample: opts.slice(0, 6) }
// 选 18:00 / 19:00 并添加
await page.evaluate(v => {
  const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(x => x.getClientRects().length)
  const el = items.find(x => x.innerText.trim() === v)
  el && el.click()
}, '18:00')
await sleep(400)
await openPicker(1)
await page.evaluate(v => {
  const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(x => x.getClientRects().length)
  const el = items.find(x => x.innerText.trim() === v)
  el && el.click()
}, '19:00')
await sleep(400)
out.addSlot = await clickText('添加时段', '.el-dialog button')
await sleep(800)
out.afterAdd = { clicked: out.addSlot, items: (await slotItems()).items }
await page.screenshot({ path: '../../shots/v7-2-bulk-dialog-added.png' })

// 关闭弹窗、退出多选（不写入）
await clickText('取消', '.el-dialog button')
await sleep(500)
await clickText('退出多选')
await sleep(600)
out.multiExited = await page.evaluate(() => !document.querySelector('.multi-bar'))

// ── 单日弹窗（20 号）：条目式 + 无「单日限单」+ 可删除后保存生效
await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.day-cell:not(.empty)')]
  const el = cells.find(c => !c.classList.contains('past') && c.innerText.trim().startsWith('20'))
  el && el.click()
})
await sleep(1400)
out.dayDialog = await page.evaluate(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length && d.innerText.includes('档期详情'))
  if (!dlg) return { visible: false }
  return {
    visible: true,
    hasLimitField: dlg.innerText.includes('单日限单'),
    hasSlotField: dlg.innerText.includes('可接单时段'),
    items: [...dlg.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim()),
    checkboxes: dlg.querySelectorAll('.el-checkbox').length,
    pickers: dlg.querySelectorAll('.slot-picker .el-select').length
  }
})
await page.screenshot({ path: '../../shots/v7-3-day-dialog-slots.png' })

// 删掉最后一段并保存 → 日历该日应只剩两段
const date20 = await page.evaluate(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length && d.innerText.includes('档期详情'))
  const m = dlg && dlg.innerText.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
})
out.dayDate = date20
await page.evaluate(() => {
  const dlg = [...document.querySelectorAll('.el-dialog')].find(d => d.getClientRects().length && d.innerText.includes('档期详情'))
  const btns = [...dlg.querySelectorAll('.slot-item .el-button')]
  btns[btns.length - 1] && btns[btns.length - 1].click()
})
await sleep(400)
await clickText('保存时段', '.el-dialog button')
await sleep(1600)
out.savedCellText = await page.evaluate(d => {
  const cells = [...document.querySelectorAll('.day-cell:not(.empty)')]
  const el = cells.find(c => c.querySelector('.day-num') && c.querySelector('.day-num').innerText.trim() === '20')
  return el ? { slots: (el.querySelector('.day-slots') || {}).innerText, booked: (el.querySelector('.day-booked') || {}).innerText } : null
}, date20)
await page.screenshot({ path: '../../shots/v7-4-day-saved.png' })

// 恢复默认（清理）
const restored = await (await fetch(`${API}/api/admin/schedule/slots`, {
  method: 'POST', headers: h, body: JSON.stringify({ dates: [date20], slots: null })
})).json()
out.cleanup = restored.msg

// ── 业务配置页：默认可接单时段同样是条目式（无复选框）
await page.goto(`${BASE}/system/config`, { waitUntil: 'networkidle2' })
await sleep(1500)
out.configPage = await page.evaluate(() => ({
  hasDailyLimit: document.body.innerText.includes('每日限单数'),
  hasDefaultSlots: document.body.innerText.includes('默认可接单时段'),
  items: [...document.querySelectorAll('.slot-item .slot-time')].map(e => e.innerText.trim()),
  checkboxes: document.querySelectorAll('.el-checkbox').length,
  pickers: document.querySelectorAll('.slot-picker .el-select').length
}))
await page.screenshot({ path: '../../shots/v7-5-config-slots.png' })

// 判据汇总
out.checks = {
  oldLimitRemoved: out.hasOldLimit === false,
  bulkRendersItemsDirectly: out.bulkDialog.visible && out.bulkDialog.items.length === 3 && out.bulkDialog.checkboxes === 0,
  bulkDeleteWorks: out.afterDeleteOne.items.length === 2,
  addCustomRange: out.afterAdd.items.includes('18:00 – 19:00') && out.afterAdd.items.length === 3,
  wholeHourOnly: out.pickerOptions.allWholeHour && out.pickerOptions.count === 24,
  dayDialogNoLimitNoCheckbox: out.dayDialog.hasLimitField === false && out.dayDialog.checkboxes === 0 && out.dayDialog.items.length === 3,
  savedToOneDay: !!(out.savedCellText && out.savedCellText.slots && out.savedCellText.slots.split('·').length === 2),
  configPageItems: out.configPage.items.length === 3 && out.configPage.checkboxes === 0 && out.configPage.hasDailyLimit === false
}
out.allPass = Object.values(out.checks).every(Boolean)

await browser.close()
console.log(JSON.stringify(out, null, 2))
