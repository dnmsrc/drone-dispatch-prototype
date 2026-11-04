// 探针：确认入口（AckEntry）在各页到底渲染成什么；须知页还有没有整批勾选卡
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const dump = async (name) => {
  const r = await page.evaluate(() => {
    const vis = s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length)
    return {
      hash: location.hash,
      ae: vis('.ae').map(e => `${e.className}|${e.textContent.trim()}|${e.offsetHeight}px`),
      box: vis('.box').map(e => e.className + '|' + e.textContent.trim().slice(0, 40)),
      pend: vis('.ae.pend').length
    }
  })
  console.log(name, JSON.stringify(r, null, 0))
}

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[3]; e && e.click() })
await sleep(600)
await dump('场地页（选了管制空域场地，未确认）')
await page.evaluate(() => { const b = [...document.querySelectorAll('.bp-ck')].filter(e => e.getClientRects().length)[0]; b && b.click() })
await sleep(400)
await page.evaluate(() => { const b = [...document.querySelectorAll('.bp-ck')].filter(e => e.getClientRects().length)[0]; b && b.click() })
await sleep(400)
await dump('场地页（确认两条后）')

for (const p of ['need', 'date', 'quote', 'consult', 'contract', 'disclosure']) {
  await page.goto(`${H5}/#/pages/apply/${p}`, { waitUntil: 'networkidle2' })
  await sleep(1400)
  await dump(p)
}
await browser.close()
