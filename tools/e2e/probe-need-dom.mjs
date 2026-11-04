// 探针：A 趟里 need 页读不到 .tier 的原因——逐页看 DOM
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))
const vis = async sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)), sel)

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[3]; if (e) e.click() })
await sleep(600)
console.log('draft.venue =', JSON.stringify((await page.evaluate(() => JSON.parse(sessionStorage.getItem('apply_draft') || 'null')) || {}).venue?.id))
await page.evaluate(() => { const b = document.querySelector('.bp-btn'); if (b) b.click() })
await sleep(400)
await page.evaluate(() => { location.hash = '#/pages/apply/need' })
await sleep(2000)
console.log('hash', await page.evaluate(() => location.hash))
console.log('.tier 可见数', (await vis('.tier')).length, (await vis('.tier')).join(' | '))
console.log('.entry-chip', (await vis('.entry-chip')).join(' | '))
console.log('.pb-btn', (await vis('.pb-btn')).join(' | '))
console.log('uni-page-body 可见数', await page.evaluate(() => [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).length))
await browser.close()
