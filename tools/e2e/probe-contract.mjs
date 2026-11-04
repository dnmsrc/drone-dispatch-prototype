// 探针：contract 页「确认完点下一步」到底发生了什么（verify-gate 里这一条 FAIL）。
// 只读事实，不改文件。看三件事：门过之后按钮标签是什么、有没有 toast、草稿里是否生成存证。
import puppeteer from 'puppeteer-core'
import { DISCLOSURE_VERSION } from '../../h5/src/engine/disclosure.js'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const vis = async sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim()), sel)
const click = async (sel, i = 0) => page.evaluate((s, i) => {
  const e = [...document.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)
const hash = async () => page.evaluate(() => location.hash)
const draft = async () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })
const toastText = async () => (await vis('[class*="toast"]')).join(' | ')
const label = async sel => (await vis(sel)).join(' | ')

async function h5load(url) {
  await page.evaluate(u => { location.hash = '#/pages/' + u }, url)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 300 })
  await sleep(900)
  const d = await draft()
  const c = d && d.contract
  console.log(`  [进 ${url} 后] step=${d && d.step} contract=${c ? c.no + (c.seed ? '(seed)' : '(signed)') + ' 签署人=' + c.name : '无'} acks=${((d && d.acks) || []).length}`)
}

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)

// 先走一遍把草稿建立起来（和 verify-gate 同样的前置）
await click('.venue-item', 3); await sleep(600)
await click('.bp-ck', 0); await sleep(300)
await click('.bp-ck', 0); await sleep(300)
await click('.bp-btn', 0); await sleep(300)
await h5load('apply/need')
await page.evaluate(() => { const i = [...document.querySelectorAll('input')].filter(e => e.getClientRects().length)[0]; if (i) { i.value = '1200'; i.dispatchEvent(new Event('input')) } }); await sleep(300)
await click('.pb-btn', 0); await sleep(600)
await h5load('apply/date')
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell')].filter(e => e.getClientRects().length && !/off/.test(e.className || '')); if (c[0]) c[0].click() }); await sleep(500)
await page.evaluate(() => { const s = [...document.querySelectorAll('.slot')].filter(e => e.getClientRects().length && !/dis/.test(e.className || '')); if (s[0]) s[0].click() }); await sleep(500)
await h5load('apply/quote')
await h5load('apply/consult')
await click('.ghost-btn', 1); await sleep(600)
console.log('  [模拟派单后] contract=', ((await draft()) || {}).contract ? '有' : '无')
const base = await draft()
console.log('base 草稿:', base && base.venue && base.venue.id, base && base.need && base.need.audience, base && base.date, base && base.slot, base && base.quote && base.quote.total, '| step:', base && base.step, '| base.contract:', !!base && !!base.contract)

// 干净草稿（acks 清空）进签署页
await page.evaluate(d => sessionStorage.setItem('apply_draft', JSON.stringify(d)), Object.assign({}, base, { acks: [] }))
await page.reload({ waitUntil: 'networkidle2' })
console.log('reload 后草稿里的存证:', !!((await draft()) || {}).contract)
await h5load('apply/contract')
console.log('进页后草稿里的存证:', !!((await draft()) || {}).contract)
console.log('== 签署页（未确认）==')
console.log('按钮标签（门前）:', await label('.pb-btn'))
await click('.pb-btn', 0); await sleep(700)
console.log('门弹窗标题:', (await vis('.bp-title')).join(' | '), '| 条款块:', (await vis('.bp-clause')).length)
for (let i = 0; i < 60; i++) { if (!(await click('.bp-ck', 0))) break; await sleep(300) }
console.log('草稿留痕条数:', ((await draft()).acks || []).length)
await click('.bp-btn', 0); await sleep(400)
console.log('关弹窗后按钮标签:', await label('.pb-btn'))
console.log('页上逐条确认计数（本地数组）:', await label('.sec-head'))
const before = await draft()
console.log('点签署前草稿里是否已有存证:', !!before && !!before.contract, before && before.contract ? before.contract.no : '')
await click('.pb-btn', 0)
for (let i = 1; i <= 5; i++) {
  await sleep(200)
  console.log(`+${i * 200}ms toast:`, (await toastText()).slice(0, 80) || '无', '| 弹窗:', (await vis('.bp-pop')).length, '| hash:', await hash())
}
const d = await draft()
console.log('草稿里是否生成存证:', !!d && !!d.contract, d && d.contract ? d.contract.no : '')
console.log('版本:', DISCLOSURE_VERSION)

await browser.close()
