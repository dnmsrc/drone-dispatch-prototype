// 走 UI 进详情（带真实订单数据），窗口滚时 sticky 顶栏必须顶住
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 700 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

await page.goto(`${H5}/#/pages/order/list`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
const clicked = await page.evaluate(() => {
  const c = document.querySelector('.order-card') || document.querySelector('.list .card')
  if (!c) return null
  c.click()
  return (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
})
console.log('点进订单:', clicked)
await sleep(1500)
console.log('hash:', await page.evaluate(() => location.hash))

const snap = () => page.evaluate(() => {
  const nb = document.querySelector('.navbar')
  const r = e => e ? Math.round(e.getBoundingClientRect().top) : null
  const body = document.querySelector('.body')
  return {
    navbarTop: nb ? r(nb) : null,
    pos: nb ? getComputedStyle(nb).position : null,
    contentH: body ? Math.round(body.getBoundingClientRect().height) : null,
    windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    docScrollTop: document.documentElement.scrollTop
  }
})
const a = await snap()
await page.evaluate(() => window.scrollTo(0, 99999))
await sleep(400)
const b = await snap()
console.log(`详情页（真实订单）内容高 ${a.contentH} · 窗口可滚=${a.windowScrollable} · position=${a.pos}`)
console.log(`  navbar top ${a.navbarTop} → ${b.navbarTop} · 窗口 scrollTop=${b.docScrollTop}`)
const ok = a.windowScrollable && b.docScrollTop > 0 && a.navbarTop === b.navbarTop
console.log(`  判定 = ${ok ? '✅ 整页滚时顶栏顶住' : '❌'}`)
await browser.close()
process.exitCode = ok ? 0 : 1
