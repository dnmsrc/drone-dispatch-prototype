// 申请顺序与“填报页只留输入”判据（全部 DOM 实测）：
// 场地 → 规模与内容 → 日期时段 → 报价 → 咨询/合同；选择时不弹窗，下一步才确认。
// 审批、天气、判定费、检查清单、合同条款正文等只读信息不得平铺在填报页。
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const H5 = process.env.H5_BASE || 'http://localhost:8090'
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shots')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) fails.push(name)
}

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false, protocolTimeout: 120000, slowMo: 30,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--window-size=900,1000', '--window-position=0,0']
})
const page = await browser.newPage()
await page.setViewport({ width: 480, height: 900 })
page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 160)))

async function grab() {
  return page.evaluate(() => {
    const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
    const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
    const text = s => vis(s).map(e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
    let draft = {}
    try { draft = JSON.parse(sessionStorage.getItem('apply_draft') || '{}') || {} } catch (e) {}
    const btn = vis('.pb-btn')[0]
    return {
      hash: location.hash,
      titles: text('.sec-title, .sh-title'),
      labels: text('.st .lb'),
      chips: text('.entry-chip'),
      pop: vis('.bp-pop').length,
      popClauses: vis('.bp-clause').length,
      acks: draft.acks || [],
      quote: !!draft.quote,
      date: draft.date || '', slot: draft.slot || '', audience: (draft.need || {}).audience || 0,
      venue: (draft.venue || {}).name || '',
      toast: [...document.querySelectorAll('[class*="toast"]')].filter(e => e.getClientRects().length).map(e => (e.innerText || e.textContent || '').trim()).join(' | '),
      btn: btn ? (btn.innerText || '').trim() : '',
      tiers: vis('.tier').map(e => ({
        num: ((e.querySelector('.tier-num') || {}).innerText || '').trim(),
        dis: e.classList.contains('dis'),
        on: e.classList.contains('on'),
        desc: ((e.querySelector('.tier-desc') || {}).innerText || '').trim()
      })),
      kv: text('.kv'),
      clRows: vis('.cl-row').length,
      conds: vis('.cond').length,
      receipt: vis('.receipt').length,
      ackFab: vis('.ack-fab').length,
      dockPanel: vis('.ad-panel').length,
      dockSub: (vis('.ad-sub')[0] || {}).innerText || '',
      items: vis('.item').length,
      inputs: vis('.text-input').length,
      signs: text('.rp-line, .receipt, .sg-grid, .sg-kv')
    }
  })
}
async function click(sel, index = 0) {
  return page.evaluate((s, i) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
    const e = [...top.querySelectorAll(s)].filter(x => x.getClientRects().length)[i]
    if (!e) return false
    e.click(); return true
  }, sel, index)
}
async function go(name) {
  await page.evaluate(u => { location.hash = '#/pages/apply/' + u }, name)
  await sleep(1000)
  await page.waitForFunction(() => [...document.querySelectorAll('uni-page-body')].some(e => e.getClientRects().length), { timeout: 9000, polling: 200 })
}
async function confirmAllAndClose() {
  for (let i = 0; i < 50; i++) {
    const g = await grab()
    if (!g.pop || !g.popClauses || !(await page.evaluate(() => {
      const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
      return [...top.querySelectorAll('.bp-ck')].some(e => e.getClientRects().length)
    }))) break
    await click('.bp-ck', 0)
    await sleep(120)
  }
  await click('.bp-btn', 0)
  await sleep(300)
}
async function passGate() {
  const g = await grab()
  if (g.pop) await confirmAllAndClose()
}

// A. 第 1 步只有场地选择，不在选择时确认。
await page.goto(`${H5}/#/pages/apply/venue`, { waitUntil: 'networkidle2' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1000)
let g = await grab()
check('干净会话直接进场地页', g.hash.includes('/pages/apply/venue') && g.pop === 0, g.hash)
check('步骤条顺序正确', g.labels.slice(0, 3).join('|') === '场地|规模与内容|日期时段', g.labels.join(' | '))
check('场地页只剩一个选择卡和零个说明入口', g.titles.join('|') === '表演场地' && g.chips.length === 0 && g.kv.length === 0, `${g.titles.join(' | ')} · 入口 ${g.chips.length}`)
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].find(x => (x.innerText || '').includes('丽江古城')); e && e.click() })
await sleep(300)
g = await grab()
check('选择场地不自动弹窗', g.pop === 0)
await click('.pb-btn'); await sleep(350)
g = await grab()
check('下一步才出现场地确认门', g.pop === 1 && g.popClauses === 2, `${g.popClauses} 条`)
await confirmAllAndClose()
await page.evaluate(() => { const e = [...document.querySelectorAll('.venue-item')].find(x => (x.innerText || '').includes('海埂大坝')); e && e.click() })
await sleep(250)
await click('.pb-btn'); await sleep(900)
g = await grab()
check('场地下一步进入规模与内容页', g.hash.includes('/pages/apply/need'), g.hash)

// B. 第 2 步只保留规模、观众、时长、内容和附加项。
check('规模页只显示 5 个填报分组', g.titles.join('|') === '规模|预计观众人数|表演时长|内容复杂度|其它附加内容', g.titles.join(' | '))
check('规模页不再平铺判定费、结论和检查清单', !g.titles.some(t => /判定|不能自助/.test(t)) && g.chips.length === 0 && !g.kv.some(x => /判定费|适用版本/.test(x)), `入口 ${g.chips.length} · kv ${g.kv.length}`)
check('规模档仍按场地上限过滤', g.tiers.some(t => t.num.startsWith('1000') && t.dis && t.desc.includes('装不下')), (g.tiers.find(t => t.num.startsWith('1000')) || {}).desc)
await page.evaluate(() => { const e = [...document.querySelectorAll('.tier.dis')].find(x => (x.innerText || '').includes('1000')); e && e.click() })
await sleep(300)
g = await grab()
check('点超限档仍被拦截', g.toast.includes('装不下') && !g.tiers.some(t => t.num.startsWith('1000') && t.on), g.toast)
await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const el = [...top.querySelectorAll('.text-input input, input.text-input')].find(e => e.getClientRects().length)
  if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur() }
})
await sleep(150)
await click('.pb-btn'); await sleep(300)
g = await grab()
check('空观众数仍被必填校验拦截', g.hash.includes('/pages/apply/need') && g.toast.includes('必填'), g.toast)
await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const el = [...top.querySelectorAll('.text-input input, input.text-input')].find(e => e.getClientRects().length)
  if (el) { el.value = '800'; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur() }
})
await sleep(250)
g = await grab()
check('填写及失焦时不自动弹窗', g.pop === 0)
await click('.pb-btn'); await sleep(350)
await passGate()
await click('.pb-btn'); await sleep(900)
g = await grab()
check('确认后进入日期与时段页', g.hash.includes('/pages/apply/date'), g.hash)

// C. 第 3 步只保留日期与时段（2026-11-03：用户要求表单只留必填项，档期锚点这类求解参数不再让用户选，
// 内部固定为「锁场地解日期」）；硬校验逻辑仍在页面脚本中。
check('日期页只显示 2 个填报分组（表演日期 | 申请时段）', g.titles.join('|') === '表演日期|申请时段', g.titles.join(' | '))
check('日期页不再平铺容量、天气和审批提前量', !g.titles.some(t => /容量|天气|审批/.test(t)) && g.kv.length === 0 && g.chips.length === 0, `kv ${g.kv.length} · 入口 ${g.chips.length}`)
await page.screenshot({ path: path.join(SHOTS, 'order-step3-focus-input.png'), timeout: 10000 }).catch(() => {})
await page.evaluate(() => { const c = [...document.querySelectorAll('.cell:not(.pad):not(.off)')].find(e => e.getClientRects().length); c && c.click() })
await sleep(250)
await page.evaluate(() => {
  const list = [...document.querySelectorAll('.slot:not(.dis)')].filter(e => e.getClientRects().length)
  const s = list.find(e => (e.textContent || '').includes('20:00')) || list[0]
  s && s.click()
})
await sleep(250)
g = await grab()
check('选择日期和时段均不自动弹窗', g.pop === 0)
check('日期与时段已真实写入草稿', !!g.date && !!g.slot, `${g.date} ${g.slot} · 观众 ${g.audience} · ${g.venue}`)
await click('.pb-btn'); await sleep(350)
g = await grab()
check('日期页下一步才出现确认门', g.pop === 1 && g.popClauses >= 2, `${g.popClauses} 条 · ${g.toast}`)
await passGate()
await click('.pb-btn'); await sleep(900)
g = await grab()
check('确认后进入报价页且报价写入草稿', g.hash.includes('/pages/apply/quote') && g.quote, g.hash)
check('报价生成时不自动弹窗', g.pop === 0)
await click('.pb-btn'); await sleep(350)
await passGate()

// D. 右下角统一入口仍可回看并进入完整说明。
await go('date')
await click('.ack-fab'); await sleep(300)
g = await grab()
check('右下角入口打开本步回看面板', g.dockPanel === 1 && g.dockSub.includes('本步'), g.dockSub)
await click('.ad-full'); await sleep(800)
g = await grab()
check('统一入口进入完整申请说明', g.hash.includes('/pages/apply/disclosure') && g.items >= 40, `${g.hash} · ${g.items} 条`)
await go('contract')

// E. 签署页只保留输入，但身份校验、确认门与存证不能丢。
g = await grab()
check('签署页只显示签约主体与意愿认证两组', g.titles.join('|') === '签约主体|意愿认证与签署', g.titles.join(' | '))
check('签署页不再平铺关键条款和签名四条件', g.clRows === 0 && g.conds === 0 && g.chips.length === 0, `条款行 ${g.clRows} · 条件 ${g.conds} · 入口 ${g.chips.length}`)
check('签署页仍有身份与手机号输入', g.inputs >= 3, `${g.inputs} 个输入框`)
await page.evaluate(() => {
  const top = [...document.querySelectorAll('uni-page-body')].filter(e => e.getClientRects().length).pop() || document
  const vis = s => [...top.querySelectorAll(s)].filter(e => e.getClientRects().length)
  const native = el => el && (el.tagName === 'INPUT' ? el : el.querySelector('input'))
  const set = (el, v) => { const i = native(el); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })) }
  const ins = vis('.text-input')
  set(ins[0], '判据探针')
  set(ins[1], '530102199001010011')
  const phone = ins.find(e => (native(e) || {}).type === 'number')
  if (phone) set(phone, '13800001234')
  const cb = vis('.code-btn')[0]; cb && cb.click()
})
await sleep(500)
await click('.pb-btn'); await sleep(400)
g = await grab()
if (g.pop) {
  await confirmAllAndClose()
  await click('.pb-btn')
}
await page.waitForFunction(() => {
  try { return !!((JSON.parse(sessionStorage.getItem('apply_draft') || '{}') || {}).contract) } catch (e) { return false }
}, { timeout: 9000, polling: 200 })
await sleep(800)
await go('contract')
g = await grab()
check('完成身份校验与确认后仍能签署并生成存证', g.receipt === 1 && g.acks.length >= 13, `存证 ${g.receipt} · 留痕 ${g.acks.length} 条`)
check('存证仍包含版本、条款和签署数据', g.signs.join(' ').includes('v1.2') && /合同|哈希|条款/.test(g.signs.join(' ')), g.signs.join(' ').slice(0, 160))

// 负控：这些判据不能因选择器失效而空判。
const focusForm = (titles, expected) => titles.join('|') === expected
const noReadOnly = g => g.clRows === 0 && g.conds === 0
check('负控：伪造只读审批卡会被识别', !focusForm(['档期锚点', '审批与提前量'], '档期锚点|表演日期|申请时段'))
check('负控：伪造合同条款行会被识别', !noReadOnly({ clRows: 16, conds: 0 }))

await browser.close()
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} · ${fails.length} 项失败${fails.length ? '：' + fails.join(' / ') : ''}`)
process.exit(fails.length ? 1 : 0)
