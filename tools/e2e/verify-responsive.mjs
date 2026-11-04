// 星穹 SkyShow 自适应专项走查（驱动本机 Edge，有头模式）
// 覆盖：H5 宽屏 rem 锁定 + 居中、手机端正常缩放；管理端 桌面/平板/手机 三档侧边栏 + 弹窗/抽屉限宽
// 前置：mock-server（8090 H5 / 8080 管理端，均为最新构建产物）
// 运行：node verify-responsive.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })

const H5 = 'http://localhost:8090'
const ADMIN = 'http://localhost:8080'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function log(name, ok, extra = '') {
  results.push({ name, ok, extra })
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
}
async function step(name, fn) {
  try {
    const r = await fn()
    log(name, r !== false, typeof r === 'string' ? r : '')
  } catch (e) {
    log(name, false, e.message.slice(0, 100))
  }
}
async function shot(page, name) {
  try {
    await sleep(300)
    await page.screenshot({ path: path.join(SHOTS, `resp-${name}.png`), timeout: 10000 })
  } catch {}
}
async function h5load(page, hashPath) {
  await page.goto(`${H5}/#${hashPath}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
}
async function type(page, sel, value) {
  return page.evaluate((s, v) => {
    const el = document.querySelector(s)
    if (!el) return false
    el.focus()
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
    return true
  }, sel, value)
}
async function clickText(page, texts, scope = '') {
  return page.evaluate((texts, scope) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return false
    const els = [...root.querySelectorAll('button, .el-button, .el-menu-item, [class*=btn]')]
    for (const t of texts) {
      const el = els.find((e) => (e.innerText || '').trim().includes(t) && e.getClientRects().length > 0)
      if (el) { el.click(); return t }
    }
    return false
  }, texts, scope)
}
async function adminLogin(page) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
  await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
  await page.waitForSelector('input[placeholder="请输入账号"]', { timeout: 10000 })
  await type(page, 'input[placeholder="请输入账号"]', 'admin')
  await type(page, 'input[placeholder="请输入密码"]', 'admin123')
  await type(page, 'input[placeholder="验证码"]', '1234')
  await clickText(page, ['登 录', '登录'])
  const ok = await page.waitForFunction(
    () => document.body.innerText.includes('管理后台') && location.pathname !== '/login',
    { timeout: 12000, polling: 200 }
  ).then(() => true).catch(() => false)
  if (!ok) throw new Error('管理端登录失败')
  await sleep(800)
}

// 度量：页面级横向溢出（表格应内部滚动，页面本身不溢出）
const docOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: false,
    protocolTimeout: 180000,
    slowMo: 25,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=1520,1000', '--window-position=0,0']
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 120)))

  // ========== H5 @ 桌面 1440 ==========
  await page.setViewport({ width: 1440, height: 900 })
  await step('H5桌面端：rem 基准锁定为 480/23.4375（≈20.48px）', async () => {
    await h5load(page, '/pages/index/index')
    await sleep(500)
    const fs_ = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
    if (Math.abs(fs_ - 20.48) > 0.3) throw new Error(`html font-size = ${fs_}（未锁定，宽屏会被放大）`)
    return `font-size=${fs_}`
  })
  await step('H5桌面端：页面栏 480px 居中 + 页面无横向溢出', async () => {
    const m = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length > 0)
      const b = bodies[0]
      if (!b) return null
      const r = b.getBoundingClientRect()
      // 桌面浏览器有纵向滚动条，居中参考系是 clientWidth（= innerWidth - 滚动条）
      return { w: Math.round(r.width), left: Math.round(r.left), cw: document.documentElement.clientWidth, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    if (!m) throw new Error('未找到可见 uni-page-body')
    if (m.w !== 480) throw new Error(`栏宽=${m.w}（应为 480）`)
    const expectLeft = (m.cw - 480) / 2
    if (Math.abs(m.left - expectLeft) > 3) throw new Error(`未居中：left=${m.left}，期望≈${expectLeft}`)
    if (m.over > 1) throw new Error(`页面横向溢出 ${m.over}px`)
    return `栏宽 480，left=${m.left}`
  })
  await step('H5桌面端：fixed 底栏/TabBar 随栏宽居中', async () => {
    await h5load(page, '/pages/order/create')
    await page.waitForSelector('.price-bar', { timeout: 10000 })
    await sleep(400)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.price-bar').getBoundingClientRect()
      return { w: Math.round(r.width), left: Math.round(r.left), cw: document.documentElement.clientWidth }
    })
    if (m.w !== 480) throw new Error(`底栏宽=${m.w}`)
    if (Math.abs(m.left - (m.cw - 480) / 2) > 3) throw new Error(`底栏未居中 left=${m.left}`)
    await shot(page, 'h5-desktop-create')
    return `底栏 480 居中`
  })

  // ========== H5 @ 手机 390 ==========
  await page.setViewport({ width: 390, height: 844 })
  await step('H5手机端：rem 基准跟随视口（≈16.64px），底栏全宽', async () => {
    await h5load(page, '/pages/order/create')
    await page.waitForSelector('.price-bar', { timeout: 10000 })
    await sleep(400)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.price-bar').getBoundingClientRect()
      return { fs: parseFloat(getComputedStyle(document.documentElement).fontSize), w: Math.round(r.width), cw: document.documentElement.clientWidth }
    })
    if (Math.abs(m.fs - 390 / 23.4375) > 0.4) throw new Error(`font-size=${m.fs}（应≈16.64）`)
    // 有头浏览器窗口存在纵向滚动条，底栏应铺满 clientWidth
    if (m.w !== m.cw) throw new Error(`底栏宽=${m.w}，可视宽=${m.cw}`)
    return `font-size=${m.fs.toFixed(2)}，底栏 ${m.w}/${m.cw}`
  })
  await step('H5手机端：联系人输入框真实点击+键盘输入（回归）', async () => {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.sec-title')].find((x) => (x.innerText || '').includes('联系人'))
      if (el) el.scrollIntoView({ block: 'center' })
    })
    await sleep(400)
    const loc = await page.evaluate(() => {
      const hosts = [...document.querySelectorAll('uni-input')].filter((e) => e.getClientRects().length > 0)
      const h = hosts.find((x) => ((x.querySelector('.uni-input-placeholder') || {}).innerText || '').includes('姓名'))
      if (!h) return null
      const r = h.getBoundingClientRect()
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    })
    if (!loc) throw new Error('未找到姓名输入框')
    await page.mouse.click(loc.cx, loc.cy)
    await sleep(200)
    await page.keyboard.type('自适配', { delay: 30 })
    await sleep(200)
    const v = await page.evaluate(() => {
      const hosts = [...document.querySelectorAll('uni-input')].filter((e) => e.getClientRects().length > 0)
      const h = hosts.find((x) => ((x.querySelector('.uni-input-placeholder') || {}).innerText || '').includes('姓名'))
      const i = h && h.querySelector('input')
      return i ? i.value : ''
    })
    if (v !== '自适配') throw new Error(`输入结果="${v}"`)
    return '真实输入 OK'
  })

  // ========== 管理端 @ 桌面 1440 ==========
  await page.setViewport({ width: 1440, height: 900 })
  await step('管理端桌面端：侧边栏展开 210px，页面无横向溢出', async () => {
    await adminLogin(page)
    const m = await page.evaluate(() => {
      const sb = document.querySelector('.sidebar')
      return { w: Math.round(sb.getBoundingClientRect().width), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    if (m.w !== 210) throw new Error(`侧边栏宽=${m.w}`)
    if (m.over > 1) throw new Error(`横向溢出 ${m.over}px`)
    return '侧边栏 210'
  })

  // ========== 管理端 @ 平板 820（<992 自动折叠） ==========
  await page.setViewport({ width: 820, height: 1000 })
  await step('管理端平板端（820px）：侧边栏自动折叠为 64px', async () => {
    await page.goto(`${ADMIN}/index`, { waitUntil: 'networkidle2' })
    await sleep(700)
    const m = await page.evaluate(() => {
      const sb = document.querySelector('.sidebar')
      return { w: Math.round(sb.getBoundingClientRect().width), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    if (m.w !== 64) throw new Error(`侧边栏宽=${m.w}（应自动折叠为 64）`)
    if (m.over > 1) throw new Error(`横向溢出 ${m.over}px`)
    await shot(page, 'admin-tablet-dashboard')
    return '侧边栏 64'
  })
  await step('管理端平板端：弹窗宽度不超出视口', async () => {
    await page.goto(`${ADMIN}/schedule`, { waitUntil: 'networkidle2' })
    await sleep(800)
    const clicked = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.day-cell')].find((c) => c.querySelector('.day-num') && c.getClientRects().length > 0)
      if (cell) { cell.click(); return true }
      return false
    })
    if (!clicked) throw new Error('未找到可点击的日期格')
    await sleep(600)
    const m = await page.evaluate(() => {
      const d = document.querySelector('.el-dialog')
      if (!d) return null
      const r = d.getBoundingClientRect()
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth }
    })
    if (!m) throw new Error('弹窗未打开')
    if (m.left < 0 || m.right > m.vw) throw new Error(`弹窗超出视口 left=${m.left} right=${m.right} vw=${m.vw}`)
    await page.keyboard.press('Escape')
    await sleep(400)
    return `弹窗 ${m.w}px @ vw=${m.vw}`
  })

  // ========== 管理端 @ 手机 390（抽屉式侧边栏） ==========
  await page.setViewport({ width: 390, height: 844 })
  await step('管理端手机端：侧边栏默认隐藏（屏外）', async () => {
    await page.goto(`${ADMIN}/index`, { waitUntil: 'networkidle2' })
    await sleep(700)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.sidebar').getBoundingClientRect()
      return { right: Math.round(r.right), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    if (m.right > 1) throw new Error(`侧边栏未隐藏 right=${m.right}`)
    if (m.over > 1) throw new Error(`横向溢出 ${m.over}px`)
    return '屏外隐藏'
  })
  await step('管理端手机端：汉堡按钮打开抽屉（210px）并带遮罩', async () => {
    await page.evaluate(() => document.querySelector('.fold-btn').click())
    await sleep(600)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.sidebar').getBoundingClientRect()
      const mask = document.querySelector('.drawer-mask')
      return { left: Math.round(r.left), w: Math.round(r.width), mask: !!(mask && mask.getClientRects().length > 0) }
    })
    if (m.left !== 0 || m.w !== 210) throw new Error(`抽屉状态异常 left=${m.left} w=${m.w}`)
    if (!m.mask) throw new Error('遮罩未出现')
    await shot(page, 'admin-mobile-drawer')
    return '抽屉 210 + 遮罩'
  })
  await step('管理端手机端：点菜单跳转后抽屉自动收起', async () => {
    const clicked = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.el-menu-item')]
      const it = items.find((x) => (x.innerText || '').includes('订单管理') && x.getClientRects().length > 0)
      if (it) { it.click(); return true }
      return false
    })
    if (!clicked) throw new Error('未找到订单管理菜单')
    await sleep(900)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.sidebar').getBoundingClientRect()
      return { right: Math.round(r.right), path: location.pathname }
    })
    if (!m.path.includes('/order')) throw new Error(`未跳转：${m.path}`)
    if (m.right > 1) throw new Error(`抽屉未收起 right=${m.right}`)
    return '跳转+收起'
  })
  await step('管理端手机端：订单列表无页面级横向溢出（表格内部滚动）', async () => {
    await sleep(600)
    const over = await docOverflow(page)
    if (over > 1) throw new Error(`横向溢出 ${over}px`)
    await shot(page, 'admin-mobile-orders')
    return '表格内部滚动'
  })
  await step('管理端手机端：订单详情抽屉不超出视口（620→钳制）', async () => {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.el-table button, .el-table .el-button')].find(
        (x) => (x.innerText || '').includes('详情') && x.getClientRects().length > 0
      )
      if (b) { b.click(); return true }
      return false
    })
    if (!clicked) throw new Error('未找到详情按钮')
    await sleep(800)
    const m = await page.evaluate(() => {
      const d = document.querySelector('.el-drawer')
      if (!d) return null
      const r = d.getBoundingClientRect()
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth }
    })
    if (!m) throw new Error('抽屉未打开')
    if (m.left < 0 || m.right > m.vw) throw new Error(`抽屉超出视口 left=${m.left} right=${m.right} vw=${m.vw}`)
    await shot(page, 'admin-mobile-drawer-detail')
    await page.keyboard.press('Escape')
    return `抽屉 ${m.w}px @ vw=${m.vw}`
  })

  await browser.close()
  const passed = results.filter((r) => r.ok).length
  console.log(`\n========== 自适应走查结果：${passed}/${results.length} 通过 ==========`)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.log('未通过：')
    failed.forEach((f) => console.log(`  ❌ ${f.name} — ${f.extra}`))
  }
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('走查中断：', e.message)
  process.exit(2)
})
