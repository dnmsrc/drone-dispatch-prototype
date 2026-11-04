// 刷新（F5）不再白屏：草稿按会话存 + 冷进入时按真实算法兜底补齐。
// 判据用 DOM 实测：hash、页面文本、步骤条当前步、sessionStorage 草稿、pageerror 必须为空。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })

function watch(p) {
  p.__errs = []
  p.on('pageerror', e => p.__errs.push(e.message))
  return p
}
const hashOf = (p) => p.evaluate(() => location.hash)
const textOf = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim())
const stepSnap = (p) => p.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  if (!bar) return null
  const items = [...bar.querySelectorAll('.st')]
  return {
    cur: items.findIndex(x => [...x.classList].some(c => c === 's-cur')) + 1,
    states: items.map(x => [...x.classList].find(c => c.startsWith('s-'))),
    labels: items.map(x => (x.querySelector('.lb') ? x.querySelector('.lb').textContent : '').trim())
  }
})
const draftOf = (p) => p.evaluate(() => {
  const raw = sessionStorage.getItem('apply_draft')
  if (!raw) return null
  try { return JSON.parse(raw) } catch (e) { return null }
})
const clickBtn = async (p, need) => {
  const label = await p.evaluate(() => { const b = document.querySelector('.pb-btn'); return b ? b.textContent.trim() : '' })
  if (!label.includes(need)) { console.log(`❌ 按钮不是「${need}」（当前「${label}」，hash=${await hashOf(p)}）`); return false }
  await p.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
  await sleep(1200)
  return true
}

const page = watch(await browser.newPage())
await page.setViewport({ width: 900, height: 1000 })

// 登录（mock 微信授权）
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)
if (!(await page.evaluate(() => (localStorage.getItem('token') || '').startsWith('utk_')))) {
  console.log('❌ 登录失败'); await browser.close(); process.exit(1)
}

// A. 走真实流程到第 4 步，然后 F5：草稿必须还在、内容必须一样、步骤条当前步仍是 4
// 先过确认门（2026-10-28：不勾选「已知晓」不能进填报页）
await page.goto(`${H5}/#/pages/apply/disclosure`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { [...document.querySelectorAll('.box.risk-box')].forEach(e => e.click()); const b = [...document.querySelectorAll('.box.ack')].find(e => e.getClientRects().length); b && b.click() })
await sleep(300)
await page.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
await sleep(1200)

// 2026-10-28 顺序调整：第 1 步场地 → 第 2 步规模与内容 → 第 3 步日期时段 → 第 4 步报价区间
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await sleep(1500)
await page.evaluate(() => { const it = [...document.querySelectorAll('.venue-item')].find(x => (x.textContent || '').includes('海埂大坝')); it && it.click() })
await sleep(700)
if (!await clickBtn(page, '下一步 · 按这个场地的上限定规模')) { await browser.close(); process.exit(1) }
if (!await clickBtn(page, '下一步 · 选日期与时段')) { await browser.close(); process.exit(1) }
let day = null
for (let t = 0; t < 4 && !day; t++) {
  day = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.cell')].find(x => x.classList.contains('ok') && !x.classList.contains('off'))
    if (c) { c.click(); return (c.textContent || '').trim() }
    const navs = [...document.querySelectorAll('.cal .nav')]
    if (navs[1]) navs[1].click()
    return null
  })
  await sleep(400)
}
if (!day) { console.log('❌ 日历里没有可安排的日期'); await browser.close(); process.exit(1) }
await page.evaluate(() => { const s = [...document.querySelectorAll('.slot')].find(x => !x.classList.contains('dis')); s && s.click() })
await sleep(500)
if (!await clickBtn(page, '下一步 · 看报价区间')) { await browser.close(); process.exit(1) }

const beforeText = await textOf(page)
const beforeStep = await stepSnap(page)
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1600)
const afterText = await textOf(page)
const afterStep = await stepSnap(page)
const afterDraft = await draftOf(page)
const hashAfter = await hashOf(page)

const checks = [
  ['A 刷新后还在第 4 步的页面', hashAfter.includes('quote')],
  ['A 刷新后草稿还在（sessionStorage）', !!afterDraft && afterDraft.step === 4 && !!afterDraft.venue && !!afterDraft.date && !!afterDraft.quote],
  ['A 刷新后内容逐字一致', beforeText === afterText && beforeText.length > 120],
  ['A 刷新后步骤条当前步 = 4', !!beforeStep && !!afterStep && beforeStep.cur === 4 && afterStep.cur === 4],
  ['A 刷新后 1-3 仍绿、5-8 仍灰', !!afterStep && afterStep.states.slice(0, 3).every(s => s === 's-done') && afterStep.states.slice(4).every(s => s === 's-todo')],
  ['A 走流程 + 刷新全程无 pageerror', page.__errs.length === 0]
]

// B. 冷进入（新标签页 = 新 sessionStorage）直接打开某一步：不能崩，要按真实算法补齐
// 2026-10-28：新标签页先被确认门挡在告知确认书 —— 先确认（这是已定行为，判据在 verify-order.mjs），再冷进入那一步
async function coldOpen(url) {
  const p = watch(await browser.newPage())
  await p.setViewport({ width: 900, height: 1000 })
  await p.goto(`${H5}/#/${url}`, { waitUntil: 'networkidle2' })
  await sleep(1600)
  if ((await hashOf(p)).includes('disclosure')) {
    await p.evaluate(() => { [...document.querySelectorAll('.box.risk-box')].forEach(e => e.click()); const b = [...document.querySelectorAll('.box.ack')].find(e => e.getClientRects().length); b && b.click() })
    await sleep(300)
    await p.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
    await sleep(1200)
    await p.goto(`${H5}/#/${url}`, { waitUntil: 'networkidle2' })
    await sleep(1600)
  }
  const r = { url, step: (await stepSnap(p) || {}).cur, text: await textOf(p), draft: await draftOf(p), errs: p.__errs }
  await p.close()
  return r
}
const b8 = await coldOpen('pages/apply/progress')
const b7 = await coldOpen('pages/apply/pay')
const b4 = await coldOpen('pages/apply/quote')
const b3 = await coldOpen('pages/apply/date')

checks.push(['B 冷进入第 8 步不崩（当前步 = 8 且有内容）', b8.errs.length === 0 && b8.step === 8 && b8.text.length > 120])
checks.push(['B 冷进入第 7 步不崩（当前步 = 7 且有内容）', b7.errs.length === 0 && b7.step === 7 && b7.text.length > 120])
checks.push(['B 冷进入第 4 步不崩（当前步 = 4 且有内容）', b4.errs.length === 0 && b4.step === 4 && b4.text.length > 120])
checks.push(['B 冷进入第 3 步不崩（当前步 = 3 且有内容）', b3.errs.length === 0 && b3.step === 3 && b3.text.length > 120])
checks.push(['B 冷进入的第 8 步补出了合同与已付节点', !!b8.draft && !!b8.draft.contract && b8.draft.contract.paidNodes.length > 0])
checks.push(['B 冷进入的第 4 步补出了报价', !!b4.draft && !!b4.draft.quote && b4.draft.quote.total > 0])

const out = path.join(SHOTS, 'stepbar-after-refresh.png')
await page.reload({ waitUntil: 'networkidle2' })   // 回到第 4 步的页面再拍（C 会退出登录）
await sleep(1500)
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`\n截图: ${out}`)

// C. 退出登录 = 这一段演示结束：草稿必须跟着清，不能把上一段的应用单带给下一个登录的人
await page.goto(`${H5}/#/pages/user/index`, { waitUntil: 'networkidle2' })
await sleep(1400)
const logoutClicked = await page.evaluate(() => {
  const it = [...document.querySelectorAll('.menu-item')].find(x => (x.textContent || '').includes('退出登录'))
  if (!it) return false
  it.click()
  return true
})
await sleep(800)
await page.evaluate(() => {
  const box = document.querySelector('uni-modal') || document.querySelector('.uni-modal')
  if (!box) return
  const ok = [...box.querySelectorAll('*')].find(x => (x.textContent || '').trim() === '确定')
  if (ok) ok.click()
})
await sleep(1400)
const afterLogout = await draftOf(page)
const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('token') || '')

checks.push(['C 点退出登录（弹框确认）', logoutClicked])
checks.push(['C 退出后草稿清空（step 1、无场地）', !!afterLogout && afterLogout.step === 1 && !afterLogout.venue && !afterLogout.quote])
checks.push(['C 退出后 token 已清', tokenAfterLogout === ''])

console.log(`\nA 文本长度 刷新前=${beforeText.length} 刷新后=${afterText.length}`)
console.log('A 刷新后草稿：step', afterDraft && afterDraft.step, '| 场地', afterDraft && afterDraft.venue && afterDraft.venue.name, '| 日期', afterDraft && afterDraft.date, afterDraft && afterDraft.slot)
for (const r of [b8, b7, b4, b3]) console.log(`B ${r.url} 当前步=${r.step} 文本=${r.text.length} 错误=${r.errs.length ? r.errs[0].slice(0, 120) : '无'}`)
console.log(`C 退出后草稿 step=${afterLogout && afterLogout.step} 场地=${afterLogout && afterLogout.venue ? afterLogout.venue.name : '无'} token=${tokenAfterLogout || '(空)'}`)
console.log('A pageerror:', page.__errs.length ? page.__errs : '无')
console.log('')
for (const [n, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${n}`)

await browser.close()
