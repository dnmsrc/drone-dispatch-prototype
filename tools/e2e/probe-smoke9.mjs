import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PAGES = ['disclosure', 'venue', 'need', 'date', 'quote', 'consult', 'contract', 'pay', 'progress']
const b = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 480, height: 900 })
const errs = []
p.on('pageerror', e => errs.push(e.message.slice(0, 140)))
await p.goto('http://localhost:8090/#/pages/login/login', { waitUntil: 'networkidle2' })
await p.reload({ waitUntil: 'networkidle2' })
await sleep(1000)
await p.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(800)
await p.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1000)
const out = []
for (const name of PAGES) {
  await p.evaluate(n => { location.hash = '#/pages/apply/' + n }, name)
  await p.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000 }).catch(() => {})
  await sleep(900)
  const r = await p.evaluate(() => {
    const body = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
    return {
      head: body ? body.querySelectorAll('.sec-head').length : 0,
      chips: body ? body.querySelectorAll('.entry-chip').length : 0,
      titles: body ? body.querySelectorAll('.sec-title').length : 0,
      txt: body ? (body.innerText || '').slice(0, 40).replace(/\n/g, ' ') : ''
    }
  })
  out.push(`${name}: head=${r.head} chip=${r.chips} oldTitle=${r.titles} | ${r.txt}`)
}
console.log(out.join('\n'))
console.log('PAGEERRORS:', errs.length ? [...new Set(errs)].slice(0, 5).join(' || ') : '无')
await b.close()
