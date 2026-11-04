// 里程碑行复核：滚到「付款节点」卡片，看文本列是否还逐字竖排
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
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

await page.goto(`${H5}/#/pages/apply/quote`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
const info = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.sec.card')].find(c => (c.textContent || '').includes('付款节点'))
  if (!card) return null
  const sc = [...document.querySelectorAll('.body *')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)[0]
  if (sc) sc.scrollTop = card.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16
  const rows = [...card.querySelectorAll('.ms')].map(r => {
    const name = r.querySelector('.ms-name')
    const nRect = name.getBoundingClientRect(), rRect = r.getBoundingClientRect()
    const fsz = parseFloat(getComputedStyle(name).fontSize)
    return {
      name: (name.textContent || '').trim(),
      wRpx: Math.round(nRect.width * 2),
      lines: Math.round(nRect.height / fsz),
      rowH: Math.round(rRect.height * 2)
    }
  })
  return rows
})
if (!info) { console.log('❌ 没找到付款节点卡片'); await browser.close(); process.exit(1) }
console.log('里程碑行（375 屏，1rpx=0.5px）')
for (const r of info) console.log(`  ${r.name.padEnd(10)} 名称列宽 ${r.wRpx}rpx / ${r.lines} 行 · 行高 ${r.rowH}rpx`)
const ok = info.every(r => r.wRpx >= 100 && r.lines <= 2)
console.log(`判定 = ${ok ? '✅ 名称列正常换行（不再逐字竖排）' : '❌'}`)
await sleep(400)
const out = path.join(SHOTS, 'milestone-rows.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`截图: ${out}`)
await browser.close()
process.exitCode = ok ? 0 : 1
