import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false, args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=900,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 180)))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const click = async sel => page.evaluate(s => {
  const el = [...document.querySelectorAll(s)].find(e => e.getClientRects().length)
  if (!el) return false
  el.click()
  return true
}, sel)
await page.goto('http://localhost:8090/#/pages/index/index', { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
const before = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.cta')]
  return {
    hash: location.hash,
    count: els.length,
    visible: els.filter(e => e.getClientRects().length > 0).map(e => {
      const r = e.getBoundingClientRect()
      return { text: (e.innerText || '').trim(), x: r.left, y: r.top, w: r.width, h: r.height }
    })
  }
})
console.log('before', JSON.stringify(before))
if (before.visible[0]) {
  await page.mouse.click(before.visible[0].x + before.visible[0].w / 2, before.visible[0].y + before.visible[0].h / 2)
  await sleep(1400)
}
const after = await page.evaluate(() => {
  const bodies = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length > 0)
  return { hash: location.hash, venues: bodies.length ? bodies[bodies.length - 1].querySelectorAll('.venue-item').length : -1 }
})
console.log('after', JSON.stringify(after))
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].filter(x => x.getClientRects().length)[3]; e && e.click() })
await sleep(500)
console.log('select-only', JSON.stringify(await page.evaluate(() => ({
  pop: [...document.querySelectorAll('.bp-pop')].filter(e => e.getClientRects().length).length,
  entry: [...document.querySelectorAll('.entry-chip.pend, .entry-chip.done')].filter(e => e.getClientRects().length).length
}))))
await click('.pb-btn')
await sleep(500)
console.log('gate', JSON.stringify(await page.evaluate(() => {
  const p = [...document.querySelectorAll('.bp-pop')].filter(e => e.getClientRects().length)[0]
  return { clauses: p ? p.querySelectorAll('.bp-clause').length : 0, title: p ? ((p.querySelector('.bp-title') || {}).innerText || '').trim() : '' }
})))
for (let i = 0; i < 4; i++) { if (!(await click('.bp-ck'))) break; await sleep(250) }
await click('.bp-btn')
await sleep(300)
await click('.ack-fab')
await sleep(300)
console.log('dock', JSON.stringify(await page.evaluate(() => ({
  panel: [...document.querySelectorAll('.ad-panel')].filter(e => e.getClientRects().length).length,
  full: !!document.querySelector('.ad-full')
}))))
await click('.ad-full')
await sleep(800)
console.log('disclosure', JSON.stringify(await page.evaluate(() => ({
  hash: location.hash,
  items: [...document.querySelectorAll('.item')].filter(e => e.getClientRects().length).length
}))))
await browser.close()
