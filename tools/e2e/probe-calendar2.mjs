import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
await page.goto('http://localhost:8090/#/pages/apply/date', { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2500))
const dump = async () => page.evaluate(() => {
  const vis = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const cells = vis('.cell:not(.pad)')
  const months = []
  const ym = (vis('.ym')[0] || {}).innerText
  const dots = vis('.legend .dot').map(e => ({ cls: e.className, bg: getComputedStyle(e).backgroundColor, w: e.getBoundingClientRect().width }))
  const slots = vis('.slot').map(e => ({ cls: e.className, text: (e.innerText || '').replace(/\s+/g, ' ').trim() }))
  return {
    ym,
    cells: cells.length,
    enabled: cells.filter(e => !e.classList.contains('off')).map(e => ({ cls: e.className, text: (e.innerText || '').replace(/\s+/g, ' ').trim() })),
    kinds: cells.map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 40),
    legend: dots,
    picked: [...document.querySelectorAll('.picked')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()),
    slots
  }
})
console.log('=== 首屏 ===')
console.log(JSON.stringify(await dump(), null, 1))
for (let i = 1; i <= 2; i++) {
  await page.evaluate(() => { const ns = [...document.querySelectorAll('.nav')].filter(e => !e.classList.contains('off')); ns[ns.length - 1] && ns[ns.length - 1].click() })
  await new Promise(r => setTimeout(r, 400))
  const g = await page.evaluate(() => ({ ym: [...document.querySelectorAll('.ym')].map(e => e.innerText)[0], cells: [...document.querySelectorAll('.cell:not(.pad)')].filter(e => e.getClientRects().length).length, first: [...document.querySelectorAll('.cell:not(.pad)')].filter(e => e.getClientRects().length).slice(0, 3).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()) }))
  console.log('=== 翻页 ' + i + ' ===', JSON.stringify(g))
}
await page.screenshot({ path: 'shots/calendar-live.png' })
await browser.close()
