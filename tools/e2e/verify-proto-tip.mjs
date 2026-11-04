// 验证原型说明（"?"悬浮提示）在 H5 与 管理端 的展示效果
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'fs'

const H5 = process.env.H5_BASE || 'http://localhost:8090'
const ADMIN = process.env.ADMIN_BASE || 'http://localhost:8080'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
mkdirSync('../../shots', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: false,
  args: ['--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 }
})

let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`) }

// ===== H5：首页（无导航栏）+ 下单页（有导航栏） =====
const h5 = await browser.newPage()
await h5.goto(`${H5}/#/pages/index/index`, { waitUntil: 'networkidle2' })
await h5.waitForSelector('#proto-tip-badge', { timeout: 8000 }).catch(() => {})
ok('H5 首页出现 ? 徽章', await h5.evaluate(() => {
  const b = document.querySelector('#proto-tip-badge')
  return b && b.style.display !== 'none' && getComputedStyle(b).position === 'fixed'
}))
await h5.hover('#proto-tip-badge')
await new Promise(r => setTimeout(r, 400))
ok('H5 首页悬浮展开说明卡', await h5.evaluate(() => {
  const c = document.querySelector('#proto-tip-card')
  return c && c.style.display === 'block' && c.innerText.includes('原型说明') && c.innerText.includes('首页')
}))
await h5.screenshot({ path: '../../shots/proto-h5-index.png' })

// 有导航栏的页面：徽章应位于导航栏下方且不遮返回键
await h5.goto(`${H5}/#/pages/order/list`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 900))
const geo = await h5.evaluate(() => {
  const b = document.querySelector('#proto-tip-badge')
  const nav = document.querySelector('.navbar')
  if (!b) return null
  const br = b.getBoundingClientRect()
  return { badgeTop: br.top, navBottom: nav ? nav.getBoundingClientRect().bottom : 0, text: document.querySelector('#proto-tip-card')?.innerText || '' }
})
ok('H5 订单页徽章位于导航栏下方', !!geo && geo.badgeTop >= geo.navBottom - 1)
await h5.hover('#proto-tip-badge')
await new Promise(r => setTimeout(r, 400))
await h5.screenshot({ path: '../../shots/proto-h5-list.png' })
ok('H5 订单页说明内容正确', geo.text.includes('我的订单'))

// ===== 管理端：登录页 + 工作台 =====
const ad = await browser.newPage()
await ad.goto(`${ADMIN}/login`, { waitUntil: 'networkidle2' })
await ad.waitForSelector('.proto-tip .pt-badge', { timeout: 8000 }).catch(() => {})
ok('管理端登录页出现 ? 徽章', await ad.evaluate(() => !!document.querySelector('.proto-tip .pt-badge')))
await ad.hover('.proto-tip .pt-badge')
await new Promise(r => setTimeout(r, 400))
ok('管理端登录页悬浮展开说明', await ad.evaluate(() => {
  const c = document.querySelector('.proto-tip .pt-card')
  return c && c.offsetParent !== null && c.innerText.includes('admin / admin123')
}))
await ad.screenshot({ path: '../../shots/proto-admin-login.png' })

// 登录 → 工作台
await ad.evaluate(() => { document.querySelector('.proto-tip .pt-close')?.click() })
const inputs = await ad.$$('.el-input__inner')
if (inputs.length >= 3) {
  await inputs[0].type('admin')
  await inputs[1].type('admin123')
  await inputs[2].type('1234')
  await ad.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 1500))
  // 若仍在登录页，点登录按钮
  const onLogin = await ad.evaluate(() => location.hash.includes('login'))
  if (onLogin) {
    await ad.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.innerText.includes('登'))?.click() })
    await new Promise(r => setTimeout(r, 1800))
  }
}
await ad.waitForSelector('.proto-tip .pt-badge', { timeout: 8000 }).catch(() => {})
await ad.waitForFunction(() => location.pathname === '/index', { timeout: 8000 }).catch(() => {})
ok('管理端工作台出现 ? 徽章', await ad.evaluate(() => location.pathname === '/index' && !!document.querySelector('.proto-tip .pt-badge')))
await ad.hover('.proto-tip .pt-badge')
await new Promise(r => setTimeout(r, 400))
ok('管理端工作台悬浮展开说明', await ad.evaluate(() => {
  const c = document.querySelector('.proto-tip .pt-card')
  return c && c.offsetParent !== null && c.innerText.includes('工作台')
}))
await ad.screenshot({ path: '../../shots/proto-admin-index.png' })

// 切到订单管理页，确认说明内容随路由切换（history 模式直接跳路径）
await ad.evaluate(() => { document.querySelector('.proto-tip .pt-close')?.click() })
await ad.goto(`${ADMIN}/order/list`, { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await ad.hover('.proto-tip .pt-badge')
await new Promise(r => setTimeout(r, 400))
ok('管理端订单页说明随路由切换', await ad.evaluate(() => {
  const c = document.querySelector('.proto-tip .pt-card')
  return c && c.innerText.includes('订单管理') && c.innerText.includes('双端数据联动')
}))
await ad.screenshot({ path: '../../shots/proto-admin-order.png' })

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
await browser.close()
process.exit(fail ? 1 : 0)
