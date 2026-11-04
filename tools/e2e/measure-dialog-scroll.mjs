// 量弹窗滚动：单日详情弹窗 / 批量配置弹窗，多视口 + 多时段数
// 判据：overlay 不产生纵向滚动条（overlayScroll <= 0 且 overlayHasBar=false）
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://localhost:8080'
const API = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const login = await (await fetch(`${API}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
})).json()
const token = login.data.token
const admin = login.data.admin
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
const postCfg = async b => (await fetch(`${API}/api/admin/config`, { method: 'PUT', headers: H, body: JSON.stringify(b) })).json()

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 30, args: ['--no-sandbox'] })
const page = await browser.newPage()

const box = () => page.evaluate(() => {
  const overlay = document.querySelector('.el-overlay-dialog')
  const dlg = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  if (!dlg) return null
  const body = dlg.querySelector('.el-dialog__body')
  const r = dlg.getBoundingClientRect()
  return {
    vh: window.innerHeight,
    docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    overlayScroll: overlay ? overlay.scrollHeight - overlay.clientHeight : null,
    overlayHasBar: overlay ? overlay.scrollHeight > overlay.clientHeight + 1 : null,
    dlgTop: Math.round(r.top), dlgBottom: Math.round(r.bottom), dlgH: Math.round(r.height),
    bodyH: body ? Math.round(body.getBoundingClientRect().height) : 0,
    bodyScroll: body ? body.scrollHeight - body.clientHeight : 0,
    lines: [...dlg.querySelectorAll('.bulk-line')].map(x => Math.round(x.getBoundingClientRect().height)),
    slotItems: dlg.querySelectorAll('.slot-item').length,
    slotListH: dlg.querySelector('.slot-list') ? Math.round(dlg.querySelector('.slot-list').getBoundingClientRect().height) : 0,
    tipH: dlg.querySelector('.op-tip') ? Math.round(dlg.querySelector('.op-tip').getBoundingClientRect().height) : 0,
    isReadonly: /操作员角色仅可查看/.test(dlg.innerText),
    text: dlg.innerText.replace(/\s+/g, ' ').slice(0, 200)
  }
})

const openDay = n => page.evaluate(num => {
  const cell = [...document.querySelectorAll('.day-cell:not(.empty)')].find(c => {
    const dn = c.querySelector('.day-num')
    return dn && dn.innerText.trim() === String(num)
  })
  if (cell) { cell.click(); return true }
  return false
}, n)
const clickText = (t, sel = 'button') => page.evaluate((t, sel) => {
  const el = [...document.querySelectorAll(sel)].find(e => e.innerText && e.innerText.trim().includes(t) && e.getClientRects().length)
  if (el) { el.click(); return true }
  return false
}, t, sel)
const closeDialog = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('.el-dialog')].find(x => x.getClientRects().length)
  const btn = d && [...d.querySelectorAll('button')].filter(b => ['关闭', '取消'].includes(b.innerText.trim())).pop()
  if (btn) { btn.click(); return true }
  return false
})

const results = {}
const VIEWPORTS = [[1680, 900], [1366, 768], [1280, 720]]
const SLOT_SETS = {
  '3段': ['19:00-20:00', '20:00-21:00', '21:00-22:00'],
  '6段': ['18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00', '22:00-23:00', '23:00-24:00'],
  '12段': ['00:00-01:00', '01:00-02:00', '02:00-03:00', '03:00-04:00', '04:00-05:00', '05:00-06:00', '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00']
}

for (const [w, h] of VIEWPORTS) {
  for (const [label, slots] of Object.entries(SLOT_SETS)) {
    await postCfg({ defaultSlots: slots })
    await page.setViewport({ width: w, height: h })
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
    await page.evaluate(({ t, admin }) => {
      localStorage.setItem('admin_token', t)
      localStorage.setItem('admin_info', JSON.stringify(admin))
    }, { t: token, admin })
    await page.goto(`${BASE}/schedule`, { waitUntil: 'networkidle2' })
    await sleep(1500)

    // 单日弹窗（可编辑的日子：11-11 有 1 单，11-06 满档）
    await openDay(4)
    await sleep(1200)
    results[`${w}x${h} day ${label}`] = await box()
    await page.screenshot({ path: `../../shots/v7-15-day-${w}x${h}-${label}.png` })
    await closeDialog()
    await sleep(600)

    // 批量弹窗：先选 3 天
    await clickText('多选')
    await sleep(400)
    for (const n of [4, 5, 6]) { await openDay(n); await sleep(250) }
    await clickText('配置接单时段')
    await sleep(1300)
    results[`${w}x${h} bulk3 ${label}`] = await box()
    await page.screenshot({ path: `../../shots/v7-15-bulk3-${w}x${h}-${label}.png` })
    await closeDialog()
    await sleep(500)

    // 批量弹窗：全选本月 27 天（日期预览最长的情形）
    await clickText('全选本月')
    await sleep(2200)
    await clickText('配置接单时段')
    await sleep(1300)
    results[`${w}x${h} bulkAll ${label}`] = await box()
    await page.screenshot({ path: `../../shots/v7-15-bulkall-${w}x${h}-${label}.png` })
    await closeDialog()
    await sleep(400)
    await clickText('退出多选')
    await sleep(400)
  }
}

await postCfg({ defaultSlots: ['19:00-20:00', '20:00-21:00', '21:00-22:00'] })
console.log(JSON.stringify(results, null, 2))
await browser.close()
