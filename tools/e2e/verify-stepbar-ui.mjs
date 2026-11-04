// 本轮 UI 优化的验收：步骤条按设备自适应整项、贴边、居中、配色分层
// 对应你提的 6 条：①标签与底部没间距 ②一屏几项由设备算、最右必须是完整项、至少 4 项
//   ③数字在圆里没居中 ④默认态改浅灰边框+浅灰字、字号字色统一取 ⑤已完成被压缩且没居中
//   ⑥按图5（白底/淡蓝底 + 浅蓝描边 + 蓝字）重画，去掉渐变实心点和绿色实心点
// 前置：mock-server 在 8090（API + h5/dist/build/h5）
// 运行：cd tools/e2e && node verify-stepbar-ui.mjs
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

// 页内工具：页面上有两个 .bar（NavBar 和 StepBar 同名撞车），只认「包含 .scroller 的那个 .bar」
const HELPERS = `(() => {
  const round = (v) => Math.round(v * 10) / 10
  const fix = (b) => b ? { l: round(b.left), r: round(b.right), t: round(b.top), b: round(b.bottom), w: round(b.width), h: round(b.height), cx: round(b.left + b.width / 2), cy: round(b.top + b.height / 2) } : null
  const bar = () => [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller')) || null
  return { round, fix, bar }
})()`

async function measure(page, fn) {
  return page.evaluate((src, fsrc) => {
    const H = eval(src)
    const call = eval('(' + fsrc + ')')
    const { round, fix, bar } = H
    const R = (el) => el ? fix(el.getBoundingClientRect()) : null
    const CS = (el) => el ? getComputedStyle(el) : null
    return call({ round, fix, bar, R, CS, document, window, getComputedStyle })
  }, HELPERS, fn.toString())
}

async function h5load(page, hash) {
  await page.goto(`${H5}/#${hash}`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 })
}
async function waitSel(page, sel, timeout = 10000) {
  try { await page.waitForSelector(sel, { timeout }); return true } catch { return false }
}
function nudgeRight(page, times) {
  return page.evaluate(async (n) => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms))
    let moved = 0
    for (let i = 0; i < n; i++) {
      const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
      const navs = bar ? [...bar.querySelectorAll('.nav')] : []
      const right = navs[navs.length - 1]
      if (!right || right.className.includes('off')) break
      right.click(); moved++
      await wait(340)
    }
    return moved
  }, times)
}
// 一路往前跳：点「已编写但在当前之后」里最靠后的一项，一次跳两格，两跳就能走到第 5 步
// （直接点第 5 步会被拒绝，因为第 4 步的产物还不存在、canTap=false，这是上一轮踩过的坑）
function advanceTo(page, target) {
  return page.evaluate(async (t) => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms))
    for (let i = 0; i < 6; i++) {
      const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
      if (!bar) return 'no-bar'
      const st = [...bar.querySelectorAll('.st')]
      const cur = st.findIndex(e => e.className.includes('s-cur'))
      if (cur + 1 >= t) return 'at-' + (cur + 1)
      let pick = -1
      st.forEach((e, i) => { if (e.className.includes('s-ahead')) pick = i })
      if (pick < 0) return 'no-ahead@' + (cur + 1)
      st[pick].click()
      await wait(1100)
    }
    return 'timeout'
  }, target)
}
function nudgeLeft(page, times) {
  return page.evaluate(async (n) => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms))
    let moved = 0
    for (let i = 0; i < n; i++) {
      const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
      const left = bar ? bar.querySelectorAll('.nav')[0] : null
      if (!left || left.className.includes('off')) break
      left.click(); moved++
      await wait(340)
    }
    return moved
  }, times)
}

// 一帧里读全部几何 + 计算样式：整项是否等宽、是否整除、右边有没有半截、数字/勾是否居中、标签离底多远
const READ = ({ bar, R, CS, document, window }) => {
  const b = bar()
  if (!b) return null
  const sc = b.querySelector('.scroller')
  const scr = [...b.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 10)[0] || sc
  const st = [...b.querySelectorAll('.st')]
  const srs = R(scr), barR = R(b)
  const w = st.length ? round(st[0].getBoundingClientRect().width) : 0
  const dots = st.map(e => R(e.querySelector('.dot')))
  const dgs = st.map(e => R(e.querySelector('.dg')))
  const cks = st.map(e => R(e.querySelector('.ck')))
  const lbs = st.map(e => R(e.querySelector('.lb')))
  const items = st.map((e, i) => { const r = R(e); return { i, ...r, state: (e.className.match(/s-(\w+)/) || [,'?'])[1], dot: dots[i], dg: dgs[i], ck: cks[i], lb: lbs[i] } })
  // 完整落在可视区里的项 / 被可视区右边缘切到的项
  const wholeInside = items.filter(x => x.l >= srs.l - 1 && x.r <= srs.r + 1)
  const partialRight = items.filter(x => x.r > srs.l + 1 && x.l < srs.r - 1 && !(x.l >= srs.l - 1 && x.r <= srs.r + 1))
  const digitOff = items.filter(x => x.dg && x.dot).map(x => ({ i: x.i, dx: round(x.dg.cx - x.dot.cx), dy: round(x.dg.cy - x.dot.cy) }))
  const doneIdx = items.findIndex(x => x.state === 'done')
  const ckOff = doneIdx >= 0 && items[doneIdx].ck && items[doneIdx].dot
    ? { dx: round(items[doneIdx].ck.cx - items[doneIdx].dot.cx), dy: round(items[doneIdx].ck.cy - items[doneIdx].dot.cy) } : null
  const todoIdx = items.findIndex(x => x.state === 'todo')
  const curIdx = items.findIndex(x => x.state === 'cur')
  const tone = (el, prop) => el ? CS(el)[prop] : 'none'
  const contrast = (rgb) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(rgb || '')
    if (!m) return null
    const c = [1, 2, 3].map(i => { const v = Number(m[i]) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    return Math.round(((1.05) / (L + 0.05)) * 10) / 10   // 对纯白卡的对比度
  }
  const csLb = (el) => { const s = CS(el); return { color: s.color, size: s.fontSize, weight: s.fontWeight, family: s.fontFamily.split(',')[0] } }
  const root = getComputedStyle(document.documentElement)
  return {
    vw: window.innerWidth, pageScrollW: document.documentElement.scrollWidth,
    bar: barR, sc: srs, scrollBox: { cw: scr.clientWidth, sw: scr.scrollWidth, sl: round(scr.scrollLeft), max: round(scr.scrollWidth - scr.clientWidth) },
    itemW: w, equal: st.every(e => Math.abs(e.getBoundingClientRect().width - w) < 0.6),
    perView: w ? Math.round(scr.clientWidth / w) : 0, slack: w ? round(scr.clientWidth - Math.round(scr.clientWidth / w) * w) : 99,
    wholeInside: wholeInside.map(x => x.i), partialRight: partialRight.map(x => ({ i: x.i, cut: round(srs.r - x.r) })),
    gapFirst: items.length ? round(items[0].l - srs.l) : 99,
    gapLast: items.length ? round(srs.r - items[items.length - 1].r) : 99,
    offLeft: (b.querySelectorAll('.nav')[0] || { className: '' }).className.includes('off'),
    offRight: ([...b.querySelectorAll('.nav')].pop() || { className: '' }).className.includes('off'),
    digitOff, ckOff, doneIdx, states: items.map(x => x.state).join(','),
    // 点是不是正圆：用 rect 的宽高比（computed width/height 是 content-box，拼字符串容易和正则对不上）
    dotRatios: items.filter(x => x.dot).map(x => round(x.dot.w / x.dot.h * 100) / 100),
    doneRatio: doneIdx >= 0 && items[doneIdx].dot ? round(items[doneIdx].dot.w / items[doneIdx].dot.h * 100) / 100 : null,
    lbInItem: items.every(x => x.lb && x.lb.l >= x.l - 0.5 && x.lb.r <= x.r + 0.5),
    lbBottom: items.length && items[0].lb ? round(items[0].b - items[0].lb.b) : 0,
    lbSizes: [...new Set(items.map(x => x.lb ? CS(x.lb.el || document.createElement('i')).fontSize : ''))] // placeholder
  }
}

// 单独取颜色 / 字号一致性 + token 是否落地（READ 里拿不到完整字号表，分一次读省得分支）
const READ_TONES = ({ bar, CS, document }) => {
  const b = bar(); if (!b) return null
  const items = [...b.querySelectorAll('.st')]
  const rows = items.map(e => {
    const st = (e.className.match(/s-(\w+)/) || [, '?'])[1]
    const lb = e.querySelector('.lb'), dg = e.querySelector('.dg'), dot = e.querySelector('.dot')
    const clb = CS(lb), cdg = CS(dg), cdot = CS(dot)
    return { state: st, labelColor: clb.color, labelSize: clb.fontSize, labelWeight: clb.fontWeight,
             digitSize: cdg ? cdg.fontSize : '-', digitColor: cdg ? cdg.color : '-',
             dotBorder: cdot.borderColor, dotBg: cdot.backgroundColor, dotSize: cdot.width + 'x' + cdot.height }
  })
  const uniqSize = [...new Set(rows.map(r => r.labelSize))]
  const root = CS(document.documentElement)
  const lum = (rgb) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(rgb || ''); if (!m) return null
    const c = [1,2,3].map(i => { const v = Number(m[i]) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2] }
  const vsWhite = (rgb) => { const L = lum(rgb); return L == null ? null : Math.round((1.05 / (L + 0.05)) * 10) / 10 }
  const by = {}
  rows.forEach(r => { if (!by[r.state]) by[r.state] = r })
  return { rows, uniqSize,
    tokens: { fs2: root.getPropertyValue('--fs-2').trim(), idleText: root.getPropertyValue('--step-idle-text').trim(), idleLine: root.getPropertyValue('--step-idle-line').trim() },
    contrastWhite: Object.keys(by).reduce((o, k) => (o[k] = { label: vsWhite(by[k].labelColor), digit: vsWhite(by[k].digitColor) }, o), {}),
    sample: by }
}

const browser = await puppeteer.launch({
  executablePath: EXE, headless: false, protocolTimeout: 300000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=860,1000', '--window-position=0,0']
})
const page = await browser.newPage()
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(140) ? e.message.slice(0, 140) : ''))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
if (await waitSel(page, '.wx-btn', 8000)) {
  await page.evaluate(() => { const b = [...document.querySelectorAll('.wx-btn')].find(e => e.getClientRects().length > 0); if (b) b.click() })
  await waitSel(page, '.auth-sheet', 6000)
  await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  const got = await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).then(() => true).catch(() => false)
  ok('登录并拿到 token', got)
}

// ============ 多宽度：360 / 393 / 414 手机 + 720 桌面（App.vue 把内容限宽到 480） ============
const WIDTHS = [360, 393, 414, 720]
const shotClip = async (dsf) => {
  const r = await measure(page, ({ bar, R }) => { const b = R(bar()); return b ? { x: Math.max(0, b.l - 2), y: Math.max(0, b.t - 2), width: b.w + 4, height: b.h + 4 } : null })
  return r
}
for (const W of WIDTHS) {
  await page.setViewport({ width: W, height: 900, deviceScaleFactor: 1 })
  await h5load(page, '/pages/apply/need')
  await waitSel(page, '.scroller')
  await sleep(1200)
  const M = await measure(page, READ)
  if (!M) { ok(`${W}px 步骤条渲染`, false, 'bar=null'); continue }
  const tag = `[${W}px]`
  ok(`${tag} 整条在屏内、页面无横向溢出`, M.bar.r <= M.vw + 1 && M.pageScrollW <= M.vw + 1, `bar=${M.bar.l}..${M.bar.r} vw=${M.vw} docScrollW=${M.pageScrollW}`)
  ok(`${tag} 每个步骤项等宽（首末不再特殊收窄）`, M.equal && M.itemW > 60, `itemW=${M.itemW}`)
  ok(`${tag} 一屏至少 4 个完整项、且可视区被整除（无余量就不会中间截断）`, M.perView >= 4 && Math.abs(M.slack) <= 1.5, `一屏=${M.perView} 项，余量=${M.slack}px，可视区=${M.scrollBox.cw} 内容=${M.scrollBox.sw}`)
  ok(`${tag} 贴左时首项贴左边缘`, Math.abs(M.gapFirst) <= 1.5, `gapFirst=${M.gapFirst}`)
  ok(`${tag} 贴左时最右边没有半截步骤`, M.partialRight.length === 0, `完整项=[${M.wholeInside}] 被切=[${M.partialRight.map(x => x.i + ':' + x.cut)}]`)
  const before = M.scrollBox.sl
  const moved = await nudgeRight(page, 1)
  const M2 = await measure(page, READ)
  const delta = M2 ? Math.round((M2.scrollBox.sl - before) * 10) / 10 : 0
  ok(`${tag} 点一次右箭头正好平移一个整项`, moved === 1 && Math.abs(delta - M.itemW) <= 2, `位移=${delta} 单项=${M.itemW}`)
  ok(`${tag} 平移一格后最右边依然是完整项`, M2 && M2.partialRight.length === 0, `完整项=[${M2 ? M2.wholeInside : ''}] 被切=[${M2 ? M2.partialRight.map(x => x.i + ':' + x.cut) : ''}]`)
  ok(`${tag} 数字在圆内水平垂直居中`, M.digitOff.every(d => Math.abs(d.dx) <= 1 && Math.abs(d.dy) <= 1.2), `偏移=${JSON.stringify(M.digitOff)}`)
  ok(`${tag} 标签离步骤条底部有呼吸间距（原来贴死在底边）`, M.lbBottom >= 5, `gap=${M.lbBottom}px`)
  ok(`${tag} 标签完整落在自己那一项里（没被邻居切到）`, M.lbInItem, `检查=${M.states}`)
  const T = await measure(page, READ_TONES)
  const idle = T && T.sample['todo'], cur = T && T.sample['cur'], done = T && T.sample['done'], ahead = T && T.sample['ahead']
  ok(`${tag} 默认(未开始)态 = 浅灰边框 + 浅灰字`, !!idle && idle.dotBorder === 'rgb(228, 231, 241)' && idle.labelColor === 'rgb(199, 205, 220)', `border=${idle ? idle.dotBorder : '-'} 字色=${idle ? idle.labelColor : '-'}`)
  ok(`${tag} 标签字号只有一种（字色字号统一、不再各写各的）`, T && T.uniqSize.length === 1, `字号集合=${T ? JSON.stringify(T.uniqSize) : '-'} token --fs-2=${T ? T.tokens.fs2 : '-'}`)
  ok(`${tag} 当前态与默认态对比度拉开（当前 ≥3.5、默认 ≤2.0）`,
    !!idle && !!cur && T.contrastWhite['cur'].label >= 3.5 && T.contrastWhite['todo'].label <= 2.0,
    `当前=${T ? T.contrastWhite['cur'].label : '-'} 默认=${T ? T.contrastWhite['todo'].label : '-'} 已完成=${T ? T.contrastWhite['done'] ? T.contrastWhite['done'].label : '-' : '-'}（对纯白卡片）`)
  ok(`${tag} 已编写在后(可选跳)态走描边语言：白底 + 蓝描边 + 蓝字`, !!ahead && ahead.dotBg === 'rgb(255, 255, 255)' && /rgba?\(74, 108, 247/.test(ahead.dotBorder), `底色=${ahead ? ahead.dotBg : '-'} 描边=${ahead ? ahead.dotBorder : '-'}`)
  ok(`${tag} 当前步是淡蓝底 + 蓝描边 + 蓝字（图5 语言，去掉了渐变和投影）`,
    !!cur && /rgba?\(74, 108, 247/.test(cur.dotBorder) && /rgba\(74, 108, 247/.test(cur.dotBg) && cur.labelWeight === '700' && cur.labelColor === 'rgb(74, 108, 247)',
    `描边=${cur ? cur.dotBorder : '-'} 底色=${cur ? cur.dotBg : '-'} 标签=${cur ? cur.labelColor + ' / ' + cur.labelWeight : '-'}`)

  // 贴左 → 截图（414 用 2 倍图看细节），再滚到最右截一张
  if (W === 414) {
    const clip = await shotClip()
    await page.setViewport({ width: 414, height: 900, deviceScaleFactor: 2 })
    await sleep(400)
    const clip2 = await shotClip()
    if (clip2) await page.screenshot({ path: path.join(SHOTS, 'ui-head-414.png'), clip: clip2, captureBeyondViewport: false, timeout: 15000 }).catch(e => console.log('  截图跳过 head:', e.message.slice(0, 60)))
    const stepsN = 8
    await nudgeRight(page, stepsN)
    await sleep(500)
    const ME = await measure(page, READ)
    ok(`[414px] 滚到最右时末项正好贴右边缘、末项完整`, ME && Math.abs(ME.gapLast) <= 1.5 && ME.partialRight.length === 0, `gapLast=${ME ? ME.gapLast : '-'} scrollLeft=${ME ? ME.scrollBox.sl : '-'}/${ME ? ME.scrollBox.max : '-'} 被切=${ME ? JSON.stringify(ME.partialRight) : '-'}`)
    ok(`[414px] 到头时右箭头置灰`, ME && ME.offRight, `右箭头 off=${ME ? ME.offRight : '-'}`)
    if (clip2) await page.screenshot({ path: path.join(SHOTS, 'ui-end-414.png'), clip: clip2, captureBeyondViewport: false, timeout: 15000 }).catch(() => {})
  }
}

// ============ 已完成态（图4 的「被压缩 + 没居中」）：走到第 5 步，前面 4 步都变已完成 ============
await page.setViewport({ width: 414, height: 900, deviceScaleFactor: 2 })
await h5load(page, '/pages/apply/need')
await waitSel(page, '.scroller'); await sleep(1100)
const jumped = await advanceTo(page, 5)
await sleep(1200)
// 往左回退一格：让「已完成 / 当前 / 已编写在后」同框，截图才能和你的图3、图4 直接对比
await nudgeLeft(page, 1)
await sleep(400)
const DM = await measure(page, READ)
const DT = await measure(page, READ_TONES)
ok(`已完成态出现（点第 5 步 → 前 4 步变已完成）`, !!DM && DM.doneIdx >= 0, `jump=${jumped} doneIdx=${DM ? DM.doneIdx : '-'} states=${DM ? DM.states : '-'}`)
ok(`已完成勾在圆里居中、圆没被压扁（图4 修好）`,
  !!DM && DM.ckOff && Math.abs(DM.ckOff.dx) <= 1 && Math.abs(DM.ckOff.dy) <= 1.2,
  `勾偏移=${DM ? JSON.stringify(DM.ckOff) : 'null'}`)
const doneRatio = DM ? DM.doneRatio : null
ok(`已完成圆仍是正圆（宽高比 1.00，没有被挤扁）`,
  !!DM && DM.dotRatios.length > 0 && DM.dotRatios.every(r => Math.abs(r - 1) <= 0.02),
  `全部点宽高比=${JSON.stringify(DM ? DM.dotRatios : [])} 已完成=${doneRatio}`)
ok(`已完成走淡蓝底 + 蓝勾（不再是绿色实心圆）`, !!DT && !!DT.sample['done'] && /rgba\(74, 108, 247/.test(DT.sample['done'].dotBg) && !!DT.sample['done'].dotBorder.includes('rgba(74, 108, 247'),
  `底色=${DT && DT.sample['done'] ? DT.sample['done'].dotBg : '-'} 描边=${DT && DT.sample['done'] ? DT.sample['done'].dotBorder : '-'} 标签=${DT && DT.sample['done'] ? DT.sample['done'].labelColor : '-'}`)
const zoomClip = await shotClip()
if (zoomClip) await page.screenshot({ path: path.join(SHOTS, 'ui-zoom-414.png'), clip: zoomClip, captureBeyondViewport: false, timeout: 15000 }).catch(() => {})

// ============ 720 桌面栏宽（限宽 480）：一屏 5 项、四种状态同框 ============
await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 2 })
await h5load(page, '/pages/apply/need')
await waitSel(page, '.scroller'); await sleep(1100)
// 两跳走到第 5 步（直接点第 5 步会被拒绝），再滚一格把「未开始」也带进这一帧
await advanceTo(page, 5)
await nudgeRight(page, 1)
await sleep(600)
const SM = await measure(page, READ)
ok(`[720px] 一屏 5 个完整项（限宽 480 里也算得下）`, SM && SM.perView === 5 && SM.partialRight.length === 0, `一屏=${SM ? SM.perView : '-'} 单项=${SM ? SM.itemW : '-'} 可视区=${SM ? SM.scrollBox.cw : '-'} 被切=${SM ? JSON.stringify(SM.partialRight) : '-'}`)
ok(`[720px] 一屏里四种状态同框（已完成 / 当前 / 已编写在后 / 未开始）`,
  SM && ['done', 'cur', 'ahead', 'todo'].every(s => SM.wholeInside.some(i => SM.states.split(',')[i] === s)),
  `可视项状态=${SM && SM.wholeInside ? SM.wholeInside.map(i => SM.states.split(',')[i]).join(',') : '-'}`)
const sClip = await shotClip()
if (sClip) await page.screenshot({ path: path.join(SHOTS, 'ui-states-720.png'), clip: sClip, captureBeyondViewport: false, timeout: 15000 }).catch(() => {})

// 回到最左，证明左箭头也能平移、并且贴左时左箭头置灰
await page.setViewport({ width: 414, height: 900, deviceScaleFactor: 1 })
await h5load(page, '/pages/apply/need'); await waitSel(page, '.scroller'); await sleep(1100)
await nudgeRight(page, 8)
for (let i = 0; i < 10; i++) {
  const back = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('.bar')].find(e => e.querySelector('.scroller'))
    const left = bar.querySelectorAll('.nav')[0]
    if (!left || left.className.includes('off')) return false
    left.click(); return true
  })
  if (!back) break
  await sleep(320)
}
await sleep(400)
const BM = await measure(page, READ)
ok(`滚回最左时首项贴左边缘、左箭头置灰、最右边仍是完整项`,
  BM && Math.abs(BM.gapFirst) <= 1.5 && BM.offLeft && BM.partialRight.length === 0,
  `gapFirst=${BM ? BM.gapFirst : '-'} scrollLeft=${BM ? BM.scrollBox.sl : '-'} 左箭头off=${BM ? BM.offLeft : '-'} 被切=${BM ? JSON.stringify(BM.partialRight) : '-'}`)

console.log(`\n==== ${pass} 通过 / ${fail} 失败 ====`)
if (fails.length) console.log('失败清单:\n  ' + fails.join('\n  '))
console.log(`截图目录: ${SHOTS}`)
await browser.close()
process.exit(fail ? 1 : 0)
