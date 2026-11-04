// 2026-10-28 两条新规则的判据（全部用 DOM 实测，不用像素图）：
//   A) 步骤条只允许点「当前填报步骤之前」的步骤；当前之后的步骤不可点
//   B) 回退改完只能从这一步重新往下走；之前保存的数据保留（草稿在 sessionStorage 的 apply_draft）
//   C) 场地只开放固定预设：申请页与下单页都不能有地图选点 / 手动输入入口
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
const page = await browser.newPage()
await page.setViewport({ width: 900, height: 1000 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

const hash = () => page.evaluate(() => location.hash)
const draft = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })
const barItems = () => page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  if (!bar) return null
  return [...bar.querySelectorAll('.st')].map((st, i) => {
    const lb = st.querySelector('.lb')
    return {
      i: i + 1,
      label: (lb ? lb.textContent : '').trim(),
      state: String([...st.classList].find(c => c.startsWith('s-')) || '').replace(/^s-/, ''),
      can: st.classList.contains('can'),
      cursor: getComputedStyle(st).cursor,
      deco: lb ? getComputedStyle(lb).textDecorationLine : '',
      color: lb ? getComputedStyle(lb).color : ''
    }
  })
})
const clickItem = (n) => page.evaluate((n) => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  const st = [...bar.querySelectorAll('.st')][n - 1]
  st.click()
}, n)
const nextBtn = () => page.evaluate(() => {
  const b = document.querySelector('.pb-btn')
  return b ? { label: b.textContent.trim(), clicked: !!(b.click && (b.click(), true)) } : null
})

// 登录（mock 微信授权）
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)
console.log('token=', await page.evaluate(() => (localStorage.getItem('token') || '').slice(0, 12)))

// 先过确认门（2026-10-28：不勾选「已知晓」不能进填报页）
await page.goto(`${H5}/#/pages/apply/disclosure`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { [...document.querySelectorAll('.box.risk-box')].forEach(e => e.click()); const b = [...document.querySelectorAll('.box.ack')].find(e => e.getClientRects().length); b && b.click() })
await sleep(300)
await page.evaluate(() => { const b = document.querySelector('.pb-btn'); b && b.click() })
await sleep(1200)

// 走到第 4 步（草稿是会话态，第一页 reload 后全靠点按钮往前走）
// 2026-10-28 顺序调整：第 1 步场地 → 第 2 步规模与内容 → 第 3 步日期时段 → 第 4 步报价区间
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)

const pickedVenue = await page.evaluate(() => {
  const it = [...document.querySelectorAll('.venue-item')].find(x => (x.textContent || '').includes('海埂大坝'))
  if (!it) return null
  it.click()
  return (it.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)
})
if (!pickedVenue) { console.log('❌ 找不到场地「海埂大坝观景平台」'); await browser.close(); process.exit(1) }
console.log('第 1 步场地:', pickedVenue)
await sleep(700)
await nextBtn(); await sleep(1200)
const tierAt2 = await page.evaluate(() => { const t = document.querySelector('.tier.on .tier-num'); return t ? t.textContent.trim() : '' })
console.log('第 2 步规模:', tierAt2)
await nextBtn(); await sleep(1200)

let day = null
for (let t = 0; t < 4; t++) {
  day = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.cell')].find(x => x.classList.contains('ok') && !x.classList.contains('off'))
    if (c) { c.click(); return (c.textContent || '').trim() }
    const navs = [...document.querySelectorAll('.cal .nav')]
    if (navs[1]) navs[1].click()
    return null
  })
  if (day) break
  await sleep(400)
}
if (!day) { console.log('❌ 日历里没有可安排的日期'); await browser.close(); process.exit(1) }
console.log('日期:', day)
await sleep(500)
const slot = await page.evaluate(() => {
  const s = [...document.querySelectorAll('.slot')].find(x => !x.classList.contains('dis'))
  if (!s) return null
  s.click()
  return (s.textContent || '').trim()
})
if (!slot) { console.log('❌ 没有可选时段'); await browser.close(); process.exit(1) }
console.log('时段:', slot)
await sleep(500)
await nextBtn(); await sleep(1200)
console.log(`走到 ${await hash()}`)

const GREEN = 'rgb(43, 164, 113)', GRAY = 'rgb(154, 160, 181)', BLUE = 'rgb(74, 108, 247)'
const at4 = await barItems()
const s4 = {}
for (const it of at4) s4[it.state] = it
const futureAt4 = at4.filter(i => i.i > s4.cur.i)

// 判据 A1：当前之后的步骤不可点（点第 6 项，hash 不变）
const beforeJump = await hash()
await clickItem(6)
await sleep(900)
const afterJump = await hash()

// 判据 A2：当前之前的步骤可点（点第 2 项 → 回到规模与内容步，此时第 1 项是绿档）
await clickItem(2)
await sleep(1200)
const backHash = await hash()
const atBack = await barItems()
const sBack = {}
for (const it of atBack) sBack[it.state] = it

// 判据 B1：回退后不能跳到后面 —— 再点第 1 项回到场地步，然后点第 3 项，hash 必须不变
await clickItem(1)
await sleep(1200)
const atStep1 = await barItems()
const sStep1 = {}
for (const it of atStep1) sStep1[it.state] = it
const beforeStep3 = await hash()
await clickItem(3)
await sleep(900)
const afterStep3 = await hash()

// 判据 B2：数据保留 —— 换场地只作废「结论」，第 3 步已选的日期时段不动
const dBefore = await draft()
const changed = await page.evaluate(() => {
  const it = [...document.querySelectorAll('.venue-item')].find(x => (x.textContent || '').includes('滇池国际会展中心广场'))
  if (!it) return null
  it.click()
  return (it.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)
})
await sleep(900)
const dAfter = await draft()
// 判据 C 的场地页部分：此刻正停在第 1 步（场地页），在这里实测
const venueTabs = await page.evaluate(() => [...document.querySelectorAll('.vtab')].map(x => x.textContent.trim()))
console.log(`换场地：${changed}`)
console.log(`  换前草稿 date=${dBefore && dBefore.date} slot=${dBefore && dBefore.slot} · 换后 date=${dAfter && dAfter.date} slot=${dAfter && dAfter.slot} · judgment=${dAfter && dAfter.judgment ? '有' : '已作废'} quote=${dAfter && dAfter.quote ? '有' : '已作废'}`)

// 判据 B3：只能从这一步重新往下走 —— 从第 1 步逐步重新确认：第 2 步规模保留，第 3 步日期时段保留
await nextBtn(); await sleep(1200)
const rewHash2 = await hash()
const tierAfter = await page.evaluate(() => { const t = document.querySelector('.tier.on .tier-num'); return t ? t.textContent.trim() : '' })
await nextBtn(); await sleep(1200)
const rewHash = await hash()
// 日历默认显示当前月，先翻到保存日期所在的月份再验选中态
const target = dAfter.date
const [ty, tm] = target.split('-').map(Number)
for (let t = 0; t < 14; t++) {
  const cur = await page.evaluate(() => {
    const ym = document.querySelector('.cal .ym')
    return ym ? ym.textContent.trim() : ''
  })
  const m = /(\d+)\s*年\s*(\d+)\s*月/.exec(cur)
  if (m && +m[1] === ty && +m[2] === tm) break
  await page.evaluate(() => { const navs = [...document.querySelectorAll('.cal .nav')]; if (navs[1]) navs[1].click() })
  await sleep(300)
}
const selCell = await page.evaluate(() => {
  const c = document.querySelector('.cell.sel')
  return c ? (c.textContent || '').trim() : null
})
const slotOn = await page.evaluate(() => {
  const s = document.querySelector('.slot.on')
  return s ? (s.textContent || '').trim() : null
})
const selDay = selCell ? parseInt(selCell, 10) : 0
const wantDay = Number(target.split('-')[2])
console.log(`重走到 ${rewHash} · 日历仍选中 ${selCell}（目标 ${target}）· 时段仍选中 ${slotOn}`)

// 判据 C：两个页面都没有地图选点 / 手动输入（场地页的实测在 B2 处 —— 那时正停在第 1 步）
await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
const createTabs = await page.evaluate(() => [...document.querySelectorAll('.vtab')].map(x => x.textContent.trim()))
const createNote = await page.evaluate(() => {
  const n = document.querySelector('.venue-fixed-note')
  return n ? (n.textContent || '').trim() : ''
})
const createItems = await page.evaluate(() => [...document.querySelectorAll('.venue-item')].map(x => (x.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)))

const checks = [
  ['A1 第4步时当前之后不可点（点第6项 hash 不变）', beforeJump === afterJump && futureAt4.every(i => !i.can)],
  ['A2 当前之前的步骤可点（点第 2 项回到规模与内容步）', backHash.includes('apply/need') && sBack.cur && sBack.cur.i === 2],
  ['A2 可点项有 cursor:pointer + 下划线（绿档 = 第 1 步场地）', sBack.done && sBack.done.can && sBack.done.cursor === 'pointer' && sBack.done.deco.includes('underline') && sBack.done.color === GREEN],
  ['A2 不可点项没有下划线、仍是灰', sBack.todo && !sBack.todo.can && sBack.todo.cursor !== 'pointer' && sBack.todo.deco === 'none' && sBack.todo.color === GRAY],
  ['A2 当前步仍是蓝（没被并进绿档）', sBack.cur.color === BLUE],
  ['A2 第 1 步没有「更早的已保存段」：只有当前与未保存两档（绿档不可能出现在第一步之前）', sStep1.cur && sStep1.cur.i === 1 && !sStep1.done],
  ['B1 回退后不能跳到后面（回到第 1 步点第 3 项 hash 不变）', beforeStep3 === afterStep3],
  ['B2 换场地后已选规模、观众与日期时段保留（用户输入不丢）', !!dBefore && !!dAfter && dAfter.date === dBefore.date && dAfter.slot === dBefore.slot && dAfter.need.droneCount === dBefore.need.droneCount && dAfter.need.audience === dBefore.need.audience],
  ['B2 只作废结论（判定/报价被清空）', !!dAfter && !dAfter.judgment && !dAfter.quote],
  ['B3 从第 1 步只能逐步往下走（第 2 步规模保留 → 第 3 步仍显示之前保存的日期与时段）', rewHash2.includes('apply/need') && tierAfter === tierAt2 && rewHash.includes('apply/date') && selDay === wantDay && slotOn.startsWith(dAfter.slot)],
  ['C 申请页没有地图选点/手动输入入口', venueTabs.length === 0],
  ['C 下单页没有地图选点/手动输入入口', createTabs.length === 0 && createNote.includes('固定预设场地') && createItems.length > 0]
]
console.log('')
for (const [n, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${n}`)

const out = path.join(SHOTS, 'stepbar-back.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`\n截图: ${out}`)
await browser.close()
