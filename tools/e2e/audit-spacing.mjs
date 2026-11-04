// 间距审计（375x667，1rpx = 0.5px，所以 px*2 = rpx）
// 标准：① 节奏 = 4 的倍数（4/8/12/16/20/24/28/32）② 可点目标 ≥ 88rpx(44px)
//       ③ 卡片左右留白 24rpx、卡片内边距 24rpx、卡片间 24rpx、标题→内容 20rpx
//       ④ 最后一块与固定操作栏之间必须有留白（内容要能滚出来，不能被压住）
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 667 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

const pages = ['/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay', '/pages/apply/progress']
let scanned = 0, offLadder = 0, smallTarget = 0, bottomGapBad = 0

for (const p of pages) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1300)
  const r = await page.evaluate(() => {
    const body = document.querySelector('.body')
    if (!body) return null
    const R = 2 // 375 屏：1rpx = 0.5px → px*2 = rpx
    const bad = [], targets = [], gaps = []
    let n = 0
    const clickable = ['.chip', '.opt', '.slot', '.tier', '.mode', '.addon', '.pay', '.branch', '.code-btn', '.vtab', '.venue-item', '.check', '.cell', '.pb-btn', '.ghost-btn', '.text-input', '.seg-item', '.btn-primary']
    for (const el of body.querySelectorAll('*')) {
      n++
      const cs = getComputedStyle(el)
      for (const k of ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
        const v = parseFloat(cs[k])
        if (!v || !isFinite(v)) continue
        const rpx = Math.round(v * R)
        if (rpx % 4 !== 0) bad.push({ cls: (el.className || el.tagName).toString().slice(0, 22), prop: k, rpx })
      }
      if (clickable.some(c => el.matches(c))) {
        const h = Math.round(el.getBoundingClientRect().height * R)
        if (h > 0 && h < 88) targets.push({ cls: (el.className || '').toString().slice(0, 22), rpx: h })
      }
    }
    // 卡片之间的实测间隙
    const secs = [...body.querySelectorAll('.sec')]
    for (let i = 0; i < secs.length - 1; i++) {
      const a = secs[i].getBoundingClientRect(), b = secs[i + 1].getBoundingClientRect()
      gaps.push({ from: i + 1, to: i + 2, gapRpx: Math.round((b.top - a.bottom) * R) })
    }
    // 标题 → 内容
    const titles = [...body.querySelectorAll('.sec-title')]
    const tg = titles.map(t => {
      const nx = t.nextElementSibling
      if (!nx) return null
      return Math.round((nx.getBoundingClientRect().top - t.getBoundingClientRect().bottom) * R)
    }).filter(v => v !== null)
    // 最后一块与固定操作栏
    const bar = document.querySelector('.price-bar')
    const last = secs[secs.length - 1]
    const bottom = bar && last ? Math.round((bar.getBoundingClientRect().top - last.getBoundingClientRect().bottom) * R) : null
    const side = last ? Math.round(last.getBoundingClientRect().left * R) : null
    const padIn = last ? Math.round(parseFloat(getComputedStyle(last).paddingTop) * R) : null
    return { bad, targets, gaps, tg, bottom, side, padIn, nSec: secs.length, n }
  })
  if (!r) { console.log(`\n${p}: 没有 .body`); continue }
  console.log(`\n${p}`)
  console.log(`  卡片间实测间隙 ${r.gaps.map(g => g.gapRpx).join(',')}rpx · 标题→内容 ${r.tg.join(',')}rpx · 左右留白 ${r.side}rpx · 卡片内边距 ${r.padIn}rpx · 末块到操作栏 ${r.bottom}rpx`)
  if (r.bad.length) { console.log(`  不在 4 的倍数节奏上: ${r.bad.map(b => `${b.cls}.${b.prop}=${b.rpx}`).slice(0, 12).join(' | ')}`); offLadder += r.bad.length }
  if (r.targets.length) { console.log(`  可点目标 < 88rpx: ${r.targets.map(t => `${t.cls}=${t.rpx}`).join(' | ')}`); smallTarget += r.targets.length }
  if (r.bottom !== null && r.bottom < 24) bottomGapBad++
  scanned += r.n
  console.log(`  扫描 ${r.n} 个元素 / ${r.nSec} 个卡片`)
}
console.log(`\n合计扫描 ${scanned} 个元素 · 不在节奏上 ${offLadder} 项 · 可点目标偏小 ${smallTarget} 项 · 末块贴底 ${bottomGapBad} 页`)
await browser.close()
