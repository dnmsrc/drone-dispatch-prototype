// 「我的预约」布局实测探针（2026-11-03 用户指出截图里按钮贴边 / 卡片对齐不一致）
// 只量 DOM，不看像素：输出每个卡片的 content box、每个直接子块的 rect、按钮行的 flex 尺寸，
// 以及「子块右缘 > 卡片 content 右缘」这类溢出。所有数值换算成 rpx（750 设计稿）。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function call(method, p, body, token) {
  const r = await fetch(H5 + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return await r.json()
}

const al = await call('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })
const atk = al.data.token
await call('POST', '/api/config/reset', {}, atk)

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, slowMo: 10,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

const click = (sel, i = 0) => page.evaluate((s, i) => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click(); return true
}, sel, i)
const confirmAll = async () => { for (let i = 0; i < 60; i++) { if (!(await click('.bp-ck', 0))) break; await sleep(220) } }

// 用户登录
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)
const utk = await page.evaluate(() => localStorage.getItem('token'))
console.log('用户 token:', utk ? 'ok' : 'BAD')

// 造数据：单 1 → 客服接待 → 派单（68000/92000）；再提一张新单把单 1 覆盖成「已自动废弃」
await page.evaluate(() => sessionStorage.clear())
await page.goto(`${H5}/#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await sleep(1800)
await click('.submit-consult', 0); await sleep(800)
await confirmAll(); await sleep(300); await click('.bp-btn', 0); await sleep(400)
await click('.submit-consult', 0); await sleep(1400)
const cno = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  const kv = [...top.querySelectorAll('.kv')].find(k => (k.querySelector('.k') || {}).innerText === '单号')
  return kv ? (kv.querySelector('.v').innerText || '').trim() : ''
})
console.log('单 1:', cno)
await call('POST', `/api/admin/consults/${cno}/receive`, {}, atk)
await call('POST', `/api/admin/consults/${cno}/dispatch`, {
  quoteLo: 68000, quoteHi: 92000, note: '现场需物业配合断电与清场，已电话沟通',
  terms: {
    approvalOwner: '承飞方（乙方）负责空域申请与备案',
    approvalFailLiability: '乙方未按时取得批复 → 乙方全责退还已付费用',
    subcontractApproved: '是（甲方书面同意）',
    depositNature: '预付款（未约定定金条款，不适用定金罚则）',
    insuranceAmount: 1000000,
    scaleBasis: '投入规模（实际投入的机队数）'
  }
}, atk)
const cur = await page.evaluate(() => JSON.parse(sessionStorage.getItem('apply_draft') || '{}'))
const nd = { ...cur, step: 5, consult: null, dispatch: null, contract: null, payment: null, date: '2026-12-05', slot: '20:00' }
await page.evaluateOnNewDocument((json) => { try { sessionStorage.setItem('apply_draft', json) } catch (e) {} }, JSON.stringify(nd))
await page.goto(`${H5}/?t=${Date.now()}#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await sleep(1800)
await click('.submit-consult', 0); await sleep(1200)
await click('.pb-inline', 0); await sleep(1600)   // 冲突层：确认放弃旧单，提交新单
const mine = await call('GET', '/api/consults/mine', null, utk)
console.log('服务端 mine:', (mine.list || []).map(c => `${c.id}/${c.status}/${c.statusText}`).join(' | '))
await page.goto(`${H5}/?t=${Date.now()}#/pages/consult/index`, { waitUntil: 'networkidle2' })
await sleep(2000)

const measure = (label) => page.evaluate((label) => {
  const R = 750 / window.innerWidth
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const toR = v => Math.round(v * R)
  const box = el => { const r = el.getBoundingClientRect(); return { l: toR(r.left), r: toR(r.right), t: toR(r.top), b: toR(r.bottom), w: toR(r.width), h: toR(r.height) } }
  const out = { label, vw: window.innerWidth, R, cards: [], overflow: [], acts: [], heads: [] }
  const cards = [...top.querySelectorAll('.item')].filter(e => e.getClientRects().length)
  for (const c of cards) {
    const cs = getComputedStyle(c)
    const cb = box(c)
    const pad = { t: toR(parseFloat(cs.paddingTop)), r: toR(parseFloat(cs.paddingRight)), b: toR(parseFloat(cs.paddingBottom)), l: toR(parseFloat(cs.paddingLeft)) }
    const content = { l: cb.l + pad.l, r: cb.r - pad.r, t: cb.t + pad.t, b: cb.b - pad.b }
    const kids = [...c.children].filter(k => k.getClientRects().length).map(k => {
      const kb = box(k)
      const cls = (k.className || k.tagName).toString().slice(0, 24)
      const of = { left: kb.l - content.l, right: content.r - kb.r, top: kb.t - content.t, bottom: content.b - kb.b }
      return { cls, ...kb, margin: { t: toR(parseFloat(getComputedStyle(k).marginTop)), b: toR(parseFloat(getComputedStyle(k).marginBottom)) }, of }
    })
    out.cards.push({ id: (c.querySelector('.ih-no') || {}).innerText, status: (c.querySelector('.ih-status') || {}).innerText, box: cb, pad, content, kids })
    for (const k of kids) if (k.of.left < -1 || k.of.right < -1) out.overflow.push({ card: (c.querySelector('.ih-no') || {}).innerText, cls: k.cls, of: k.of })
    // 按钮行：flex 尺寸与每个按钮的 padding / 盒宽
    const acts = c.querySelector('.it-acts')
    if (acts) {
      out.acts.push({ card: (c.querySelector('.ih-no') || {}).innerText, acts: box(acts), gap: toR(parseFloat(getComputedStyle(acts).columnGap) || 0), kids: [...acts.children].filter(k => k.getClientRects().length).map(k => { const cs2 = getComputedStyle(k); return { cls: (k.className || '').toString().slice(0, 20), ...box(k), padL: toR(parseFloat(cs2.paddingLeft)), padR: toR(parseFloat(cs2.paddingRight)), minW: cs2.minWidth, flex: cs2.flex, boxSizing: cs2.boxSizing } }) })
    }
    // 标题行：左块与状态胶囊
    const head = c.querySelector('.it-head')
    if (head) {
      const hb = box(head), left = box(head.querySelector('.ih-left')), st = head.querySelector('.ih-status')
      out.heads.push({ card: (c.querySelector('.ih-no') || {}).innerText, head: hb, left, status: st ? { ...box(st), txt: st.innerText } : null, align: getComputedStyle(head).alignItems })
    }
  }
  return out
}, label)

let m = await measure('480')
console.log('\n===== 视口 480 =====')
console.log(JSON.stringify(m.cards, null, 1))
console.log('溢出:', JSON.stringify(m.overflow))
console.log('按钮行:', JSON.stringify(m.acts))
console.log('标题行:', JSON.stringify(m.heads))
await page.screenshot({ path: path.join(SHOTS, 'mine-probe-480.png') })

await page.setViewport({ width: 375, height: 667 })
await sleep(900)
m = await measure('375')
console.log('\n===== 视口 375 =====')
console.log('溢出:', JSON.stringify(m.overflow))
console.log('按钮行:', JSON.stringify(m.acts))
await page.screenshot({ path: path.join(SHOTS, 'mine-probe-375.png') })

await page.setViewport({ width: 320, height: 640 })
await sleep(900)
m = await measure('320')
console.log('\n===== 视口 320 =====')
console.log('溢出:', JSON.stringify(m.overflow))
console.log('按钮行:', JSON.stringify(m.acts))
await page.screenshot({ path: path.join(SHOTS, 'mine-probe-320.png') })

await browser.close()
