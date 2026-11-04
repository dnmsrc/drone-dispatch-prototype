// 未登录态检查：登录页 wx-btn（svg + 文字组合）、我的预约 gate 的「去登录」按钮
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 375, height: 812 })

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' }); await sleep(1500)
const m = await page.evaluate(() => {
  const b = [...document.querySelectorAll('uni-button')].find(e => e.getClientRects().length)
  if (!b) return null
  const r = b.getBoundingClientRect()
  const kids = [...b.children].map(k => { const kr = k.getBoundingClientRect(); return { tag: k.tagName.toLowerCase(), cx: +(kr.left + kr.width / 2 - (r.left + r.width / 2)).toFixed(1), cy: +(kr.top + kr.height / 2 - (r.top + r.height / 2)).toFixed(1) } })
  const rg = document.createRange(); rg.setStart(b, 0); rg.setEnd(b, b.childNodes.length)
  const tr = rg.getBoundingClientRect()
  return { cls: String(b.className), w: +r.width.toFixed(1), h: +r.height.toFixed(1), disp: getComputedStyle(b).display,
    jc: getComputedStyle(b).justifyContent, union: { dh: +(tr.left + tr.width / 2 - (r.left + r.width / 2)).toFixed(1), dv: +(tr.top + tr.height / 2 - (r.top + r.height / 2)).toFixed(1) }, kids }
})
console.log('login wx-btn:', JSON.stringify(m))
await page.screenshot({ path: 'shots/login-btn.png' })

await page.goto(`${H5}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' }); await sleep(1500)
const g = await page.evaluate(() => {
  const b = [...document.querySelectorAll('uni-page-body uni-button')].find(e => e.getClientRects().length)
  if (!b) return null
  const r = b.getBoundingClientRect()
  const rg = document.createRange(); rg.setStart(b, 0); rg.setEnd(b, b.childNodes.length)
  const tr = rg.getBoundingClientRect()
  return { cls: String(b.className), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    dh: +(tr.left + tr.width / 2 - (r.left + r.width / 2)).toFixed(1), dv: +(tr.top + tr.height / 2 - (r.top + r.height / 2)).toFixed(1) }
})
console.log('consult gate 去登录:', JSON.stringify(g))
await page.screenshot({ path: 'shots/gate-login-btn.png' })
await browser.close()
