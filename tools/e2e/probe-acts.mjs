// 只看「我的预约」页按钮行的真实盒模型（A 判据报 321/317，差 4rpx，要找到是哪条规则造成的）
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('console', m => { const t = m.text(); if (/error|warn|TypeError|undefined/i.test(t)) console.log('[console]', m.type(), t.slice(0, 300)) })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)))
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1400)
await page.goto(`${H5}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' })
await sleep(1800)
const out = await page.evaluate(() => {
  const R = 750 / window.innerWidth
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  const items = [...top.querySelectorAll('.item')].filter(e => e.getClientRects().length).map(c => ({
    id: (c.querySelector('.ih-no') || {}).innerText,
    status: (c.querySelector('.ih-status') || {}).innerText,
    text: (c.innerText || '').replace(/\s+/g, ' ').trim(),
    html: [...c.querySelectorAll('.it-meta')].map(m => m.outerHTML.slice(0, 300)),
    metas: [...c.querySelectorAll('.it-meta')].map(m => ({
      k: (m.querySelector('.im-k') || {}).innerText,
      v: (m.querySelector('.im-v') || {}).innerText,
      vColor: m.querySelector('.im-v') ? getComputedStyle(m.querySelector('.im-v')).color : null
    }))
  }))
  return items
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
