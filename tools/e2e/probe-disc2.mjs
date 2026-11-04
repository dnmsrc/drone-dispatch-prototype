import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const b = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 480, height: 900 })
const errs = []
p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 300)))
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)) })
await p.goto('http://localhost:8090/#/pages/apply/disclosure', { waitUntil: 'networkidle2' })
await p.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const r = await p.evaluate(() => ({
  hash: location.hash,
  items: document.querySelectorAll('.item').length,
  secHead: document.querySelectorAll('.sec-head').length,
  secTitle: document.querySelectorAll('.sec-title').length,
  text: document.body.innerText.slice(0, 200)
}))
console.log(JSON.stringify(r))
console.log('ERRORS:', errs.slice(0, 6).join(' || '))
await b.close()
