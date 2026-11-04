import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const b = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 480, height: 900 })
const errs = []
p.on('pageerror', e => errs.push(e.message.slice(0, 200)))
await p.goto('http://localhost:8090/#/pages/login/login', { waitUntil: 'networkidle2' })
await p.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1000))
await p.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(() => { location.hash = '#/pages/order/list' })
await new Promise(r => setTimeout(r, 1500))
const r = await p.evaluate(() => ({ hash: location.hash, cards: document.querySelectorAll('.order-card').length, text: (document.querySelector('uni-page-body') || {}).innerText?.slice(0, 120) }))
console.log(JSON.stringify(r), 'ERR', errs.slice(0, 3).join(' | '))
await b.close()
