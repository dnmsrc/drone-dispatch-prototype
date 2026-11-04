// 告知确认书 UI 复查：勾移到行右侧后，编号列是否每条都对齐、整行可点、进度条可见。
// 运行：node probe-disclosure-ui.mjs（mock-server:8090 需在跑）
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 180000, slowMo: 30,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=0,0']
})
const p = await browser.newPage()
await p.setViewport({ width: 480, height: 900 })

await p.goto(`${H5}/#/pages/apply/disclosure`, { waitUntil: 'networkidle2' })
await sleep(1200)
if (!(await p.evaluate(() => !!localStorage.getItem('token')))) {
  await p.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length); b && b.click() })
  await sleep(1500)
  await p.evaluate(() => { const b = [...document.querySelectorAll('.auth-sheet .btn.allow')].find(e => e.getClientRects().length); b && b.click() })
  await sleep(1500)
  await p.goto(`${H5}/#/pages/apply/disclosure`, { waitUntil: 'networkidle2' })
  await sleep(1200)
}

// 勾第 5 条（重大利害关系条款）——用整行点击，验证行可点
const rowInfo = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('.item.risk')].filter(e => e.getClientRects().length)
  if (!rows.length) return null
  const r = rows[0]
  r.scrollIntoView({ block: 'center' })
  r.click()
  const box = r.querySelector('.box.risk-box')
  const cs = getComputedStyle(r)
  return {
    n: (r.querySelector('.no') || {}).innerText,
    rowH: Math.round(r.getBoundingClientRect().height * 750 / 480),   // rpx：480 视口下 1px = 1.5625rpx
    cursor: cs.cursor,
    boxRight: Math.round(box.getBoundingClientRect().right),
    boxOn: box.classList.contains('on'),
    riskRows: rows.length,
    align: [...document.querySelectorAll('.item')].filter(e => e.getClientRects().length).slice(0, 12)
      .map(e => Math.round((e.querySelector('.no') || e).getBoundingClientRect().left))
  }
})
await sleep(500)
await p.screenshot({ path: path.join(SHOTS, 'disclosure-ui-rows.png'), timeout: 10000 })
console.log('行可点 / 编号列对齐 / 勾在右侧：', JSON.stringify(rowInfo, null, 1))
await browser.close()
