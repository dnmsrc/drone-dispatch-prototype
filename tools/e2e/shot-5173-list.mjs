// 用户在看的 5173（dev）上的真实样子：我的预约 列表态
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.BASE || 'http://localhost:5173'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1200,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
await page.goto(`${BASE}/#/pages/login/login`, { waitUntil: 'networkidle2' }); await sleep(2500)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() }); await sleep(1200)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() }); await sleep(2500)
await page.goto(`${BASE}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' }); await sleep(2500)
await page.screenshot({ path: 'shots/5173-list.png' })
const m = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  const out = [...top.querySelectorAll('uni-button')].filter(e => e.getClientRects().length).map(b => {
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b)
    const rg = document.createRange(); rg.selectNodeContents(b); const tr = rg.getBoundingClientRect()
    return `${String(b.className).slice(0, 22)} ${r.width.toFixed(1)}x${r.height.toFixed(1)} disp=${cs.display} dv=${(tr.top + tr.height / 2 - (r.top + r.height / 2)).toFixed(1)} 「${(b.innerText || '').trim()}」`
  })
  return out
})
console.log(m.join('\n'))
await browser.close()
