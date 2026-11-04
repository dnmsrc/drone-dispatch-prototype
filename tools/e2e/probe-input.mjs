// 定位两条真失败：① 联系人真实输入为空（verify-responsive 同一条也挂）② run.mjs line 304 期望第一个 .sec-sub = '300 架'
// 用法：cd tools/e2e && node probe-input.mjs
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EXE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://127.0.0.1:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = (label, obj) => console.log(label + '\n' + JSON.stringify(obj, null, 1))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=420,900', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })

// —— 先看无 token 深链 create 的行为（自动跳登录还是停在原页），再显式走登录页授权 ——
await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await sleep(1200)
out('⓪ 无 token 直接深链 create', await page.evaluate(() => ({
  hash: location.hash, token: !!localStorage.getItem('token'),
  body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 140),
  hasWxBtn: !!document.querySelector('.wx-btn')
})))
// 输入框体检不需要 token（⓪ 已证明 create 页无 token 也渲染，下单才走 API），这里直接重开一次 create
await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await sleep(1500)

// —— ① 输入框现场体检：矩形、计算样式、中心点实际命中的元素（有没有被固定底栏 / toast 盖住）——
const env = await page.evaluate(() => {
  const sec = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('联系人'))
  if (sec) sec.scrollIntoView({ block: 'center' })
  return { secFound: !!sec }
})
await sleep(500)
const diagA = await page.evaluate(() => {
  const html = getComputedStyle(document.documentElement).fontSize
  const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
  return {
    vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio, htmlRem: html,
    scrollY: Math.round(window.scrollY),
    bodyScrollY: Math.round(document.scrollingElement.scrollTop),
    hosts: hosts.map(h => {
      const r = h.getBoundingClientRect()
      const ph = (h.querySelector('.uni-input-placeholder') || {}).innerText || ''
      const i = h.querySelector('input')
      const cs = i ? getComputedStyle(i) : null
      const hit = (r.width > 0 && r.height > 0) ? document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)) : null
      return {
        ph: ph.slice(0, 12),
        host: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        input: i ? { w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), fs: cs.fontSize, color: cs.color, bg: cs.backgroundColor, caret: cs.caretColor, vis: cs.visibility, pe: cs.pointerEvents, disabled: i.disabled, readOnly: i.readOnly } : null,
        hitAtCenter: hit ? (hit.tagName + '.' + (hit.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.') + ' | ' + (hit.innerText || '').slice(0, 18)) : null
      }
    })
  }
})
out('① create 页 uni-input 现场（视口 390×844，已滚到「联系人」）', { sec: env.secFound, ...diagA })

// —— ② 真实点击 + 键盘输入，看 activeElement 和落值 ——
const findInput = `(ph) => {
  const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
  const host = hosts.find(h => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph))
  if (!host) return null
  const r = host.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
}`
const typed = []
for (const [ph, value] of [['姓名', '自动化演示'], ['手机号', '13800009999']]) {
  const loc = await page.evaluate(`(${findInput})(${JSON.stringify(ph)})`)
  if (!loc) { typed.push({ ph, err: 'host 未找到' }); continue }
  await page.mouse.click(loc.cx, loc.cy)
  await sleep(200)
  const focus = await page.evaluate(() => {
    const a = document.activeElement
    return a ? a.tagName + '.' + ((a.className || '').toString().trim().split(/\s+/)[0] || '') : 'null'
  })
  await page.keyboard.type(value, { delay: 30 })
  await sleep(250)
  const after = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
    const get = (p) => { const h = hosts.find(x => ((x.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(p)); const i = h && h.querySelector('input'); return i ? i.value : '' }
    return { name: get('姓名'), phone: get('手机号') }
  })
  typed.push({ ph, cx: Math.round(loc.cx), cy: Math.round(loc.cy), focusAfterClick: focus, valueNow: after })
}
out('② 真实点击+键盘输入结果', typed)

// —— ③ 首页 CTA 到底进了哪个页面、第一个 .sec-sub 是什么（判断 line 304 是否期望过时）——
await page.goto(`${H5}/#/pages/index/index`, { waitUntil: 'networkidle2' })
await sleep(1200)
const ctaBefore = await page.evaluate(() => {
  const c = document.querySelector('.cta')
  return c ? { text: (c.innerText || '').slice(0, 24), hit: !!document.elementFromPoint(Math.round(c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2), Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)) } : null
})
await page.click('.cta')
await sleep(1600)
const diagC = await page.evaluate(() => {
  const bodies = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length > 0)
  const body = bodies[bodies.length - 1]
  if (!body) return { hash: location.hash, bodies: bodies.length }
  const q = (s) => [...body.querySelectorAll(s)].map(x => (x.innerText || '').trim().slice(0, 30))
  return {
    hash: location.hash,
    bodyCount: bodies.length,
    secTitles: q('.sec-title'),
    secSubs: q('.sec-sub'),
    secSubFirst: (body.querySelector('.sec-sub') || { innerText: '' }).innerText.trim(),
    tierOn: q('.tier.on .tier-num'),
    pbPrice: q('.pb-price'),
    stepbarItems: [...body.querySelectorAll('.st')].length
  }
})
out('③ 首页 CTA 跳转后的页面结构', { ctaBefore, ...diagC })

await browser.close()
