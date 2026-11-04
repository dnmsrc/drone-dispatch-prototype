// 截图：与用户截图同尺寸（430×884），把验证码行滚到视野里再拍
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
await page.setViewport({ width: 430, height: 884 })
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

await page.goto(`${H5}/#/pages/apply/contract`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)

const m = await page.evaluate(() => {
  const R = 750 / 430
  const h = el => Math.round(el.getBoundingClientRect().height * R)
  const row = document.querySelector('.code-row')
  const inp = document.querySelector('.code-input'), btn = document.querySelector('.code-btn')
  const sc = [...document.querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)[0]
  if (row) row.scrollIntoView({ block: 'center' })
  return {
    row: h(row), inp: h(inp), btn: h(btn),
    inpBg: getComputedStyle(inp).backgroundColor, cardBg: getComputedStyle(inp.closest('.card')).backgroundColor,
    btnLH: +(parseFloat(getComputedStyle(btn).lineHeight) / parseFloat(getComputedStyle(btn).fontSize)).toFixed(2),
    barBtn: document.querySelector('.pb-btn') ? h(document.querySelector('.pb-btn')) : null
  }
})
console.log(`验证码行 ${m.row}rpx · 输入框 ${m.inp}rpx · 按钮 ${m.btn}rpx · 差 ${Math.abs(m.btn - m.inp)}rpx`)
console.log(`输入框背景 ${m.inpBg} / 卡片背景 ${m.cardBg} · 按钮行高 ${m.btnLH}×字号 · 底部按钮 ${m.barBtn}rpx`)
await sleep(600)
const out = path.join(SHOTS, 'height-fix-contract.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`截图: ${out}`)
await browser.close()
