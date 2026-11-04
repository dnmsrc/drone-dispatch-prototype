import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 940, deviceScaleFactor: 2 })
await page.goto('http://localhost:8090/#/pages/apply/date', { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2500))
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell:not(.pad)')].find(d => !d.classList.contains('off')); c && c.click() })
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: 'shots/date-calendar-final.png', fullPage: false })
// 待定日期 → 下一步 → 预约风险确认
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.cell.unknown')].find(d => d.getClientRects().length)
  c && c.click()
})
await new Promise(r => setTimeout(r, 500))
await page.evaluate(() => {
  const s = [...document.querySelectorAll('.slot')].find(e => e.getClientRects().length && !/dis/.test(e.className || ''))
  s && s.click()
})
await new Promise(r => setTimeout(r, 400))
await page.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
await new Promise(r => setTimeout(r, 700))
await page.screenshot({ path: 'shots/date-weather-risk.png', fullPage: false })
console.log(JSON.stringify(await page.evaluate(() => ({
  ym: (document.querySelector('.ym') || {}).innerText,
  cells: [...document.querySelectorAll('.cell:not(.pad)')].filter(e => e.getClientRects().length).length,
  picked: [...document.querySelectorAll('.picked')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())[0],
  slots: [...document.querySelectorAll('.slot')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()),
  risk: [...document.querySelectorAll('.bp-risk')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())[0],
  buttons: [...document.querySelectorAll('.bp-pop button')].map(e => (e.innerText || '').trim())
}), null, 1)))
await browser.close()
