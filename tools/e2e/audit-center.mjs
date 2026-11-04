// 按钮文字几何居中审计（2026-11-03：用户指出「我的预约」空态按钮文字没居中）
// 判据：控件内「内容块」（文本节点 + 子元素的 union bbox）中心 vs 控件盒中心，
//       垂直/水平偏差 > 1.5px 判定不居中。
// 特例：.mine-link / .kv 这类「左侧标题 + 右侧箭头(margin-left:auto)」的行式入口是左对齐设计，跳过。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEF = ['/pages/index/index', '/pages/apply/need', '/pages/apply/venue', '/pages/apply/date',
  '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay',
  '/pages/apply/progress', '/pages/consult/index', '/pages/user/index', '/pages/order/list',
  '/pages/order/result', '/pages/apply/disclosure']
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : DEF
const SKIP = /mine-link|kv|row|step-bar|stepbar|seg|tab|navbar|topbar|nav-/

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000']
})
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 812 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 120)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

const audit = () => page.evaluate((SKIPSRC) => {
  const SKIP = new RegExp(SKIPSRC, 'i')
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  if (!top) return []
  const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
  const SEL = 'uni-button, .entry-chip, .chip, .code-btn'
  const unionOf = b => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const add = r => { if (r.width || r.height) { x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom) } }
    const wk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT)
    while (wk.nextNode()) {
      const n = wk.currentNode
      if (!n.textContent.trim()) continue
      const rg = document.createRange(); rg.selectNodeContents(n); add(rg.getBoundingClientRect())
    }
    for (const k of b.children) if (vis(k)) add(k.getBoundingClientRect())
    return x1 > x0 ? { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } : null
  }
  const out = []
  for (const b of [...top.querySelectorAll(SEL)].filter(vis)) {
    const cls = String(b.className || '').trim()
    if (SKIP.test(cls)) continue
    const u = unionOf(b); if (!u) continue
    const r = b.getBoundingClientRect()
    const txt = (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 16)
    out.push({
      cls: cls.slice(0, 26) || b.tagName.toLowerCase(), txt,
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      dh: +(u.cx - (r.left + r.width / 2)).toFixed(1),
      dv: +(u.cy - (r.top + r.height / 2)).toFixed(1)
    })
  }
  return out
}, SKIP.source)

let pages = 0, badPages = 0, badRows = 0
for (const p of PAGES) {
  await page.goto(`${H5}/?t=${Date.now()}#${p}`, { waitUntil: 'networkidle2' })
  await sleep(1300)
  const rows = await audit()
  if (!rows.length) { console.log(`\n${p.replace('/pages/', '')}  无控件`); continue }
  pages++
  const bad = rows.filter(x => Math.abs(x.dv) > 1.5 || Math.abs(x.dh) > 1.5)
  console.log(`\n${p.replace('/pages/', '')}  控件 ${rows.length} · 不居中 ${bad.length}`)
  for (const x of rows) {
    const f = Math.abs(x.dv) > 1.5 || Math.abs(x.dh) > 1.5 ? '❌' : '✅'
    console.log(`  ${f} ${x.cls.padEnd(26)}「${x.txt}」 ${x.w}x${x.h} dh=${x.dh} dv=${x.dv}`)
  }
  badRows += bad.length
  if (bad.length) badPages++
}
console.log(`\n合计 ${pages} 页 · 不居中页 ${badPages} · 不居中控件 ${badRows}`)
await browser.close()
process.exitCode = badRows ? 1 : 0
