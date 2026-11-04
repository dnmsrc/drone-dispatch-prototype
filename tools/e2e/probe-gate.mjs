// 探针：复现用户报的问题——没确认就点「下一步」，系统不拦截。
// 走一遍：第1步选触发条款的场地 → 关掉弹窗（不确认）→ 点下一步 → 看 hash 是否被放行。
// 然后第2步、第3步同样跑一遍。只读事实，不改文件。
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)))

const vis = async sel => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim()), sel)
const click = async (sel, i = 0) => page.evaluate((s, i) => {
  const e = [...document.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
  if (!e) return false
  e.click()
  return true
}, sel, i)
const hash = async () => page.evaluate(() => location.hash)
const toastText = async () => (await vis('[class*="toast"]')).join(' | ')

async function h5load(url) {
  await page.evaluate(u => { location.hash = '#/pages/' + u }, url)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 300 })
  await sleep(900)
}

await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await sleep(1200)

console.log('== 第1步 场地 ==')
await click('.venue-item', 3)
await sleep(600)
console.log('弹窗出现:', (await vis('.bp-pop')).length, '| 条款块:', (await vis('.bp-clause')).length)
// 不确认，直接关掉弹窗
await click('.bp-btn', 0)
await sleep(500)
console.log('关弹窗后未确认条数（入口状态）:', (await vis('.entry-chip')).join(' | '))
await click('.pb-btn', 0)
await sleep(800)
console.log('点下一步后 hash:', await hash(), '| toast:', (await toastText()).slice(0, 60))
const step1Passed = (await hash()).includes('apply/need')
console.log('第1步是否被放行（未确认）:', step1Passed ? '放行（问题）' : '拦住（正确）')

// 第2步：选档位触发 capacity 条款，观众数 1200 触发 crowdLicense / penaltyPartyA
console.log('== 第2步 规模与内容 ==')
await h5load('apply/need')
await click('.tier', 1)
await sleep(600)
console.log('选档位弹窗:', (await vis('.bp-pop')).length)
await click('.bp-btn', 0)
await sleep(400)
await page.evaluate(() => { const i = document.querySelector('input'); if (i) { i.value = '1200'; i.dispatchEvent(new Event('input')); } })
await sleep(300)
await page.evaluate(() => { const i = document.querySelector('input'); if (i) i.blur() })
await sleep(600)
console.log('观众数 blur 后弹窗:', (await vis('.bp-pop')).length, '| 条款:', (await vis('.bp-clause')).map(t => t.slice(0, 40)).join(' / '))
await click('.bp-btn', 0)
await sleep(400)
await click('.pb-btn', 0)
await sleep(800)
console.log('第2步点下一步 hash:', await hash(), '| toast:', (await toastText()).slice(0, 60))
console.log('第2步是否被放行（未确认）:', (await hash()).includes('apply/date') ? '放行（问题）' : '拦住（正确）')

console.log('== 第3步 日期与时段 ==')
await h5load('apply/date')
await click('.slot', 0)
await sleep(600)
console.log('选时段弹窗:', (await vis('.bp-pop')).length)
await click('.bp-btn', 0)
await sleep(400)
await click('.pb-btn', 0)
await sleep(800)
console.log('第3步点下一步 hash:', await hash(), '| toast:', (await toastText()).slice(0, 60))
console.log('第3步是否被放行（未确认）:', (await hash()).includes('apply/quote') ? '放行（问题）' : '拦住（正确）')

await browser.close()
