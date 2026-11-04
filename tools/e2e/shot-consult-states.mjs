// 第 5 步咨询派单的关键状态截图（视觉核对用）：未提交 / 待接待 / 已派单待确认 / 冲突层 / 我的预约 / admin 派单弹窗
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const ADMIN = 'http://localhost:8080'
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
  executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 15,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))
const adminPage = await browser.newPage()
await adminPage.setViewport({ width: 1280, height: 900 })

const click = (sel, i = 0) => page.evaluate((s, i) => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click(); return true
}, sel, i)
const confirmAll = async () => { for (let i = 0; i < 60; i++) { if (!(await click('.bp-ck', 0))) break; await sleep(220) } }
const shot = async (p, name) => { await sleep(450); await p.screenshot({ path: path.join(SHOTS, name) }).catch(e => console.log('shot fail', name, e.message.slice(0, 60))) }

// 用户登录
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

// ① 未提交
await page.evaluate(() => sessionStorage.clear())
await page.goto(`${H5}/?t=${Date.now()}#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await sleep(2000)
await shot(page, 'consult-s1-draft.png')

// ② 提交门（先截门，再确认提交）
await click('.submit-consult', 0); await sleep(900)
await shot(page, 'consult-s2-gate.png')
await confirmAll(); await sleep(300); await click('.bp-btn', 0); await sleep(400)
await click('.submit-consult', 0); await sleep(1400)
await shot(page, 'consult-s3-waiting.png')
const cno = await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop()
  const kv = [...top.querySelectorAll('.kv')].find(k => (k.querySelector('.k') || {}).innerText === '单号')
  return kv ? (kv.querySelector('.v').innerText || '').trim() : ''
})
console.log('单号', cno)

// ③ 客服接待 → 用户看到已接待
await call('POST', `/api/admin/consults/${cno}/receive`, {}, atk)
await click('.refresh-btn', 0); await sleep(1300)
await shot(page, 'consult-s4-received.png')

// ④ 客服创建派单 → 用户看到已派单待确认
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
await click('.refresh-btn', 0); await sleep(1500)
await shot(page, 'consult-s5-dispatched.png')

// ⑤ 冲突层：另起一张草稿（同场地不同日期）→ 提交撞 40901
const cur = await page.evaluate(() => JSON.parse(sessionStorage.getItem('apply_draft') || '{}'))
const nd = { ...cur, step: 5, consult: null, dispatch: null, contract: null, payment: null, date: '2026-12-05', slot: '20:00' }
await page.evaluateOnNewDocument((json) => { try { sessionStorage.setItem('apply_draft', json) } catch (e) {} }, JSON.stringify(nd))
await page.goto(`${H5}/?t=${Date.now()}#/pages/apply/consult`, { waitUntil: 'networkidle2' })
await sleep(2000)
await shot(page, 'consult-s6-other.png')
await click('.submit-consult', 0); await sleep(1200)
await shot(page, 'consult-s7-conflict.png')
await click('.pb-inline', 0); await sleep(1600)

// ⑥ 我的预约
await page.evaluate(() => { location.hash = '#/pages/consult/index' }); await sleep(2000)
await shot(page, 'consult-s8-mine.png')

// ⑦ admin 工作台（真实 UI）：列表 + 派单弹窗（六项校验）
await adminPage.evaluateOnNewDocument((tk, info) => {
  localStorage.setItem('admin_token', tk); localStorage.setItem('admin_info', info)
}, atk, JSON.stringify(al.data.admin))
await adminPage.goto(`${ADMIN}/consult`, { waitUntil: 'networkidle2' })
await sleep(2200)
await shot(adminPage, 'consult-a1-list.png')
// 默认页签是「待接待」，先切到「全部」才能看到 RECEIVED 单的「创建派单」按钮
const tabbed = await adminPage.evaluate(() => {
  const items = [...document.querySelectorAll('.el-tabs__item')].filter(e => e.getClientRects().length)
  const all = items.find(e => (e.innerText || '').replace(/\s+/g, '').startsWith('全部'))
  if (!all) return false
  all.click(); return true
})
if (tabbed) { await sleep(1500); await shot(adminPage, 'consult-a1b-list-all.png') }
// 打开某张 RECEIVED 单的「创建派单」
const opened = await adminPage.evaluate(() => {
  const rows = [...document.querySelectorAll('.el-table__row')].filter(e => e.getClientRects().length)
  for (const r of rows) {
    const btn = [...r.querySelectorAll('button')].find(b => (b.innerText || '').includes('创建派单'))
    if (btn) { btn.click(); return true }
  }
  return false
})
if (opened) {
  await sleep(900)
  // 空表点一次提交，截「必填校验」态
  await adminPage.evaluate(() => {
    const dlg = [...document.querySelectorAll('.el-dialog')].find(e => e.getClientRects().length)
    const b = dlg && [...dlg.querySelectorAll('button')].find(x => (x.innerText || '').includes('确认创建派单'))
    if (b) b.click()
  })
  await sleep(1000)
  await shot(adminPage, 'consult-a2-dispatch-empty.png')
}
console.log('done')
await browser.close()
