// 截图：十次调整后的标题行 + 入口（8090 构建产物 = mock-server 服务的那份）
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 })
// 种草稿：已确认 1..54（等同 e2e 的口径），避免进门
await p.evaluateOnNewDocument(() => {
  const acks = Array.from({ length: 54 }, (_, i) => ({ v: 'v1.2', clause: i + 1, touch: 't', at: '2026-10-29 14:00', user: 'demo', hash: 'c1209a0dc120' }))
  sessionStorage.setItem('apply_draft', JSON.stringify({ admin: 'demo', venue: null, need: { droneCount: 100, duration: 15, audience: 800 }, acks }))
})
await p.goto('http://localhost:8090/#/pages/apply/venue', { waitUntil: 'networkidle2' })
await p.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
// 选第 4 个场地（触发条款）→ 弹窗会自动弹出，关掉它再看标题行入口
await p.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[3]; e && e.click() })
await sleep(700)
await p.evaluate(() => { const x = [...document.querySelectorAll('.bp-btn')].find(e => e.getClientRects().length); x && x.click() })
await sleep(700)
await p.screenshot({ path: path.join(SHOTS, 'ui-unify-venue.png') })
await p.evaluate(() => { location.hash = '#/pages/apply/need' })
await p.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000 }).catch(() => {})
await sleep(1200)
await p.screenshot({ path: path.join(SHOTS, 'ui-unify-need.png') })
const info = await p.evaluate(() => ({
  venueHead: [...document.querySelectorAll('.sec-head')].map(h => ({ t: (h.querySelector('.sh-title') || {}).innerText, chip: (h.querySelector('.entry-chip') || {}).innerText })),
  needHead: [...document.querySelectorAll('.sec-head')].slice(0, 6).map(h => ({ t: (h.querySelector('.sh-title') || {}).innerText, chip: (h.querySelector('.entry-chip') || {}).innerText }))
}))
console.log(JSON.stringify(info))
await b.close()
