// 探针：把每个控件的 height / min-height / padding / line-height / box-sizing 全打出来，
// 找出「按钮比输入框高 13rpx」到底是哪一条声明造成的（而不是猜）。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 884 })
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

const SELS = ['.text-input', '.code-btn', '.ghost-btn', '.pb-btn', '.chip', '.pay', '.branch', '.seg-item', '.slot', '.cell']
for (const p of ['/pages/apply/contract', '/pages/apply/consult', '/pages/apply/pay', '/pages/apply/need']) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1300)
  const r = await page.evaluate((SELS) => {
    const R = 750 / 430
    const out = []
    for (const sel of SELS) {
      const el = document.querySelector(sel)
      if (!el) continue
      const cs = getComputedStyle(el)
      out.push({
        sel,
        h: Math.round(el.getBoundingClientRect().height * R),
        cssHeight: cs.height, minH: cs.minHeight, pad: `${cs.paddingTop}/${cs.paddingBottom}`,
        lh: cs.lineHeight, fs: Math.round(parseFloat(cs.lineHeight) / (parseFloat(cs.fontSize)) * 100) / 100,
        fsPx: Math.round(parseFloat(cs.fontSize) * R), box: cs.boxSizing, disp: cs.display, align: cs.alignItems
      })
    }
    const row = document.querySelector('.code-row')
    const rowInfo = row ? { h: Math.round(row.getBoundingClientRect().height * R), align: getComputedStyle(row).alignItems } : null
    return { out, rowInfo }
  }, SELS)
  console.log(`\n${p}`)
  for (const o of r.out) console.log(`  ${o.sel.padEnd(11)} 实测 ${String(o.h).padEnd(4)} | css height=${o.cssHeight} minH=${o.minH} pad=${o.pad} line-height=${o.lh} font=${o.fsPx}rpx box=${o.box} display=${o.disp}`)
  if (r.rowInfo) console.log(`  code-row 实测 ${r.rowInfo.h}rpx align=${r.rowInfo.align}`)
}
await browser.close()
