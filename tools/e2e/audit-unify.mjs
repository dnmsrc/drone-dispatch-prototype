// 全站控件/文本规范审计（2026-11-03：用户指出「我的预约」页 UI 有问题，要求排查同类问题）
// 判据（全部 DOM 实测 + 计算样式）：
//   A 同一 flex 行内并排的可点控件宽度不一致（>2rpx）→ 视觉上「一宽一窄」
//   B 同类按钮（同 class）在页面内的 padding 不一致（>2rpx）→ 文字在按钮里的位置不一致
//   C 文本被容器裁切（scrollWidth > clientWidth + 1 且 overflow hidden / nowrap）→ 文字看不全
//   D 正文对比度 < 4.5:1、大字号(≥24px) < 3:1 → 看不清
//   E 卡片内同一列（标签列）宽度不一致（同一页面里 .im-k/.k/.gk 等标签列宽差 >2rpx）
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PAGES = [
  '/pages/index/index', '/pages/apply/need', '/pages/apply/venue', '/pages/apply/date',
  '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay',
  '/pages/apply/progress', '/pages/consult/index', '/pages/user/index', '/pages/order/list'
]

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, slowMo: 8,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1400,1000']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); if (e) e.click() })
await sleep(700)
await page.evaluate(() => { const b = [...document.querySelectorAll('.btn.allow')].find(x => x.getClientRects().length); if (b) b.click() })
await sleep(1500)

const audit = () => page.evaluate(() => {
  const R = 750 / window.innerWidth
  const toR = v => Math.round(v * R)
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  const cls = el => (el.className || el.tagName).toString().trim()

  // A 同一 flex row 的行内按钮宽度不一致（.chip / .entry-chip 是随文字自适应的标签，不算）
  const rowBad = []
  for (const row of [...top.querySelectorAll('*')].filter(e => vis(e) && getComputedStyle(e).display === 'flex' && getComputedStyle(e).flexDirection === 'row')) {
    const kids = [...row.children].filter(k => vis(k) && (k.tagName === 'UNI-BUTTON' || k.tagName === 'BUTTON'))
    if (kids.length < 2) continue
    const ws = kids.map(k => toR(k.getBoundingClientRect().width))
    const spread = Math.max(...ws) - Math.min(...ws)
    if (spread > 2) rowBad.push({ row: cls(row).slice(0, 22), kids: ws.join('/'), spread })
  }

  // B 同类按钮 padding 不一致
  const pads = {}
  for (const b of [...top.querySelectorAll('uni-button, .entry-chip')].filter(vis)) {
    const k = cls(b).split(' ')[0]
    const cs = getComputedStyle(b)
    const v = [toR(parseFloat(cs.paddingLeft)), toR(parseFloat(cs.paddingRight))].join('/')
    ;(pads[k] = pads[k] || new Set()).add(v)
  }
  const padBad = Object.entries(pads).filter(([, s]) => s.size > 1).map(([k, s]) => `${k}=${[...s].join(' & ')}`)

  // C 文本被裁切
  const clipBad = []
  for (const el of [...top.querySelectorAll('text, .num, .v, .t, .title')].filter(vis)) {
    if (!el.innerText || !el.innerText.trim()) continue
    const cs = getComputedStyle(el)
    if (el.scrollWidth > el.clientWidth + 2 && (['hidden', 'clip'].includes(cs.overflowX) || cs.whiteSpace === 'nowrap') && cs.textOverflow !== 'ellipsis') {
      clipBad.push({ cls: cls(el).slice(0, 20), txt: el.innerText.trim().slice(0, 12), sw: el.scrollWidth, cw: el.clientWidth })
    }
  }

  // D 对比度
  const lum = c => {
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const rgb = s => { const m = s.match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null }
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
  const bgOf = el => {
    let a = el
    while (a) {
      const cs = getComputedStyle(a)
      const c = rgb(cs.backgroundColor)
      if (c && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return c
      a = a.parentElement
    }
    return [255, 255, 255]
  }
  const cBad = []
  for (const el of [...top.querySelectorAll('text, .k, .v, .im-k, .im-v, .fl-v, .tl-s, .ih-sub, .it-note')].filter(vis)) {
    const txt = (el.innerText || '').trim()
    if (!txt || txt.length > 60) continue
    const cs = getComputedStyle(el)
    const fg = rgb(cs.color)
    if (!fg) continue
    const bg = bgOf(el)
    const c = ratio(fg, bg)
    const fs = parseFloat(cs.fontSize)
    const need = fs >= 24 || cs.fontWeight >= 700 && fs >= 18 ? 3 : 4.5
    if (c < need) cBad.push({ cls: cls(el).slice(0, 16), txt: txt.slice(0, 10), c: +c.toFixed(2), need, fs: +fs.toFixed(1) })
  }

  // E 卡片标签列宽一致：只统计「键值行」的直接子标签（.kv > .k），排除 .gk 里的明细标题
  const colBad = []
  const kvTags = [...top.querySelectorAll('.kv > .k, .kv > .im-k')].filter(vis).map(el => ({
    txt: (el.innerText || '').trim(), w: toR(el.getBoundingClientRect().width)
  }))
  const kvW = [...new Set(kvTags.map(t => t.w))].sort((a, b) => a - b)
  if (kvW.length > 1) colBad.push(`标签列宽 ${kvW.join('/')}rpx · 最长标签 ${kvTags.sort((a, b) => b.w - a.w).slice(0, 2).map(t => `「${t.txt}」${t.w}`).join(' ')}`)

  return { rowBad, padBad, clipBad, cBad, colBad, n: top.querySelectorAll('*').length }
})

let pages = 0, badPages = 0
const all = { rowBad: [], padBad: [], clipBad: [], cBad: [], colBad: [] }
for (const p of PAGES) {
  await page.goto(`${H5}/?t=${Date.now()}#${p}`, { waitUntil: 'networkidle2' })
  await sleep(1500)
  const r = await audit()
  if (!r.n) continue
  pages++
  const name = p.replace('/pages/', '')
  const lines = []
  if (r.rowBad.length) lines.push(`  A 行内控件宽度不一致 ${r.rowBad.length}: ${r.rowBad.map(x => `${x.row}[${x.kids}]差${x.spread}`).join(' | ')}`)
  if (r.padBad.length) lines.push(`  B 同类按钮内边距不一致: ${r.padBad.join(' | ')}`)
  if (r.clipBad.length) lines.push(`  C 文字被裁 ${r.clipBad.length}: ${r.clipBad.map(x => `${x.cls}「${x.txt}」${x.sw}>${x.cw}`).join(' | ')}`)
  if (r.cBad.length) lines.push(`  D 对比度不足 ${r.cBad.length}: ${r.cBad.map(x => `${x.cls}「${x.txt}」${x.c}(${x.fs}px需${x.need})`).join(' | ')}`)
  if (r.colBad.length) lines.push(`  E 标签列宽不一致: ${r.colBad.join(' | ')}`)
  console.log(`\n${name}  [元素 ${r.n}]${lines.length ? '' : '  ✅ 无问题'}`)
  lines.forEach(l => console.log(l))
  if (lines.length) badPages++
  for (const k of Object.keys(all)) all[k].push(...(r[k] || []))
}
console.log(`\n合计 ${pages} 页 · 有问题 ${badPages} 页`)
console.log('A 行内宽度不一致合计', all.rowBad.length, '| B 内边距不一致', all.padBad.length, '| C 文字裁切', all.clipBad.length, '| D 对比度不足', all.cBad.length, '| E 标签列', all.colBad.length)
await browser.close()
process.exitCode = badPages ? 1 : 0
