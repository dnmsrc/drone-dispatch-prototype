// 文本列塌陷审计：CJK 没有词边界 → flex 项的 min-content = 1 字，被挤窄就逐字竖排
// 判据口径：文本列实测宽 ≥ 100rpx（约 4 字 @ fs-3），且「行数 > 1 时宽 ≥ 4 字宽」才算正常换行
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

// 用法：node audit-textcol.mjs [页名/页路径...]（不传则跑全部申请页）
// 页名简写（need/venue/...）会自动补成 /pages/apply/x；传全路径也行。
// 注意：Git Bash 会把以 / 开头的参数当路径改写，所以优先用简写。
const ALL = ['/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay', '/pages/apply/progress']
const pages = process.argv.slice(2).length
  ? process.argv.slice(2).map(p => (p.startsWith('/pages/') ? p : '/pages/apply/' + p))
  : ALL
// 2026-11-03 修：原先把 .cost（外层卡片）当文本列测，宽度是整卡片 → 永远 4 字以上、抓不到内部塌陷。
// 改为逐个叶子文本列（.cost-name / .cost-why / .v 等），塌陷才暴露。
const COLS = ['.gk', '.ms-name', '.nd-left', '.nd-name', '.cl-text', '.cb-line', '.sub-col', '.fill', '.check', '.venue-info', '.cn-body', '.k', '.cost-name', '.cost-why', '.grp-name', '.pb-left', '.v', '.note']

for (const p of pages) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1300)
  const r = await page.evaluate((COLS) => {
    const R = 2, out = []
    let n = 0
    for (const sel of COLS) {
      for (const el of document.querySelectorAll(sel)) {
        n++
        const w = Math.round(el.getBoundingClientRect().width * R)
        const h = Math.round(el.getBoundingClientRect().height * R)
        const fs = parseFloat(getComputedStyle(el).fontSize) * R
        const lines = Math.round(h / fs)
        const oneChar = fs // 一个汉字的宽 ≈ 字号
        const charsPerLine = w / oneChar
        const tl = (el.textContent || '').trim().length
        // 只有「需要换行、且每行都不到 4 字」才算塌陷；「推迟」这类 2 字短值宽 2 字是正常单行
        if (w > 0 && charsPerLine < 4 && charsPerLine < tl) out.push({ sel, w, lines: Math.max(1, lines), charsPerLine: +charsPerLine.toFixed(1), text: (el.textContent || '').trim().slice(0, 18) })
      }
    }
    return { out, n }
  }, COLS)
  console.log(`\n${p}  扫描 ${r.n} 个文本列`)
  if (r.out.length) console.log('  逐字竖排风险（每行 < 4 字）: ' + r.out.map(x => `${x.sel} 宽${x.w}rpx/${x.lines}行=${x.charsPerLine}字 «${x.text}»`).join(' | '))
  else console.log('  ✅ 没有文本列被挤到逐字竖排')
}
await browser.close()
