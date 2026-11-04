// 在活页面上注入两种布局方案，实测「谁在滚」：
//   A) 现状：.page min-height:100vh（内容驱动高度）→ scroll-view 被内容撑开 → 整页滚，顶栏被滚走
//   B) 方案：.page 定高 100vh + overflow:hidden，.body flex:1 min-height:0 → 内容在 scroll-view 里滚，顶栏不动
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

const snap = () => page.evaluate(() => {
  const r = e => e ? { top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height) } : null
  const host = document.querySelector('uni-scroll-view.body') || document.querySelector('.body')
  const inner = host ? host.querySelector('.uni-scroll-view') : null
  const content = inner ? inner.querySelector('.uni-scroll-view-content') : null
  return {
    navbar: r(document.querySelector('.navbar .bar')),
    stepbar: r([...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))),
    host: r(host),
    contentScrollTop: content ? content.scrollTop : null,
    contentScrollable: content ? content.scrollHeight > content.clientHeight : null,
    windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    docScrollTop: document.documentElement.scrollTop
  }
})

async function run(label, inject) {
  await page.evaluate(inject)
  await sleep(400)
  const a = await snap()
  await page.evaluate(() => { const c = document.querySelector('.uni-scroll-view-content'); if (c) c.scrollTop = 99999; window.scrollTo(0, 99999) })
  await sleep(400)
  const b = await snap()
  console.log(`\n${label}`)
  console.log('  navbar top ', a.navbar && a.navbar.top, '→', b.navbar && b.navbar.top)
  console.log('  stepbar top', a.stepbar && a.stepbar.top, '→', b.stepbar && b.stepbar.top)
  console.log('  scroll-view 高', a.host && a.host.h, '内容可滚=', a.contentScrollable, '滚后内容 scrollTop=', b.contentScrollTop)
  console.log('  窗口可滚=', a.windowScrollable, '滚后窗口 scrollTop=', b.docScrollTop)
  const ok = a.navbar && b.navbar && a.navbar.top === b.navbar.top && b.contentScrollTop > 0
  console.log('  顶栏固定 + 内容能滚 =', ok)
}

await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await run('现状（min-height 内容驱动）', () => {})
await run('方案 B（.page 定高 + .body flex:1 min-height:0）', () => {
  const p = document.querySelector('.page')
  p.style.height = '100vh'
  p.style.overflow = 'hidden'
  const b = document.querySelector('.body')
  b.style.height = 'auto'
  b.style.flex = '1'
  b.style.minHeight = '0'
})
await run('方案 B2（.page 定高 + .body 显式 calc 高）', () => {
  const p = document.querySelector('.page')
  p.style.height = '100vh'
  p.style.overflow = 'hidden'
  const b = document.querySelector('.body')
  b.style.flex = 'none'
  b.style.height = 'calc(100vh - 56px - 78px)'
  b.style.minHeight = '0'
})
await run('方案 C（只把顶栏 sticky，不动布局）', () => {
  const p = document.querySelector('.page')
  p.style.height = ''
  p.style.overflow = ''
  const b = document.querySelector('.body')
  b.style.flex = ''
  b.style.height = ''
  b.style.minHeight = ''
  const nb = document.querySelector('.navbar')
  nb.style.position = 'sticky'
  nb.style.top = '0'
  nb.style.zIndex = '60'
  const sb = [...document.querySelectorAll('.bar')].find(x => x.querySelector('.scroller'))
  if (sb) { const wrap = sb.parentElement; wrap.style.position = 'sticky'; wrap.style.top = '56px'; wrap.style.zIndex = '55'; wrap.style.background = 'var(--bg)' }
})

await browser.close()
