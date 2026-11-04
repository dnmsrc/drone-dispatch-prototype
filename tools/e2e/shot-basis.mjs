// 一次性截图：依据弹窗链路的三个画面 —— 判定行（依据按钮）/ 依据弹窗 / 审批卡短文本
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 60000, slowMo: 20,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=220,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
await page.evaluateOnNewDocument(() => {
  sessionStorage.setItem('apply_draft', JSON.stringify({
    acks: [{ v: 'v1.2', at: '2026-10-28 20:48', user: 'probe', hash: 'c1209a0dc120', risk: Array.from({ length: 54 }, (_, i) => i + 1) }]
  }))
})
await page.goto(`${H5}/#/pages/apply/need`, { waitUntil: 'networkidle2' })
await sleep(1500)
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('判定费'))
  t && t.scrollIntoView({ block: 'start' })
})
await sleep(400)
await page.screenshot({ path: path.join(SHOTS, 'basis-1-checks.png') })
await page.evaluate(() => { const b = [...document.querySelectorAll('.ck-info')].find(e => e.getClientRects().length > 0); b && b.click() })
await sleep(500)
await page.screenshot({ path: path.join(SHOTS, 'basis-2-pop.png') })
await page.goto(`${H5}/#/pages/apply/date`, { waitUntil: 'networkidle2' })
await sleep(1500)
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('审批与提前量'))
  t && t.scrollIntoView({ block: 'start' })
})
await sleep(400)
await page.screenshot({ path: path.join(SHOTS, 'basis-3-approval.png') })
console.log('ok 3 shots')
await browser.close()
