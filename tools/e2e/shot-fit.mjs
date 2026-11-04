// 一次性截图：第 3 步「容量与时长核对」卡 —— 验证时间浮点修复（全暗 HH:MM，不再是 19:17.0558…）
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
// 在任何页面脚本跑之前把确认记录种进 sessionStorage：
// 先加载再种是来不及的（store 已在内存里初始化为空草稿，确认门按内存判，直接重定向）
await page.evaluateOnNewDocument(() => {
  sessionStorage.setItem('apply_draft', JSON.stringify({
    acks: [{ v: 'v1.2', at: '2026-10-28 20:48', user: 'probe', hash: 'c1209a0dc120', risk: Array.from({ length: 54 }, (_, i) => i + 1) }]
  }))
})
await page.goto(`${H5}/#/pages/apply/date`, { waitUntil: 'networkidle2' })
await sleep(1500)
const lines = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('容量与时长核对'))
  t && t.scrollIntoView({ block: 'start' })
  return [...document.querySelectorAll('.rline')].map(e => (e.innerText || '').trim())
})
await sleep(500)
await page.screenshot({ path: path.join(SHOTS, 'order-step3-fit.png') })
console.log(lines.join('\n'))
console.log(/\d{2}:\d{2}\.\d/.test(lines.join(' ')) ? 'BAD 仍有浮点时间' : 'ok  时间无浮点')
await browser.close()
