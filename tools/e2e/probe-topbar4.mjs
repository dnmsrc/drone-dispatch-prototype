// 真正的滚动容器是 .uni-scroll-view（overflow:auto），不是 .uni-scroll-view-content。
// 用 B 方案（页外壳定高 + .body flex:1 min-height:0）在多个页面、两种视口实测：顶栏不动 + 内容能滚。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 900, height: 1000 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)
console.log('token=', await page.evaluate(() => (localStorage.getItem('token') || '').slice(0, 12)), 'hash=', await page.evaluate(() => location.hash))

const snap = () => page.evaluate(() => {
  const r = e => e ? { top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height) } : null
  const host = document.querySelector('uni-scroll-view.body') || document.querySelector('.body')
  const sc = host ? host.querySelector('.uni-scroll-view') : null
  return {
    hash: location.hash,
    navbar: r(document.querySelector('.navbar .bar')),
    stepbar: r([...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))),
    host: r(host),
    scrollerOverflow: sc ? getComputedStyle(sc).overflowY : null,
    scrollerScrollable: sc ? sc.scrollHeight > sc.clientHeight : null,
    scrollerScrollTop: sc ? sc.scrollTop : null,
    windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight
  }
})

async function run(label) {
  const a = await snap()
  await page.evaluate(() => { const sc = document.querySelector('.uni-scroll-view'); if (sc) sc.scrollTop = 99999 })
  await sleep(400)
  const b = await snap()
  console.log(`\n${label}`)
  console.log('  hash      ', a.hash)
  console.log('  navbar top ', a.navbar && a.navbar.top, '→', b.navbar && b.navbar.top, ' stepbar top', a.stepbar && a.stepbar.top, '→', b.stepbar && b.stepbar.top)
  console.log('  滚动容器 overflowY=', a.scrollerOverflow, '可滚=', a.scrollerScrollable, '滚后 scrollTop=', b.scrollerScrollTop, '窗口可滚=', a.windowScrollable)
  const fixed = a.navbar && b.navbar && a.navbar.top === b.navbar.top
  const scrolled = b.scrollerScrollTop > 0
  console.log('  顶栏固定 =', fixed, '· 内容真能滚 =', scrolled, '· 判定 =', fixed && scrolled ? '✅' : '❌')
}

const inject = () => page.evaluate(() => {
  const p = document.querySelector('.page')
  if (p) { p.style.height = '100vh'; p.style.overflow = 'hidden'; p.style.display = 'flex'; p.style.flexDirection = 'column' }
  const b = document.querySelector('.body')
  if (b) { b.style.height = 'auto'; b.style.flex = '1'; b.style.minHeight = '0' }
})

for (const p of ['/pages/apply/quote', '/pages/apply/need', '/pages/order/create', '/pages/order/confirm', '/pages/order/list']) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1400)
  await run(`${p}（900x1000）`)
  await inject()
  await run(`${p} 注入 B 后`)
}

await page.setViewport({ width: 390, height: 700 })
await sleep(600)
await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1400)
await inject()
await run('apply/quote 注入 B（390x700 手机）')

await browser.close()
