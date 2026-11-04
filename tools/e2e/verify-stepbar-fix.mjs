// 验证本轮两处修复（第二版：修掉了「测错元素」的问题）
//   页面上有两个 .bar：NavBar 的导航条和 StepBar 的步骤条同名撞车，
//   所有断言都只认「包含 .scroller 的那个 .bar」，箭头只认 bar 自己的 .nav。
//   1) 原型说明「?」徽章从左上角（压住步骤条第 1 个点）挪到右下角，并让开底部固定条
//   2) 步骤条 .bar 写死 width:100%、滚动区写死 calc(100% - 104rpx)，整条不再被内容顶出屏幕
// 前置：mock-server 在 8090（API + h5/dist/build/h5）
// 运行：cd tools/e2e && node verify-stepbar-fix.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const H5 = process.env.H5_BASE || 'http://localhost:8090'
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p))
if (!EXE) { console.error('找不到 Edge/Chrome'); process.exit(1) }
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const fails = []
function ok(name, cond, extra = '') {
  cond ? pass++ : fail++
  if (!cond) fails.push(name)
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
}

// 页内工具：取「步骤条那一条 bar」、取 bar 内的箭头、取真正会滚的容器
const HELPERS = `(() => {
  const round = (v) => Math.round(v * 10) / 10
  const fix = (b) => b ? { l: round(b.left), r: round(b.right), t: round(b.top), b: round(b.bottom), w: round(b.width), h: round(b.height) } : null
  const bar = () => [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller')) || null
  return { round, fix, bar }
})()`

async function measure(page, fn) {
  return page.evaluate((src, fsrc) => {
    const H = eval(src)
    const call = eval('(' + fsrc + ')')
    const { round, fix, bar } = H
    const R = (el) => el ? fix(el.getBoundingClientRect()) : null
    return call({ round, fix, bar, R, document, window, getComputedStyle })
  }, HELPERS, fn.toString())
}

async function h5load(page, hash) {
  await page.goto(`${H5}/#${hash}`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 })
}
async function waitSel(page, sel, timeout = 10000) {
  try { await page.waitForSelector(sel, { timeout }); return true } catch { return false }
}
async function shot(page, name, clip) {
  try { await sleep(300); await page.screenshot({ path: path.join(SHOTS, name), timeout: 15000, clip }) }
  catch (e) { console.log(`  (截图跳过 ${name}: ${e.message.slice(0, 60)})`) }
}
const TOP = { x: 0, y: 28, width: 414, height: 92 } // 只截导航条 + 步骤条这一窄条，看像素最省事

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false, protocolTimeout: 240000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=520,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 414, height: 896 })
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 140)))

// 登录：走页面自己的微信授权，token 格式由 uni 自己写
await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
if (await waitSel(page, '.wx-btn', 8000)) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length > 0); if (b) b.click() })
  await waitSel(page, '.auth-sheet', 6000)
  await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  const got = await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).then(() => true).catch(() => false)
  ok('登录并拿到 token', got)
}

// ============ 申请单第 1 步：需求页 ============
await h5load(page, '/pages/apply/need')
await waitSel(page, '.scroller')
await sleep(1100)

const M = await measure(page, ({ bar, R, round, window, document }) => {
  const b = bar()
  const navs = b ? [...b.querySelectorAll('.nav')] : []
  const sc = b ? b.querySelector('.scroller') : null
  const scr = [...(b ? b.querySelectorAll('*') : [])].filter(e => e.scrollWidth > e.clientWidth + 10)[0] || null
  return {
    vw: window.innerWidth,
    app: R(document.querySelector('#app')),
    bar: R(b), barComputed: b ? getComputedStyle(b).width + ' / ' + getComputedStyle(b).flex + ' / justify=' + getComputedStyle(b).justifyContent : 'none',
    sc: R(sc), scComputed: sc ? (getComputedStyle(sc).width + ' basis=' + getComputedStyle(sc).flexBasis + ' minW=' + getComputedStyle(sc).minWidth) : 'none',
    scrollBox: scr ? { tag: scr.tagName.toLowerCase(), cw: scr.clientWidth, sw: scr.scrollWidth } : null,
    navL: R(navs[0]), navR: R(navs[navs.length - 1]), navCount: navs.length,
    badge: R(document.querySelector('#proto-tip-badge')),
    priceBar: R(document.querySelector('.price-bar')),
    pageScrollW: document.documentElement.scrollWidth,
    dotText: (() => { const d = b ? b.querySelector('.st.s-cur .dg') : null; return d ? (d.innerText || '').trim() : 'none' })(),
    firstDot: (() => { const d = b ? b.querySelector('.st:first-child .dot') : null; return d ? round(d.getBoundingClientRect().left) : null })(),
    stepsRight: (() => { const s = b ? b.querySelector('.steps') : null; return s ? round(s.getBoundingClientRect().right) : null })()
  }
})

const A = M.app, BAR = M.bar, BADGE = M.badge
const overlap = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

ok('步骤条 bar 占满整行（不再按内容收缩）', !!BAR && !!A && BAR.w >= A.w - 2, `bar=${BAR ? BAR.l + '..' + BAR.r + ' w=' + BAR.w : 'null'} app=${A ? A.w : '-'} | 计算值 ${M.barComputed}`)
ok('右箭头在屏幕内', !!M.navR && !!A && M.navR.r <= A.r + 1 && M.navR.l >= A.l, `navR=${M.navR ? M.navR.l + '..' + M.navR.r : 'null'} appRight=${A ? A.r : '-'} vw=${M.vw}`)
ok('左箭头在屏幕内', !!M.navL && !!A && M.navL.l >= A.l - 1 && M.navL.r <= A.r, `navL=${M.navL ? M.navL.l + '..' + M.navL.r : 'null'}`)
ok('页面本身没有横向溢出', M.pageScrollW <= M.vw + 1, `docScrollW=${M.pageScrollW} vw=${M.vw}`)
ok('内容确实比滚动盒宽（靠箭头平移）', !!M.scrollBox && M.scrollBox.sw > M.scrollBox.cw + 20, JSON.stringify(M.scrollBox) + ' | 滚动区计算值 ' + M.scComputed)
ok('步骤内容超出可视区、只能靠左右箭头平移（整条 bar 仍在屏内）',
  !!M.stepsRight && !!M.sc && M.stepsRight >= M.sc.r - 1 && !!M.bar && M.bar.r <= M.vw + 1,
  `内容右边缘=${M.stepsRight} 滚动区右边缘=${M.sc ? M.sc.r : '-'} barRight=${M.bar ? M.bar.r : '-'} vw=${M.vw} | 滚动区 ${M.scComputed}`)

// ? 徽章位置：不压步骤条、贴右下、让开底栏
ok('? 徽章和步骤条不相交', !!BADGE && !!BAR && !overlap(BADGE, BAR),
  `badge=${BADGE ? BADGE.l + ',' + BADGE.t + '..' + BADGE.r + ',' + BADGE.b : 'null'} bar=${BAR ? BAR.t + '..' + BAR.b : 'null'}`)
ok('? 徽章贴 #app 右边缘内侧', !!BADGE && !!A && BADGE.r <= A.r && BADGE.r >= A.r - 40, `badgeRight=${BADGE ? BADGE.r : '-'} appRight=${A ? A.r : '-'}`)
ok('? 徽章让开底部固定条（不压「下一步」）', !!BADGE && !!M.priceBar && BADGE.b <= M.priceBar.t - 8, `badgeBottom=${BADGE ? BADGE.b : '-'} priceBarTop=${M.priceBar ? M.priceBar.t : '-'}`)
ok('当前圆点显示数字、不是问号', M.dotText === '1', `dotText=${JSON.stringify(M.dotText)}`)

await page.hover('#proto-tip-badge')
await sleep(450)
const CARD = await measure(page, ({ document, R }) => R(document.querySelector('#proto-tip-card')))
const cardTxt = await page.evaluate(() => (document.querySelector('#proto-tip-card') || {}).innerText || '')
ok('悬停 ? 能展开说明卡', !!CARD && cardTxt.includes('原型说明'), `card=${CARD ? CARD.t + '..' + CARD.b : 'null'}`)
ok('说明卡不盖住步骤条', !!CARD && !!BAR && !overlap(CARD, BAR))
await shot(page, 'fix-need-badge.png')
await page.mouse.move(207, 500); await sleep(250)
await shot(page, 'fix-need-top.png', TOP)

// 用右箭头滚到最右：最后一个点贴住滚动可视区右边缘、右箭头到头置灰
let lastGap = null, atEnd = false
for (let i = 0; i < 12; i++) {
  const adv = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    if (!bar) return false
    const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
    const right = navs[navs.length - 1]
    if (!right || right.classList.contains('off')) return false
    right.click(); return true
  })
  if (!adv) { atEnd = !adv; break }
  await sleep(320)
  lastGap = await measure(page, ({ bar, round }) => {
    const b = bar(); if (!b) return null
    const sc = b.querySelector('.scroller')
    const st = [...b.querySelectorAll('.st')]
    const last = st[st.length - 1], dot = last && last.querySelector('.dot')
    if (!sc || !dot) return null
    return round(sc.getBoundingClientRect().right - dot.getBoundingClientRect().right)
  })
}
ok('滚到最右后最后一个点贴住可视区右边缘', lastGap !== null && Math.abs(lastGap) <= 4, `末端点到可视区右边距=${lastGap}px`)
ok('到头后右箭头自动置灰（用户知道不能再滚）', atEnd)
await shot(page, 'fix-need-top-end.png', TOP)
await shot(page, 'fix-need-full-end.png')

// 滚回最左：首个点贴左边
for (let i = 0; i < 12; i++) {
  const back = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    if (!bar) return false
    const navs = [...bar.querySelectorAll('.nav')].filter(e => e.getClientRects().length > 0)
    const left = navs[0]
    if (!left || left.classList.contains('off')) return false
    left.click(); return true
  })
  if (!back) break
  await sleep(280)
}
const headGap = await measure(page, ({ bar, round }) => {
  const b = bar(); if (!b) return null
  const sc = b.querySelector('.scroller')
  const st = [...b.querySelectorAll('.st')]
  const first = st[0], dot = first && first.querySelector('.dot')
  if (!sc || !dot) return null
  return round(dot.getBoundingClientRect().left - sc.getBoundingClientRect().left)
})
ok('滚到最左后第一个点贴住可视区左边缘', headGap !== null && Math.abs(headGap) <= 4, `首点到可视区左边距=${headGap}px`)
await shot(page, 'fix-need-top-head.png', TOP)

// 点第 3 步（date）：前两步变已完成，勾必须是画的、圆点里不能残留 ? / ✓
const jumped = await page.evaluate(() => {
  const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
  if (!bar) return false
  const st = [...bar.querySelectorAll('.st')]
  if (st.length < 3) return false
  st[2].click(); return true
})
await page.waitForFunction(() => location.hash.includes('date'), { timeout: 12000, polling: 200 }).catch(() => {})
await sleep(900)
const done = await measure(page, ({ document, getComputedStyle, round }) => {
  const cks = [...document.querySelectorAll('.st.s-done .ck')].filter(e => e.getClientRects().length > 0)
    .map(e => { const c = getComputedStyle(e); return { bl: c.borderLeftWidth, bb: c.borderBottomWidth, rotate: c.transform !== 'none', w: round(e.getBoundingClientRect().width), color: c.borderLeftColor } })
  const dots = [...document.querySelectorAll('.st.s-done .dot')].map(e => (e.innerText || '').trim())
  return { n: cks.length, sample: cks[0] || null, dots, cur: location.hash, stCount: document.querySelectorAll('.st').length }
})
ok('点第 3 步后前两步变「已编写」', jumped && done.stCount === 8 && done.n >= 2, `st=${done.stCount} done勾=${done.n} cur=${done.cur}`)
ok('已完成步骤的勾是 CSS 画的（有左+下边框、带 rotate、白色）',
  !!done.sample && parseFloat(done.sample.bl) > 0 && parseFloat(done.sample.bb) > 0 && done.sample.rotate && /rgb\(255, 255, 255\)|#fff|#ffffff/i.test(done.sample.color),
  `sample=${JSON.stringify(done.sample)}`)
ok('已完成圆点里没有残留 ? / ✓ 文本', done.dots.length > 0 && done.dots.every(t => t === ''), `圆点内文本=${JSON.stringify(done.dots)}`)
await shot(page, 'fix-date-top.png', TOP)

// 逐步往第 6 步走（合同）：步骤条跳步要求「下一步的产物已存在」，所以 4→5→6 连着点，不能一步跳到 6
for (const [idx, key] of [[3, 'quote'], [4, 'consult'], [5, 'contract']]) {
  const moved = await page.evaluate((i) => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    if (!bar) return false
    const st = [...bar.querySelectorAll('.st')]
    if (st.length <= i) return false
    st[i].click(); return true
  }, idx)
  const landed = await page.waitForFunction((k) => location.hash.includes(k), { timeout: 12000, polling: 200 }, key).then(() => true).catch(() => false)
  ok(`点第 ${idx + 1} 步跳到 ${key} 页`, moved && landed)
  await sleep(700)
}
// 勾选第一条关键条款：勾必须出现，而且是 CSS 画的（左+下两条边转 -45°），不是字符
await page.evaluate(() => {
  const box = [...document.querySelectorAll('.checkbox')].filter(e => e.getClientRects().length > 0)[0]
  if (box) box.click()
})
await sleep(600)
const ct = await measure(page, ({ document, getComputedStyle, round }) => {
  const region = document.querySelector('.page') || document.body
  const drawn = [...region.querySelectorAll('.gck')].filter(e => e.getClientRects().length > 0)
    .map(e => { const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { bl: c.borderLeftWidth, bb: c.borderBottomWidth, rot: c.transform, color: c.borderLeftColor, w: round(b.width), inBar: !!e.closest('.bar') } })
  const outside = drawn.filter(d => !d.inBar)
  const q = [...region.querySelectorAll('*')].filter(e => {
    const own = [...e.childNodes].some(n => n.nodeType === 3 && (n.nodeValue || '').indexOf('?') >= 0)
    return own && e.getClientRects().length > 0
  }).map(e => e.tagName + '.' + (e.className || '').toString().slice(0, 24))
  const glyphs = (region.innerText.match(/[✓✔?]/g) || [])
  return { total: drawn.length, outside: outside.length, sample: outside[0] || drawn[0] || null, qMarks: q.slice(0, 5), glyphs: glyphs.slice(0, 10), cur: location.hash }
})
ok('合同页的勾是 CSS 画的（.gck 有左+下边框、transform 是 -45° 矩阵、跟随 currentColor）',
  !!ct.sample && parseFloat(ct.sample.bl) > 0 && parseFloat(ct.sample.bb) > 0 && /-0\.707/.test(ct.sample.rot),
  `合同页 .gck 共 ${ct.total} 个（步骤条外 ${ct.outside} 个）cur=${ct.cur} sample=${JSON.stringify(ct.sample)}`)
ok('合同页正文没有残留 ? / ✓ 字符', ct.qMarks.length === 0 && ct.glyphs.length === 0, `带 ? 的节点=${JSON.stringify(ct.qMarks)} 命中=${JSON.stringify(ct.glyphs)}`)
await shot(page, 'fix-contract.png')

// 其他页面徽章同样不抢地方（首页、订单列表带 TabBar）
for (const [p, key] of [['/pages/index/index', '首页'], ['/pages/order/list', '订单列表']]) {
  await h5load(page, p)
  await sleep(800)
  const g2 = await measure(page, ({ document, window, getComputedStyle, round }) => {
    const R = (el) => { const b = el.getBoundingClientRect(); return { l: round(b.left), r: round(b.right), t: round(b.top), b: round(b.bottom), w: round(b.width) } }
    const app = document.querySelector('#app'), b = document.querySelector('#proto-tip-badge')
    const bottom = [...document.querySelectorAll('#app *')].filter(e => getComputedStyle(e).position === 'fixed' && e.id !== 'proto-tip-card')
      .map(e => R(e)).filter(x => x.w > 80 && Math.abs(window.innerHeight - x.b) < 3).sort((a, b) => b.t - a.t)[0] || null
    return { badge: b ? R(b) : null, app: app ? R(app) : null, bottom, shown: !!b && b.style.display !== 'none', pageScrollW: document.documentElement.scrollWidth, vw: window.innerWidth }
  })
  const b2 = g2.badge, f = g2.bottom
  ok(`${key}：? 徽章在右下、让开底部条、页面不横向溢出`,
    !!b2 && !!g2.app && b2.r <= g2.app.r && (!f || b2.b <= f.t - 8) && g2.pageScrollW <= g2.vw + 1,
    `badge=${b2 ? b2.l + ',' + b2.t + '..' + b2.r + ',' + b2.b : 'null'} 底部条=${f ? 'top=' + f.t : '无'} docScrollW=${g2.pageScrollW}/${g2.vw}`)
}

await shot(page, 'fix-index.png')
await browser.close()
console.log(`\n==== ${pass} 通过 / ${fail} 失败 ====`)
if (fails.length) console.log('失败项：', fails.join(' | '))
process.exit(fail ? 1 : 0)
