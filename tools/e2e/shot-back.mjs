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
await page.setViewport({ width: 900, height: 1000 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

await page.goto(`${H5}/#/pages/apply/need`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await page.evaluate(() => document.querySelector('.pb-btn').click())
await sleep(1200)
await page.evaluate(() => { const it = [...document.querySelectorAll('.venue-item')].find(x => (x.textContent || '').includes('海埂大坝')); it && it.click() })
await sleep(700)
await page.evaluate(() => document.querySelector('.pb-btn').click())
await sleep(1200)
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell')].find(x => x.classList.contains('ok') && !x.classList.contains('off')); c && c.click() })
await sleep(500)
await page.evaluate(() => { const s = [...document.querySelectorAll('.slot')].find(x => !x.classList.contains('dis')); s && s.click() })
await sleep(500)
await page.evaluate(() => document.querySelector('.pb-btn').click())
await sleep(1200)
console.log('第4步:', await page.evaluate(() => location.hash))

// 回退到第 2 步（当前之前的步骤可点）
await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  const st = [...bar.querySelectorAll('.st')][1]
  st.click()
})
await sleep(1500)
console.log('回退到:', await page.evaluate(() => location.hash))
console.log('步骤条:', await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  return [...bar.querySelectorAll('.st')].map(st => {
    const lb = st.querySelector('.lb')
    return `${(lb.textContent || '').trim()}=${String([...st.classList].find(c => c.startsWith('s-'))).replace('s-', '')}${st.classList.contains('can') ? '(可点)' : ''}`
  }).join(' ')
}))
const out = path.join(SHOTS, 'stepbar-back-venue.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log('截图:', out)
await browser.close()
