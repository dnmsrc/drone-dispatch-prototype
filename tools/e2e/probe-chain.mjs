// 把 scroll-view 的 DOM 链逐层打印：谁有 overflow、谁 scrollHeight > clientHeight，到底谁在滚
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

await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)

const chain = await page.evaluate(() => {
  const host = document.querySelector('uni-scroll-view.body')
  if (!host) return { err: '没有 uni-scroll-view.body' }
  const rows = []
  let el = host
  for (let d = 0; d < 6 && el; d++) {
    const cs = getComputedStyle(el)
    rows.push({
      d,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 40),
      overflowY: cs.overflowY,
      height: cs.height,
      rectH: Math.round(el.getBoundingClientRect().height),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight
    })
    el = el.firstElementChild
  }
  return rows
})
console.log('现状链：')
for (const r of Array.isArray(chain) ? chain : [chain]) console.log(' ', JSON.stringify(r))

// 找到真正带 overflow auto/scroll 的后代
const scroller = await page.evaluate(() => {
  const host = document.querySelector('uni-scroll-view.body')
  if (!host) return null
  const cands = [host, ...host.querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
  return cands.map(e => ({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 40), overflowY: getComputedStyle(e).overflowY, scrollH: e.scrollHeight, clientH: e.clientHeight }))
})
console.log('带 overflow auto/scroll 的后代：', JSON.stringify(scroller))

// 给链上每层加一个「定高 + overflow」的候选方案，看哪一层能滚
await page.evaluate(() => {
  const host = document.querySelector('.page')
  host.style.height = '100vh'
  host.style.overflow = 'hidden'
  const sv = document.querySelector('uni-scroll-view.body')
  sv.style.flex = '1'
  sv.style.minHeight = '0'
  sv.style.height = 'auto'
  const inner = sv.querySelector('.uni-scroll-view')
  if (inner) { inner.style.height = '100%'; inner.style.overflowY = 'auto' }
})
await sleep(400)
const after = await page.evaluate(() => {
  const host = document.querySelector('uni-scroll-view.body')
  const inner = host.querySelector('.uni-scroll-view')
  const rows = []
  let el = host
  for (let d = 0; d < 4 && el; d++) {
    const cs = getComputedStyle(el)
    rows.push({ d, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 30), overflowY: cs.overflowY, rectH: Math.round(el.getBoundingClientRect().height), scrollH: el.scrollHeight, clientH: el.clientHeight, scrollTop: el.scrollTop })
    el = el.firstElementChild
  }
  return rows
})
console.log('定高方案后的链：')
for (const r of after) console.log(' ', JSON.stringify(r))

// 滚一下
await page.evaluate(() => {
  const host = document.querySelector('uni-scroll-view.body')
  const inner = host.querySelector('.uni-scroll-view')
  if (inner) inner.scrollTop = 500
  const c = host.querySelector('.uni-scroll-view-content')
  if (c) c.scrollTop = 500
})
await sleep(400)
const now = await page.evaluate(() => {
  const host = document.querySelector('uni-scroll-view.body')
  const inner = host.querySelector('.uni-scroll-view')
  const c = host.querySelector('.uni-scroll-view-content')
  return {
    navbarTop: Math.round(document.querySelector('.navbar .bar').getBoundingClientRect().top),
    stepbarTop: Math.round([...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller')).getBoundingClientRect().top),
    innerScrollTop: inner.scrollTop,
    contentScrollTop: c.scrollTop,
    docScrollTop: document.documentElement.scrollTop
  }
})
console.log('滚后：', JSON.stringify(now))
await browser.close()
