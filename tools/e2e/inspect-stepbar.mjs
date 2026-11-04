// 定向取证：页面上有两个 .bar（NavBar 的导航条 + StepBar 的步骤条），同名撞车导致前一轮测错了元素。
// 这里只测「包含 .scroller 的那个 .bar」，把它的计算样式、子元素、滚动容器逐层打出来。
// 运行：node tools/e2e/inspect-stepbar.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const H5 = process.env.H5_BASE || 'http://localhost:8090'
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p))
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false, protocolTimeout: 240000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 414, height: 896 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 140)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
if (await page.waitForSelector('.wx-btn', { timeout: 8000 }).catch(() => null)) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length > 0); if (b) b.click() })
  await sleep(600)
  await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).catch(() => {})
}

await page.goto(`${H5}/#/pages/apply/need`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)

const dump = await page.evaluate(() => {
  const round = (v) => Math.round(v * 10) / 10
  const r = (el) => {
    const b = el.getBoundingClientRect(); const c = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40),
      disp: c.display, flex: c.flexGrow + '/' + c.flexShrink + '/' + c.flexBasis,
      w: c.width, minW: c.minWidth, maxW: c.maxWidth, ovX: c.overflowX, just: c.justifyContent, order: c.order,
      rect: { l: round(b.left), r: round(b.right), w: round(b.width) },
      cw: el.clientWidth, sw: el.scrollWidth, sl: round(el.scrollLeft),
      inline: (el.getAttribute('style') || '').slice(0, 120)
    }
  }
  const bars = [...document.querySelectorAll('.bar')]
  const bar = bars.find(b => b.querySelector('.scroller')) || null
  if (!bar) return { err: '找不到包含 .scroller 的 .bar', barCount: bars.length, barClasses: bars.map(b => b.className + ' | ' + b.innerHTML.slice(0, 60)) }
  const sc = bar.querySelector('.scroller')
  const chain = [sc, ...sc.querySelectorAll('*')].slice(0, 5).map(r)
  const navs = [...bar.querySelectorAll('.nav')].map(e => ({ off: e.className.includes('off'), ...r(e) }))
  const scrollerList = [...document.querySelectorAll('.scroller')].map(r)
  const canScroll = [...bar.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 10)
    .map(e => ({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 30), cw: e.clientWidth, sw: e.scrollWidth }))
  const steps = [...bar.querySelectorAll('.st')].map(e => { const b = e.getBoundingClientRect(); const dot = e.querySelector('.dot'); const db = dot ? dot.getBoundingClientRect() : null; return { cls: e.className, l: round(b.left), r: round(b.right), w: round(b.width), dotL: db ? round(db.left) : null, dotR: db ? round(db.right) : null } })
  const st = steps[steps.length - 1]
  const scr = chain[0]
  return {
    barCount: bars.length,
    bar: r(bar),
    kids: [...bar.children].map(r),
    chain, scrollerList, navs, canScroll,
    stepsHead: steps.slice(0, 3), stepsTail: steps.slice(-2),
    contentRight: (() => { const s = bar.querySelector('.steps'); return s ? round(s.getBoundingClientRect().right) : null })(),
    stepsCount: steps.length,
    badge: (() => { const b = document.querySelector('#proto-tip-badge'); if (!b) return null; const q = b.getBoundingClientRect(); return { l: round(q.left), t: round(q.top), r: round(q.right), b: round(q.bottom) } })()
  }
})
console.log('===== StepBar 定向取证（need 页）=====')
console.log(JSON.stringify(dump, null, 1))

// 顶部区域截图放大看：步骤条到底长什么样
await page.screenshot({ path: path.join(SHOTS, 'stepbar-closeup.png'), clip: { x: 0, y: 30, width: 414, height: 90 }, timeout: 15000 }).catch(e => console.log('截图失败', e.message.slice(0, 60)))

// 把真正的滚动容器滚到底，再看最后一个点是否贴住可视区右边缘
const test = await page.evaluate(async () => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))
  const round = (v) => Math.round(v)
  const scroller = bar ? bar.querySelector('.scroller') : null
  const cand = bar ? [...bar.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 10) : []
  const t = cand[0] || scroller
  if (!t) return { err: '没有可滚的容器' }
  const before = { tag: t.tagName.toLowerCase(), cls: (t.className || '').toString().slice(0, 30), cw: t.clientWidth, sw: t.scrollWidth }
  for (let i = 0; i < 6; i++) {
    const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
    const right = navs[navs.length - 1]
    if (!right || right.classList.contains('off')) break
    right.click()
    await new Promise(r => setTimeout(r, 300))
  }
  const st = [...bar.querySelectorAll('.st')]
  const last = st[st.length - 1], dot = last && last.querySelector('.dot')
  const scRect = scroller ? scroller.getBoundingClientRect() : null
  const tRect = t.getBoundingClientRect()
  const dr = dot ? dot.getBoundingClientRect() : null
  const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
  return {
    before, afterScrollLeft: round(t.scrollLeft),
    scRect: scRect ? { l: round(scRect.left), r: round(scRect.right), w: round(scRect.width) } : null,
    containerRect: { l: round(tRect.left), r: round(tRect.right), w: round(tRect.width) },
    lastDotRight: dr ? round(dr.right) : null,
    gapLast: dr ? round(tRect.right - dr.right) : null,
    gapScroller: dr && scRect ? round(scRect.right - dr.right) : null,
    rightNavOff: navs.length ? navs[navs.length - 1].className.includes('off') : null,
    rightNavRect: navs.length ? (() => { const q = navs[navs.length - 1].getBoundingClientRect(); return { l: round(q.left), r: round(q.right) } })() : null,
    vw: window.innerWidth,
    docScrollW: document.documentElement.scrollWidth,
    firstDotLeft: (() => { const f = st[0]; const d = f && f.querySelector('.dot'); return d ? round(d.getBoundingClientRect().left) : null })(),
    badgeOverBar: (() => { const b = document.querySelector('#proto-tip-badge'); if (!b || !scRect) return null; const q = b.getBoundingClientRect(); return !(q.bottom <= scRect.top + 1 || q.top >= scRect.bottom - 1 || q.right <= scRect.left || q.left >= scRect.right) })()
  }
})
console.log('\n===== 滚动/贴边/徽章遮挡实测 =====')
console.log(JSON.stringify(test, null, 1))
await page.screenshot({ path: path.join(SHOTS, 'stepbar-closeup-scrolled.png'), clip: { x: 0, y: 30, width: 414, height: 90 }, timeout: 15000 }).catch(() => {})

await browser.close()
