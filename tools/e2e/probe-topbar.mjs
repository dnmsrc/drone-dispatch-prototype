// 顶部栏在滚动时会不会跟着走 —— 用 DOM 实测（rect + 谁在滚），不看像素图
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

async function probe(label) {
  const r = await page.evaluate(() => {
    const nb = document.querySelector('.navbar .bar')
    const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))
    const sv = document.querySelector('.uni-scroll-view')
    const inner = sv ? sv.querySelector('.uni-scroll-view-content') : null
    const rect = e => e ? { top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height) } : null
    return {
      hash: location.hash,
      navbar: rect(nb),
      stepbar: rect(bar),
      scrollview: sv ? { top: Math.round(sv.getBoundingClientRect().top), h: Math.round(sv.getBoundingClientRect().height) } : null,
      innerScroll: inner ? inner.scrollTop : null,
      innerScrollable: inner ? inner.scrollHeight > inner.clientHeight : null,
      windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      docScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      pageBody: (() => { const pb = document.querySelector('uni-page-body'); return pb ? { top: Math.round(pb.getBoundingClientRect().top), h: Math.round(pb.getBoundingClientRect().height) } : null })()
    }
  })
  console.log(`\n${label}`)
  console.log('  hash       ', r.hash)
  console.log('  navbar     ', JSON.stringify(r.navbar))
  console.log('  stepbar    ', JSON.stringify(r.stepbar))
  console.log('  scroll-view', JSON.stringify(r.scrollview), 'inner scrollTop=', r.innerScroll, '可滚=', r.innerScrollable)
  console.log('  page-body  ', JSON.stringify(r.pageBody))
  console.log('  窗口可滚=', r.windowScrollable, 'documentElement.scrollTop=', r.docScrollTop, 'body.scrollTop=', r.bodyScrollTop)

  // 滚到底再看顶部栏的 top
  await page.evaluate(() => { const inner = document.querySelector('.uni-scroll-view .uni-scroll-view-content'); if (inner) inner.scrollTop = 99999 })
  await page.evaluate(() => { window.scrollTo(0, 99999) })
  await sleep(400)
  const after = await page.evaluate(() => {
    const nb = document.querySelector('.navbar .bar')
    const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))
    const inner = document.querySelector('.uni-scroll-view .uni-scroll-view-content')
    return {
      navbarTop: nb ? Math.round(nb.getBoundingClientRect().top) : null,
      stepbarTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
      innerScrollTop: inner ? inner.scrollTop : null,
      docScrollTop: document.documentElement.scrollTop
    }
  })
  console.log('  滚之后 navbar top =', after.navbarTop, ' stepbar top =', after.stepbarTop, ' inner scrollTop =', after.innerScrollTop, ' doc scrollTop =', after.docScrollTop)
  console.log('  判定：顶部栏固定 =', after.navbarTop === r.navbar.top && after.stepbarTop === r.stepbar.top)
}

// 申请流程里的一个内容超屏的页（报价区间）
await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await probe('申请页 · 报价区间（900x1000）')

// 下单页（也是内容超屏）
await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await probe('下单页（900x1000）')

// 手机尺寸
await page.setViewport({ width: 390, height: 700 })
await sleep(600)
await probe('下单页（390x700 手机）')

await browser.close()
