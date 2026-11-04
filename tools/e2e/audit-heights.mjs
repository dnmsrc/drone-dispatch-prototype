// 控件高度审计（2026-10-28 用户指出：验证码行里按钮比输入框高一大截）
// 判据口径：
//   A. 单行控件标准高度 = 88rpx（44px）；多行文本域允许更高但必须是 4 的倍数
//   B. 同一 flex 行里并排的控件高度必须相等（差 > 4rpx 判失败）
//   C. 控件必须"看得见"：背景色与所在卡片背景相同且无描边 = 隐形控件（视觉上只剩一行文字，行高由旁边的按钮撑开）
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = 'http://localhost:8090'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 884 })   // 与用户截图同尺寸
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 160)))

await page.goto(`${H5}/#/pages/login/login`, { waitUntil: 'networkidle2' })
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1200)
await page.evaluate(() => { const e = [...document.querySelectorAll('.wx-btn')].find(x => x.getClientRects().length); e && e.click() })
await sleep(600)
await page.evaluate(() => { const b = document.querySelector('.btn.allow'); b && b.click() })
await sleep(1200)

const CONTROLS = ['.chip', '.opt', '.slot', '.tier', '.mode', '.addon', '.pay', '.branch', '.code-btn', '.venue-item', '.check', '.cell', '.pb-btn', '.ghost-btn', '.text-input', '.seg-item', '.btn-primary']
const pages = ['/pages/apply/need', '/pages/apply/venue', '/pages/apply/date', '/pages/apply/quote', '/pages/apply/consult', '/pages/apply/contract', '/pages/apply/pay', '/pages/apply/progress']

for (const p of pages) {
  await page.goto(`${H5}/#${p}`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(1300)
  const r = await page.evaluate((CONTROLS) => {
    const body = document.querySelector('.body')
    if (!body) return null
    const R = 750 / 430                       // 430 屏：px × (750/430) = rpx
    const h = el => Math.round(el.getBoundingClientRect().height * R)
    const cls = el => (el.className || el.tagName).toString().slice(0, 24)
    const ctl = [], rows = [], invisible = []
    for (const sel of CONTROLS) {
      for (const el of body.querySelectorAll(sel)) {
        const cs = getComputedStyle(el)
        const hh = h(el)
        if (!hh) continue
        ctl.push({ sel, hh })
        const bg = cs.backgroundColor, bd = cs.borderTopWidth
        const card = el.closest('.card')
        const cardBg = card ? getComputedStyle(card).backgroundColor : getComputedStyle(document.body).backgroundColor
        if (bg === cardBg && parseFloat(bd) === 0) invisible.push({ sel, bg, cardBg, hh })
        const parent = el.parentElement
        if (parent && getComputedStyle(parent).display === 'flex' && getComputedStyle(parent).flexDirection === 'row') {
          const kids = [...parent.children].filter(k => CONTROLS.some(c => k.matches(c)))
          if (kids.length >= 2) {
            const hs = kids.map(k => h(k))
            const spread = Math.max(...hs) - Math.min(...hs)
            rows.push({ row: cls(parent), kids: kids.map(k => `${cls(k)}=${h(k)}`), spread, align: getComputedStyle(parent).alignItems })
          }
        }
      }
    }
    return { ctl, rows, invisible, n: body.querySelectorAll('*').length }
  }, CONTROLS)
  if (!r) { console.log(`\n${p}: 没有 .body`); continue }
  const short = r.ctl.filter(c => c.hh < 88)
  const badRow = r.rows.filter(x => x.spread > 4)
  console.log(`\n${p}  扫描 ${r.n} 元素 / ${r.ctl.length} 控件`)
  console.log(`  控件高度: ${[...new Set(r.ctl.map(c => `${c.sel}=${c.hh}rpx`))].join(' | ')}`)
  if (short.length) console.log(`  ❌ 低于 88rpx（${short.length}）: ${short.map(c => `${c.sel}=${c.hh}`).join(' | ')}`)
  if (badRow.length) console.log(`  ❌ 同行控件高度不齐（${badRow.length}）: ${badRow.map(x => `${x.row}[${x.kids.join(' ')}]差${x.spread}rpx/${x.align}`).join(' | ')}`)
  if (r.invisible.length) console.log(`  ❌ 隐形控件（背景=卡片背景且无描边，${r.invisible.length}）: ${[...new Set(r.invisible.map(c => `${c.sel} bg=${c.bg}`))].join(' | ')}`)
  console.log(`  ${short.length ? '❌' : '✅'} 标准高度 · ${badRow.length ? '❌' : '✅'} 同行齐高 · ${r.invisible.length ? '❌' : '✅'} 控件可见`)
}
await browser.close()
