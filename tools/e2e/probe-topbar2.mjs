// 顶部栏到底是不是被整页滚走 —— 分别量「页外壳 / scroll-view 宿主 / scroll-view 内容」三层，看谁在滚
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
    hash: location.hash,
    navbar: r(document.querySelector('.navbar .bar')),
    stepbar: r([...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))),
    pageBody: r(document.querySelector('uni-page-body')),
    host: r(host),
    inner: r(inner),
    content: r(content),
    contentScrollTop: content ? content.scrollTop : null,
    contentScrollable: content ? content.scrollHeight > content.clientHeight : null,
    windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    docScrollTop: document.documentElement.scrollTop
  }
})

async function probe(label) {
  const a = await snap()
  console.log(`\n${label}`)
  console.log('  hash      ', a.hash)
  console.log('  navbar    ', JSON.stringify(a.navbar))
  console.log('  stepbar   ', JSON.stringify(a.stepbar))
  console.log('  page-body ', JSON.stringify(a.pageBody))
  console.log('  host      ', JSON.stringify(a.host), ' inner', JSON.stringify(a.inner), ' content', JSON.stringify(a.content))
  console.log('  内容可滚=', a.contentScrollable, ' 内容 scrollTop=', a.contentScrollTop, ' 窗口可滚=', a.windowScrollable)
  await page.evaluate(() => { const c = document.querySelector('.uni-scroll-view-content'); if (c) c.scrollTop = 99999; window.scrollTo(0, 99999) })
  await sleep(400)
  const b = await snap()
  console.log(`  滚后：navbar top ${a.navbar && a.navbar.top} → ${b.navbar && b.navbar.top} · stepbar top ${a.stepbar && a.stepbar.top} → ${b.stepbar && b.stepbar.top} · 内容 scrollTop ${b.contentScrollTop} · 窗口 scrollTop ${b.docScrollTop}`)
  const fixed = a.navbar && b.navbar && a.navbar.top === b.navbar.top
  console.log('  顶部栏固定 =', fixed, fixed ? '' : '（被整页滚走）')
}

await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await probe('申请页 · 报价区间（900x1000）')

await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await probe('下单页（900x1000）')

await browser.close()
