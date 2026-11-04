// 退款试算「已发生成本清单」行内文字列实测：.cost 必须两行结构，
// 名称/金额在第一行、可扣除说明独占第二行，任何文本列不得被压到 <4 字宽（逐字竖排）。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 30, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1000)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(700)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

await page.goto(`${H5}/#/pages/apply/progress`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1600)

const has = await page.evaluate(() => !!document.querySelector('.cost-list'))
console.log('cost-list present:', has)
if (!has) { await page.screenshot({ path: '../../shots/v5-7-progress-empty.png' }); await browser.close(); process.exit(1) }

// 滚到成本清单
await page.evaluate(() => { const el = document.querySelector('.cost-list'); if (el) el.scrollIntoView({ block: 'center' }) })
await sleep(700)

const m = await page.evaluate(() => {
  const R = 2, r = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x * R), y: Math.round(b.y * R), w: Math.round(b.width * R), h: Math.round(b.height * R) } }
  const out = []
  for (const c of document.querySelectorAll('.cost')) {
    const name = c.querySelector('.cost-name'), amt = c.querySelector('.cost-amt'), why = c.querySelector('.cost-why')
    const fs3 = parseFloat(getComputedStyle(name).fontSize) * R
    const fs1 = parseFloat(getComputedStyle(why).fontSize) * R
    out.push({
      box: r(c),
      name: { ...r(name), charsPerLine: +(r(name).w / fs3).toFixed(1) },
      amt: r(amt),
      why: { ...r(why), charsPerLine: +(r(why).w / fs1).toFixed(1) },
      // 名称与金额应在同一行（y 差小于行高一半）
      sameRow: Math.abs(r(name).y - r(amt).y) < fs3 * 0.8,
      whyBelow: r(why).y > r(amt).y + r(amt).h * 0.5,
      // 说明独占第二行并撑满内容宽（卡片左右各 16rpx 内边距，容差 12rpx 给 rpx 取整）
      whyFull: Math.abs(r(why).w - (r(c).w - 32)) < 12
    })
  }
  return out
})
console.log(JSON.stringify(m, null, 2))

// 判据
const bad = m.filter(c => c.name.charsPerLine < 6 || !c.sameRow || !c.whyBelow || c.why.charsPerLine < 10 || !c.whyFull)
console.log(bad.length ? `❌ ${bad.length} 行不符合两行结构` : '✅ 3 行全部为「名称+金额 / 说明独占第二行」')

// 负控：临时注入 flex-wrap:nowrap（= 修复前的写法），判据必须能报警，否则说明判据本身失灵
const neg = await page.evaluate(() => {
  const st = document.createElement('style'); st.id = 'neg-nowrap'
  st.textContent = '.cost{flex-wrap:nowrap!important}'
  document.head.appendChild(st)
  const R = 2, els = [...document.querySelectorAll('.cost-name')]
  return els.map(el => {
    const w = el.getBoundingClientRect().width * R
    const fs = parseFloat(getComputedStyle(el).fontSize) * R
    return +(w / fs).toFixed(1)
  })
})
console.log('负控（强制 nowrap）名称列字数/行:', JSON.stringify(neg), neg.some(x => x < 6) ? '→ 判据报警 ✅' : '→ 判据失灵 ❌')
await page.evaluate(() => { const s = document.getElementById('neg-nowrap'); s && s.remove() })
await sleep(400)

const box = await page.evaluate(() => { const el = document.querySelector('.cost-list').closest('.sec'); const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
await page.screenshot({ path: '../../shots/v5-7-cost-list.png', clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(box.width + 16, 480), height: Math.min(box.height + 16, 900) } })
await page.screenshot({ path: '../../shots/v5-7-progress-full.png', fullPage: true })
await browser.close()
