// 下一步统一确认 + 右下角回看（2026-10-29 最新口径）：
// ① 填报时只选择/输入，不自动弹窗；点击下一步/提交/签署时才弹出本步未确认条款。
// ② 表单不出现“需确认/已确认”状态按钮；右下角统一回看已确认条款。
// ③ 确认记录 = 版本 + 条款号 + 触点 + 时间戳 + 账号 + 内容哈希，已确认不可撤销。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedUserLogin } from './seed-login.mjs'

const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const R = 750 / 480
let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`)
  cond ? pass++ : fail++
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const info = async sel => page.evaluate(s => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  return [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
    .map(e => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), h: e.offsetHeight }))
}, sel)
const click = async (sel, i = 0) => page.evaluate((s, i) => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)
const hash = async () => page.evaluate(() => location.hash)
const draft = async () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })
const toastText = async () => page.evaluate(() => [...document.querySelectorAll('[class*="toast"]')].filter(e => e.getClientRects().length).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' | '))
const stateEntries = async () => page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  return [...top.querySelectorAll('.entry-chip')].filter(e => e.getClientRects().length && (/pend|done/.test(e.className || '') || /需确认|已确认/.test(e.textContent || '')))
    .map(e => e.textContent.replace(/\s+/g, ' ').trim())
})
const fabInfo = async () => page.evaluate(() => {
  const e = [...document.querySelectorAll('.ack-fab')].find(x => x.getClientRects().length)
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { text: e.textContent.replace(/\s+/g, ' ').trim(), left: r.left, top: r.top, right: r.right, bottom: r.bottom, h: r.height * (750 / innerWidth), vw: innerWidth, vh: innerHeight }
})
const go = async name => {
  await page.evaluate(u => { location.hash = '#/pages/apply/' + u }, name)
  await sleep(1000)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 200 })
}
const load = async name => {
  await page.goto(`${H5}/#/pages/apply/${name}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(700)
}
const confirmAllAndClose = async () => {
  for (let i = 0; i < 40; i++) {
    const buttons = await info('.bp-ck')
    if (!buttons.length) break
    await click('.bp-ck', 0)
    await sleep(140)
  }
  await click('.bp-btn', 0)
  await sleep(300)
}

// 2026-11-03 新增登录门：预约流程未登录会被挡到登录页，判据必须先种「已登录」再量页面。
await seedUserLogin(page, H5)
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1000)

ok('直接进第 1 步，不在流程开头批量确认', (await hash()).includes('apply/venue') && !(await info('.bp-pop')).length)
ok('初始没有整批确认记录', !(((await draft()) || {}).acks || []).length)
ok('表单没有“需确认/已确认”状态按钮', (await stateEntries()).length === 0)
ok('导航栏不再放申请说明大入口', !(await info('.navbar .entry-chip')).length)
const fab0 = await fabInfo()
ok('右下角有轻量申请说明入口（88rpx）', !!fab0 && fab0.text.includes('申请说明') && fab0.left > fab0.vw / 2 && fab0.top > fab0.vh / 2 && Math.abs(fab0.h - 88) <= 2, JSON.stringify(fab0))

// 场地：选择时不弹；下一步才弹。
await click('.venue-item', 3)
await sleep(400)
ok('选择触发条款的场地时不自动弹窗', !(await info('.bp-pop')).length)
ok('选择场地时不提前写确认记录', !(((await draft()) || {}).acks || []).length)
await click('.pb-btn', 0)
await sleep(400)
ok('点击下一步才弹出本步确认门', (await info('.bp-pop')).length === 1)
ok('场地门只列本步触发的 2 条', (await info('.bp-clause')).length === 2, `${(await info('.bp-clause')).length} 条`)
ok('确认按钮只在弹窗内且达到 88rpx', (await info('.bp-ck')).length === 2 && (await info('.bp-ck')).every(b => Math.round(b.h * R) >= 88))
await confirmAllAndClose()
const acked = ((await draft()) || {}).acks || []
ok('两次独立确认写入两条留痕', acked.length === 2 && acked.every(e => e.v && e.clause && e.touch && e.at && e.user && e.hash), JSON.stringify(acked))
ok('确认后表单仍不出现状态按钮', (await stateEntries()).length === 0)

// 右下角统一入口只读回看。
await click('.ack-fab', 0); await sleep(300)
ok('统一入口打开已确认条款面板', (await info('.ad-panel')).length === 1)
ok('本步面板列出刚确认的 2 条', (await info('.ad-item')).length === 2 && (await info('.ad-sub')).some(e => e.t.includes('本步 2 条')))
ok('面板展示正文与留痕，不放确认按钮', (await info('.ad-text')).length === 2 && (await info('.ad-meta')).length === 2 && !(await info('.ad-panel .bp-ck')).length)
await page.screenshot({ path: path.join(SHOTS, 'ack-dock-step1.png') }).catch(() => {})
await click('.ad-tab', 1); await sleep(200)
ok('可切换查看全部已确认条款', (await info('.ad-item')).length === 2 && (await info('.ad-tab.on')).some(e => e.t.includes('全部')))
await click('.ad-close', 0); await sleep(200)

// 再选场地仍不弹；已确认不可撤销。
await click('.venue-item', 4); await sleep(250)
await click('.venue-item', 3); await sleep(250)
ok('重复选择不自动弹窗且确认记录不重复', !(await info('.bp-pop')).length && (((await draft()) || {}).acks || []).length === 2)
await click('.venue-item', 1); await sleep(250)

// 规模与观众：失焦不弹，下一步集中确认。
await go('need')
await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(e => e.getClientRects().length); i && i.focus() })
await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
await page.keyboard.type('1200')
await sleep(200)
await page.evaluate(() => { const i = [...document.querySelectorAll('input')].find(e => e.getClientRects().length); i && i.blur() })
await sleep(400)
ok('填写观众人数及失焦时不自动弹窗', !(await info('.bp-pop')).length)
ok('填写观众人数时不提前新增确认记录', (((await draft()) || {}).acks || []).length === 2)
await click('.pb-btn', 0); await sleep(400)
ok('规模页点击下一步才弹出确认门', (await info('.bp-pop')).length === 1 && (await info('.bp-clause')).length >= 3, `${(await info('.bp-clause')).length} 条`)
await confirmAllAndClose()

// 日期与时段：选择不弹，下一步确认天气、改期、时段等条款。
// 整页加载让 store 按真实算法补一个可提交日期/时段，随后仍再点一次验证不会自动弹窗。
await load('date')
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell:not(.pad):not(.off)')].find(e => e.getClientRects().length); c && c.click() })
await sleep(300)
ok('选择日期时不自动弹窗', !(await info('.bp-pop')).length)
await page.evaluate(() => {
  const list = [...document.querySelectorAll('.slot:not(.dis)')].filter(e => e.getClientRects().length)
  const s = list.find(e => (e.textContent || '').includes('20:00')) || list[0]
  s && s.click()
})
await sleep(300)
ok('选择申请时段时不自动弹窗', !(await info('.bp-pop')).length)
const dateDraft = (await draft()) || {}
ok('日期与时段已真实写入草稿', !!dateDraft.date && !!dateDraft.slot, `${dateDraft.date || '无日期'} ${dateDraft.slot || '无时段'}`)
await click('.pb-btn', 0); await sleep(400)
ok('日期页点击下一步才弹出确认门', (await info('.bp-pop')).length === 1 && (await info('.bp-clause')).length >= 2, `${(await info('.bp-clause')).length} 条 · ${await toastText()}`)
await confirmAllAndClose()

// 报价是结果页，但确认同样只在点击“转人工咨询”时发生。
await go('quote')
ok('生成报价结果时不自动弹窗', !(await info('.bp-pop')).length)
await click('.pb-btn', 0); await sleep(400)
ok('点击转人工咨询才弹出报价与付款条款', (await info('.bp-pop')).length === 1 && (await info('.bp-clause')).length === 3, `${(await info('.bp-clause')).length} 条`)
await confirmAllAndClose()

// 全站各申请页都不显示旧状态按钮，且只有右下角一个统一入口。
for (const [name, url] of [['第1步', 'venue'], ['第2步', 'need'], ['第3步', 'date'], ['第4步', 'quote'], ['第5步', 'consult'], ['第6步', 'contract']]) {
  await go(url)
  ok(`${name} 无旧确认状态按钮`, (await stateEntries()).length === 0)
  ok(`${name} 右下角统一入口唯一`, (await info('.ack-fab')).length === 1 && !(await info('.navbar .entry-chip')).length)
}

// 签署门仍在点击签署时生效。
await click('.pb-btn', 0); await sleep(400)
ok('点击签署才弹出剩余确认条款', (await hash()).includes('contract') && /未确认/.test((((await info('.bp-title'))[0] || {}).t || '')) && !/未确认/.test(await toastText()))

// 说明页只读，且不递归出现右下角入口。
await page.goto(`${H5}/#/pages/apply/disclosure`, { waitUntil: 'networkidle2' }); await sleep(700)
ok('申请说明页只读且无递归悬浮入口', !(await info('.ack-fab')).length && !(await info('.bp-ck')).length && (await info('.item')).length >= 40)

// 负控：自动弹窗、旧状态按钮、重复入口或全量 54 条必须判失败。
const noAutoPop = n => n === 0
const noOldStates = n => n === 0
const oneDock = (dock, nav) => dock === 1 && nav === 0
const partialGate = n => n >= 1 && n < 54
const neg = [
  ['选择时自动弹窗', noAutoPop(1)],
  ['旧状态按钮', noOldStates(1)],
  ['导航大入口/重复入口', oneDock(0, 1)],
  ['门只列还欠条款', partialGate(54)]
]
console.log(`\n负控: ${neg.map(([n, p]) => `${n}=${p ? '❌ 空判' : '✅ 生效'}`).join(' · ')}`)
if (neg.some(([, p]) => p)) fail++

await browser.close()
console.log(`\n合计 PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
