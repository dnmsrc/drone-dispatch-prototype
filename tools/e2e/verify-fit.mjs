// 星穹 SkyShow 按钮/文本适配专项走查（驱动本机 Edge，有头模式）
// 目标：机器化发现「按钮收缩成圆形裁掉文字」「文本溢出容器」「页面横向溢出」三类适配缺陷
// 覆盖：H5（390 手机 + 1440 桌面）+ 管理端（1440 桌面 + 390 手机）
// 前置：mock-server（8090 H5 / 8080 管理端，均为最新构建产物）
// 运行：node verify-fit.mjs
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
    log(name, false, e.message.slice(0, 140))
  }
}
async function shot(page, name) {
  try {
    await sleep(300)
    await page.screenshot({ path: path.join(SHOTS, `fit-${name}.png`), timeout: 10000 })
  } catch {}
}
async function h5load(page, hashPath) {
  await page.goto(`${H5}/#${hashPath}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(600)
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
async function clickText(page, texts) {
  return page.evaluate((texts) => {
    const els = [...document.querySelectorAll('button, .el-button, [class*=btn]')]
    for (const t of texts) {
      const el = els.find((e) => (e.innerText || '').trim().includes(t) && e.getClientRects().length > 0)
      if (el) { el.click(); return t }
    }
    return false
  }, texts)
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

// ===== 页面内适配度量（在浏览器上下文执行）=====
// 返回 { clippedBtns, clippedTexts, docOver }
// clippedBtns：文字被裁的可见按钮（scrollWidth/scrollHeight 超出 client 尺寸）
// clippedTexts：overflow 可见却装不下内容的普通文本元素（设计为 ellipsis/scroll 的不算缺陷）
const fitAudit = () => {
  const visible = (e) => {
    if (!e.getClientRects().length) return false
    const cs = getComputedStyle(e)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01
  }
  const clippedBtns = []
  for (const b of document.querySelectorAll('uni-button, button, .el-button')) {
    if (!visible(b)) continue
    if (!(b.innerText || '').trim()) continue // 纯图标按钮（如 EP 排序箭头）无文字可裁，内部图形溢出属组件自身设计
    const dx = b.scrollWidth - b.clientWidth
    const dy = b.scrollHeight - b.clientHeight
    if (dx > 2 || dy > 2) {
      const r = b.getBoundingClientRect()
      clippedBtns.push(`"${(b.innerText || '').trim().slice(0, 12)}" ${Math.round(r.width)}x${Math.round(r.height)} 溢出${dx}x${dy}`)
    }
  }
  const clippedTexts = []
  for (const e of document.querySelectorAll('text, span, p, div, view')) {
    if (!visible(e)) continue
    if (e.children.length && e.querySelector('*')) continue // 只看叶子，避免父容器误报
    const cs = getComputedStyle(e)
    if (cs.overflowX !== 'visible') continue // 设计为隐藏/滚动/省略的不算缺陷
    const dx = e.scrollWidth - e.clientWidth
    if (dx > 2) clippedTexts.push(`"${(e.innerText || '').trim().slice(0, 16)}" 溢出${dx}px .${[...e.classList].slice(0, 2).join('.')}`)
  }
  const docOver = document.documentElement.scrollWidth - document.documentElement.clientWidth
  return { clippedBtns: clippedBtns.slice(0, 5), clippedTexts: clippedTexts.slice(0, 5), docOver }
}

async function auditPage(page, name) {
  const r = await page.evaluate(fitAudit)
  const problems = []
  if (r.clippedBtns.length) problems.push(`按钮裁字: ${r.clippedBtns.join(' | ')}`)
  if (r.clippedTexts.length) problems.push(`文本溢出: ${r.clippedTexts.join(' | ')}`)
  if (r.docOver > 1) problems.push(`页面横向溢出 ${r.docOver}px`)
  if (problems.length) throw new Error(problems.join('；'))
  return '按钮/文本/页面均无溢出'
}

// H5 模拟微信授权登录（与 run.mjs 主流程同路径：触发拦截→授权→拿 token）
async function h5Login(page) {
  await h5load(page, '/pages/order/create')
  await page.waitForSelector('.tier-grid', { timeout: 10000 })
  await page.evaluate(() => { const b = document.querySelector('.pb-btn'); if (b) b.click() })
  const toLogin = await page.waitForSelector('.wx-btn', { timeout: 6000 }).then(() => true).catch(() => false)
  if (toLogin) {
    await page.reload({ waitUntil: 'networkidle2' })
    await page.waitForSelector('.wx-btn', { timeout: 8000 })
    await page.evaluate(() => document.querySelector('.wx-btn').click())
    await page.waitForSelector('.auth-sheet', { timeout: 6000 })
    await page.evaluate(() => { const b = document.querySelector('.btn.allow'); if (b) b.click() })
  }
  const got = await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000, polling: 200 }).then(() => true).catch(() => false)
  if (!got) throw new Error('H5 授权后无 token')
}

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

  // H5 先登录一次（localStorage 跨页面/视口共享），否则订单列表为空、详情进不去
  await step('H5：模拟微信授权登录', async () => {
    await page.setViewport({ width: 390, height: 844 })
    await h5Login(page)
    return 'token 已获取'
  })

  const H5_PAGES = [
    ['/pages/index/index', '首页'],
    ['/pages/order/create', '预约下单'],
    ['/pages/order/list', '订单列表'],
    ['/pages/user/index', '我的'],
    ['/pages/login/login', '登录']
  ]

  for (const vp of [{ width: 390, height: 844, tag: '手机390' }, { width: 1440, height: 900, tag: '桌面1440' }]) {
    await page.setViewport({ width: vp.width, height: vp.height })
    for (const [path_, label] of H5_PAGES) {
      await step(`H5 ${vp.tag}：${label} 按钮/文本适配`, async () => {
        await h5load(page, path_)
        await shot(page, `h5-${vp.tag}-${label}`)
        return auditPage(page, label)
      })
    }
    // 订单详情（从列表点进第一单，覆盖状态横幅/时间线/底栏按钮）
    await step(`H5 ${vp.tag}：订单详情 按钮/文本适配`, async () => {
      await h5load(page, '/pages/order/list')
      const ok = await page.evaluate(() => {
        const c = [...document.querySelectorAll('.order-card')].find((x) => x.getClientRects().length > 0)
        if (c) { c.click(); return true }
        return false
      })
      if (!ok) throw new Error('列表无订单可点')
      await page.waitForFunction(() => location.hash.includes('detail'), { timeout: 8000, polling: 200 })
      await sleep(700)
      await shot(page, `h5-${vp.tag}-订单详情`)
      return auditPage(page, '订单详情')
    })
  }

  // ========== 管理端 ==========
  const ADMIN_PAGES = [
    ['/index', '工作台'],
    ['/order/list', '订单管理'],
    ['/refund/list', '退款管理'],
    ['/schedule', '排期管理'],
    ['/review/list', '评价管理'],
    ['/venue/list', '场地管理'],
    ['/user/list', '用户管理'],
    ['/system/config', '系统配置']
  ]
  for (const vp of [{ width: 1440, height: 900, tag: '桌面1440' }, { width: 390, height: 844, tag: '手机390' }]) {
    await page.setViewport({ width: vp.width, height: vp.height })
    let logged = false
    for (const [path_, label] of ADMIN_PAGES) {
      await step(`管理端 ${vp.tag}：${label} 按钮/文本适配`, async () => {
        if (!logged) { await adminLogin(page); logged = true }
        await page.goto(`${ADMIN}${path_}`, { waitUntil: 'networkidle2' })
        await sleep(900)
        await shot(page, `admin-${vp.tag}-${label}`)
        return auditPage(page, label)
      })
    }
  }

  await browser.close()
  const passed = results.filter((r) => r.ok).length
  console.log(`\n========== 按钮/文本适配走查：${passed}/${results.length} 通过 ==========`)
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
