import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
await page.goto('http://localhost:8090/#/pages/apply/date', { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
console.log(JSON.stringify(await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.cell:not(.pad)')]
  let draft = {}
  try { draft = JSON.parse(sessionStorage.getItem('apply_draft') || '{}') } catch (e) {}
  return {
    now: new Date().toString(),
    hash: location.hash,
    venue: (draft.venue || {}).name,
    date: draft.date,
    slot: draft.slot,
    cells: cells.length,
    enabled: cells.filter(e => !e.classList.contains('off')).length,
    first: cells.slice(0, 12).map(e => ({ cls: e.className, text: (e.innerText || '').trim() })),
    lastEnabled: cells.filter(e => !e.classList.contains('off')).slice(-5).map(e => ({ cls: e.className, text: (e.innerText || '').trim() }))
  }
}), null, 2))
// 翻到最近有可提交日的月份，滚到时段选项，留一张“只专注填写”的最终观感截图。
await page.evaluate(() => {
  const next = [...document.querySelectorAll('.nav')].filter(e => !e.classList.contains('off')).pop()
  next && next.click()
})
await new Promise(r => setTimeout(r, 250))
await page.evaluate(() => {
  const next = [...document.querySelectorAll('.nav')].filter(e => !e.classList.contains('off')).pop()
  next && next.click()
})
await new Promise(r => setTimeout(r, 350))
await page.evaluate(() => { const s = document.querySelector('.slot-row'); s && s.scrollIntoView({ block: 'center' }) })
await new Promise(r => setTimeout(r, 250))
await page.screenshot({ path: 'shots/date-focus-final.png' })
await browser.close()
