// 截图：空态按钮文字居中修复 + 同类页面（我的预约空态/登录 gate/订单空态/首页）
import puppeteer from 'puppeteer-core'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const OUT = 'shots'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000'] })
const page = await browser.newPage()

// 拦截「我的预约」接口 → 空列表，造出用户截图里的空态
await page.setRequestInterception(true)
page.on('request', req => {
  if (/\/api\/consults\/mine/.test(req.url())) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { list: [] } }) })
  } else req.continue()
})

const shots = []
for (const w of [375, 480]) {
  await page.setViewport({ width: w, height: w === 375 ? 812 : 900 })
  // 登录态
  await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' }); await sleep(1000)
  await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() }); await sleep(600)
  await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() }); await sleep(1400)

  await page.goto(`${H5}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' }); await sleep(1500)
  let f = `${OUT}/btn-center-empty-${w}.png`; await page.screenshot({ path: f }); shots.push(f)
  const card = await page.evaluate(() => {
    const c = [...document.querySelectorAll('uni-page-body .gate')].find(e => e.getClientRects().length)
    if (!c) return null
    const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  if (card) {
    f = `${OUT}/btn-center-empty-card-${w}.png`
    await page.screenshot({ path: f, clip: { x: Math.max(0, card.x - 8), y: Math.max(0, card.y - 8), width: Math.min(w, card.w + 16), height: card.h + 16 } })
    shots.push(f)
  }

  // 订单空态按钮（.btn-primary，验证 88rpx 高后没把布局搞坏）
  await page.goto(`${H5}/?t=${Date.now()}#/pages/order/list`, { waitUntil: 'networkidle2' }); await sleep(1400)
  f = `${OUT}/btn-center-order-${w}.png`; await page.screenshot({ path: f }); shots.push(f)
}
console.log(shots.join('\n'))
await browser.close()
