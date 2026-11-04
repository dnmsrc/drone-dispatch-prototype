// 运行时渲染错误审计（2026-11-03）：选项式 API 里，模板调用未挂到实例的函数时会抛
// `X is not a function`，Vue 只 console.error 一条，然后把该节点渲染成 <!----> ——
// 页面不崩、不报错，只是「少了一行/入口点了没反应」。静态分析容易漏（mixin / 简写 / 运行时才有值），
// 所以逐页真跑一遍，把 console 里的 TypeError / Vue warn 当成判据。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PAGES = [
  '/pages/index/index', '/pages/login/login', '/pages/apply/need', '/pages/apply/venue',
  '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract',
  '/pages/apply/pay', '/pages/apply/progress', '/pages/apply/disclosure', '/pages/consult/index',
  '/pages/user/index', '/pages/order/list'
]

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
let errors = []
page.on('console', m => {
  const t = m.text()
  if (['error', 'warning', 'warn'].includes(m.type()) && /is not a function|Cannot read|undefined is not|TypeError|Vue warn/.test(t)) errors.push(t.slice(0, 220))
})
page.on('pageerror', e => { const t = 'pageerror: ' + e.message; if (/is not a function|Cannot read|undefined is not|TypeError/.test(t)) errors.push(t.slice(0, 220)) })

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

let bad = 0
for (const p of PAGES) {
  errors = []
  await page.goto(`${H5}/?t=${Date.now()}#${p}`, { waitUntil: 'networkidle2' })
  await sleep(1600)
  // 打开弹层/点击入口也能暴露「点了没反应」类问题；只做一次轻量点击（入口胶囊）
  await page.evaluate(() => { const e = [...document.querySelectorAll('.entry-chip, .sec-head .entry, .bp-btn')].filter(x => x.getClientRects().length)[0]; if (e) e.click() })
  await sleep(900)
  const name = p.replace('/pages/', '')
  if (errors.length) {
    bad++
    console.log(`\n${name}  ❌ 渲染错误 ${errors.length}`)
    const uniq = Array.from(new Set(errors))
    uniq.slice(0, 4).forEach(e => console.log('   ' + e))
  } else console.log(`${name}  ✅`)
}
console.log(`\n合计 ${PAGES.length} 页 · 有渲染错误 ${bad} 页`)
await browser.close()
process.exitCode = bad ? 1 : 0
