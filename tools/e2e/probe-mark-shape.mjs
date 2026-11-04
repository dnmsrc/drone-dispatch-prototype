// 探针（不是判据）：已确认态里 .ae 里到底渲染了什么——判据说 shapeMin=23rpx（像圆），但模板在 done 态应该渲染 .gck（20×12）。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
const clickSel = async (sel, i = 0) => page.evaluate((s, i) => {
  const e = [...document.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)

await clickSel('.venue-item', 3)
await sleep(600)
console.log('确认前：', JSON.stringify(await page.evaluate(() => {
  const e = [...document.querySelectorAll('.ae')].filter(x => x.getClientRects().length)[0]
  return { html: e.innerHTML, cls: e.className }
})))
await clickSel('.bp-ck', 0)
await sleep(400)
await clickSel('.bp-ck', 0)
await sleep(400)
const after = await page.evaluate(() => {
  const R = 750 / window.innerWidth
  const e = [...document.querySelectorAll('.ae')].filter(x => x.getClientRects().length)[0]
  const c = e.querySelector('*')
  const cs = c ? getComputedStyle(c) : null
  const r = c ? c.getBoundingClientRect() : null
  return {
    html: e.innerHTML, cls: e.className,
    childTag: c ? c.tagName + '.' + c.className : '无',
    childRect: r ? `${Math.round(r.width * R)}×${Math.round(r.height * R)}rpx` : '—',
    childBorder: cs ? cs.borderLeftWidth : '—',
    childBg: cs ? cs.backgroundColor : '—',
    childColor: cs ? cs.color : '—'
  }
})
console.log('确认后：', JSON.stringify(after, null, 2))
await browser.close()
