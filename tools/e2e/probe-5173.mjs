// 量 5173（Vite dev server）上「我的预约」空态按钮的真实样式 —— 判断用户看到的页面为什么没修好
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.BASE || 'http://localhost:5173'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1200,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })

await page.setRequestInterception(true)
page.on('request', req => {
  if (/\/api\/consults\/mine/.test(req.url())) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { list: [] } }) })
  } else req.continue()
})

await page.goto(`${BASE}/#/pages/login/login`, { waitUntil: 'networkidle2' }); await sleep(2500)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() }); await sleep(1200)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() }); await sleep(2500)

await page.goto(`${BASE}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' }); await sleep(2500)

const info = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  if (!top) return { err: 'no page body' }
  const btn = [...top.querySelectorAll('uni-button')].find(e => e.getClientRects().length)
  if (!btn) return { err: 'no button', html: top.innerHTML.slice(0, 200) }
  const r = btn.getBoundingClientRect()
  const cs = getComputedStyle(btn)
  // 纸张里有几份 App.vue 全局样式：查是否命中 display:flex
  const appCss = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
    .filter(r2 => r2.selectorText && /uni-button/.test(r2.selectorText))
    .map(r2 => `${r2.selectorText} { ${(r2.style.cssText || '').slice(0, 120)} }`)
  const rg = document.createRange(); rg.selectNodeContents(btn); const tr = rg.getBoundingClientRect()
  return {
    viewport: { w: innerWidth, dpr: devicePixelRatio, appW: document.getElementById('app')?.getBoundingClientRect().width },
    btn: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), left: +r.left.toFixed(1) },
    cs: { display: cs.display, alignItems: cs.alignItems, justifyContent: cs.justifyContent, lineHeight: cs.lineHeight, minHeight: cs.minHeight, padding: cs.padding },
    text: { h: +tr.height.toFixed(1), dh: +(tr.left + tr.width / 2 - (r.left + r.width / 2)).toFixed(1), dv: +(tr.top + tr.height / 2 - (r.top + r.height / 2)).toFixed(1) },
    appCss
  }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: 'shots/5173-empty.png' })
await browser.close()
