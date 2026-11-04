// 探针：确认门写下的 ackAt 到底有没有进 sessionStorage（刷新后还在不在）
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

const draft = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('1) 直接进第 1 步 →', await page.evaluate(() => location.hash), '· 草稿 ackAt =', (await draft() || {}).ackAt)

await page.evaluate(() => { const b = [...document.querySelectorAll('.box')].find(e => e.getClientRects().length); b && b.click() })
await sleep(400)
console.log('2) 勾了框 · box.on =', await page.evaluate(() => { const b = document.querySelector('.box'); return b && b.classList.contains('on') }))
await page.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
await sleep(1500)
console.log('3) 点确认 →', await page.evaluate(() => location.hash), '· 草稿 ackAt =', (await draft() || {}).ackAt)

await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
console.log('4) 刷新后 →', await page.evaluate(() => location.hash), '· 草稿 ackAt =', (await draft() || {}).ackAt)

await page.goto(`${H5}/#/pages/apply/need`, { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('5) 去第 2 步 →', await page.evaluate(() => location.hash), '· 草稿 ackAt =', (await draft() || {}).ackAt)

await browser.close()
