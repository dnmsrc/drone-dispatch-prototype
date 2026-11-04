// 列出每个可点控件的子元素结构（判断全局 display:flex 是否安全）
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEF = ['/pages/index/index', '/pages/apply/need', '/pages/apply/venue', '/pages/apply/date',
  '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay',
  '/pages/apply/progress', '/pages/consult/index', '/pages/user/index', '/pages/order/list',
  '/pages/apply/disclosure', '/pages/login/login']
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : DEF

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 812 })
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' }); await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() }); await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() }); await sleep(1500)

for (const p of PAGES) {
  await page.goto(`${H5}/?t=${Date.now()}#${p}`, { waitUntil: 'networkidle2' }); await sleep(1200)
  const rows = await page.evaluate(() => {
    const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
    if (!top) return []
    const vis = e => e.getClientRects().length
    return [...top.querySelectorAll('uni-button')].filter(vis).map(b => {
      const cs = getComputedStyle(b)
      const kids = [...b.children].map(k => `${k.tagName.toLowerCase()}${k.className ? '.' + String(k.className).trim().split(/\s+/)[0] : ''}`)
      const txtDirect = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length
      return { cls: String(b.className).trim().slice(0, 26), disp: cs.display, w: +b.getBoundingClientRect().width.toFixed(1),
        h: +b.getBoundingClientRect().height.toFixed(1), kids: kids.join(',') || '-', txt: txtDirect,
        txtLen: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 16) }
    })
  })
  console.log(`\n${p.replace('/pages/', '')}  uni-button ${rows.length}`)
  for (const r of rows) console.log(`  ${r.disp.padEnd(5)} ${r.w}x${r.h} kids=${r.kids} txtNodes=${r.txt} | ${r.cls} 「${r.txtLen}」`)
}
await browser.close()
