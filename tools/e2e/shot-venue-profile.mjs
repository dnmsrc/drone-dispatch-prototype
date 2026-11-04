// 第 1 步场地页截图（2026-10-29 九次调整：整卡删除，只剩列表 + 选中行行尾的标记与档案入口）
// 前置：mock-server:8090 已启动
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: false,
  protocolTimeout: 120000,
  slowMo: 30,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,900', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })

const clickVis = (sel) => page.evaluate((s) => {
  const el = [...document.querySelectorAll(s)].find(e => e.getClientRects().length > 0)
  if (el) { el.click(); return true }
  return false
}, sel)

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)

// 走完确认门（真实点击，不伪造确认记录）
await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length > 0).pop() || document
  ;[...document.querySelectorAll('.box.risk-box')].filter(e => e.getClientRects().length && top.contains(e)).forEach(e => e.click())
  ;[...document.querySelectorAll('.box.ack')].filter(e => e.getClientRects().length && top.contains(e)).forEach(e => e.click())
})
await sleep(400)
await clickVis('.pb-btn')
await sleep(1500)
console.log('确认后落在', await page.evaluate(() => location.hash))

// 选一个场地 → 截图：只剩列表 + 选中行行尾的标记与档案入口
// 选到触发条款的场地会当场自动弹窗 —— 先把它关掉，才能拍到「表单页只剩列表」这一屏
await clickVis('.venue-item')
await sleep(600)
await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const b = [...top.querySelectorAll('.bp-btn')].filter(e => e.getClientRects().length)[0]
  b && b.click()
})
await sleep(500)
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.venue-item.on')].filter(e => e.getClientRects().length)[0]
  if (el) el.scrollIntoView({ block: 'start' })
})
await sleep(500)
await page.screenshot({ path: path.join(SHOTS, 'venue-form-lean.png'), timeout: 10000 })
const card = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length > 0).pop() || document
  const vis = (s) => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length && top.contains(e))
  const R = 750 / window.innerWidth
  return {
    titles: vis('.sec-title').map(e => e.innerText.trim()),
    kv: vis('.kv').map(e => e.innerText.trim()),
    rlines: vis('.rline').map(e => e.innerText.trim()),
    // 选中行行尾：标记（布局贡献 + 可点区）与入口
    entry: vis('.entry').map(e => {
      const a = e.querySelector('.ae')
      const m = a && (a.querySelector('.mark-dot') || a.querySelector('.gck'))
      const row = e.closest('.venue-item')
      return {
        link: (e.querySelector('.sec-link') || {}).innerText || '',
        shape: m ? (m.classList.contains('gck') ? '勾' : '点') : '无',
        glyph: m ? `${Math.round(m.getBoundingClientRect().width * R)}×${Math.round(m.getBoundingClientRect().height * R)}rpx` : '',
        tap: a ? `${Math.round(a.getBoundingClientRect().height * R)}rpx` : '',
        color: a ? getComputedStyle(a).color : '',
        rowH: row ? `${Math.round(row.getBoundingClientRect().height * R)}rpx` : ''
      }
    })
  }
})
console.log('表单页内容:', JSON.stringify(card, null, 2))

// 打开场地档案弹窗 → 截图
await clickVis('.sec-link')
await sleep(600)
await page.screenshot({ path: path.join(SHOTS, 'venue-profile-pop.png'), timeout: 10000 })
console.log('弹窗:', await page.evaluate(() => {
  const vis = (s) => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length)
  return {
    title: (vis('.bp-title')[0] || {}).innerText || '',
    lines: vis('.bp-line').map(e => e.innerText.trim()),
    link: (vis('.bp-link')[0] || {}).innerText || ''
  }
}))

await browser.close()
