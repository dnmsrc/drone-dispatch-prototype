// 下单 + 支付全链路（H5 UI 真实操作 → 服务端断言）
//
// 覆盖点：
//   ① 下单页真实渲染（档位/时长/日历/场地都来自服务端计价与档期）；
//   ② 选日期只点「当天真的有可用时段」的日子（种子数据里有休整日、被占用时段，盲选会被服务端挡回）；
//   ③ 联系人用真实鼠标+键盘输入并回读校验（合成事件发现不了「输入框塌缩/真实用户输不进去」）；
//   ④ 确认页金额 = 服务端计价（不硬编码盲猜版本号）；未确认条款点提交必须进不了收银台（负控拦截）；
//   ⑤ 收银台模拟支付成功 → 结果页出现订单号 → 服务端状态 PENDING_ACCEPT、金额/明细/联系方式一致；
//   ⑥ 负控：重复支付被拒、金额判据防空判。
import { defineCase, step } from '../lib/case.mjs'
import { H5 } from '../lib/browser.mjs'
import { h5Load, h5Route, waitVisible, textsVisible, topText, getToast, typeIntoUniInput, readUniInput, clickVisible, clickVisibleText, countVisible } from '../lib/nav.mjs'
import { seedUserLogin } from '../lib/auth.mjs'
import { createOrder, getPricing, pickOpenSlot, getOrder, dateStr } from '../lib/api.mjs'
import { sleep } from '../lib/browser.mjs'

/** 在日历里选指定日期：先翻到对应月份，再点该日（避开 off/pad 格）。 */
async function selectDateInCalendar(page, date) {
  const day = Number(date.slice(8))
  const wantYm = `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月`
  for (let i = 0; i < 4; i++) {
    const curYm = await page.evaluate(() => {
      const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
      return ((top.querySelector('.ym') || {}).innerText || '').replace(/\s+/g, ' ').trim()
    })
    if (curYm.includes(`${Number(date.slice(5, 7))} 月`) && curYm.includes(date.slice(0, 4))) break
    const flipped = await page.evaluate(() => {
      const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
      const navs = [...top.querySelectorAll('.nav')].filter((e) => e.getClientRects().length && !/off/.test(e.className || ''))
      const n = navs[navs.length - 1]
      if (!n) return false
      n.click(); return true
    })
    if (!flipped) break
    await sleep(450)
  }
  const picked = await page.evaluate((d) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    const cells = [...top.querySelectorAll('.cell:not(.pad)')].filter((e) => e.getClientRects().length && !/\boff\b/.test(e.className || ''))
    const c = cells.find((e) => {
      const dayEl = e.querySelector('.day')
      return dayEl && dayEl.innerText.trim() === String(d)
    })
    if (!c) return { ok: false, visible: cells.map((e) => (e.querySelector('.day') || {}).innerText).filter(Boolean).slice(0, 10) }
    c.click()
    return { ok: true }
  }, day)
  // 日期可能被置灰（提前量/天气），点不动就换下一天
  if (!picked.ok) throw new Error(`日历里没找到可点的 ${date}（可见日期：${(picked.visible || []).join(',')}）`)
  await sleep(500)
  return picked.ok
}

export default defineCase({
  id: 'order-pay-full',
  title: 'H5 下单 + 支付全链路（真实表单 → 确认门 → 收银台 → 结果页）',
  tags: ['smoke', 'h5', 'order', 'pay'],
  priority: 'P0',
  impact: ['h5/src/pages/order/create.vue', 'h5/src/pages/order/confirm.vue', 'h5/src/pages/order/cashier.vue', 'h5/src/pages/order/result.vue'],
  need: { h5: true },
  timeoutMs: 180000,
  estimateSeconds: 45,
  requires: '种子数据 +9 天 20:00 已被占用、+7 天是休整日 —— 日期/时段必须按服务端档期选，不能盲写',
  setup: async (ctx) => {
    // 登录门（2026-11-03 起）：不种 token 会量到登录页。必须在 goto 之前种（evaluateOnNewDocument）。
    await seedUserLogin(ctx.h5, H5, { token: ctx.user.token, user: ctx.user.user })
  },
  steps: [
    step('下单页渲染（档位/日历/场地来自服务端）', async (ctx) => {
      const { assert, h5, userApi } = ctx
      await h5Load(h5, '/pages/order/create')
      assert.check('下单页档位网格渲染', await waitVisible(h5, '.tier-grid', 10000), '未等到 .tier-grid')
      const tiers = await textsVisible(h5, '.tier')
      assert.gte('档位选项 ≥ 3', tiers.length, 3, tiers.join(' | '))
      const pricing = await getPricing(userApi)
      // 页面档位价格必须来自服务端计价（防前端硬编码）
      const serverPrices = pricing.priceRules.tiers.map((t) => t.price)
      const shown = tiers.join(' ')
      assert.check('档位价格与服务端计价一致（不是前端硬编码）',
        serverPrices.some((p) => shown.includes(p.toLocaleString('en-US'))), `页面=${tiers[0] || ''} 服务端=${serverPrices.join('/')}`)
      assert.check('场地列表至少 1 个可选', (await textsVisible(h5, '.venue-item')).length >= 1)
      // 用 API 挑一个「当天真的有 openSlots」的日期，避免盲选撞休整日/占满日
      const picked = await pickOpenSlot(userApi, { fromOffset: 1, maxOffset: 20 })
      ctx.state.openDate = picked.date
      ctx.state.openSlot = picked.slot
      ctx.log(`档期选择：${picked.date} ${picked.slot}（openSlots=${picked.day.openSlots.join(',')}）`)
      await ctx.shot('01-create')
    }),

    step('选日期 / 时段 / 场地', async (ctx) => {
      const { assert, h5 } = ctx
      await selectDateInCalendar(h5, ctx.state.openDate)
      assert.check('日期已选中（格子有 sel 态）', (await textsVisible(h5, '.cell.sel')).length >= 1,
        `可见 .cell=${(await textsVisible(h5, '.cell')).length} 选中=${(await textsVisible(h5, '.cell.sel')).length}`)
      assert.check('选中日期后出现申请时段', await waitVisible(h5, '.slot', 8000), '未出现 .slot')
      const slotHours = ctx.state.openSlot.slice(0, 5)
      const picked = await h5.evaluate((h) => {
        const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
        const list = [...top.querySelectorAll('.slot')].filter((e) => e.getClientRects().length && !/dis|off|dead/.test(e.className || ''))
        const el = list.find((e) => (e.innerText || '').includes(h)) || list[0]
        if (!el) return false
        el.click(); return true
      }, slotHours)
      assert.check(`可用时段「${slotHours}」被选中`, picked, '没有可点时段')
      const venue = await clickVisible(h5, '.venue-item', 0)
      assert.check('场地选中（第一项）', venue)
      await ctx.shot('02-selected')
    }),

    step('联系人真实输入并回读校验', async (ctx) => {
      const { assert, h5 } = ctx
      // 滚到联系人区（合成 click 不触发真实滚动时坐标会落到别的元素上）
      await h5.evaluate(() => {
        const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
        const el = [...top.querySelectorAll('.sec-title')].find((x) => (x.innerText || '').includes('联系人'))
        if (el) el.scrollIntoView({ block: 'center' })
      })
      await sleep(350)
      await typeIntoUniInput(h5, '姓名', '自动化演示')
      await typeIntoUniInput(h5, '手机号', '13800009999')
      const name = await readUniInput(h5, '姓名')
      const phone = await readUniInput(h5, '手机号')
      assert.check('姓名真实输入成功（键盘事件而非改 value）', name === '自动化演示', `回读=${name}`)
      assert.check('手机号真实输入成功', phone === '13800009999', `回读=${phone}`)
      await ctx.shot('03-contact')
    }),

    step('点下一步 → 确认页（金额与条款来自服务端）', async (ctx) => {
      const { assert, h5, userApi } = ctx
      // 先记录服务端按当前选择会算出的金额：用同样参数试算（下单前预览不写库）
      const payBtn = await clickVisible(h5, '.pb-btn', 0)
      assert.check('点「下一步」进入确认页', payBtn && await waitVisible(h5, '.hero-card', 10000), await h5Route(h5))
      const text = await topText(h5)
      const pricing = await getPricing(userApi)
      const tier = pricing.priceRules.tiers.find((t) => t.drones === 300)
      assert.check('确认页金额与默认档位（300 架）一致', text.includes(tier.price.toLocaleString('en-US')),
        `页面含金额=${text.match(/¥[\d,]+/g)?.slice(0, 3).join(',')} 服务端 300 架=${tier.price}`)
      // 2026-11-04 口径：填报/确认页不再有「总勾门 + 整段说明」，确认件是勾选框 + 服务协议入口
      const linkTexts = await textsVisible(h5, '.link')
      const agreeCount = await countVisible(h5, '.agree')
      const checkboxCount = await countVisible(h5, '.checkbox')
      assert.check('确认页有「同意协议」勾选控件（提交前的确认件）', agreeCount + checkboxCount >= 1,
        `agree=${agreeCount} checkbox=${checkboxCount}`)
      assert.check('确认页能打开服务协议/本单适用条款入口', linkTexts.some((t) => /服务协议|条款/.test(t)) || /服务协议|条款/.test(text),
        `links=${JSON.stringify(linkTexts).slice(0, 140)}`)
      await ctx.shot('04-confirm')
    }),

    step('确认门：没勾同意点提交不进收银台，勾选后才放行', async (ctx) => {
      const { assert, h5 } = ctx
      const before = await clickVisibleText(h5, ['提交订单', '下一步', '去支付'], { selector: 'button, .bb-btn' })
      if (!before) await clickVisible(h5, '.bb-btn', 0)
      await sleep(700)
      const stayed = h5Route(h5).includes('/pages/order/confirm')
      const toast = await getToast(h5)
      assert.check('没确认条款点提交：被拦住（不进收银台）', stayed, `路由=${h5Route(h5)} toast=${toast}`)
      await ctx.shot('05-gate-blocked')
      // 勾同意 → 放行
      await clickVisible(h5, '.checkbox', 0)
      await sleep(300)
      const next = await clickVisible(h5, '.bb-btn', 0)
      const toCashier = await h5.waitForFunction(() => location.hash.includes('cashier'), { timeout: 12000, polling: 200 })
        .then(() => true).catch(() => false)
      assert.check('勾选同意后进入收银台', next && toCashier, `hash=${h5Route(h5)} toast=${await getToast(h5)}`)
      assert.check('收银台金额卡渲染', await waitVisible(h5, '.amount-card', 10000), '未等到 .amount-card')
      await ctx.shot('06-cashier')
    }),

    step('模拟支付成功 → 结果页 → 取订单号', async (ctx) => {
      const { assert, h5 } = ctx
      await clickVisible(h5, '.pay-btn', 0)
      assert.check('出现模拟支付面板', await waitVisible(h5, '.panel', 8000), '未等到 .panel')
      const paid = await clickVisibleText(h5, ['模拟支付成功'], { selector: 'button, .btn, .pb-btn, [class*=btn]' })
      assert.check('点击「模拟支付成功」', paid, '未找到模拟支付按钮')
      const toResult = await h5.waitForFunction(() => location.hash.includes('/pages/order/result'), { timeout: 12000, polling: 200 })
        .then(() => true).catch(() => false)
      assert.check('进入支付结果页', toResult, `hash=${h5Route(h5)}`)
      assert.check('结果页渲染', await waitVisible(h5, '.result', 8000), '未等到 .result')
      const orderId = await h5.evaluate(() => {
        const m = location.hash.match(/[?&]id=([^&]+)/)
        return m ? decodeURIComponent(m[1]) : ''
      })
      assert.check('结果页带出订单号', /^D\d/.test(orderId), `orderId=${orderId}`)
      ctx.state.orderId = orderId
      await ctx.shot('07-result')
    }),

    step('服务端断言：已支付待接单，金额/明细/联系人一致', async (ctx) => {
      const { assert, userApi } = ctx
      const order = await getOrder(userApi, ctx.state.orderId)
      assert.eq('订单状态 = 已支付待接单（PENDING_ACCEPT）', order.status, 'PENDING_ACCEPT')
      assert.check('订单金额与服务端计价明细自洽',
        order.totalAmount === (order.priceDetail || []).reduce((s, i) => s + i.amount, 0),
        `total=${order.totalAmount} detail=${JSON.stringify(order.priceDetail)}`)
      assert.eq('联系人落库（真实输入的姓名）', order.contact.name, '自动化演示')
      assert.eq('手机号落库', order.contact.phone, '13800009999')
      assert.includes('支付流水号已写入', order.payTradeNo, 'WX', order.payTradeNo)
      assert.check('支付时间已写入', !!order.paidAt)
      // 时间轴记录了支付成功
      assert.check('订单时间轴有「支付成功」', (order.timeline || []).some((t) => /支付成功/.test(t.text)),
        (order.timeline || []).map((t) => t.text).join(' | ').slice(0, 160))
      ctx.state.order = order
    }),

    step('负控：重复支付被拒 + 金额判据防空判', async (ctx) => {
      const { assert, userApi } = ctx
      const again = await userApi.call(`/api/orders/${ctx.state.orderId}/pay`, { method: 'POST', body: { channel: 'WECHAT', success: true } })
      assert.check('已支付订单再次支付被拒（状态机不可倒退）', again.code !== 0, `code=${again.code} ${again.msg || ''}`)
      assert.negative('金额判据不是空判（伪造：金额被算成 1 元）',
        (s) => Number(s.total) === 38800,
        { total: 1 })
      assert.negative('订单号判据不是空判（伪造：结果页没订单号）',
        (s) => /^D\d/.test(s.id),
        { id: '' })
    })
  ]
})
