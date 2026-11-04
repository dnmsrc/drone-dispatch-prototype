// 步骤条判据（2026-10-27 三条改动 + 2026-10-28 收窄）：
//   1) 只有「当前填报步骤之前」的步骤可点；当前之后不可点（改完只能从这一步重新往下走）
//   2) 没保存过的步骤一律灰；已保存（当前之前）= 绿；当前 = 蓝
//   3) 流动只在「当前节点 ↔ 上一个节点」这一条连线上（2026-10-28 用户要求，收窄 10-27 的「走过的路都流动」）；
//      更早的已保存段 = 绿静态虚线，没走过的段 = 灰静态虚线。
// 判据用 DOM 实测（几何 + computed style），像素图只用来复核。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { TOUCH_CLAUSE, clauseOf, DISCLOSURE_VERSION, contentHash } from '../../h5/src/engine/disclosure.js'
import { VENUES } from '../../h5/src/engine/venues.js'

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
const click = (sel) => page.evaluate((sel) => {
  const e = document.querySelector(sel)
  if (!e) return false
  e.click()
  return true
}, sel)

// 登录（mock 微信授权）
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
const hasBtn = await page.evaluate(() => !![...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length))
if (!hasBtn) { console.log('❌ 登录页无 .wx-btn'); await browser.close(); process.exit(1) }
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)
console.log('token=', await page.evaluate(() => (localStorage.getItem('token') || '').slice(0, 12)))

// 到第 4 步。判据量的是步骤条状态（done/cur/todo 由 stepFilled 算），所以草稿必须有「1~3 步的真产物」。
// 真实走一遍现在走不通：100 架 × 观众 200 下，有可排日的场地（V03/V04/V06）全被路由去人工咨询，
// 没被路由的场地（V01/V02）60 天窗口里一个可排日都没有。所以种一个有可排日的场地（V06 告庄西双景），
// 判定 / 日期时段 / 报价由引擎按真实算法补（store.hydrateTo），不是塞假数字。
const draft = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('apply_draft') || 'null') } catch (e) { return null } })
async function h5load(url) {
  await page.evaluate(u => { location.hash = '#/pages/' + u }, url)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 300 })
  await sleep(1200)
}

// 2026-10-28 起没有「先批量确认才能填报」的门：确认发生在选到那一项的弹窗里。
// 判据要走到第 4 步，所以先把逐条确认记录种进草稿——否则每一步的「下一步」都会被门拦下。
const seedAcks = Object.keys(TOUCH_CLAUSE).map(t => {
  const c = clauseOf(t)
  return { v: DISCLOSURE_VERSION, at: '2026-10-29 17:00', user: 'e2e 判据', hash: contentHash(), clause: c.n, touch: t }
})
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(a => sessionStorage.setItem('apply_draft', JSON.stringify(a)), {
  step: 1, acks: seedAcks,
  need: { droneCount: 100, duration: 10, contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 200 },
  venue: (VENUES || []).find(v => v.id === 'V06'), date: '', slot: '', anchor: 'flex',
  judgment: null, quote: null, consult: null, dispatch: null, contract: null, payment: null
})
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1400)
await h5load('apply/quote')
const d0 = await draft()
console.log(`种子场地 ${d0 && d0.venue && d0.venue.id} · ${d0 && d0.need && d0.need.droneCount} 架 · 判定 ${d0 && d0.judgment && d0.judgment.conclusion} · 日期 ${d0 && d0.date} ${d0 && d0.slot} · 报价 ${d0 && d0.quote && d0.quote.total}`)
console.log(`走到 ${await hash()}`)

const snap = await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  if (!bar) return null
  const items = [...bar.querySelectorAll('.st')].map((st, i) => {
    const lb = st.querySelector('.lb'), dg = st.querySelector('.dg'), ck = st.querySelector('.ck'), dot = st.querySelector('.dot')
    const seg = (sel) => {
      const ln = st.querySelector(sel)
      if (!ln) return null
      const cs = getComputedStyle(ln)
      return {
        flow: ln.classList.contains('flow'),
        bgImage: cs.backgroundImage,
        animName: cs.animationName,
        animDur: cs.animationDuration,
        borderBottom: cs.borderBottomColor,
        h: Math.round(ln.getBoundingClientRect().height)
      }
    }
    return {
      i: i + 1,
      label: (lb && lb.textContent || '').trim(),
      state: [...st.classList].find(c => c.startsWith('s-')),
      can: st.classList.contains('can'),
      cursor: getComputedStyle(st).cursor,
      labelColor: lb ? getComputedStyle(lb).color : null,
      digitColor: dg ? getComputedStyle(dg).color : null,
      checkColor: ck ? getComputedStyle(ck).borderLeftColor : null,
      dotBg: dot ? getComputedStyle(dot).backgroundColor : null,
      L: seg('.ln-l'), R: seg('.ln-r')
    }
  })
  return { barW: Math.round(bar.getBoundingClientRect().width), items }
})
if (!snap) { console.log('❌ 步骤条未渲染（.bar .scroller 不存在）'); await browser.close(); process.exit(1) }

const norm = (s) => String(s || '').replace(/^s-/, '')
console.log(`\n第4步（报价区间）bar 实测宽 = ${snap.barW}px`)
for (const it of snap.items) {
  const segTxt = (s) => s ? `${s.flow ? '流动' : '静态'}${s.flow ? `(${s.animName})` : ''}` : '-'
  console.log(`${norm(it.state).padEnd(5)} ${it.label.padEnd(5)} 标签=${it.labelColor} 数字=${it.digitColor || '-'} 勾=${it.checkColor || '-'} 点底=${it.dotBg} 左段=${segTxt(it.L)} 右段=${segTxt(it.R)}`)
}

// 判据 1（2026-10-28 改版）：只有「当前填报步骤之前」的步骤可点；当前之后不可点
const before = await hash()
await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller') && b.getClientRects().length)
  const st = [...bar.querySelectorAll('.st')][5]
  st.click()
})
await sleep(900)
const after = await hash()
const toast = await page.evaluate(() => {
  const t = document.querySelector('.uni-toast, .toast, [class*="toast"]')
  return t && t.getClientRects().length ? (t.textContent || '').trim() : ''
})

// 判据 3b：流动确实在动 —— 同一段连线在两个时刻的 background-position 必须不同（只看 animationName 不够）
const posAt = () => page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(b => b.querySelector('.scroller'))
  const ln = bar && bar.querySelector('.ln.flow')
  return ln ? getComputedStyle(ln).backgroundPositionX : null
})
const p1 = await posAt()
await sleep(400)
const p2 = await posAt()
console.log(`流动位移实测：${p1} → ${p2}`)

const GREEN = 'rgb(43, 164, 113)', GRAY = 'rgb(154, 160, 181)', BLUE = 'rgb(74, 108, 247)'
const GREEN_LINE = 'rgba(43, 164, 113, 0.42)'
const items = snap.items.map(i => ({ ...i, state: norm(i.state) }))
const byState = {}
for (const it of items) byState[it.state] = it
const doneItems = items.filter(i => i.state === 'done')
const futureItems = items.filter(i => i.i > byState.cur.i)
const prevOfCur = items.find(i => i.i === byState.cur.i - 1)
const segsOf = (i) => [i.L && { i, side: 'L', seg: i.L }, i.R && { i, side: 'R', seg: i.R }].filter(Boolean)
const flowSegs = items.flatMap(segsOf).filter(x => x.seg.flow)
console.log(`扫描 ${items.length} 个步骤项 / ${items.flatMap(segsOf).length} 段连线，其中流动 ${flowSegs.length} 段`)
console.log('流动段位置:', flowSegs.map(s => `第${s.i.i}项${s.side === 'L' ? '左半' : '右半'}`).join(' + ') || '（无）')

const checks = [
  ['1 当前之后不可点（点第6项 hash 不变）+ 不弹提示', before === after && !toast],
  ['1 已保存（当前之前）步骤可点：class can + cursor:pointer；未保存步骤不可点', doneItems.length > 0 && doneItems.every(i => i.can && i.cursor === 'pointer') && futureItems.every(i => !i.can && i.cursor !== 'pointer')],
  ['2 三档齐全（已保存 / 当前 / 未保存），没有 ahead 档', ['todo', 'done', 'cur'].every(s => byState[s]) && !byState.ahead],
  ['2 已保存：标签绿 + 勾绿 + 淡绿底', byState.done.labelColor === GREEN && byState.done.checkColor === GREEN && byState.done.dotBg === 'rgba(43, 164, 113, 0.1)'],
  ['2 当前之后全部灰（一个绿都不许有）', futureItems.length > 0 && futureItems.every(i => i.state === 'todo' && i.labelColor === GRAY && !i.checkColor)],
  ['2 当前档仍是蓝（保持不变）', byState.cur.labelColor === BLUE && byState.cur.dotBg === 'rgba(74, 108, 247, 0.12)'],
  ['3 流动只出现在「当前节点 ↔ 上一节点」这条线（恰好两段：上一节点右半 + 当前节点左半）', flowSegs.length === 2 && prevOfCur && prevOfCur.R && prevOfCur.R.flow && byState.cur.L && byState.cur.L.flow],
  ['3 流动段仍是蓝色渐变 + 1.1s 动画', flowSegs.length === 2 && flowSegs.every(s => String(s.seg.bgImage).includes('gradient') && String(s.seg.bgImage).includes(BLUE) && String(s.seg.animName).startsWith('step-flow') && s.seg.animDur === '1.1s')],
  ['3 其它已保存段不流动、是绿色静态虚线', doneItems.length > 1 && items.flatMap(segsOf).filter(x => x.i.state === 'done' && !x.seg.flow).length >= 3 && items.flatMap(segsOf).filter(x => x.i.state === 'done').every(x => x.seg.flow ? (x.i === prevOfCur && x.seg === x.i.R) : x.seg.borderBottom === GREEN_LINE)],
  ['3 未保存段仍是灰静态虚线、不流动', futureItems.filter(i => i.L).every(i => !i.L.flow && i.L.borderBottom === 'rgb(228, 231, 241)')],
  ['3 流动真的在走（两个时刻 background-position 不同）', !!p1 && !!p2 && p1 !== p2],
  ['flow 段有实际高度（2rpx ≈ 1.3px，height:0 铺不了背景）', flowSegs.every(s => s.seg.h >= 1)],
  ['bar 未被内容收缩（宽屏限宽 480px，>=400）+ 8 项完整', snap.barW >= 400 && snap.items.length === 8]
]

// 负控（判据纪律 M4）：把「更早的已保存段」伪造成流动，判据必须变红。
// 若伪造后仍判通过，说明这条判据是空判（空数组的 every() 会空判通过）。
const fake = items.flatMap(segsOf).filter(x => x.i.state === 'done')
const negResult = fake.every(x => x.seg.flow ? (x.i === prevOfCur && x.seg === x.i.R) : x.seg.borderBottom === GREEN_LINE)
const fakePass = fake.map(x => ({ ...x, seg: { ...x.seg, flow: true } })).every(x => x.seg.flow ? (x.i === prevOfCur && x.seg === x.i.R) : x.seg.borderBottom === GREEN_LINE)
console.log(`负控（把已保存段伪造成流动）: ${fakePass ? '❌ 判据是空判（伪造仍通过）' : '✅ 负控生效（伪造被判失败）'} · 扫描 ${fake.length} 段`)

console.log('')
for (const [n, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${n}`)

await sleep(300)
const out = path.join(SHOTS, 'stepbar-flow.png')
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`\n截图: ${out}`)
await browser.close()
process.exitCode = checks.some(([, ok]) => !ok) ? 1 : 0
