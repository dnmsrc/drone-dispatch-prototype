// 探针（不是判据）：图标触控层会不会挤到相邻行。88rpx 可点区塞进行高只有 40rpx 的行里，
// 必然伸出到上下相邻行——只有当两个图标离得足够近（间距 < 88rpx）才会真的重叠。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pages = ['/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract']

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })

const goto = async (url) => {
  const path = url.startsWith('/pages/') ? url : '/pages/' + url
  await page.evaluate(u => { location.hash = '#' + u }, path)
  const ok = await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 300 }).then(() => true).catch(() => false)
  await sleep(1200)
  return ok
}

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
const first = await page.evaluate(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length))
console.log(`起始页渲染：${first ? '是' : '否'} · ${await page.evaluate(() => location.hash)}`)
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[5]; e && e.click() })
await sleep(600)

let worst = null
for (const p of pages) {
  const rendered = await goto(p)
  const dbg = await page.evaluate(() => ({ hash: location.hash, pages: document.querySelectorAll('uni-page').length, bodies: [...document.querySelectorAll('uni-page-body')].map(e => e.getClientRects().length) }))
  console.log(`  debug ${JSON.stringify(dbg)}`)
  const r = await page.evaluate(() => {
    const R = 750 / window.innerWidth
    const vis = [...document.querySelectorAll('.ae')].filter(e => e.getClientRects().length)
    const card = e => e.closest('.card')
    const byCard = new Map()
    for (const e of vis) { const c = card(e); if (!byCard.has(c)) byCard.set(c, []); byCard.get(c).push(e) }
    const out = []
    for (const [c, list] of byCard) {
      for (let i = 0; i < list.length; i++) {
        const rr = list[i].getBoundingClientRect()
        const row = list[i].parentElement.getBoundingClientRect()
        const next = i + 1 < list.length ? list[i + 1].getBoundingClientRect() : null
        out.push({ rowH: Math.round(row.height * R), tapH: Math.round(rr.height * R),
          pitch: next ? Math.round((next.top - rr.top) * R) : null,
          overlap: next ? Math.round(rr.bottom - next.top) : null,
          rowSel: (list[i].parentElement.className || '').toString().slice(0, 20) })
      }
    }
    return out
  })
  const minPitch = Math.min(...r.filter(x => x.pitch !== null).map(x => x.pitch), Infinity)
  const hits = r.filter(x => x.overlap !== null && x.overlap > 0)
  console.log(`${p}: ${rendered ? '已渲染' : '未渲染'} · ${r.length} 个图标 · 同卡片内最小间距 ${minPitch === Infinity ? '—' : minPitch + 'rpx'} · 重叠 ${hits.length}`)
  if (minPitch !== Infinity && (!worst || minPitch < worst.pitch)) worst = { page: p, pitch: minPitch }
}
console.log(`\n最紧的一处：${worst ? worst.page + ' 间距 ' + worst.pitch + 'rpx（阈值 88）' : '无相邻图标'}`)
await browser.close()
