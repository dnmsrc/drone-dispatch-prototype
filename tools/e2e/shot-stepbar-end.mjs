// 单独补一张「滚到最右」的像素证据：上一轮的截图被 captureBeyondViewport 重置了滚动位置，
// 所以这里显式关掉它，并在截图前把滚动状态打印出来，确保截到的就是滚到底的那一帧。
// 运行：cd tools/e2e && node shot-stepbar-end.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const H5 = process.env.H5_BASE || 'http://localhost:8090'
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p))
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const TOP = { x: 0, y: 28, width: 414, height: 92, scale: 1 }

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false, protocolTimeout: 240000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 414, height: 896 })

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
if (await page.waitForSelector('.wx-btn', { timeout: 8000 }).catch(() => null)) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length > 0); if (b) b.click() })
  await sleep(600)
  await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).catch(() => {})
}

await page.goto(`${H5}/#/pages/apply/need`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)

const state = () => page.evaluate(() => {
  const round = (v) => Math.round(v * 10) / 10
  const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
  if (!bar) return null
  const sc = bar.querySelector('.scroller')
  const box = [...bar.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 10)[0]
  const st = [...bar.querySelectorAll('.st')]
  const last = st[st.length - 1], first = st[0]
  const navs = [...bar.querySelectorAll('.nav')]
  const dl = last.querySelector('.dot').getBoundingClientRect(), fl = first.querySelector('.dot').getBoundingClientRect()
  const sr = sc.getBoundingClientRect()
  return {
    labels: st.map(e => (e.querySelector('.lb') || {}).innerText || ''),
    visible: st.filter(e => { const b = e.getBoundingClientRect(); return b.right > sr.left && b.left < sr.right }).map(e => (e.querySelector('.lb') || {}).innerText || ''),
    scrollLeft: box ? round(box.scrollLeft) : -1, scrollMax: box ? round(box.scrollWidth - box.clientWidth) : -1,
    gapLastRight: round(sr.right - dl.right), gapFirstLeft: round(fl.left - sr.left),
    rightNavOff: navs[navs.length - 1].className.includes('off'),
    barRight: round(bar.getBoundingClientRect().right), vw: window.innerWidth
  }
})

console.log('起始状态   :', JSON.stringify(await state()))
for (let i = 0; i < 12; i++) {
  const adv = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    if (!bar) return false
    const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
    const right = navs[navs.length - 1]
    if (!right || right.classList.contains('off')) return false
    right.click(); return true
  })
  if (!adv) break
  await sleep(340)
}
await sleep(500)
const end = await state()
console.log('滚到最右   :', JSON.stringify(end))
// captureBeyondViewport:false：默认 true 会让 Chrome 重建立层树、把滚动位置重置回 0（上一轮截图就是这样骗过我的）
await page.screenshot({ path: path.join(SHOTS, 'end-top.png'), clip: TOP, captureBeyondViewport: false, timeout: 15000 })
await page.screenshot({ path: path.join(SHOTS, 'end-full.png'), captureBeyondViewport: false, timeout: 15000 })

// 再滚回最左，同一套参数拍开头那一帧
for (let i = 0; i < 12; i++) {
  const back = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    if (!bar) return false
    const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
    const left = navs[0]
    if (!left || left.classList.contains('off')) return false
    left.click(); return true
  })
  if (!back) break
  await sleep(340)
}
await sleep(500)
const head = await state()
console.log('滚回最左   :', JSON.stringify(head))
await page.screenshot({ path: path.join(SHOTS, 'head-top.png'), clip: TOP, captureBeyondViewport: false, timeout: 15000 })

const okEnd = Math.abs(end.gapLastRight) <= 4 && end.rightNavOff && end.barRight <= end.vw + 1
const okHead = Math.abs(head.gapFirstLeft) <= 4 && Math.abs(head.scrollLeft) <= 2
console.log(`\n==== ${okEnd && okHead ? 'ALL PASS' : 'FAIL'} ====  最右贴边=${end.gapLastRight}px 最左贴边=${head.gapFirstLeft}px barRight=${end.barRight}/${end.vw} 右箭头到头置灰=${end.rightNavOff}`)
await browser.close()
process.exit(okEnd && okHead ? 0 : 1)
