// 现场取证：把步骤条的真实 DOM / 计算样式 / 布局几何打出来，判断到底是哪条规则没生效
// 运行：node tools/e2e/inspect-steps.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const H5 = process.env.H5_BASE || 'http://localhost:8090'
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false, protocolTimeout: 240000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 414, height: 896 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 140)))

async function h5load(hash) {
  await page.goto(`${H5}/#${hash}`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 })
}

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
const has = await page.waitForSelector('.wx-btn', { timeout: 8000 }).catch(() => null)
if (has) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length > 0); if (b) b.click() })
  await sleep(600)
  await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).catch(() => {})
}

// 需求页：把 .bar 整棵子树的计算样式与几何打出来
await h5load('/pages/apply/need')
await sleep(1200)
const dump = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); const c = getComputedStyle(el); return {
    tag: el.tagName.toLowerCase(), cls: el.className, scoped: [...el.attributes].filter(a => a.name.startsWith('data-v-')).map(a => a.name),
    disp: c.display, flex: c.flex, width: c.width, minW: c.minWidth, overX: c.overflowX, just: c.justifyContent, align: c.alignItems,
    box: { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) },
    cw: el.clientWidth, sw: el.scrollWidth, inlineStyle: el.getAttribute('style') || ''
  } }
  const bar = [...document.querySelectorAll('.bar')].find(e => e.getClientRects().length > 0) || document.querySelector('.bar')
  const kids = bar ? [...bar.children].map(r) : []
  const sc = bar ? bar.querySelector('.scroller') : null
  const inner = sc ? [...sc.querySelectorAll('*')].slice(0, 6).map(r) : []
  const steps = [...document.querySelectorAll('.st')].map(e => { const b = e.getBoundingClientRect(); return { cls: e.className, l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), vis: e.getClientRects().length > 0, dot: e.querySelector('.dot') ? { cls: e.querySelector('.dot').className, l: Math.round(e.querySelector('.dot').getBoundingClientRect().left), w: Math.round(e.querySelector('.dot').getBoundingClientRect().width), html: e.querySelector('.dot').innerHTML.slice(0, 120) } : null } })
  return {
    barCount: document.querySelectorAll('.bar').length,
    stCount: steps.length,
    pageStack: [...document.querySelectorAll('uni-page-body')].length,
    barHTML: bar ? bar.outerHTML.slice(0, 900) : 'NO .bar',
    barSelf: bar ? r(bar) : null,
    kids, inner, steps: steps.slice(0, 4),
    cssSheets: [...document.styleSheets].map(s => { try { return { href: (s.href || 'inline').split('/').pop(), rules: s.cssRules.length } } catch (e) { return { href: (s.href || 'inline').split('/').pop(), err: e.message.slice(0, 30) } } })
  }
})
console.log('===== need 页取证 =====')
console.log(JSON.stringify(dump, null, 1))

// 第 3 步（日期）：看已完成步骤的 class 与圆点内容
await h5load('/pages/apply/date')
await sleep(900)
const d3 = await page.evaluate(() => {
  const steps = [...document.querySelectorAll('.st')].map(e => ({ cls: e.className, dotHTML: (e.querySelector('.dot') || {}).innerHTML || '', label: (e.querySelector('.lb') || {}).innerText || '' }))
  return { cur: location.hash, steps: steps.slice(0, 8) }
})
console.log('\n===== date 页（应为第 3 步，前两步 done）=====')
console.log(JSON.stringify(d3, null, 1))

// 合同页：看逐条确认的勾选框实际用什么 class、勾怎么画的
await h5load('/pages/apply/contract')
await sleep(900)
const ct = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.term-box, .clause, .ck-item, .tc-box, .cb, .gck')].filter(e => e.getClientRects().length > 0).slice(0, 8)
    .map(e => { const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className, html: e.innerHTML.slice(0, 90), bl: c.borderLeftWidth, bb: c.borderBottomWidth, rotate: c.transform, w: Math.round(b.width) } })
  const txt = (document.querySelector('.clause-list') || document.body).innerText.slice(0, 260)
  return { boxes, txt }
})
console.log('\n===== contract 页勾选框取证 =====')
console.log(JSON.stringify(ct, null, 1))

await browser.close()
