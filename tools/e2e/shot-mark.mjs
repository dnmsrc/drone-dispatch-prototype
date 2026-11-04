// 观感核对：第 2 步（图标 + 自动弹窗）与申请说明（只读、无标记）。DOM 判据过了不等于好看，这张是给人看的。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
fs.mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900, deviceScaleFactor: 2 })

const goto = async (url) => {
  await page.evaluate(u => { location.hash = '#/pages/' + u }, url)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 300 })
  await sleep(1200)
}
const clickSel = async (sel, i = 0) => page.evaluate((s, i) => {
  const e = [...document.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)

// 图标实测：必须在「当前可见页」上量——uni-app 页面栈里旧页仍在 DOM
const measure = async (label) => {
  const out = await page.evaluate(() => {
    const R = 750 / window.innerWidth
    const vis = [...document.querySelectorAll('.ae')].filter(e => e.getClientRects().length)
    return vis.map(e => {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect()
      const row = e.parentElement.getBoundingClientRect()
      const inner = e.querySelector('*')
      const ic = inner ? getComputedStyle(inner) : null
      const ir = inner ? inner.getBoundingClientRect() : null
      const R2 = R
      return { state: e.className, shape: inner ? (parseFloat(ic.borderLeftWidth) >= 2 ? '勾' : '点') : '文字',
        shapeSize: inner ? `${Math.round(ir.width * R2)}×${Math.round(ir.height * R2)}` : '—',
        tap: `${Math.round(r.height * R)}×${Math.round(r.width * R)}`,
        layout: `${Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) * R)}×${Math.round((r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * R)}`,
        rowH: Math.round(row.height * R),
        offset: Math.round((r.top + r.height / 2 - row.top - row.height / 2) * R),
        color: cs.color }
    })
  })
  console.log(`${label}: ${out.length} 个图标`)
  for (const x of out) console.log(`  ${x.state} ${x.shape} ${x.shapeSize} 可点${x.tap} 布局贡献${x.layout} 行高${x.rowH} 中心偏移${x.offset} ${x.color}`)
}

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)

// 第 1 步：选到触发条款的场地 → 自动弹窗（确认按钮在弹窗里，页上只有图标）
await clickSel('.venue-item', 3)
await sleep(700)
await page.screenshot({ path: path.join(SHOTS, 'mark-1-venue-autopop.png'), timeout: 10000 })
await clickSel('.bp-ck', 0)            // 确认第 41 条
await sleep(500)
await clickSel('.bp-btn', 0)            // 关闭
await sleep(500)
await page.screenshot({ path: path.join(SHOTS, 'mark-2-venue-after-confirm.png'), timeout: 10000 })
await measure('第1步 场地（已确认第 41 条）')

// 第 2 步：先换到「触发条款且装得下」的场地（V06 告庄西双景，6800 m²，管制空域）——
// V04 四方街 2600 m² 连 100 架都装不下，点档位会被 pickTier 挡住（只出 toast，不触发条款），演示不了自动弹窗。
await clickSel('.venue-item', 5)
await sleep(700)
await goto('apply/need')
await page.screenshot({ path: path.join(SHOTS, 'mark-3a-need-pending.png'), timeout: 10000 })   // 未确认态：行尾是橙点
await clickSel('.tier', 1)
await sleep(700)
await page.screenshot({ path: path.join(SHOTS, 'mark-3-need-autopop.png'), timeout: 10000 })
await clickSel('.bp-ck', 0)
await sleep(500)
await clickSel('.bp-btn', 0)
await sleep(500)
await page.screenshot({ path: path.join(SHOTS, 'mark-4-need-lean.png'), timeout: 10000 })
await measure('第2步 规模（第 2 条已确认，其余未确认）')

// 申请说明：只读全文，无逐条标记、无确认按钮
await goto('apply/disclosure')
await page.screenshot({ path: path.join(SHOTS, 'mark-5-disclosure-plain.png'), timeout: 10000 })
await measure('申请说明（应为 0 个图标）')

await browser.close()
