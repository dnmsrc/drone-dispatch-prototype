// 合同管理页渲染 + 操作闸门 UI 验证（puppeteer-core + Edge，无头）
// 前置：admin vite 跑在 BASE（代理到含合同路由的 mock），账号 admin/admin123
import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'url'
import path from 'path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.ADMIN_BASE || 'http://127.0.0.1:5188'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const here = path.dirname(fileURLToPath(import.meta.url))
const shot = (name) => path.join(here, 'shots', name)

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 960 })
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 160)) })

const textAll = async (sel) =>
  page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel)

// 1) 登录：直接调登录接口拿 token/admin 信息，注入 localStorage（绕过验证码与 UI 时序）
const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
}).then((r) => r.json())
if (loginRes.code !== 0) throw new Error('登录接口失败: ' + loginRes.msg)
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
await page.evaluate((d) => {
  localStorage.setItem('admin_token', d.token)
  localStorage.setItem('admin_info', JSON.stringify(d.admin))
}, loginRes.data)
await sleep(400)

// 2) 进入合同管理
await page.goto(`${BASE}/contract/list`, { waitUntil: 'networkidle2' })
await sleep(1800)
// 切到 50 条/页，确保草稿态也在当前页，可验证「提交签署」
await page.evaluate(() => {
  const sel = document.querySelector('.pager .el-select__wrapper') || document.querySelector('.pager input')
  if (sel) sel.click()
})
await sleep(500)
await page.evaluate(() => {
  const opt = [...document.querySelectorAll('.el-select-dropdown__item')].find((o) => /50/.test(o.textContent))
  if (opt) opt.click()
})
await sleep(1200)

// 表格行数与合同号
const rows = await page.evaluate(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length)
const contractNos = await textAll('.el-table__body-wrapper tbody tr td:first-child .strong')
console.log('表格行数:', rows)
console.log('前几个合同号:', contractNos.slice(0, 5).join(' | '))

// 操作列按钮类型统计（按行收集可见按钮文本）
const perRow = await page.evaluate(() => {
  return [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].map((tr) => {
    const status = tr.querySelector('td:nth-child(5) .el-tag')?.textContent.trim() || ''
    const btns = [...tr.querySelectorAll('td:last-child button')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim())
    return { status, btns }
  })
})
console.log('\n各行 状态→按钮:')
perRow.slice(0, 12).forEach((r) => console.log(`  [${r.status}] ${r.btns.join(' / ') || '（无动作按钮）'}`))

// 3) 闸门断言
const hasTerminate = perRow.some((r) => r.btns.includes('终止'))
const hasReschedule = perRow.some((r) => r.btns.includes('改期'))
const hasVoid = perRow.some((r) => r.btns.includes('作废'))
const voidRow = perRow.find((r) => r.status === '已作废')
const pendingRow = perRow.find((r) => r.status === '待签署')
const draftRow = perRow.find((r) => r.status === '草稿')
console.log('\n=== 闸门断言 ===')
const check = (name, cond, extra = '') => console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
check('存在终止按钮（ADMIN 可见）', hasTerminate)
check('存在改期按钮（生效合同）', hasReschedule)
check('存在作废按钮（未生效/零付款）', hasVoid)
check('已作废行只有详情、无推进按钮', voidRow && voidRow.btns.length === 1 && voidRow.btns[0] === '详情', JSON.stringify(voidRow?.btns))
check('待签署行有「上传签署件」', pendingRow && pendingRow.btns.includes('上传签署件'), JSON.stringify(pendingRow?.btns))
check('草稿/待签署等未生效行无终止按钮', perRow.filter((r) => r.status === '待签署' || r.status === '草稿').every((r) => !r.btns.includes('终止')))
const draft = perRow.find((r) => r.status === '草稿')
check('草稿行有「提交签署」', !draft || draft.btns.includes('提交签署'), draft ? JSON.stringify(draft.btns) : '当前种子无草稿（PENDING_PAY 未支付不生成有效合同），跳过')

// 4) 打开第一行详情抽屉，验证关键区块
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.el-table__body-wrapper tbody tr:first-child button')].find((x) => /详情/.test(x.textContent))
  if (b) b.click()
})
await sleep(1200)
const drawerTitles = await textAll('.el-drawer .section-title')
console.log('\n详情抽屉区块:', drawerTitles.join(' | '))
check('详情含分期付款计划', drawerTitles.some((t) => t.includes('分期付款计划')))
check('详情含甲乙双方', drawerTitles.some((t) => t.includes('甲乙双方')))
await page.screenshot({ path: shot('contract-detail-drawer.png') })

// 关掉抽屉，截列表
await page.evaluate(() => { const c = document.querySelector('.el-drawer__close-btn'); if (c) c.click() })
await sleep(600)
await page.screenshot({ path: shot('contract-list.png') })

// 5) 搜索过滤
await page.evaluate(() => {
  const input = document.querySelector('.search-card input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, 'HT')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const btn = [...document.querySelectorAll('.search-card button')].find((b) => /查询/.test(b.textContent))
  btn.click()
})
await sleep(1000)
const filtered = await page.evaluate(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length)
console.log('\n关键词 HT 过滤后行数:', filtered, '总数(total):', (await textAll('.el-pagination__total'))[0])

console.log('\n=== 页面错误 ===')
console.log(errors.length ? errors.join('\n') : '无 pageerror / console.error')
await browser.close()
