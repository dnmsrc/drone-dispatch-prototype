// 星穹 SkyShow 双端全流程自动化走查（驱动本机 Edge）
// 前置：mock-server:8090、h5:5173、admin:8080 均已启动
// 运行：node run.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })

const H5 = process.env.H5_BASE || 'http://localhost:8090' // 默认打构建产物（8090 静态托管），可 H5_BASE=http://localhost:5173 打 dev
const ADMIN = 'http://localhost:8080'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const results = []
function log(name, ok, extra = '') {
  results.push({ name, ok, extra })
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
}

async function shot(page, name) {
  try {
    await sleep(350)
    // 把窗口提到前台再截：headless:false 下窗口被遮挡/最小化时 captureScreenshot 会卡在 CDP。
    await page.bringToFront().catch(() => {})
    // 2026-11-04：headless:false 下 captureScreenshot 偶发卡死在 CDP（不是 10s timeout 能兜住的），
    // 单张图最坏 9s 就放弃，避免一张截图拖垮整轮走查。
    await Promise.race([
      page.screenshot({ path: path.join(SHOTS, `flow-${name}.png`), timeout: 8000 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot 卡住（9s）')), 9000))
    ])
  } catch (e) {
    console.log(`  (截图跳过 ${name}: ${e.message.slice(0, 40)})`)
  }
}

// evaluate 版点击：按选择器（可见性过滤，避开 uni-app 页面堆叠中的隐藏页）
async function click(page, sel) {
  return page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    const el = els.find(e => e.getClientRects().length > 0) || els[0]
    if (el) { el.click(); return true }
    return false
  }, sel)
}

// 在指定根选择器内点击包含任一文字的可见元素
async function clickText(page, texts, scope = '') {
  return page.evaluate((texts, scope) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return false
    const els = [...root.querySelectorAll('button, .tab, .reason, .slot, .venue-item, .cell, .mini, .oc-item, [class*=btn], .el-button, .el-dropdown-menu__item')]
    for (const t of texts) {
      const el = els.find(e => (e.innerText || '').trim().includes(t) && e.getClientRects().length > 0)
      if (el) { el.click(); return t }
    }
    return false
  }, texts, scope)
}

// evaluate 版输入（触发 v-model）
async function type(page, sel, value) {
  return page.evaluate((s, v) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.focus()
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur()
    return true
  }, sel, value)
}

async function waitSel(page, sel, timeout = 10000) {
  // 只等 DOM 存在：uni-app 页面过渡期间元素可能暂时不可见
  try { await page.waitForSelector(sel, { timeout }); return true }
  catch { return false }
}

// 等待并确认 ElMessageBox：在“可见”的弹框中按文案点击（DOM 中可能残留已关闭弹框）
async function confirmBox(page, texts) {
  await sleep(400)
  for (let i = 0; i < 20; i++) {
    const r = await page.evaluate((texts) => {
      const boxes = [...document.querySelectorAll('.el-message-box')]
      const box = boxes.find(bx => bx.getClientRects().length > 0)
      if (!box) return null
      const btn = [...box.querySelectorAll('button')].find(x => texts.some(t => (x.innerText || '').trim() === t || (x.innerText || '').trim().includes(t)))
      if (btn) { btn.click(); return btn.innerText.trim() }
      return false
    }, texts)
    if (r) return r
    if (r === false) return false // 弹框可见但没有目标按钮
    await sleep(300)
  }
  return false
}

// 精确文案点击（可见性过滤）
async function clickExact(page, text, scopeSel) {
  return page.evaluate((t, scope) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return false
    const btn = [...root.querySelectorAll('button, .el-button')].find(x => (x.innerText || '').trim() === t && x.getClientRects().length > 0)
    if (btn) { btn.click(); return true }
    return false
  }, text, scopeSel)
}

// 步骤级超时兜底（2026-11-03）：个别 DOM 等待/截图会挂住整轮跑批（表现为日志停在上一行、不报错），
// 单步超过 75 秒就判失败并继续走，避免一轮全流程被一处卡死。
async function step(name, fn, ms = 75000) {
  let timer = null
  try {
    const r = await Promise.race([
      fn(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`步骤超时（${ms}ms）`)), ms) })
    ])
    log(name, r !== false, typeof r === 'string' ? r : '')
  } catch (e) {
    log(name, false, e.message.slice(0, 200))
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// H5 整页加载（2026-10-29 修：puppeteer 的 goto 只改 hash 时 uni-app 不会挂载新页，且同文档导航偶尔等不到 load 事件——
// 表现为「卡在某一步不动、也不报错」。可靠写法 = 在页内改 location.hash 后 reload，再等 uni-page-body 真的渲染出来）
async function h5load(page, hashPath) {
  await page.evaluate(h => { location.hash = '#' + h }, hashPath).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length),
    { timeout: 12000, polling: 200 }
  ).catch(() => {})
  await sleep(400)
}

// H5：填写下单表单并支付成功
async function h5CreateAndPay(page, dayOffset, tag) {
  await h5load(page, '/pages/order/create')
  await waitSel(page, '.tier-grid')
    console.log('  [pay] 1: tier-grid ready')
  const day = await page.evaluate((offset) => {
    const t = new Date(); t.setDate(t.getDate() + offset); return t.getDate()
  }, dayOffset)
  let picked = await page.evaluate((d) => {
    const cells = [...document.querySelectorAll('.cell:not(.off):not(.pad)')]
    const c = cells.find(x => x.querySelector('.day') && x.querySelector('.day').innerText.trim() === String(d))
    if (c) { c.click(); return true } return false
  }, day)
    console.log('  [pay] 2: date picked =', picked)
  if (!picked) {
    await page.evaluate(() => { const navs = document.querySelectorAll('.nav:not(.off)'); navs[navs.length - 1].click() })
    await sleep(300)
    await page.evaluate((d) => {
      const cells = [...document.querySelectorAll('.cell:not(.off):not(.pad)')]
      const c = cells.find(x => x.querySelector('.day') && x.querySelector('.day').innerText.trim() === String(d))
      if (c) { c.click(); return true } return false
    }, day)
  }
    console.log('  [pay] 3: after retry pick')
  // 2026-11-04：种子订单会占用部分时段（同一时段只能接一单），不能盲点第 2 个时段，
  // 必须选当天「仍可用」的第一个时段，否则下单会被服务端以「该时段已被占用」挡回。
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('.slot')].filter(e => e.getClientRects().length)
    const usable = all.filter(e => !/dis|off|dead/.test(e.className || ''))
    const s = usable[0] || all[0]
    if (s) s.click()
  })
  await page.evaluate(() => document.querySelector('.venue-item').click())
  // 真实鼠标+键盘输入联系人（合成事件无法发现「输入框塌缩导致真实用户无法输入」这类 bug）
    console.log('  [pay] 4: slot+venue picked')
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('联系人'))
    if (el) el.scrollIntoView({ block: 'center' })
  })
  await sleep(400)
    console.log('  [pay] 5: scrolled to contact')
  const findInput = `(ph) => {
    const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
    const host = hosts.find(h => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph))
    if (!host) return null
    const r = host.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }`
  for (const [ph, value] of [['姓名', '自动化演示'], ['手机号', '13800009999']]) {
    const loc = await page.evaluate(`(${findInput})(${JSON.stringify(ph)})`)
    if (!loc) throw new Error(`未找到输入框: ${ph}`)
    await page.mouse.click(loc.cx, loc.cy)
    await sleep(200)
    await page.keyboard.type(value, { delay: 30 })
    await sleep(200)
  }
    console.log('  [pay] 6: contacts typed')
  const typed = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
    const get = (ph) => { const h = hosts.find(x => ((x.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph)); const i = h && h.querySelector('input'); return i ? i.value : '' }
    return { name: get('姓名'), phone: get('手机号') }
  })
  if (typed.name !== '自动化演示' || typed.phone !== '13800009999') {
    throw new Error(`联系人真实输入失败: ${JSON.stringify(typed)}`)
  }
    console.log('  [pay] 7: typed verified =', JSON.stringify(typed))
  await shot(page, `${tag}-create-filled`)
  await click(page, '.pb-btn')
    console.log('  [pay] 8: filled shot done')
  if (!(await waitSel(page, '.hero-card', 8000))) {
    console.log('  [pay] 9: clicked next')
    const diag = await page.evaluate(() => {
      const on = (s) => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.innerText.trim().slice(0, 14)).join(',') || '无'
      return location.hash + ' | toast=' + (((document.querySelector('.uni-toast') || {}).innerText || '无')) +
        ' | 日期=' + on('.cell.on') + ' | slot=' + on('.slot.on') + ' | venue=' + on('.venue-item.on') +
        ' | tier=' + on('.tier.on') + ' | btn=' + (((document.querySelector('.pb-btn') || {}).className || '无')) +
        ' | ' + document.body.innerText.slice(0, 120).replace(/\n/g, ' ')
    })
    throw new Error('未进入确认页: ' + diag)
  }
  await click(page, '.checkbox')
  await shot(page, `${tag}-confirm`)
    console.log('  [pay] 10: confirm page + checkbox')
  await click(page, '.bb-btn')
  const toCashier = await page.waitForFunction(() => location.hash.includes('cashier'), { timeout: 12000, polling: 200 }).then(() => true).catch(() => false)
    console.log('  [pay] 11: clicked bb-btn')
  if (!toCashier) {
    const diag = await page.evaluate(() => {
      const toast = [...document.querySelectorAll('[class*="toast"]')].filter(e => e.getClientRects().length).map(e => (e.innerText || '').trim()).join('|')
      const cb = document.querySelector('.checkbox')
      const btn = [...document.querySelectorAll('.bb-btn')].filter(e => e.getClientRects().length)[0]
      return `${location.hash} | agree=${cb ? cb.className : '无'} | btn=${btn ? (btn.innerText || '').trim() + '/' + btn.disabled : '无'} | toast=${toast || '无'} | ${document.body.innerText.slice(0, 120)}`
    })
    console.log('  [pay] cashier-fail:', diag)
    throw new Error('未进入收银台: ' + diag)
  }
  if (!(await waitSel(page, '.amount-card', 10000))) throw new Error('收银台未渲染')
  await shot(page, `${tag}-cashier`)
    console.log('  [pay] 12: cashier rendered')
  await click(page, '.pay-btn')
  await waitSel(page, '.panel')
  await clickText(page, ['模拟支付成功'])
    console.log('  [pay] 13: pay-btn clicked, panel waiting')
  const toResult = await page.waitForFunction(() => location.hash.includes('result'), { timeout: 12000, polling: 200 }).then(() => true).catch(() => false)
  if (!toResult) throw new Error('未进入结果页: ' + await page.evaluate(() => location.hash))
    console.log('  [pay] 14: clicked mock pay success')
  await waitSel(page, '.result', 8000)
  // 按钮适配回归：uni-button 默认 auto 外边距曾使按钮在 flex 列里收缩成圆形裁掉文字
  const btnFit = await page.evaluate(() => {
    const box = document.querySelector('.btns')
    if (!box) return { ok: false, why: 'no .btns' }
    const bw = box.getBoundingClientRect().width
    const bad = [...box.querySelectorAll('uni-button, button')].filter(b => {
      const r = b.getBoundingClientRect()
      return r.width < bw * 0.9 || b.scrollWidth > b.clientWidth + 2
    })
    return { ok: bad.length === 0, why: bad.map(b => `"${b.innerText}" w=${Math.round(b.getBoundingClientRect().width)}/box=${Math.round(bw)}`).join(',') }
  })
  if (!btnFit.ok) throw new Error('结果页按钮适配异常: ' + btnFit.why)
  await shot(page, `${tag}-result`)
  // 返回订单号：供后续 admin/H5 步骤「按订单号精确定位行」，不再依赖列表排序假设
  return await page.evaluate(() => {
    const m = location.hash.match(/[?&]id=([^&]+)/)
    return m ? m[1] : ''
  })
}

async function adminLogin(page, username, password) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
  await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
  await waitSel(page, 'input[placeholder="请输入账号"]')
  await type(page, 'input[placeholder="请输入账号"]', username)
  await type(page, 'input[placeholder="请输入密码"]', password)
  await type(page, 'input[placeholder="验证码"]', '1234')
  await clickText(page, ['登 录', '登录'])
  // 登录成功标志：侧边栏/工作台出现
  const ok = await page.waitForFunction(
    () => document.body.innerText.includes('管理后台') && location.pathname !== '/login',
    { timeout: 12000, polling: 200 }
  ).then(() => true).catch(() => false)
  if (!ok) {
    const diag = await page.evaluate(() => location.hash + ' | ' + document.body.innerText.slice(0, 80))
    throw new Error('登录未成功: ' + diag)
  }
  await sleep(800)
}

// 按订单号精确定位行并点其「详情」（消除「首行就是目标单」的排序假设，杜绝点开错单）
async function openRowDetailById(page, orderId) {
  const clicked = await page.evaluate((oid) => {
    const rows = [...document.querySelectorAll('.el-table__row')].filter(r => r.getClientRects().length > 0)
    const row = rows.find(r => (r.innerText || '').includes(oid))
    if (!row) return 'row-not-found'
    const b = [...row.querySelectorAll('button, .el-button')].find(x => (x.innerText || '').includes('详情'))
    if (!b) return 'btn-not-found'
    b.click(); return true
  }, orderId)
  if (clicked !== true) throw new Error(`未找到订单 ${orderId} 的详情按钮: ${clicked}`)
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: false, // 有头模式：headless 帧饥饿会导致截图挂起、过渡卡死
    protocolTimeout: 180000,
    slowMo: 30,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1520,1000', '--window-position=0,0']
  })
  const h5 = await browser.newPage()
  await h5.setViewport({ width: 480, height: 900 })
  // 新 page 是 about:blank，h5load 里的 location.hash 改不动它、reload 会挂住 —— 先落到站点 origin
  await h5.goto(`${H5}/#/pages/index/index`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  h5.on('pageerror', e => console.log('  [h5 pageerror]', e.message.slice(0, 150)))
  // 原生对话框自动接管（2026-10-29）：浏览器里一旦挂着 window.confirm/alert，puppeteer 的页面操作会一直等
  // 直到 protocolTimeout（180s）——表现为「卡在某一步不动、也不报错」。这里统一 accept，避免测试被对话框挂死。
  h5.on('dialog', d => d.accept().catch(() => {}))
  const admin = await browser.newPage()
  await admin.setViewport({ width: 1440, height: 900 })
  admin.on('pageerror', e => console.log('  [admin pageerror]', e.message.slice(0, 150)))
  admin.on('dialog', d => d.accept().catch(() => {}))
  admin.on('response', r => { const u = r.url(); if (u.includes('/api/admin/') && r.request().method() === 'POST') console.log('  [net]', u.split('/api')[1], '->', r.status()) })

  // 跑批前重置演示数据（2026-10-28 17:25 定位）：mock-server 的数据是持久化的（save()），dailyLimit=3，
  // 跨轮累积会把「+1 天」的额度占满 → 日历那天变 .off → 第二单选不到日期（诊断：日期=无 slot=无）。
  // 这不是页面回归，是测试状态累积；判据要可重复，所以每轮从已知状态开始。
  const API = process.env.API_BASE || 'http://localhost:8090'
  const resetDemo = async () => {
    const r0 = await fetch(`${API}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
    const j0 = await r0.json()
    const tok = (j0.data && j0.data.token) || ''
    if (!tok) throw new Error(`reset 前管理员登录失败：${JSON.stringify(j0).slice(0, 80)}`)
    const r1 = await fetch(`${API}/api/config/reset`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` } })
    const j1 = await r1.json()
    if (j1.code !== 0) throw new Error(`reset 失败：${JSON.stringify(j1).slice(0, 80)}`)
    console.log('  [reset]', j1.msg)
  }
  await resetDemo()

  // 1. H5 首页
  await step('H5 首页渲染', async () => {
    await h5load(h5, '/pages/index/index')
    await waitSel(h5, '.hero')
    await shot(h5, '01-home')
  })

  // 1b. 首页 CTA「立即预约表演」→ 登录门 → 真实微信登录 → 回跳第 1 步
  //     （回归：@click 无括号把事件对象写入 droneCount，页面渲染 JSON）
  await step('首页 CTA 登录门 + 回跳第 1 步（事件对象泄漏回归）', async () => {
    // 2026-11-03 用户要求：没登录不允许点进预约流程。先确保判据从「未登录」态开始，
    // 否则量到的是一条已登录路径，登录门有没有真的拦住就没人验了。
    await h5load(h5, '/pages/index/index')
    console.log('  [1b] a: index loaded')
    await h5.evaluate(() => { try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch (e) {} })
    // 用 domcontentloaded 重载：首页有轮询请求，networkidle2 可能永远等不到。
    await h5.reload({ waitUntil: 'domcontentloaded' })
    console.log('  [1b] b: reloaded')
    await sleep(1200)
    await waitSel(h5, '.cta')
    console.log('  [1b] c: cta ready')
    // 真实鼠标点击 CTA（合成 click() 同样会传事件对象，但真实点击更贴近用户路径）
    const loc = await h5.evaluate(() => {
      const el = [...document.querySelectorAll('.cta')].find(e => e.getClientRects().length > 0)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    })
    if (!loc) throw new Error('未找到 CTA 按钮')
    await h5.mouse.click(loc.cx, loc.cy)
    console.log('  [1b] d: cta clicked')
    // 2026-11-03 新增登录门：未登录点 CTA 必须先被拦到登录页，并把「登录后回哪」带过去。
    await sleep(1200)
    const gate = await h5.evaluate(() => ({ hash: location.hash }))
    console.log('  [1b] e: gate hash =', gate.hash)
    if (!gate.hash.includes('/pages/login/login')) throw new Error(`未登录点预约没被登录门拦住：${gate.hash}`)
    let back = gate.hash.split('redirect=')[1] || ''
    for (let i = 0; i < 3; i++) { try { back = decodeURIComponent(back) } catch (e) { break } }
    if (!back.includes('/pages/apply/venue')) throw new Error(`登录门没带对回跳地址：${gate.hash}`)
    // 真实走一遍微信模拟登录（不是种 token）：登录成功后应直接回到第 1 步，不绕回首页。
    await click(h5, '.wx-btn')
    console.log('  [1b] f: wx clicked')
    if (!(await waitSel(h5, '.auth-sheet', 6000))) throw new Error('授权弹层未打开')
    console.log('  [1b] g: auth sheet ok')
    await shot(h5, '03-wxauth')
    // 点击「允许」会触发一次真实页面导航（login → venue）。先注册 waitForNavigation 再点，
    // 点完等导航完成再量页面 —— 在 uni-app 转场中途 evaluate 会把 CDP 执行上下文挂住（实测 150s 不返回）。
    const navP = h5.waitForNavigation({ timeout: 12000, waitUntil: 'domcontentloaded' }).catch(() => null)
    await h5.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
    console.log('  [1b] h: allow clicked')
    await navP
    await sleep(1500)
    // 路由用 url() 同步读，不在转场中发 evaluate。
    const afterLogin = h5.url().split('#')[1] || ''
    console.log('  [1b] j: afterLogin =', afterLogin)
    const loggedIn = await h5.evaluate(() => !!localStorage.getItem('token')).catch(() => false)
    console.log('  [1b] i: loggedIn =', loggedIn)
    if (!loggedIn) throw new Error('授权后无 token')
    if (!afterLogin.includes('/pages/apply/venue')) throw new Error(`登录后没有回到第 1 步：${afterLogin}`)
    await waitSel(h5, '.venue-item', 8000)
    // 2026-10-28 六次调整（用户要求）：《申请说明》不再是流程第一步 —— CTA 直接进第 1 步，
    // 重大条款在「选到对应项」的那一刻逐条确认；须知页通过右下角悬浮入口随时回看。
    const m = await h5.evaluate(() => {
      const bodies = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length > 0)
      const body = bodies[bodies.length - 1]
      if (!body) return null
      return {
        hash: location.hash,
        venues: body.querySelectorAll('.venue-item').length,
        entry: body.querySelectorAll('.entry-chip.pend, .entry-chip.done').length,
        hasJson: body.innerText.includes('"type"') || body.innerText.includes('changedTouches')
      }
    })
    if (!m) throw new Error('第 1 步（场地）未渲染')
    if (m.hasJson) throw new Error(`页面仍渲染事件 JSON：${m.hash}`)
    if (!m.hash.includes('/pages/apply/venue')) throw new Error(`首页 CTA 未直接进入第 1 步：${m.hash}`)
    if (m.venues < 4) throw new Error(`场地列表不完整：${m.venues}`)
    // 判据口径（2026-10-29 最新）：填报时只选择，不弹窗、不显示确认入口；点击下一步才集中确认本步条款。
    if (m.entry) throw new Error(`填报页出现确认入口：${m.entry}`)
    console.log('  [1b] k: venue items =', await h5.evaluate(() => [...document.querySelectorAll('.venue-item')].filter(e => e.getClientRects().length).length))
    // 确认流的逐条判据在 verify-ackflow（40 项 · 全 DOM 实测）里已全覆盖；
    // 这轮全流程走查只验「入口 → 登录门 → 微信登录 → 回跳第 1 步 → 场地真的渲染出来」，
    // 避免整轮被一次 uni-app 转场卡死（2026-11-04 收窄口径）。
    await shot(h5, '01b-create-from-cta')
    return `登录门 → 微信登录 → 回跳第 1 步（${m.venues} 场地 · 无确认入口 · 无事件 JSON）`
  }, 150000)

  // 2. 未登录拦截 + 微信授权登录
  await step('H5 未登录拦截+模拟微信授权', async () => {
    h5.on('response', r => { if (r.url().includes('/api/auth/')) console.log('  [net]', r.url().split('/api')[1], r.status()) })
    // 2026-11-03 登录门对下单流程同样生效：先清登录态，验证「未登录点下一步」被拦到登录页。
    await h5.evaluate(() => { try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch (e) {} })
    // 必须整页重载：同文档改 hash 时 uni-app 不挂载新页，量到的还是上一页。
    await h5load(h5, '/pages/order/create')
    if (!(await waitSel(h5, '.tier-grid', 8000))) throw new Error('下单页未渲染')
    await shot(h5, '02-create')
    await click(h5, '.pb-btn')
    if (!(await waitSel(h5, '.wx-btn', 6000))) throw new Error('未跳转登录页')
    // 重载为干净的全量加载页，消除客户端导航的点击怪异
    await h5.reload({ waitUntil: 'domcontentloaded' })
    if (!(await waitSel(h5, '.wx-btn', 8000))) throw new Error('重载后无登录按钮')
    await click(h5, '.wx-btn')
    if (!(await waitSel(h5, '.auth-sheet', 6000))) throw new Error('授权弹层未打开')
    await shot(h5, '03-wxauth')
    const allowClicked = await h5.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) { b.click(); return true } return false })
    if (!allowClicked) throw new Error('未找到允许按钮')
    const gotToken = await h5.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).then(() => true).catch(() => false)
    const hash = await h5.evaluate(() => location.hash)
    console.log(`  [auth] token=${gotToken ? '已获取' : '空'} hash=${hash}`)
    if (!gotToken) throw new Error('授权后无 token')
    await shot(h5, '04-after-login')
  }, 150000)

  // 3. 第一单（+9 天，演示 90% 阶梯退款）
  let o1id = ''
  await step('第一单：H5 下单+支付成功', async () => {
    o1id = await h5CreateAndPay(h5, 9, 'o1')
    if (!o1id) throw new Error('结果页未取得订单号')
  }, 150000)

  // 4. operator 接单
  await step('operator 登录看板+接单', async () => {
    await adminLogin(admin, 'operator', 'operator123')
    await shot(admin, '05-dashboard-operator')
    await admin.goto(`${ADMIN}/order/list`, { waitUntil: 'networkidle2' })
    if (!(await waitSel(admin, '.el-table__row', 10000))) throw new Error('订单表格未渲染')
    await sleep(1000)
    await openRowDetailById(admin, o1id)
    if (!(await waitSel(admin, '.el-drawer', 8000))) throw new Error('抽屉未打开')
    await sleep(800)
    await shot(admin, '06-order-drawer-pending')
    const acc = await clickExact(admin, '接单', '.el-drawer')
    if (!acc) throw new Error('无接单按钮')
    const ok = await confirmBox(admin, ['确认接单', '确定'])
    if (!ok) throw new Error('接单确认框未处理')
    const accepted = await admin.waitForFunction(
      () => [...document.querySelectorAll('.el-drawer button')].some(b => (b.innerText || '').includes('开始执行')),
      { timeout: 10000, polling: 200 }
    ).then(() => true).catch(() => false)
    if (!accepted) throw new Error('接单后状态未变为已接单')
    await shot(admin, '07-order-accepted')
  })

  // 5. H5 申请退款
  await step('H5 申请退款（阶梯试算）', async () => {
    await h5load(h5, '/pages/order/list')
    await waitSel(h5, '.order-card')
    await h5.evaluate(() => document.querySelector('.order-card').click())
    await waitSel(h5, '.banner')
    await clickText(h5, ['申请退款'])
    if (!(await waitSel(h5, '.calc-card', 8000))) throw new Error('未进入退款页')
    await sleep(600)
    await shot(h5, '08-refund-preview')
    const ratio = await h5.evaluate(() => (document.querySelector('.cc-ratio') || {}).innerText || '')
    await h5.evaluate(() => document.querySelector('.reason').click())
    await clickText(h5, ['提交退款申请'])
    await sleep(1500)
    await shot(h5, '09-refunding')
    return ratio.replace(/\n/g, ' ')
  })

  // 6. admin 审批退款
  await step('admin 审批退款通过', async () => {
    await adminLogin(admin, 'admin', 'admin123')
    await admin.goto(`${ADMIN}/refund/list`, { waitUntil: 'networkidle2' })
    if (!(await waitSel(admin, '.el-table__row', 10000))) throw new Error('退款表格未渲染')
    await sleep(1000)
    await shot(admin, '10-refund-list')
    const auditClicked = await admin.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-table button, .el-table .el-button')]
      const b = btns.find(x => (x.innerText || '').includes('审批') && x.getClientRects().length > 0)
      if (b) { b.click(); return true }
      return false
    })
    if (!auditClicked) throw new Error('未找到审批按钮')
    if (!(await waitSel(admin, '.el-dialog', 8000))) throw new Error('审批弹窗未打开')
    await sleep(600)
    await shot(admin, '11-refund-audit')
    const ap = await clickText(admin, ['批准退款', '批准', '通过'], '.el-dialog')
    if (!ap) throw new Error('无批准按钮')
    await sleep(500)
    await clickText(admin, ['确 定', '确定'], '.el-message-box')
    await sleep(1500)
    await shot(admin, '12-refund-approved')
  })

  // 7. H5 查看已退款
  await step('H5 显示已退款', async () => {
    await h5load(h5, '/pages/order/list')
    await waitSel(h5, '.order-card')
    await h5.evaluate(() => document.querySelector('.order-card').click())
    await waitSel(h5, '.banner')
    await shot(h5, '13-refunded-detail')
    return await h5.evaluate(() => document.body.innerText.includes('已退款'))
  })

  // 8. 第二单（+1 天）→ operator 接单/执行/完成 → H5 照片+评价
  let o2id = ''
  await step('第二单：H5 下单+支付成功', async () => {
    o2id = await h5CreateAndPay(h5, 1, 'o2')
    if (!o2id) throw new Error('结果页未取得订单号')
  })
  await step('operator 接单/开始执行/完成订单', async () => {
    await adminLogin(admin, 'operator', 'operator123')
    await admin.goto(`${ADMIN}/order/list`, { waitUntil: 'networkidle2' })
    if (!(await waitSel(admin, '.el-table__row', 10000))) throw new Error('订单表格未渲染')
    await sleep(1000)
    await openRowDetailById(admin, o2id)
    if (!(await waitSel(admin, '.el-drawer', 8000))) throw new Error('抽屉未打开')
    await sleep(800)
    await shot(admin, '14-order2-drawer')
    const waitDrawerBtn = (text, timeout = 10000) => admin.waitForFunction(
      (t) => [...document.querySelectorAll('.el-drawer button')].some(b => (b.innerText || '').includes(t)),
      { timeout, polling: 200 }, text
    ).then(() => true).catch(() => false)
    // 抽屉动作：点击+确认框，以「下一状态按钮出现」为成功判据，最多重试 3 次（抗重渲染抖动）
    const action = async (btn, boxTexts, nextBtn) => {
      for (let i = 0; i < 3; i++) {
        if (await waitDrawerBtn(nextBtn, 1200)) return true
        await clickExact(admin, btn, '.el-drawer')
        await confirmBox(admin, boxTexts)
        if (await waitDrawerBtn(nextBtn, 3000)) return true
      }
      return false
    }
    if (!(await waitDrawerBtn('接单'))) throw new Error('接单按钮未出现')
    if (!(await action('接单', ['确认接单', '确定'], '开始执行'))) throw new Error('接单未生效')
    if (!(await action('开始执行', ['开始执行', '确定'], '完成订单'))) throw new Error('开始执行未生效')
    await clickExact(admin, '完成订单', '.el-drawer')
    await sleep(700)
    await shot(admin, '14-complete-dialog')
    await clickText(admin, ['自动生成', '直接提交', '确 定', '确定', '提交'], '.el-dialog')
    await sleep(1500)
    await shot(admin, '15-order-completed')
  })
  await step('H5 现场照片+评价', async () => {
    await h5load(h5, '/pages/order/list')
    await waitSel(h5, '.order-card')
    await h5.evaluate(() => document.querySelector('.order-card').click())
    await waitSel(h5, '.banner')
    await shot(h5, '16-completed-detail')
    await clickText(h5, ['现场照片'])
    if (!(await waitSel(h5, '.photo-grid', 8000))) throw new Error('未进入照片页')
    await sleep(900)
    await shot(h5, '17-gallery')
    await h5.goBack()
    await waitSel(h5, '.banner')
    await clickText(h5, ['评价订单'])
    if (!(await waitSel(h5, '.rate-card', 8000))) throw new Error('未进入评价页')
    await h5.evaluate(() => { const s = document.querySelectorAll('.star'); s[4].click() })
    await type(h5, 'textarea', '效果非常震撼，孩子看呆了！自动化演示评价。')
    await shot(h5, '18-review')
    await clickText(h5, ['提交评价'])
    await sleep(1500)
    await shot(h5, '19-reviewed')
    return await h5.evaluate(() => document.body.innerText.includes('我的评价') || document.body.innerText.includes('已评价'))
  })

  // 9. 档期页 + 最终看板
  await step('档期管理页（时段制 + 节假日图例）', async () => {
    await admin.goto(`${ADMIN}/schedule`, { waitUntil: 'networkidle2' })
    await sleep(1500)
    const text = await admin.evaluate(() => document.body.innerText)
    // 2026-11-03 档期模型从「每日限单数」改为「时段制」（一段 = 一个名额，每天名额 = 开放时段数）。
    // 页面上常显的是日历图例（满档/不接单/休整日/节假日·特殊日/可预约），「配置接单时段」只在多选操作条里出现，
    // 所以判据查图例齐全 + 旧「默认限单数」模型已消失。
    for (const t of ['满档', '不接单', '休整日', '节假日/特殊日', '可预约']) {
      if (!text.includes(t)) throw new Error(`档期页缺少图例「${t}」`)
    }
    if (text.includes('默认限单数')) throw new Error('档期页仍是旧的「每日限单数」模型')
    await shot(admin, '20-schedule')

    // 2026-11-04 用户口径：多选「已选」不许用整圈描边（描边贴着网格线，看着挤）。
    // 口径 = 内层圆角色块填充 + 日期变蓝 + 右上角对勾，相邻选中块之间留 ≥6px 呼吸缝。
    await admin.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '多选')
      b && b.click()
    })
    await sleep(500)
    await admin.evaluate(() => {
      const cells = [...document.querySelectorAll('.day-cell:not(.empty)')]
        .filter(c => c.querySelector('.day-booked') && !c.classList.contains('locked'))
      ;[20, 21, 22].forEach(i => cells[i] && cells[i].click())
    })
    await sleep(500)
    const pickedStyle = await admin.evaluate(() => {
      const cells = [...document.querySelectorAll('.day-cell.picked')]
      if (!cells.length) return { picked: 0 }
      const inner = cells[0].querySelector('.day-inner')
      const num = cells[0].querySelector('.day-num')
      const boxes = cells.map(c => ({ top: c.getBoundingClientRect().top, inner: c.querySelector('.day-inner').getBoundingClientRect() }))
      let gap = null
      for (let i = 1; i < boxes.length; i++) {
        if (Math.abs(boxes[i].top - boxes[i - 1].top) < 1) {
          const g = boxes[i].inner.left - boxes[i - 1].inner.right
          if (g >= 0 && g < 60 && (gap === null || g < gap)) gap = Math.round(g)
        }
      }
      return {
        picked: cells.length,
        checks: cells.filter(c => c.querySelector('.chk')).length,
        shadow: getComputedStyle(inner).boxShadow,
        radius: getComputedStyle(inner).borderRadius,
        numColor: getComputedStyle(num).color,
        gap
      }
    })
    if (!pickedStyle.picked) throw new Error('多选：点格子后没有选中态')
    if (pickedStyle.shadow !== 'none') throw new Error(`多选已选仍是描边：box-shadow=${pickedStyle.shadow}`)
    if (pickedStyle.checks !== pickedStyle.picked) throw new Error('多选已选缺少对勾标记')
    if (!(pickedStyle.gap >= 6)) throw new Error(`相邻选中块呼吸缝不足 6px：${pickedStyle.gap}`)
    if (!/rgb\(43, 124, 255\)/.test(pickedStyle.numColor)) throw new Error(`选中日期数字未变蓝：${pickedStyle.numColor}`)
    await shot(admin, '20b-schedule-multi')
    await admin.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === '退出多选')
      b && b.click()
    })
  })
  await step('admin 最终看板', async () => {
    await admin.goto(`${ADMIN}/index`, { waitUntil: 'networkidle2' })
    await sleep(1800)
    await shot(admin, '21-dashboard-final')
  })

  // 10. 业务配置页（admin 角色）
  await step('业务配置页渲染+保存', async () => {
    await adminLogin(admin, 'admin', 'admin123')
    await admin.goto(`${ADMIN}/system/config`, { waitUntil: 'networkidle2' })
    await sleep(1200)
    const text = await admin.evaluate(() => document.body.innerText)
    for (const t of ['运营参数', '预约窗口', '支付时限', '计价规则总览', '退款阶梯规则']) {
      if (!text.includes(t)) throw new Error(`业务配置页缺少「${t}」`)
    }
    await shot(admin, '22-biz-config')
    // 保存一次（值未变，验证链路可用）
    await clickText(admin, ['保存配置'])
    const okMsg = await admin.waitForFunction(
      () => document.body.innerText.includes('实时生效'),
      { timeout: 8000, polling: 200 }
    ).then(() => true).catch(() => false)
    if (!okMsg) throw new Error('保存后无成功提示')
  })

  // 11. 字典管理页渲染
  await step('字典管理页渲染', async () => {
    await admin.goto(`${ADMIN}/system/dict`, { waitUntil: 'networkidle2' })
    if (!(await waitSel(admin, '.type-card', 8000))) throw new Error('字典页未渲染')
    await sleep(1200)
    const text = await admin.evaluate(() => document.body.innerText)
    for (const t of ['架次档位', '表演时长', '预设图案', '附加服务', '演出时段', '退款阶梯', '订单状态']) {
      if (!text.includes(t)) throw new Error(`字典类型缺少「${t}」`)
    }
    // 默认选中第一个类型，右侧应展示档位项与价格
    if (!text.includes('18,800')) throw new Error('右侧未展示 100 架档位价格')
    await shot(admin, '23-dict')
  })

  // 12. 字典改价 → H5 计价联动（API 级往返，含还原）
  await step('字典改价联动 H5 计价（API）', async () => {
    const API = 'http://localhost:8090/api'
    const login = await (await fetch(`${API}/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    })).json()
    const tk = { Authorization: `Bearer ${login.data.token}` }
    const items = (await (await fetch(`${API}/admin/dict/drone_tier/items`, { headers: tk })).json()).data.list
    const it100 = items.find(i => i.key === '100')
    if (!it100) throw new Error('未找到 100 架档位字典项')
    const put = await (await fetch(`${API}/admin/dict/drone_tier/items/${it100.id}`, {
      method: 'PUT', headers: { ...tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 19800 })
    })).json()
    if (put.code !== 0) throw new Error('改价失败: ' + put.msg)
    const pricing = (await (await fetch(`${API}/config/pricing`)).json()).data
    const t = pricing.priceRules.tiers.find(x => x.drones === 100)
    if (t.price !== 19800) throw new Error(`H5 计价未联动: ${t.price}`)
    // 还原
    await fetch(`${API}/admin/dict/drone_tier/items/${it100.id}`, {
      method: 'PUT', headers: { ...tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 18800 })
    })
    const back = (await (await fetch(`${API}/config/pricing`)).json()).data.priceRules.tiers.find(x => x.drones === 100)
    if (back.price !== 18800) throw new Error('还原失败')
    return '18800→19800→18800 联动正常'
  })

  // 13. 档期单日覆盖 + 特殊日标注（API 级，含还原）
  await step('档期单日覆盖/特殊日（API）', async () => {
    const API = 'http://localhost:8090/api'
    const login = await (await fetch(`${API}/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    })).json()
    const tk = { Authorization: `Bearer ${login.data.token}` }
    const d = new Date(); d.setDate(d.getDate() + 21)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const post = (url, body) => fetch(`${API}${url}`, {
      method: 'POST', headers: { ...tk, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => r.json())
    const month = date.slice(0, 7)
    // 2026-11-03 档期改成时段制：单日覆盖 = 给这一天单独配可接单时段（/schedule/slots），
    // 不再有「单日限单数」这种覆盖方式。
    const ov = await post('/admin/schedule/slots', { dates: [date], mode: 'single', slots: ['19:00-20:00'] })
    if (ov.code !== 0) throw new Error('单日时段覆盖失败：' + (ov.msg || ''))
    const sch1 = (await (await fetch(`${API}/admin/schedule?month=${month}`, { headers: tk })).json()).data
    const day1 = sch1.days.find(x => x.date === date)
    if (!day1.slotsOverridden || day1.slots.length !== 1 || day1.slots[0] !== '19:00-20:00') throw new Error('单日时段覆盖未生效：' + JSON.stringify(day1.slots))
    const hd = await post('/admin/schedule/holiday', { date, name: '测试吉日' })
    if (hd.code !== 0 || hd.data.day.holiday !== '测试吉日') throw new Error('特殊日标注未生效')
    // 还原：清掉该日时段配置与特殊日标注
    await post('/admin/schedule/slots', { dates: [date], mode: 'single', slots: null })
    await post('/admin/schedule/holiday', { date, name: '' })
    const sch2 = (await (await fetch(`${API}/admin/schedule?month=${month}`, { headers: tk })).json()).data
    const day2 = sch2.days.find(x => x.date === date)
    if (day2.slotsOverridden || day2.holiday) throw new Error('还原后仍有覆盖/标注')
    return `${date} 时段覆盖+特殊日+还原正常`
  })

  await browser.close()
  const failed = results.filter(r => !r.ok)
  console.log(`\n========== 走查完成：${results.length - failed.length}/${results.length} 通过 ==========`)
  if (failed.length) { console.log('失败项：', failed.map(f => `${f.name}(${f.extra})`).join('、')); process.exit(2) }
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
