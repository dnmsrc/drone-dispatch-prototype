// 截图：第 1 步没确认就点「下一步」→ 被门拦住（阻断式弹窗，确认后才能继续）
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[3]; if (e) e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.bp-btn'); if (b) b.click() })   // 没确认就关掉
await sleep(400)
await page.evaluate(() => { const b = [...document.querySelectorAll('.pb-btn')].filter(e => e.getClientRects().length)[0]; if (b) b.click() })
await sleep(900)
await page.screenshot({ path: 'shots/gate-blocked-venue.png' })
console.log('被拦后 hash:', await page.evaluate(() => location.hash))
console.log('弹窗:', await page.evaluate(() => { const p = document.querySelector('.bp-pop'); return p ? p.innerText.replace(/\s+/g, ' ').slice(0, 120) : '无' }))
await browser.close()
