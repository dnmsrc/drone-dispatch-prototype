// 验证用户本轮报告的 5 个问题（用户看的是 5173 dev；8090 构建产物同样跑一遍）
import puppeteer from 'puppeteer-core'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.BASE || 'http://localhost:5173'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = { base: BASE, scenes: {} }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1200,1000'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)) })

const v = (fn) => page.evaluate(fn)
const hashOf = () => v(() => location.hash)
const goHash = async (hash, wait = 2400) => {
  await page.goto(`${BASE}/?t=${Date.now()}#${hash}`, { waitUntil: 'networkidle2' })
  await sleep(wait)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000 }).catch(() => {})
}
const clickText = (re) => page.evaluate((reStr) => {
  const re = new RegExp(reStr)
  const el = [...document.querySelectorAll('button, uni-button, view')].filter(e => e.getClientRects().length)
    .find(e => re.test(e.textContent) && e.tagName === 'UNI-BUTTON')
  const target = el || [...document.querySelectorAll('button, uni-button')].filter(e => e.getClientRects().length).find(e => re.test(e.textContent))
  if (target) { target.click(); return true }
  return false
}, re)
const toasts = () => v(() => [...document.querySelectorAll('[class*="toast"], .uni-toast, .uni-simple-toast')].map(e => e.textContent.trim()).filter(Boolean))

// 清空登录与草稿：先在同源页面里清，再重载目标 hash
const reset = async () => {
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle2' })
  await sleep(800)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
}

// ── 场景 1：未登录点「立即预约表演」→ 应被登录门拦住并跳登录页（问题 3）
await reset()
await goHash('/pages/index/index', 3400)
const c1 = await clickText('立即预约表演')
await sleep(1600)
out.scenes.s1_guest_gate = { clicked: c1, hash: await hashOf(), toast: await toasts(), pages: await v(() => (typeof getCurrentPages === 'function' ? getCurrentPages().map(p => p.route) : [])) }
await page.screenshot({ path: '../../shots/v5-1-gate.png' })

// ── 场景 2：登录后应回到预约表单（redirect），并验证已登录（问题 2、3）
const loginPage = /login/.test(out.scenes.s1_guest_gate.hash)
if (loginPage) {
  await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
  await sleep(1200)
  await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
  await sleep(2600)
}
out.scenes.s2_after_login = { hash: await hashOf(), token: await v(() => (typeof uni !== 'undefined' && uni.getStorageSync ? String(uni.getStorageSync('token') || '').slice(0, 20) : 'no-uni')) }

// ── 场景 3：第 5 步 textarea 宽度 vs 卡片内容区（问题 1）
await goHash('/pages/apply/consult', 2600)
out.scenes.s3_textarea = await v(() => {
  const body = document.querySelector('uni-page-body')
  if (!body) return { err: 'no page body' }
  const card = [...body.querySelectorAll('.card')].filter(e => e.getClientRects().length)[0]
  if (!card) return { err: 'no card' }
  const ta = [...body.querySelectorAll('uni-textarea')].find(e => e.getClientRects().length)
  const inner = ta ? [...ta.querySelectorAll('.uni-textarea-textarea')].find(e => e.getClientRects().length) : null
  const cr = card.getBoundingClientRect(); const cs = getComputedStyle(card)
  const padR = parseFloat(cs.paddingRight), padL = parseFloat(cs.paddingLeft)
  const contentW = cr.width - padL - padR
  const tr = ta ? ta.getBoundingClientRect() : null
  const ir = inner ? inner.getBoundingClientRect() : null
  return {
    card: { w: +cr.width.toFixed(1), contentW: +contentW.toFixed(1), pad: cs.padding },
    ta: tr ? { w: +tr.width.toFixed(1), left: +tr.left.toFixed(1), right: +tr.right.toFixed(1) } : null,
    inner: ir ? { w: +ir.width.toFixed(1) } : null,
    gapRight: tr ? +(cr.right - padR - tr.right).toFixed(1) : null,
    ok: tr ? Math.abs(tr.width - contentW) <= 1 : false
  }
})
await page.screenshot({ path: '../../shots/v5-2-textarea.png' })

// 场景 3b：已登录点「提交咨询单」不应再提示登录（问题 2）
const subClick = await clickText('提交咨询单')
await sleep(1600)
out.scenes.s3b_submit = { clicked: subClick, toast: await toasts(), hash: await hashOf() }

// ── 场景 4：我的预约空态「去预约表演」→ 直接进预约表单（问题 4）
await page.setRequestInterception(true).catch(() => {})
page.on('request', req => {
  if (/\/api\/consults\/mine/.test(req.url())) req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { list: [] } }) })
  else req.continue()
})
await goHash('/pages/consult/index', 2600)
const c4 = await clickText('去预约表演')
await sleep(1600)
out.scenes.s4_mine_goapply = { clicked: c4, hash: await hashOf(), pages: await v(() => (typeof getCurrentPages === 'function' ? getCurrentPages().map(p => p.route) : [])) }
await page.screenshot({ path: '../../shots/v5-3-mine.png' })

// ── 场景 5：表单页点返回 = 回上一步（问题 5）；含「刷新后栈只剩一页」的兜底
await goHash('/pages/apply/need', 2400)
await page.evaluate(() => { const l = [...document.querySelectorAll('.navbar .left')].find(e => e.getClientRects().length); if (l) l.click() })
await sleep(1600)
out.scenes.s5_back_from_need = { hash: await hashOf() }
await goHash('/pages/apply/date', 2400)
await page.evaluate(() => { const l = [...document.querySelectorAll('.navbar .left')].find(e => e.getClientRects().length); if (l) l.click() })
await sleep(1600)
out.scenes.s5_back_from_date = { hash: await hashOf() }
await goHash('/pages/apply/venue', 2400)
await page.evaluate(() => { const l = [...document.querySelectorAll('.navbar .left')].find(e => e.getClientRects().length); if (l) l.click() })
await sleep(1600)
out.scenes.s5_back_from_venue = { hash: await hashOf() }

// ── 场景 6：从首页重新进入预约 → 从头开始（第 1 步），不会「复活」到退出前的步骤
await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle2' }); await sleep(600)
await page.evaluate(() => {
  const draft = { step: 3, need: { droneCount: 100, duration: 10, contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 200 }, venue: null, date: '', slot: '' }
  sessionStorage.setItem('apply_draft', JSON.stringify(draft))
})
await goHash('/pages/index/index', 3400)
const c6 = await clickText('立即预约表演')
await sleep(2200)
// 若被「已有进行中的单」弹层拦住，点「重新申请」
await page.evaluate(() => { const b = [...document.querySelectorAll('button, uni-button')].find(e => /重新申请/.test(e.textContent) && e.getClientRects().length); if (b) b.click() })
await sleep(1600)
out.scenes.s6_home_entry = { clicked: c6, hash: await hashOf(), step: await v(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || '{}').step } catch (e) { return null } }) }

await browser.close()
console.log(JSON.stringify(out, null, 2))
