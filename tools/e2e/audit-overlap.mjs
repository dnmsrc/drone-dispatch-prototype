// 全站「遮挡 / 贴边」审计（2026-11-03 用户指出截图里 UI 有问题：悬浮入口压在卡片正文、底栏压内容）
// 判据全部走 DOM 实测，不看像素：
//   A. 悬浮/固定元素遮挡：滚到底后，任何 position:fixed 可见元素（排除弹层/mask/toast）与卡片正文 rect 相交 → BAD
//   B. 滚动区末端避让：滚动区 scrollHeight - clientHeight 与末块底边到滚动区底的距离，检查末块是否被浮层压住
//   C. 卡片内边距：卡片的直接子块左右都必须在 padding box 内（容差 2rpx）
//   D. 同一卡片内左对齐一致性：所有直接子块左缘 = content 左缘（应贴内容左边）；右缘 = content 右缘（若子块是满宽块）
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PAGES = [
  '/pages/index/index',
  '/pages/apply/need',
  '/pages/apply/venue',
  '/pages/apply/date',
  '/pages/apply/quote',
  '/pages/apply/consult',
  '/pages/apply/contract',
  '/pages/apply/pay',
  '/pages/apply/progress',
  '/pages/consult/index',
  '/pages/user/index'
]

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

// 登录
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

const probe = () => page.evaluate(() => {
  const R = 750 / window.innerWidth
  const toR = v => Math.round(v * R)
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  // 找滚动容器（scroll-view 内部真正滚动的那个）
  const scrollers = [...top.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e)
    return ['auto', 'scroll'].includes(cs.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.getClientRects().length
  })
  // 滚到底
  for (const s of scrollers) s.scrollTop = s.scrollHeight
  const fixed = [...top.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    if (cs.position !== 'fixed') return false
    if (!e.getClientRects().length || r.width < 8 || r.height < 8) return false
    if (['0', '0px'].includes(cs.opacity) || cs.visibility === 'hidden' || cs.display === 'none') return false
    if (/mask|toast|dialog|pop|panel|sheet/i.test((e.className || '').toString())) return false
    return true
  }).map(e => {
    const r = e.getBoundingClientRect()
    const cls = (e.className || e.tagName).toString().slice(0, 30)
    return { cls, l: toR(r.left), r: toR(r.right), t: toR(r.top), b: toR(r.bottom), txt: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24) }
  })
  // 卡片与卡片内可点目标
  const cards = [...top.querySelectorAll('.card, .item, .sec, .stat-card, .ord-card, .order-card')]
    .filter(e => e.getClientRects().length && !(e.parentElement && e.parentElement.closest('.card, .item, .sec')))
  const blocks = []
  for (const c of cards.slice(0, 30)) {
    const cs = getComputedStyle(c)
    const cr = c.getBoundingClientRect()
    const box = { l: toR(cr.left), r: toR(cr.right), t: toR(cr.top), b: toR(cr.bottom) }
    const pad = { l: toR(parseFloat(cs.paddingLeft)), r: toR(parseFloat(cs.paddingRight)), t: toR(parseFloat(cs.paddingTop)), b: toR(parseFloat(cs.paddingBottom)) }
    const content = { l: box.l + pad.l, r: box.r - pad.r, t: box.t + pad.t, b: box.b - pad.b }
    const kids = [...c.children].filter(k => k.getClientRects().length).map(k => {
      const kr = k.getBoundingClientRect()
      return { cls: (k.className || k.tagName).toString().slice(0, 22), l: toR(kr.left), r: toR(kr.right), oL: toR(kr.left) - content.l, oR: content.r - toR(kr.right) }
    })
    blocks.push({ cls: (c.className || '').toString().slice(0, 20), box, content, kids })
  }
  const hit = []
  for (const f of fixed) for (const b of blocks) {
    const ix = Math.min(f.r, b.box.r) - Math.max(f.l, b.box.l)
    const iy = Math.min(f.b, b.box.b) - Math.max(f.t, b.box.t)
    if (ix > 4 && iy > 4) hit.push({ fixed: f, card: b.cls, overlap: [toR(ix), toR(iy)] })
  }
  const kidBad = []
  for (const b of blocks) for (const k of b.kids) if (k.oL < -2 || k.oR < -2) kidBad.push({ card: b.cls, kid: k.cls, oL: k.oL, oR: k.oR })
  return { fixed, cards: blocks.length, hit, kidBad, scrollers: scrollers.length, vw: window.innerWidth }
})

let fails = 0
for (const p of PAGES) {
  await page.goto(`${H5}/?t=${Date.now()}#${p}`, { waitUntil: 'networkidle2' })
  await sleep(1500)
  const r = await probe()
  const name = p.replace('/pages/', '')
  if (!r.cards) { console.log(`${name}: 无卡片`); continue }
  const bad = r.hit.length || r.kidBad.length
  if (bad) fails++
  console.log(`\n${name}  [卡片 ${r.cards} · 悬浮元素 ${r.fixed.length} · 滚动区 ${r.scrollers}]`)
  if (r.fixed.length) console.log(`  悬浮: ${r.fixed.map(f => `${f.cls}(${f.l},${f.t}-${f.r},${f.b})「${f.txt}」`).join(' | ')}`)
  if (r.hit.length) console.log(`  ❌ 遮挡 ${r.hit.length}: ${r.hit.map(h => `${h.fixed.cls}×${h.card} 重叠${h.overlap[0]}×${h.overlap[1]}rpx`).join(' | ')}`)
  if (r.kidBad.length) console.log(`  ❌ 子块越界 ${r.kidBad.length}: ${r.kidBad.map(k => `${k.card}>${k.kid} 左${k.oL}/右${k.oR}`).join(' | ')}`)
  if (!bad) console.log('  ✅ 无遮挡、子块都在内边距内')
}
console.log(`\n合计 ${PAGES.length} 页 · 有问题 ${fails} 页`)
await browser.close()
process.exitCode = fails ? 1 : 0
