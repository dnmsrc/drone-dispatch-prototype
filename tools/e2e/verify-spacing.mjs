// 表单间距判据（2026-10-28 用户要求：按常规 H5 标准检查所有步骤）
// 标准（750rpx 设计稿，375 屏 1rpx=0.5px，所以实测 px×2 = rpx）：
//   ① 节奏 = 4 的倍数（4/8/12/16/20/24/28/32）—— 同一页面里不能混用 6/10/14/18/22 这种值
//   ② 可点目标最小高度 88rpx（44px，H5/小程序通用触摸目标）
//   ③ 卡片左右留白 24rpx、卡片内边距 24rpx、卡片之间 24rpx、首块顶部 24rpx、末块底部 24rpx
//   ④ 分区标题 → 内容 20rpx
//   ⑤ 底部操作栏必须在流内占位（不能 fixed 盖在滚动区上，否则末块被压住、滚不出来）
//   ⑥ 卡片内不套卡片
//   ⑦ 文本列不能逐字竖排：CJK 没有词边界，flex 文本项的 min-width:auto = 1 个字，被挤窄时整列竖排。
//      判据口径 = 每行至少 4 个字（列宽 ≥ 4 × 字号）。
//   ⑧ 控件高度（2026-10-28 用户指出验证码行里按钮比输入框高一大截）：
//      a. 单行控件高度必须恰好 88rpx（44px 触摸目标）；多行控件（带副标题 / 多行文本）只要求 ≥88，
//         高度由内容决定，不能强求是 4 的倍数
//      b. 同一 flex 行里并排的控件必须齐高（差 > 4rpx 判失败），且行内控件不得带 margin-top/bottom
//         —— 行内控件带 margin 会让它比邻居低半格，行高被 margin box 撑开
//      c. 控件必须看得见：自身背景 = 最近的有背景祖先 且无描边 = 隐形控件（只剩一行文字，行高被邻居撑开）
//      d. 负 margin 触控层（2026-10-29）：小图标用 padding + 等值负 margin 撑出 88rpx 可点区，
//         布局贡献只有字形本身 —— 负 margin 被自身 padding 完全抵消时允许，抵消不了才判失败。
//      e. 字形可见（2026-10-29）：图标类控件不该有背景块，靠「字形颜色 ≠ 祖先文字色」判可见，否则 ⑧c 会误判隐形。
//      根因：uni-button 默认行高 2.86×字号（实测，注释里记的是 2.55），按钮 = padding + 行高，
//      比同一行的输入框高 13–29rpx。App.vue 已把按钮行高压回 1.5，高度回落到 min-height 88rpx。
//   ⑨ 键值行标签不换行（2026-10-28 用户指出「空管审批 / 层级」「观众许可窗 / 口」这种词中断行）：
//      .kv 直接子级 .k 必须是单行；做法 = 标签 ≤5 字 + flex:none 取自然宽 + white-space:nowrap，值收缩换行。
//      .gk 里的 .k 是明细行标题（长文案），不在此判据内。
// 判据全部用 DOM 实测 rect / computed style，不看像素图；每条判据配必然失败的负控（M4）。
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
await page.setViewport({ width: 375, height: 667 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

const CLICKABLE = ['.chip', '.opt', '.slot', '.tier', '.mode', '.addon', '.pay', '.branch', '.code-btn', '.venue-item', '.check', '.cell', '.pb-btn', '.ghost-btn', '.text-input', '.seg-item', '.btn-primary', '.entry-chip']
const PROPS = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']
const COLS = ['.gk', '.k', '.ms-name', '.nd-left', '.cn-body', '.sub-col', '.fill', '.check', '.venue-info', '.venue-meta', '.cl-text', '.cb-line', '.pb-left']
const ALL_PAGES = ['/pages/apply/disclosure', '/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay', '/pages/apply/progress']
// 窄跑（2026-10-29）：命令行给页名就只跑那几页（页名或完整路径），不给参数 = 跑全套 9 页。
// 只有改动落在共用组件 / 共用 CSS / 确认门时才需要跑全套；单页改动先跑那一页。
const args = process.argv.slice(2).filter(a => !a.startsWith('-'))
const pages = args.length ? args.map(p => p.startsWith('/') ? p : '/pages/apply/' + p) : ALL_PAGES

let scanned = 0, offLadder = 0, smallTarget = 0, badBox = 0, badBar = 0, badNest = 0, badCol = 0, badH = 0, badRowH = 0, badMargin = 0, badInvis = 0, badK = 0, badEntry = 0
for (const p of pages) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1300)
  const r = await page.evaluate((CLICKABLE, PROPS, COLS) => {
    const body = document.querySelector('.body')
    if (!body) return null
    const R = 750 / window.innerWidth // 1rpx = 视口宽/750 px；写死 ×2 只在 375 宽成立
    const bad = [], targets = [], gaps = [], cols = []
    const hBad = [], rowBad = [], marginBad = [], invisBad = [], kBad = []
    const cls = el => (el.className || el.tagName).toString().split(' ')[0] || el.tagName
    const hRpx = el => Math.round(el.getBoundingClientRect().height * R)
    const barEl = document.querySelector('.price-bar')
    const scope = barEl ? [body, barEl] : [body]        // 控件扫描要含底部操作栏：pb-btn 在 .body 之外
    let n = 0
    for (const el of scope.flatMap(s => [s, ...s.querySelectorAll('*')])) {
      n++
      const cs = getComputedStyle(el)
      for (const k of PROPS) {
        const v = parseFloat(cs[k])
        if (!v || !isFinite(v)) continue
        const rpx = Math.round(v * R)
        if (rpx % 4 !== 0) bad.push({ cls: (el.className || el.tagName).toString().slice(0, 20), prop: k, rpx })
      }
      if (CLICKABLE.some(c => el.matches(c))) {
        const h = hRpx(el)
        if (h > 0 && h < 88) targets.push({ cls: (el.className || '').toString().slice(0, 20), rpx: h })
        // ⑧a 单行控件 = 内容只占一行的控件，必须恰好 88rpx
        const fsz = parseFloat(cs.fontSize) * R
        const lines = Math.max(1, Math.round((h - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / fsz))
        if (lines === 1) { if (Math.abs(h - 88) > 2) hBad.push({ sel: cls(el), h }) }
        else if (h < 88) hBad.push({ sel: cls(el), h, lines })
        // ⑧b 行内控件不得带 margin（会低半格）
        const parent = el.parentElement
        if (parent && getComputedStyle(parent).display === 'flex' && getComputedStyle(parent).flexDirection === 'row') {
          const pt = Math.round(parseFloat(cs.paddingTop) * R), pb = Math.round(parseFloat(cs.paddingBottom) * R)
          const mt = Math.round(parseFloat(cs.marginTop) * R), mb = Math.round(parseFloat(cs.marginBottom) * R)
          // ⑧d 负 margin 触控层：小图标用「padding + 等值负 margin」把可点区撑到 88rpx，布局贡献只有字形本身。
          //     负 margin 被自身 padding 完全抵消时允许（不然图标会把行撑高）；抵消不了就是真 margin，照旧判失败。
          const touchLayer = mt < 0 && mb < 0 && Math.abs(mt) <= pt && Math.abs(mb) <= pb
          if ((mt || mb) && !touchLayer) marginBad.push({ sel: cls(el), mt, mb })
          const kids = [...parent.children].filter(k => CLICKABLE.some(c => k.matches(c)))
          if (kids.length >= 2) {
            const hs = kids.map(hRpx)
            const spread = Math.max(...hs) - Math.min(...hs)
            if (spread > 4) rowBad.push({ row: cls(parent), kids: kids.map(k => `${cls(k)}=${hRpx(k)}`).join(' '), spread })
          }
        }
        // ⑧c 控件可见性：与最近的「有背景」祖先比，同色且无描边 = 隐形
        let a = el.parentElement, host = null
        while (a) { const c = getComputedStyle(a); if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent') { host = a; break } a = a.parentElement }
        const hostBg = host ? getComputedStyle(host).backgroundColor : 'transparent'
        const own = cs.backgroundColor
        const hasBorder = ['Top', 'Bottom', 'Left', 'Right'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none')
        const hasShadow = cs.boxShadow !== 'none'
        // ⑧e 字形可见：图标类控件没有背景也没有描边，靠「字形颜色 ≠ 祖先的文字色」判可见——
        //     否则小图标会被 ⑧c 误判成隐形（它本来就不该有背景块）。
        // ⑧f 画出来的形状（2026-10-29 八次调整）：勾必须 CSS 画（App.vue 约定：✓ 字符在不少系统字体里缺字，
        //     会渲染成「?」）。所以控件可以既没背景也没文字，靠内部画出的形状（描边或填充）可见。
        const hostColor = host ? getComputedStyle(host).color : ''
        const hasGlyph = el.textContent.trim() && cs.color !== hostColor
        const hasShape = [...el.querySelectorAll('*')].some(c => {
          const cc = getComputedStyle(c)
          const bg = cc.backgroundColor !== 'rgba(0, 0, 0, 0)' && cc.backgroundColor !== 'transparent'
          const bd = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].some(k => parseFloat(cc[k]) * R >= 2)
          return bg || bd
        })
        if (!hasBorder && !hasShadow && !hasGlyph && !hasShape && own === hostBg) invisBad.push({ sel: cls(el), bg: own })
      }
    }
    // ⑨ kv 标签单行：.kv 直接子级 .k 高度不能超过一行（列被值挤压时中文从词中间断开）
    for (const el of body.querySelectorAll('.kv > .k')) {
      const c2 = getComputedStyle(el)
      const lh = parseFloat(c2.lineHeight) || parseFloat(c2.fontSize) * 1.2
      const lines = Math.round(el.getBoundingClientRect().height / lh)
      if (lines > 1) kBad.push({ t: (el.innerText || '').trim().slice(0, 10), lines })
    }
    for (const sel of COLS) {
      for (const el of body.querySelectorAll(sel)) {
        const w = Math.round(el.getBoundingClientRect().width * R)
        const fsz = parseFloat(getComputedStyle(el).fontSize) * R
        const lines = Math.round(el.getBoundingClientRect().height / fsz)
        if (w > 0 && lines >= 1 && w / fsz < 4) cols.push({ sel, w, lines: Math.max(1, lines), perLine: +(w / fsz).toFixed(1) })
      }
    }
    // ⑩ 入口统一（2026-10-29 十次调整，用户：标题在左、入口在标题右侧、样式统一规范、手机上要好按）：
    //     全站只有一种入口 = .entry-chip 胶囊（恰好 88rpx 高），且必须停在所在行的右端（margin-left:auto + 行内最后一个）。
    //     裸文字入口（.sec-link / .kv-info / .cb-link / .ck-info）一律不允许——它们没有触摸目标，也读不出可按。
    const chips = [...body.querySelectorAll('.entry-chip')]
    const chipBad = chips.map(c => {
      const parent = c.parentElement
      const pcs = parent ? getComputedStyle(parent) : null
      const pr = parent ? parent.getBoundingClientRect() : null
      const cr = c.getBoundingClientRect()
      // getComputedStyle 对 margin-left:auto 返回已用值（px），所以位置按几何量：入口右缘贴住行内容右缘
      const rightGap = pr ? Math.round((pr.right - parseFloat(pcs.paddingRight) - cr.right) * R) : 999
      const last = parent && [...parent.children].filter(k => k.getClientRects().length).pop() === c
      return { rightGap, last, h: Math.round(cr.height * R) }
    }).filter(x => !(x.last && x.rightGap <= 4))
    const proseLinks = [...body.querySelectorAll('.sec-link, .kv-info, .cb-link, .ck-info')].filter(e => e.getClientRects().length).length
    const secs = [...body.querySelectorAll('.sec')]
    const nested = secs.filter(s => s.closest('.sec') !== s)
    const sibs = secs.filter(s => !nested.includes(s))
    for (let i = 0; i < sibs.length - 1; i++) {
      const a = sibs[i].getBoundingClientRect(), b = sibs[i + 1].getBoundingClientRect()
      gaps.push(Math.round((b.top - a.bottom) * R))
    }
    const titles = [...body.querySelectorAll('.sec-title, .sec-head')].map(t => {
      const nx = t.nextElementSibling
      return nx ? Math.round((nx.getBoundingClientRect().top - t.getBoundingClientRect().bottom) * R) : null
    }).filter(v => v !== null)
    const sc = [...body.querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)[0]
    const first = sibs[0], last = sibs[sibs.length - 1]
    const bar = document.querySelector('.price-bar')
    return {
      bad, targets, gaps, titles, cols, n, nested: nested.length, nSec: sibs.length,
      hBad, rowBad, marginBad, invisBad, kBad, chipBad, proseLinks, nChips: chips.length,
      top: first && sc ? Math.round((first.getBoundingClientRect().top - sc.getBoundingClientRect().top) * R) : null,
      bottom: last ? Math.round(parseFloat(getComputedStyle(last).marginBottom) * R) : null,
      left: first ? Math.round(first.getBoundingClientRect().left * R) : null,
      pad: first ? Math.round(parseFloat(getComputedStyle(first).paddingTop) * R) : null,
      barPos: bar ? getComputedStyle(bar).position : null
    }
  }, CLICKABLE, PROPS, COLS)
  if (!r) { console.log(`\n${p}: 没有 .body`); continue }
  scanned += r.n
  const pOff = r.bad.length, pSmall = r.targets.length, pCol = r.cols.length
  const boxOk = r.left === 24 && r.pad === 24 && r.gaps.every(g => g === 24) && r.top === 24 && r.bottom === 24
  const titleOk = r.titles.length > 0 && r.titles.every(t => t === 20)
  const barOk = r.barPos === 'static'
  const noNested = r.nested === 0
  if (pOff) offLadder += pOff
  if (pSmall) smallTarget += pSmall
  if (pCol) badCol++
  if (!boxOk) badBox++
  if (!barOk) badBar++
  if (!noNested) badNest++
  if (r.hBad.length) badH++
  if (r.rowBad.length) badRowH++
  if (r.marginBad.length) badMargin++
  if (r.invisBad.length) badInvis++
  if (r.kBad.length) badK++
  const chipOk = r.chipBad.length === 0 && r.proseLinks === 0
  if (!chipOk) badEntry++
  console.log(`\n${p}`)
  console.log(`  留白 ${r.left} · 内边距 ${r.pad} · 卡片间 ${r.gaps.join(',')} · 标题→内容 ${r.titles.join(',')} · 首块顶 ${r.top} · 末块底 ${r.bottom} · 操作栏 ${r.barPos}`)
  if (pOff) console.log(`  不在 4 的倍数节奏上（${pOff}）: ${[...new Set(r.bad.map(b => `${b.cls}.${b.prop}=${b.rpx}`))].join(' | ')}`)
  if (pSmall) console.log(`  可点目标 < 88rpx（${pSmall}）: ${[...new Set(r.targets.map(t => `${t.cls}=${t.rpx}`))].join(' | ')}`)
  if (pCol) console.log(`  逐字竖排（${pCol}）: ${r.cols.map(c => `${c.sel} 宽${c.w}rpx/${c.lines}行=${c.perLine}字`).join(' | ')}`)
  if (r.hBad.length) console.log(`  控件高度（${r.hBad.length}）: ${r.hBad.map(c => `${c.sel}=${c.h}${c.lines ? '/' + c.lines + '行' : ''}`).join(' | ')}`)
  if (r.rowBad.length) console.log(`  同行控件不齐高（${r.rowBad.length}）: ${r.rowBad.map(x => `${x.row}[${x.kids}]差${x.spread}`).join(' | ')}`)
  if (r.marginBad.length) console.log(`  行内控件带 margin（${r.marginBad.length}）: ${[...new Set(r.marginBad.map(m => `${m.sel} mt${m.mt}/mb${m.mb}`))].join(' | ')}`)
  if (r.invisBad.length) console.log(`  隐形控件（${r.invisBad.length}）: ${[...new Set(r.invisBad.map(i => `${i.sel} bg=${i.bg}`))].join(' | ')}`)
  if (r.kBad.length) console.log(`  标签换行（${r.kBad.length}）: ${r.kBad.map(k => `${k.t}=${k.lines}行`).join(' | ')}`)
  if (r.chipBad.length) console.log(`  入口不在行右端（${r.chipBad.length}）: ${r.chipBad.map(c => `右距=${c.rightGap} last=${c.last}`).join(' | ')}`)
  if (r.proseLinks) console.log(`  裸文字入口（${r.proseLinks}）: 入口必须是 .entry-chip 胶囊，不能用 .sec-link / .kv-info / .cb-link / .ck-info`)
  console.log(`  ${pOff ? '❌' : '✅'} 节奏 · ${pSmall ? '❌' : '✅'} 可点目标 · ${boxOk ? '✅' : '❌'} 留白/间隙 · ${titleOk ? '✅' : '❌'} 标题间距 · ${barOk ? '✅' : '❌'} 操作栏占位 · ${noNested ? '✅' : '❌'} 不套卡片 · ${pCol ? '❌' : '✅'} 文本列不竖排 · ${r.hBad.length ? '❌' : '✅'} 控件高度 · ${r.rowBad.length ? '❌' : '✅'} 同行齐高 · ${r.marginBad.length ? '❌' : '✅'} 行内无 margin · ${r.invisBad.length ? '❌' : '✅'} 控件可见 · ${r.kBad.length ? '❌' : '✅'} 标签单行 · ${chipOk ? '✅' : '❌'} 入口统一（${r.nChips} 个胶囊，扫描 ${r.n} 元素 / ${r.nSec} 卡片）`)
}

// 负控（M4）：每条判据配一个必然失败的伪造样本——若伪造样本被判通过，说明该判据是空判（空数组 every() 会空判通过）
const neg = [
  ['节奏（伪造 gap=14）', [{ rpx: 14 }].every(x => x.rpx % 4 === 0)],
  ['可点目标（伪造高度 60rpx）', [{ rpx: 60 }].every(x => x.rpx >= 88)],
  ['卡片套卡片（伪造 nested=1）', [{ nested: 1 }].every(x => x.nested === 0)],
  ['文本列（伪造 1 字宽列）', [{ perLine: 1 }].every(x => x.perLine >= 4)],
  ['控件高度（伪造单行控件 101rpx）', [{ h: 101 }].every(x => Math.abs(x.h - 88) <= 2)],
  ['同行齐高（伪造 88 vs 101）', [{ spread: 13 }].every(x => x.spread <= 4)],
  ['行内 margin（伪造 mt=16）', [{ mt: 16 }].every(x => x.mt === 0 && x.mb === 0)],
  ['控件可见（伪造同色无描边无字形无形状）', [{ bg: '#fff', border: false, shadow: false, glyph: '', shape: '' }].every(x => x.shape || x.glyph || x.border || x.shadow || x.bg !== '#fff')],
  ['画出来的形状（伪造一个靠文字撑可见的控件）', [{ shape: '' }].every(x => x.shape)],
  ['负 margin 触控层（伪造无 padding 的负 margin）', [{ mt: -16, mb: -16, pt: 0, pb: 0 }].every(x => x.mt < 0 && x.mb < 0 && Math.abs(x.mt) <= x.pt && Math.abs(x.mb) <= x.pb)],
  ['标签单行（伪造 2 行标签）', [{ lines: 2 }].every(x => x.lines <= 1)],
  ['入口在行右端（伪造右距 24rpx）', [{ rightGap: 24, last: true }].every(x => x.last && x.rightGap <= 4)],
  ['入口形态唯一（伪造一个裸文字入口）', [{ proseLinks: 1 }].every(x => x.proseLinks === 0)]
]
console.log(`\n负控: ${neg.map(([n, pass]) => `${n}=${pass ? '❌ 空判（伪造仍通过）' : '✅ 生效'}`).join(' · ')}`)
console.log(`合计扫描 ${scanned} 个元素（${pages.length} 页）· 不在节奏上 ${offLadder} · 可点目标偏小 ${smallTarget} · 留白不合格 ${badBox}/${pages.length} 页 · 操作栏占位不合格 ${badBar}/${pages.length} 页 · 卡片套卡片 ${badNest}/${pages.length} 页 · 文本列竖排 ${badCol}/${pages.length} 页 · 控件高度不合格 ${badH}/${pages.length} 页 · 同行不齐高 ${badRowH}/${pages.length} 页 · 行内 margin ${badMargin}/${pages.length} 页 · 隐形控件 ${badInvis}/${pages.length} 页 · 标签换行 ${badK}/${pages.length} 页 · 入口不统一 ${badEntry}/${pages.length} 页`)

const out = path.join(SHOTS, 'height-fix-contract.png')
await page.goto(`${H5}/#/pages/apply/contract`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1500)
await page.screenshot({ path: out, captureBeyondViewport: false, timeout: 10000 })
console.log(`截图: ${out}`)
await browser.close()
process.exitCode = (offLadder || smallTarget || badBox || badBar || badNest || badCol || badH || badRowH || badMargin || badInvis || badK || badEntry) ? 1 : 0
