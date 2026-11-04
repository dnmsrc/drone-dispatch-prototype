// 退款申请 → 管理端审批 → H5 状态与金额（阶梯退款规则）
//
// 覆盖点：
//   ① 造一张真实已支付订单（userApi + createPaidOrder，走真实下单/支付接口），再由管理端接单进 ACCEPTED
//      —— 只有 ACCEPTED 才走「阶梯退款」，PENDING_ACCEPT 是全额退，测不到阶梯；
//   ② 退款试算按 GET /api/config/pricing 的退款阶梯算：期望 ratio/金额由用例自己按规则算一遍，
//      与服务端 refund-preview 逐项比对（不是硬编码某个比例，规则改了用例仍然对）；
//   ③ 结构性保证：用户 token 调管理端审批接口必须被拒（「未审批就变已退款」在接口层就不可能）；
//   ④ H5 订单详情页真实渲染：待审批 → 「退款中 / 退款审核中」，审批后 → 「已退款 / 退款成功 + 退款流水号」，
//      页面金额与阶梯试算金额一致；
//   ⑤ 负控：伪造「未审批就显示已退款」「金额与阶梯不符」样本必须被判失败（防判据空判）。
//
// 依赖源码口径（只读确认，未改）：
//   h5/src/pages/order/detail.vue  onLoad 读 q.id；状态条 .b-status/.b-desc；退款卡 .refund-card(.pending/.approved)、.rf-title/.rf-row/.rf-no
//   h5/src/utils/format.js         REFUNDING→「退款中」、REFUNDED→「已退款」
//   mock-server/server.js          POST /api/admin/refunds/:orderId/approve（requireAdminRole）；refundPreview 按小时数取阶梯
import { defineCase, step } from '../lib/case.mjs'
import { H5, sleep } from '../lib/browser.mjs'
import { h5Load, waitVisible, textsVisible, topText, readH5 } from '../lib/nav.mjs'
import { seedUserLogin } from '../lib/auth.mjs'
import { createPaidOrder, getPricing, refundPreview, applyRefund, getOrder, getScheduleDay, dateStr } from '../lib/api.mjs'

const HOUR = 3600000

/** 与服务端 performDateTime 同口径：日期 + 时段起点 + +08:00。 */
function performStartMs(order) {
  const start = String(order.timeSlot || '20:00-21:00').slice(0, 5)
  return new Date(`${order.performDate}T${start}:00+08:00`).getTime()
}

/** 按退款阶梯规则（按 minHours 从高到低取第一条命中）算期望档位。 */
function expectedRule(rules, hours) {
  const sorted = [...rules].sort((a, b) => b.minHours - a.minHours)
  return sorted.find((r) => hours >= r.minHours) || { minHours: 0, ratio: 0, label: '不可退款' }
}

/** 往后找一天「有可用时段」的日期，要求距今天 ≥ minOffset 天（保证走阶梯 50% 档而不是不可退）。 */
async function pickFarOpenDay(api, minOffset = 4, maxOffset = 20) {
  for (let i = minOffset; i <= maxOffset; i++) {
    const date = dateStr(i)
    const day = await getScheduleDay(api, date)
    if (!day || day.closed) continue
    if (!day.openSlots || !day.openSlots.length) continue
    return { offset: i, date, slot: day.openSlots[0], day }
  }
  throw new Error(`未来 ${minOffset}~${maxOffset} 天没有可用时段`)
}

/** 从 H5 详情页读出退款卡片/状态条（全部按可见元素取，避免读到 uni 页面栈里的旧页）。 */
async function readRefundUi(page) {
  const statusText = (await textsVisible(page, '.b-status'))[0] || ''
  const bannerDesc = (await textsVisible(page, '.b-desc'))[0] || ''
  const cardCls = await readH5(page, (top, vis) => {
    const c = vis('.refund-card')[0]
    return c ? String(c.className || '') : ''
  })
  const rfTitle = (await textsVisible(page, '.rf-title'))[0] || ''
  const rfRows = await textsVisible(page, '.rf-row')
  const rfNo = (await textsVisible(page, '.rf-no'))[0] || ''
  return { statusText, bannerDesc, cardCls, rfTitle, rfRows, rfNo }
}

export default defineCase({
  id: 'refund-apply-approve',
  title: '退款申请 → 管理端审批 → H5 状态文案与阶梯退款金额一致',
  tags: ['smoke', 'h5', 'admin', 'refund'],
  priority: 'P0',
  impact: [
    'h5/src/pages/order/detail.vue',
    'h5/src/pages/order/refund.vue',
    'h5/src/utils/format.js',
    'admin/src/views/refund/list.vue',
    'mock-server/server.js'
  ],
  need: { h5: true, admin: false },
  timeoutMs: 180000,
  estimateSeconds: 40,
  requires: '种子数据 + 4090/8080 运行中；退款阶梯来自字典（种子：168h/90%、72h/50%、24h/20%、<24h 不可退）',
  setup: async (ctx) => {
    await seedUserLogin(ctx.h5, H5, { token: ctx.user.token, user: ctx.user.user })
  },
  steps: [
    step('造已支付订单并由管理端接单（进入可走阶梯退款的状态）', async (ctx) => {
      const { assert, userApi, adminApi } = ctx
      // 选 ≥ +4 天：距表演 > 96h，落在「3-7 天退 50%」档，不会命中 24h 内不可退
      const picked = await pickFarOpenDay(userApi, 4)
      const { order } = await createPaidOrder(userApi, {
        runId: ctx.runId,
        performInDays: picked.offset,
        timeSlot: picked.slot
      })
      assert.eq('支付后订单状态 = 待接单（PENDING_ACCEPT）', order.status, 'PENDING_ACCEPT')
      assert.check('支付成功已写入支付时间/流水号', !!order.paidAt && !!order.payTradeNo, `paidAt=${order.paidAt} tradeNo=${order.payTradeNo}`)
      assert.gt('订单金额 > 0（真实计价）', order.totalAmount, 0)

      const accepted = await adminApi.call(`/api/admin/orders/${order.id}/accept`, { method: 'POST', body: {} })
      assert.check('管理端接单接口返回成功', accepted.code === 0, `code=${accepted.code} ${accepted.msg || ''}`)
      assert.eq('接单后订单状态 = ACCEPTED（阶梯退款只对已接单订单生效）', accepted.data.order.status, 'ACCEPTED')
      ctx.state.orderId = order.id
      ctx.state.order = accepted.data.order
      ctx.log(`订单 ${order.id} · 表演 ${order.performDate} ${order.timeSlot} · 金额 ¥${order.totalAmount}`)
      await ctx.shot('01-accepted')
    }),

    step('退款试算与计价里的退款阶梯逐项一致（不硬编码比例）', async (ctx) => {
      const { assert, userApi } = ctx
      const pricing = await getPricing(userApi)
      const rules = pricing.refundRules || []
      assert.gte('计价接口返回退款阶梯 ≥ 3 档', rules.length, 3, JSON.stringify(rules.map((r) => `${r.minHours}h/${r.ratio}`)))
      assert.check('阶梯按 minHours 单调递减（高档在前才可能取到第一条命中）',
        rules.every((r, i) => i === 0 || Number(rules[i - 1].minHours) > Number(r.minHours)),
        rules.map((r) => r.minHours).join('>'))

      const pv = await refundPreview(userApi, ctx.state.orderId)
      const hours = (performStartMs(ctx.state.order) - Date.now()) / HOUR
      const hit = expectedRule(rules, hours)
      assert.eq('试算档位与阶梯规则一致（ratio）', pv.ratio, hit.ratio, `距表演 ${hours.toFixed(1)}h 命中 ${hit.label}`)
      assert.eq('试算档位文案与阶梯规则一致（label）', pv.ruleLabel, hit.label)
      assert.eq('试算金额 = 订单金额 × 阶梯比例', pv.amount, Math.round(ctx.state.order.totalAmount * hit.ratio),
        `total=${ctx.state.order.totalAmount} ratio=${hit.ratio}`)
      assert.check('试算回传的小时数与用例自算一致（±1h）',
        Math.abs(Number(pv.hoursToPerform) - hours) <= 1, `服务端=${pv.hoursToPerform} 自算=${hours.toFixed(1)}`)
      // 服务端把整条阶梯带回来：必须与 /api/config/pricing 同一份（防两端各写一份规则）
      assert.check('试算返回的阶梯与计价接口同源',
        JSON.stringify(pv.rules) === JSON.stringify(rules), `preview=${JSON.stringify(pv.rules)}`)
      ctx.state.preview = pv
      ctx.state.rules = rules
      ctx.state.expectedAmount = Math.round(ctx.state.order.totalAmount * hit.ratio)
      await ctx.shot('02-preview')
    }),

    step('用户提交退款申请 → REFUNDING/PENDING（页面可展示的待审批数据落库）', async (ctx) => {
      const { assert, userApi } = ctx
      const order = await applyRefund(userApi, ctx.state.orderId, '自动化测试-时间冲突')
      assert.eq('申请退款后订单状态 = 退款中（REFUNDING）', order.status, 'REFUNDING')
      assert.eq('退款单状态 = 待审批（PENDING）', order.refund.status, 'PENDING')
      assert.eq('退款单记录的试算金额 = 阶梯试算金额', order.refund.applyAmount, ctx.state.preview.amount)
      assert.eq('退款单记录的档位 = 阶梯试算档位', order.refund.ratio, ctx.state.preview.ratio)
      assert.includes('订单时间轴有「用户申请退款」', (order.timeline || []).map((t) => t.text).join(' | '), '申请退款')
      ctx.state.refundingOrder = order
      await ctx.shot('03-refunding')
    }),

    step('H5 订单详情页（未审批）：显示「退款中 / 退款审核中」且金额为阶梯试算值', async (ctx) => {
      const { assert, h5 } = ctx
      await h5Load(h5, `/pages/order/detail?id=${ctx.state.orderId}`)
      const bannerOk = await waitVisible(h5, '.b-status', 12000)
      assert.check('订单详情页渲染出状态横幅', bannerOk, bannerOk ? '' : '12s 内未等到 .b-status')
      const ui = await readRefundUi(h5)
      assert.eq('H5 状态文案 = 退款中', ui.statusText, '退款中')
      assert.includes('H5 状态说明 = 退款申请审核中', ui.bannerDesc, '退款申请审核中')
      assert.includes('退款卡是待审批态（.refund-card.pending）', ui.cardCls, 'pending', ui.cardCls)
      assert.eq('退款卡标题 = 退款审核中', ui.rfTitle, '退款审核中')
      const rowText = ui.rfRows.join(' | ')
      assert.includes('待审批金额 = 阶梯试算金额（页面含 ¥）', rowText, `¥${ctx.state.preview.amount.toLocaleString('en-US')}`, rowText)
      assert.includes('待审批文案带阶梯百分比', rowText, `${Math.round(ctx.state.preview.ratio * 100)}%`, rowText)
      // 还没审批：页面上不应该出现「已退款 / 退款成功」
      const body = await topText(h5)
      assert.check('审批前页面不出现「退款成功」', !body.includes('退款成功'), body.slice(0, 120))
      ctx.state.uiPending = ui
      await ctx.shot('04-detail-pending')
    }),

    step('负控：用户 token 自己批退款必须被拒（未审批不可能变已退款）', async (ctx) => {
      const { assert, userApi } = ctx
      const selfApprove = await userApi.call(`/api/admin/refunds/${ctx.state.orderId}/approve`, {
        method: 'POST', body: { note: '越权批准' }
      })
      assert.check('用户 token 调管理端退款审批接口被拒', selfApprove.code !== 0,
        `code=${selfApprove.code} ${selfApprove.msg || ''}`)
      assert.check('被拒后订单仍停留在退款中（没有被越权改成 REFUNDED）',
        (await getOrder(userApi, ctx.state.orderId)).status === 'REFUNDING')
      // 判据防空判：伪造「未审批就显示已退款」样本必须被判失败
      assert.negative('退款状态判据不是空判（伪造：退款单还是 PENDING 却显示「已退款」）',
        (s) => s.statusText === '已退款' && s.refundStatus === 'APPROVED',
        { statusText: '已退款', refundStatus: 'PENDING' })
      await ctx.shot('05-self-approve-denied')
    }),

    step('管理端审批通过 → REFUNDED/APPROVED，金额沿用阶梯试算值', async (ctx) => {
      const { assert, adminApi } = ctx
      const r = await adminApi.call(`/api/admin/refunds/${ctx.state.orderId}/approve`, {
        method: 'POST', body: { note: '自动化测试-同意退款' }
      })
      assert.check('管理端审批接口返回成功', r.code === 0, `code=${r.code} ${r.msg || ''}`)
      const o = r.data.order
      assert.eq('审批后订单状态 = 已退款（REFUNDED）', o.status, 'REFUNDED')
      assert.eq('退款单状态 = APPROVED', o.refund.status, 'APPROVED')
      assert.eq('实退金额 = 阶梯试算金额（未被审批人偷偷改数）', o.refund.refundAmount, ctx.state.expectedAmount)
      assert.match('生成退款流水号（R 开头）', o.refund.refundNo, /^R\d/)
      assert.includes('时间轴有「退款审批通过」', (o.timeline || []).map((t) => t.text).join(' | '), '退款审批通过')
      assert.check('审批留痕：审批人与审批时间已写入', !!o.refund.auditBy && !!o.refund.auditedAt,
        `auditBy=${o.refund.auditBy} auditedAt=${o.refund.auditedAt}`)
      ctx.state.refundedOrder = o
      await ctx.shot('06-approved')
    }),

    step('H5 订单详情页（已审批）：显示「已退款 / 退款成功」且金额与阶梯一致', async (ctx) => {
      const { assert, h5 } = ctx
      await h5Load(h5, `/pages/order/detail?id=${ctx.state.orderId}`)
      const bannerOk2 = await waitVisible(h5, '.b-status', 12000)
      assert.check('刷新详情页后状态横幅可见', bannerOk2, bannerOk2 ? '' : '12s 内未等到 .b-status')
      await sleep(300)
      const ui = await readRefundUi(h5)
      assert.eq('H5 状态文案 = 已退款', ui.statusText, '已退款')
      assert.includes('H5 状态说明 = 退款已完成', ui.bannerDesc, '退款已完成')
      assert.includes('退款卡是已通过态（.refund-card.approved）', ui.cardCls, 'approved', ui.cardCls)
      assert.eq('退款卡标题 = 退款成功', ui.rfTitle, '退款成功')
      const rows = ui.rfRows.join(' | ')
      assert.includes('页面实退金额 = 阶梯试算金额', rows, `¥${ctx.state.expectedAmount.toLocaleString('en-US')}`, rows)
      assert.includes('页面展示退款流水号', ui.rfNo, ctx.state.refundedOrder.refund.refundNo, ui.rfNo)
      assert.includes('页面写明原路返回', rows, '原路返回', rows)
      // 金额与阶梯规则交叉校验：页面金额 ÷ 订单金额 = 阶梯比例
      const shown = Number((rows.match(/¥([\d,]+)/) || [])[1]?.replace(/,/g, '') || 0)
      assert.eq('页面金额 = 订单金额 × 阶梯比例（端到端交叉校验）', shown, ctx.state.expectedAmount,
        `页面=${shown} 期望=${ctx.state.expectedAmount} ratio=${ctx.state.preview.ratio}`)
      ctx.state.uiApproved = ui
      await ctx.shot('07-detail-approved')
    }),

    step('负控：金额判据「只比状态不比钱」会漏 —— 伪造错金额样本必须被判失败', async (ctx) => {
      const { assert } = ctx
      const expected = ctx.state.expectedAmount
      assert.negative('金额判据不是空判（伪造：退款金额比阶梯少 1 元）',
        (s) => Number(s.amount) === expected,
        { amount: expected - 1 })
      assert.negative('退款流水号判据不是空判（伪造：无流水号）',
        (s) => /^R\d/.test(String(s.refundNo || '')),
        { refundNo: '' })
      assert.negative('阶梯档位判据不是空判（伪造：档位比例被算成 100%）',
        (s) => Number(s.ratio) === ctx.state.preview.ratio,
        { ratio: 1 })
      // 正向对照：真实结果满足同一判据（防「判据恒 false」的假红）
      const ui = ctx.state.uiApproved
      assert.check('真实已退款页面满足同一判据', ui.statusText === '已退款' && ui.rfTitle === '退款成功')
    })
  ],

  // 环境归还：runner 为每条用例新开 page，但同一 browser context 的 8090 localStorage 是共享的。
  // 种进去的登录态必须清掉，否则会泄漏给后面「冷启动必须无 token」的用例（cases/h5-login-gate.mjs）。
  teardown: async (ctx) => {
    if (!ctx.h5) return
    await ctx.h5.evaluate(() => {
      try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch (e) {}
    }).catch(() => {})
    ctx.log('已清理 H5 登录态（避免跨用例 localStorage 泄漏）')
  }
})
