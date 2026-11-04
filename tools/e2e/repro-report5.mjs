// 复现用户本轮报告的 5 个问题现状（在 5173 上看，因为用户看的是 5173）
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.BASE || 'http://localhost:5173'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1200,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)) })

const gotoHash = async (hash) => {
  await page.goto(`${BASE}/?t=${Date.now()}#${hash}`, { waitUntil: 'networkidle2' })
  await sleep(2200)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000 })
}
const topBody = () => document.querySelector('uni-page-body')
const state = () => page.evaluate(() => {
  const ls = {}
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) || '').slice(0, 60) }
  return { hash: location.hash, ls }
})

// ── 场景 A：先登录（走真实后端），再看第 5 步咨询页
console.log('=== login ===')
await gotoHash('/pages/login/login')
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(1200)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(2500)
console.log('after login:', JSON.stringify(await state()))

console.log('=== consult page (token 已登录，直接 goto) ===')
await gotoHash('/pages/apply/consult')
const consultInfo = await page.evaluate(() => {
  const body = document.querySelector('uni-page-body')
  const bodyR = body.getBoundingClientRect()
  const cards = [...body.querySelectorAll('.card')].filter(e => e.getClientRects().length)
  const ta = [...body.querySelectorAll('uni-textarea')].find(e => e.getClientRects().length)
  const taInner = ta ? [...ta.querySelectorAll('textarea, div')].filter(e => e.getClientRects().length).map(e => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return { cls: e.className, tag: e.tagName, left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), pad: cs.padding, boxS: cs.boxSizing }
  }) : []
  const taR = ta ? ta.getBoundingClientRect() : null
  const taCs = ta ? getComputedStyle(ta) : null
  return {
    body: { left: +bodyR.left.toFixed(1), right: +bodyR.right.toFixed(1), w: +bodyR.width.toFixed(1) },
    card: cards[0] ? (() => { const r = cards[0].getBoundingClientRect(); const cs = getComputedStyle(cards[0]); return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), pad: cs.padding } })() : null,
    ta: ta ? { left: +taR.left.toFixed(1), right: +taR.right.toFixed(1), w: +taR.width.toFixed(1), display: taCs.display, pad: taCs.padding, boxS: taCs.boxSizing, margin: taCs.margin } : null,
    taInner
  }
})
console.log('consult layout:', JSON.stringify(consultInfo, null, 2))
await page.screenshot({ path: '../../shots/rep-consult.png' })

// 点「提交咨询单」看是否提示登录
const beforeTok = await page.evaluate(() => { const t = uni.getStorageSync('token'); return { ls: !!t, sample: String(t).slice(0, 12) } })
console.log('token in storage:', JSON.stringify(beforeTok))
await page.evaluate(() => { const b = [...document.querySelectorAll('button, uni-button')].find(e => /提交咨询单/.test(e.textContent) && e.getClientRects().length); if (b) b.click() })
await sleep(1200)
const toast = await page.evaluate(() => [...document.querySelectorAll('[class*="toast"], .uni-toast, .uni-simple-toast')].map(e => e.textContent.trim()).filter(Boolean))
console.log('toast after submit:', JSON.stringify(toast))

// ── 场景 B：第 1→3 步，点返回图标，看页栈与落地页
console.log('=== back from step3 ===')
await gotoHash('/pages/apply/venue')
await page.evaluate(() => { const ps = getCurrentPages(); });

// 从首页进流程（模拟用户路径）
await gotoHash('/pages/index/index')
await page.evaluate(() => { const b = [...document.querySelectorAll('button, uni-button')].find(e => /立即预约表演/.test(e.textContent) && e.getClientRects().length); if (b) b.click() })
await sleep(2000)
const step1 = await page.evaluate(() => ({ hash: location.hash, pages: (typeof getCurrentPages === 'function' ? getCurrentPages().map(p => p.route) : []) }))
console.log('step1:', JSON.stringify(step1))

// 走两步下一步
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, uni-button')].reverse().find(e => /下一步|下一步|提交|继续/.test(e.textContent) && e.getClientRects().length)
    if (b) b.click()
  })
  await sleep(1500)
  await page.evaluate(() => { const ok = [...document.querySelectorAll('button')].find(e => /知道了|确认|我已了解|确定/.test(e.textContent) && e.getClientRects().length); if (ok) ok.click() })
  await sleep(1000)
}
console.log('after 2 next:', JSON.stringify(await page.evaluate(() => ({ hash: location.hash, pages: (typeof getCurrentPages === 'function' ? getCurrentPages().map(p => p.route) : []) }))))
await page.screenshot({ path: '../../shots/rep-step3.png' })

// 点导航栏返回
await page.evaluate(() => { const l = [...document.querySelectorAll('.navbar .left')].find(e => e.getClientRects().length); if (l) l.click() })
await sleep(1800)
console.log('after back click:', JSON.stringify(await page.evaluate(() => ({ hash: location.hash, pages: (typeof getCurrentPages === 'function' ? getCurrentPages().map(p => p.route) : []) }))))
await page.screenshot({ path: '../../shots/rep-afterback.png' })

await browser.close()
