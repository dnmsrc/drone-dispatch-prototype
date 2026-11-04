// 判据：顶部操作栏不随滚动走（2026-10-28 用户要求）—— 全部用 DOM 实测 rect，不看像素图
//   定高页（申请流程 / 下单 / 订单列表 / 确认）：滚动发生在 scroll-view 内部带 overflow:auto 的那层，顶栏在滚动区之外
//   自然滚页（订单详情）：顶栏靠 sticky 顶住，整页滚时 top 不变
// 没有顶部操作栏的页（「我的」）不参与判据。
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
await page.setViewport({ width: 390, height: 700 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)
console.log('token=', await page.evaluate(() => (localStorage.getItem('token') || '').slice(0, 12)))

const snap = () => page.evaluate(() => {
  const r = e => e ? Math.round(e.getBoundingClientRect().top) : null
  const nb = document.querySelector('.navbar')
  const sc = [...document.querySelectorAll('.page *')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)[0] || null
  return {
    hash: location.hash,
    navbarTop: nb ? r(nb) : null,
    pos: nb ? getComputedStyle(nb).position : null,
    stepbarTop: (() => { const b = [...document.querySelectorAll('.bar')].find(x => x.querySelector('.scroller')); return b ? r(b) : null })(),
    scroller: sc ? { cls: (sc.className || '').toString().slice(0, 26), scrollH: sc.scrollHeight, clientH: sc.clientHeight, scrollTop: sc.scrollTop } : null,
    windowScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    docScrollTop: document.documentElement.scrollTop
  }
})

const rows = []
async function check(p, label) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1400)
  const a = await snap()
  if (a.navbarTop === null) { console.log(`\n${label || p}：没有顶部操作栏，不参与判据`); return }
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('.page *')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)[0]
    if (sc) sc.scrollTop = 400
    window.scrollTo(0, 400)
  })
  await sleep(400)
  const b = await snap()
  const scrolled = (b.scroller && b.scroller.scrollTop > 0) || b.docScrollTop > 0
  const fixed = a.navbarTop === b.navbarTop && a.stepbarTop === b.stepbarTop
  const internal = !!b.scroller && !b.windowScrollable
  const ok = fixed && scrolled
  rows.push({ p: label || p, ok })
  console.log(`\n${label || p}`)
  console.log(`  navbar top ${a.navbarTop} → ${b.navbarTop} · stepbar top ${a.stepbarTop} → ${b.stepbarTop} · position=${a.pos}`)
  console.log(`  滚动位置：${internal ? `scroll-view 内部（${b.scroller.clientH}px 装 ${b.scroller.scrollH}px，顶栏在滚动区之外）` : '整页滚（靠 sticky 顶住）'} · 滚后 scrollTop=${b.scroller && b.scroller.scrollTop > 0 ? b.scroller.scrollTop : b.docScrollTop}`)
  console.log(`  顶栏固定=${fixed} · 内容真滚=${scrolled} → ${ok ? '✅' : '❌'}`)
}

for (const p of ['/pages/apply/disclosure', '/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay', '/pages/apply/progress', '/pages/order/create', '/pages/order/list', '/pages/order/confirm', '/pages/user/index']) {
  await check(p)
}

// 详情页要有真实订单数据（内容超屏才谈得上滚动）—— 从列表点进去
await page.goto(`${H5}/#/pages/order/list`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await page.evaluate(() => { const c = document.querySelector('.order-card'); c && c.click() })
await sleep(1500)
await check('/pages/order/detail?id=D20261027-0024', '详情页（从列表点进，有真实数据）')

// 宽屏（演示常用尺寸）再确认一遍
await page.setViewport({ width: 900, height: 1000 })
await sleep(600)
await check('/pages/apply/quote', '申请页·报价（900x1000）')

const fails = rows.filter(r => !r.ok)
console.log('\n汇总')
console.log(`  参与判据 ${rows.length} 页，通过 ${rows.length - fails.length}`)
if (fails.length) console.log('  未通过:', fails.map(f => f.p).join(', '))

const out = path.join(SHOTS, 'topbar-fixed.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`\n截图: ${out}`)
await browser.close()
process.exitCode = fails.length ? 1 : 0
