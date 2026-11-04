// H5 端并入后台档期（2026-11-03 口径修正后）：时段是「起-止」整点区间。
//   A 场景：11-20 只开 19-20 / 20-21 两段 → 第三段灰显、写「未开放」
//   B 场景：11-25 整日关闭 → 格子不可选、点击提示该日暂不接单
//   C 场景：11-21 配两段任意区间（18-19 / 22-23）→ 用户端按配置渲染，不写死 19/20/21
// 脚本自己准备并清理演示数据（默认时段两端恢复），跑完核验接口回到默认。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.BASE || 'http://localhost:5173'
const API = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const login = await (await fetch(`${API}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
})).json()
const tok = login.data.token
async function setSlots(dates, slots) {
  const r = await (await fetch(`${API}/api/admin/schedule/slots`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ dates, slots })
  })).json()
  return r
}

const setA = await setSlots(['2026-11-20'], ['19:00-20:00', '20:00-21:00'])
const setB = await setSlots(['2026-11-25'], [])
const setC = await setSlots(['2026-11-21'], ['18:00-19:00', '22:00-23:00'])

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 40, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const pricing = await (await fetch(`${API}/api/config/pricing`)).json()
const venue = pricing.data.venues[0]

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1000)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(700)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1400)

async function setDraft(date) {
  await page.evaluate(({ venue, date, step }) => {
    sessionStorage.setItem('apply_draft', JSON.stringify({
      step,
      need: { droneCount: 200, duration: 15, contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 800 },
      venue, date, slot: '', quote: null, judgment: null, acks: []
    }))
  }, { venue, date, step: 3 })
}

async function openDatePage(date) {
  await setDraft(date)
  await page.goto(`${H5}/#/pages/apply/date`, { waitUntil: 'networkidle2' })
  await sleep(500)
  await page.reload({ waitUntil: 'networkidle2' })
  await page.waitForFunction(() => {
    const b = document.querySelector('uni-page-body')
    return b && b.getClientRects().length && document.querySelectorAll('.slot').length >= 2
  }, { timeout: 15000 })
  await sleep(2200)
}
const clickDay = n => page.evaluate(n => {
  const el = [...document.querySelectorAll('.cell')].find(c => {
    const t = c.querySelector('.day')
    return t && t.innerText.trim() === String(n) && !c.classList.contains('pad')
  })
  if (!el) return { ok: false }
  const disabled = el.classList.contains('off')
  el.click()
  return { ok: true, disabled }
}, n)
const slotState = () => page.evaluate(() => [...document.querySelectorAll('.slot')].map(s => ({
  slot: (s.querySelector('.sl-t') || {}).innerText,
  label: (s.querySelector('.sl-s') || {}).innerText || '',
  dis: s.classList.contains('dis'),
  on: s.classList.contains('on')
})))
const toastText = () => page.evaluate(() => {
  const t = [...document.querySelectorAll('[class*="toast"]')].find(x => x.getClientRects().length)
  return t ? t.innerText.trim() : ''
})

const out = { setup: [setA.msg, setB.msg, setC.msg] }

// ── A：部分时段关闭（19-20 / 20-21 开，21-22 关）
await openDatePage('2026-11-20')
out.A_click20 = await clickDay(20)
await sleep(1200)
out.A_slots = await slotState()
await page.evaluate(() => { const r = document.querySelector('.slot-row'); r && r.scrollIntoView({ block: 'center' }) })
await sleep(700)
await page.screenshot({ path: '../../shots/v7-6-h5-slot-closed.png' })

// ── B：整日关闭
await openDatePage('2026-11-25')
out.B_click25 = await clickDay(25)
await sleep(900)
out.B_toast = await toastText()
out.B_selected = await page.evaluate(() => {
  const c = document.querySelector('.cell.sel') || document.querySelector('.cell.on')
  return c ? c.querySelector('.day').innerText : ''
})
await page.screenshot({ path: '../../shots/v7-7-h5-day-closed.png' })

// ── C：任意区间（18-19 / 22-23）
await openDatePage('2026-11-21')
out.C_click21 = await clickDay(21)
await sleep(1200)
out.C_slots = await slotState()
await page.evaluate(() => { const r = document.querySelector('.slot-row'); r && r.scrollIntoView({ block: 'center' }) })
await sleep(600)
await page.screenshot({ path: '../../shots/v7-8-h5-custom-range.png' })

// ── 清理
const clean = await setSlots(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-25'], null)
out.cleanup = clean.msg
out.apiAfter = (await (await fetch(`${API}/api/schedule?from=2026-11-20&to=2026-11-25`)).json()).data.days.map(d => `${d.date}:${d.slots.join('/')}`)

out.checks = {
  // 时段列表由后台配置驱动：只配两段 → 用户端只看到两段，且都可点（不再留灰掉的第三段）
  A_onlyConfiguredSlots: out.A_slots.length === 2
    && out.A_slots[0].slot === '19:00 – 20:00' && out.A_slots[1].slot === '20:00 – 21:00'
    && out.A_slots.every(x => x.dis === false),
  B_dayDisabled: out.B_click25.disabled === true && out.B_toast.includes('暂不接单'),
  C_customRangeRendered: out.C_slots.length === 2 && out.C_slots[0].slot === '18:00 – 19:00' && out.C_slots[1].slot === '22:00 – 23:00' && out.C_slots.every(s => !s.dis),
  cleaned: out.apiAfter.every(x => x.slice(11) === '19:00-20:00/20:00-21:00/21:00-22:00')
}
out.allPass = Object.values(out.checks).every(Boolean)

await browser.close()
console.log(JSON.stringify(out, null, 2))
