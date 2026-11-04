// 复现用户报告的两个 H5 bug：
// 1) 预约页「选择架次」显示 JSON 字符串
// 2) 姓名/手机号无法输入
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: false,
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=560,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('[console.' + m.type() + ']', m.text().slice(0, 200)) })
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0, 120), r.failure() && r.failure().errorText))
page.on('response', r => { if (r.status() >= 400) console.log('[http ' + r.status() + ']', r.url().slice(0, 120)) })

// ---- bug 1：架次档位渲染 ----
await page.goto(`${H5}/#/pages/order/create`, { waitUntil: 'networkidle2' })
await sleep(1500)
const tierInfo = await page.evaluate(() => {
  const grid = document.querySelector('.tier-grid')
  if (!grid) return { found: false, bodyStart: document.body.innerText.slice(0, 200) }
  return {
    found: true,
    tierCount: grid.querySelectorAll('.tier').length,
    firstTierText: (grid.querySelector('.tier') || {}).innerText || '',
    gridText: grid.innerText.slice(0, 400)
  }
})
console.log('=== bug1 架次档位 ===')
console.log(JSON.stringify(tierInfo, null, 2))
try { await page.screenshot({ path: path.join(SHOTS, 'repro-create-top.png'), timeout: 8000 }) } catch (e) { console.log('(shot skip)', e.message.slice(0, 40)) }

// ---- bug 2：真实键盘输入姓名/手机号 ----
console.log('\n=== bug2 真实键盘输入 ===')
// uni-app 把 placeholder 渲染为宿主内的独立 div，原生 input 无 placeholder 属性；
// 通过 uni-input 宿主内的 .uni-input-placeholder 文案定位，再取宿主内 input
const findInput = `(ph) => {
  const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
  const host = hosts.find(h => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph))
  if (!host) return null
  const input = host.querySelector('input')
  const r = host.getBoundingClientRect()
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, inputH: input ? input.getBoundingClientRect().height : -1 }
}`
const inputs = await page.evaluate(() => {
  const list = [...document.querySelectorAll('.uni-input-input')].filter(e => e.getClientRects().length > 0)
  return list.map(e => ({ h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
})
console.log('可见 input 数量:', inputs.length, '尺寸:', JSON.stringify(inputs))

// 滚动到联系人区域
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.sec-title')].find(x => (x.innerText || '').includes('联系人'))
  if (el) el.scrollIntoView({ block: 'center' })
})
await sleep(500)

async function realType(ph, value) {
  const loc = await page.evaluate(`(${findInput})(${JSON.stringify(ph)})`)
  if (!loc) { console.log(`  [${ph}] 宿主未找到`); return null }
  await page.mouse.click(loc.cx, loc.cy)
  await sleep(250)
  await page.keyboard.type(value, { delay: 50 })
  await sleep(250)
  const val = await page.evaluate(`(() => {
    const hosts = [...document.querySelectorAll('uni-input')].filter(e => e.getClientRects().length > 0)
    const host = hosts.find(h => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(${JSON.stringify(ph)}))
    const input = host && host.querySelector('input')
    return { value: input ? input.value : null, inputH: ${loc.inputH} }
  })()`)
  console.log(`  [${ph}] 真实键盘输入后值: ${JSON.stringify(val.value)}（内部 input 高度 ${val.inputH}px）`)
  return val.value
}
const nameVal = await realType('姓名', '张三丰')
const phoneVal = await realType('手机号', '13812345678')
console.log('bug2 判定:', nameVal === '张三丰' && phoneVal === '13812345678' ? '✅ 可正常输入' : '❌ 仍无法输入')
try { await page.screenshot({ path: path.join(SHOTS, 'repro-contact-typed.png'), timeout: 8000 }) } catch (e) { console.log('(shot skip)', e.message.slice(0, 40)) }

// ---- 顺带扫一遍其它页面渲染是否裸 JSON ----
console.log('\n=== 其它页面裸渲染检查 ===')
for (const p of ['/pages/index/index', '/pages/order/list', '/pages/user/index', '/pages/login/login']) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await sleep(800)
  const info = await page.evaluate(() => {
    const t = document.body.innerText.trim()
    return { startsWithBrace: t.startsWith('{') || t.startsWith('['), len: t.length, head: t.slice(0, 60).replace(/\n/g, ' ') }
  })
  console.log(p, JSON.stringify(info))
}

await browser.close()
console.log('\n复现脚本结束')
