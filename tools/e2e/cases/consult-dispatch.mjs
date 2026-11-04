// 咨询单：H5 真实 UI 提交 → 管理端接待 → 派单 → H5 我的预约页看到「已派单 / 报价」
//
// 覆盖点：
//   ① 咨询单不是在库里直接插一条：H5 第 5 步点「提交咨询单」，真的被条款门拦住（阻断式弹窗），
//      逐条确认后才真的提交，单号由服务端生成（C+日期-序号）；
//   ② 状态机 PENDING → RECEIVED → DISPATCHED 逐级推进，每一步都校验「不能跳步 / 不能重复」：
//      未接待时管理端不能创建派单、用户不能确认派单、已接待不能重复接待、已有派单不能重复创建；
//   ③ 派单六项必填齐全 + 报价区间落库（区间不是前端编的，是客服在管理端填的）；
//   ④ H5「我的预约」真实 UI：状态胶囊「已派单·待你确认」、报价区间、展开后的全流程留痕；
//   ⑤ 负控：伪造「没接待就显示已派单」「报价区间错位」「时间轴缺接待记录」样本必须被判失败。
//
// 依赖源码口径（只读确认，未改）：
//   h5/src/pages/apply/consult.vue   提交按钮 .submit-consult；条款门 = BasisPop（.bp-pop / 逐条 .bp-ck / .bp-btn.ghost）
//   h5/src/pages/consult/index.vue   卡片 .item、单号 .ih-no、状态 .ih-status、报价 .im-v.price、展开 .tl-row
//   mock-server/server.js            /api/consults 提交；/api/admin/consults/:id/receive|dispatch（严格状态机）
import { defineCase, step } from '../lib/case.mjs'
import { H5, sleep } from '../lib/browser.mjs'
import { h5Load, waitVisible, textsVisible, topText, clickVisible, clickVisibleText } from '../lib/nav.mjs'
import { seedUserLogin } from '../lib/auth.mjs'
import { createConsult, receiveConsult, dispatchConsult, myConsults, adminConsultDetail, getPricing, pickOpenSlot } from '../lib/api.mjs'

const CONSULT_ID_RE = /C\d{8}-\d{4}/

/** 点掉阻断式条款门：逐条点「确认本条」，确认完点关闭。返回点了几条。 */
async function passAckGate(page, maxClauses = 24) {
  let clicked = 0
  for (let i = 0; i < maxClauses; i++) {
    const vis = await page.evaluate(() => {
      const pop = [...document.querySelectorAll('.bp-pop')].find((e) => e.getClientRects().length)
      if (!pop) return { open: false, pending: 0 }
      const pending = [...pop.querySelectorAll('.bp-ck')].filter((e) => e.getClientRects().length)
      if (pending.length) { pending[0].click(); return { open: true, pending: pending.length, hit: true } }
      return { open: true, pending: 0 }
    })
    if (!vis.open) break
    if (vis.hit) { clicked++; await sleep(220); continue }
    // 没有待确认条款了 → 点关闭按钮退出弹层
    const closed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.bp-btn.ghost')].find((e) => e.getClientRects().length && !e.disabled)
      if (!btn) return false
      btn.click(); return true
    })
    if (closed) { await sleep(400); break }
    await sleep(300)
  }
  return clicked
}

export default defineCase({
  id: 'consult-dispatch',
  title: '咨询单：H5 真实提交 → 客服接待 → 创建派单 → H5 看到「已派单 / 报价区间」',
  tags: ['smoke', 'h5', 'admin', 'consult'],
  priority: 'P0',
  impact: [
    'h5/src/pages/apply/consult.vue',
    'h5/src/pages/consult/index.vue',
    'h5/src/engine/consult.js',
    'admin/src/views/consult/index.vue',
    'mock-server/server.js'
  ],
  need: { h5: true, admin: false },
  timeoutMs: 240000,
  estimateSeconds: 60,
  requires: '种子数据；H5 第 5 步需要草稿里有场地/规模（用例通过 sessionStorage apply_draft 注入真实场地后走真实提交）',
  setup: async (ctx) => {
    const pricing = await getPricing(ctx.userApi)
    const venue = pricing.venues[0]
    const picked = await pickOpenSlot(ctx.userApi, { fromOffset: 3, maxOffset: 20 })
    const draft = {
      step: 5,
      acks: [],
      wxAcks: [],
      need: {
        droneCount: 200, duration: 15, contentMode: 'template', screens: 'mid',
        dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 800
      },
      venue,
      date: picked.date,
      slot: picked.slot,
      anchor: 'flex',
      quote: { total: 28800, lines: [], detail: [], fee: null }
    }
    await seedUserLogin(ctx.h5, H5, {
      token: ctx.user.token, user: ctx.user.user, keepDraft: true, draftJson: JSON.stringify(draft)
    })
    ctx.state.venue = venue
    ctx.state.performDate = picked.date
    ctx.state.timeSlot = picked.slot
    ctx.log(`草稿：${picked.date} ${picked.slot} · ${venue.name} · 200 架`)
  },
  steps: [
    step('H5 第 5 步真实提交咨询单（过条款门，单号由服务端生成）', async (ctx) => {
      const { assert, h5, userApi } = ctx
      await h5Load(h5, '/pages/apply/consult')
      const submitBtnOk = await waitVisible(h5, '.submit-consult', 12000)
      assert.check('第 5 步「提交咨询单」按钮可见', submitBtnOk, submitBtnOk ? '' : '12s 内未等到 .submit-consult')
      assert.includes('页面处于人工咨询与派单步骤', await topText(h5), '人工咨询与派单')

      // 第一次点提交：本单触发的条款还没确认 → 必须被阻断式弹窗拦住，不能直接进服务端
      await clickVisible(h5, '.submit-consult', 0)
      const gated = await waitVisible(h5, '.bp-pop', 6000)
      assert.check('未确认条款点提交：被阻断式弹窗拦住', gated, gated ? '' : '6s 内没有出现 .bp-pop（提交门失效或直接提交了）')
      const stillDraft = await topText(h5)
      assert.check('被拦住时页面仍是未提交状态（没生成单号）', !CONSULT_ID_RE.test(stillDraft), stillDraft.slice(0, 160))

      const clicked = await passAckGate(h5)
      assert.gte('逐条确认了本单触发的条款（留痕动作）', clicked, 3, `点了 ${clicked} 条`)
      ctx.log(`条款门逐条确认 ${clicked} 条`)

      // 确认完再点一次提交 → 真提交
      await clickVisible(h5, '.submit-consult', 0)
      const gotId = await h5.waitForFunction(() => /C\d{8}-\d{4}/.test(document.body.innerText || ''), { timeout: 15000, polling: 250 })
        .then(() => true).catch(() => false)
      assert.check('确认条款后提交成功：页面出现服务端生成的咨询单号', gotId, (await topText(h5)).slice(0, 200))
      const body = await topText(h5)
      const id = (body.match(CONSULT_ID_RE) || [])[0] || ''
      assert.match('单号格式为 C+日期-序号', id, CONSULT_ID_RE, `id=${id}`)
      ctx.state.consultId = id

      const mine = await myConsults(userApi)
      const rec = mine.find((c) => c.id === id)
      assert.check('服务端「我的咨询单」里有这张单（真实落库）', !!rec, mine.map((c) => c.id).join(','))
      assert.eq('新提交的咨询单状态 = 待客服接待（PENDING）', rec.status, 'PENDING')
      assert.eq('页面状态文案 = 待客服接待', rec.statusText, '待客服接待')
      assert.check('时间轴第一条是「提交咨询单」', (rec.timeline || [])[0]?.text.includes('提交咨询单'),
        JSON.stringify(rec.timeline || []))
      ctx.state.timelineLen = (rec.timeline || []).length
      await ctx.shot('01-submitted')
    }),

    step('负控：不能跳步（未接待不能派单 / 用户不能自己推进 / 判据防空判）', async (ctx) => {
      const { assert, userApi, adminApi } = ctx
      const id = ctx.state.consultId
      // 管理端在 PENDING 状态直接创建派单 → 必须被拒（状态机不允许跳步）
      const jump = await adminApi.call(`/api/admin/consults/${id}/dispatch`, {
        method: 'POST', body: { quoteLo: 30000, quoteHi: 42000, note: '跳步', terms: {} }
      })
      assert.check('PENDING 直接派单被拒（客服必须先接待）', jump.code !== 0, `code=${jump.code} ${jump.msg || ''}`)
      // 用户侧没有推进入口：客服还没派单时 confirm-dispatch 必须被拒
      const early = await userApi.call(`/api/consults/${id}/confirm-dispatch`, { method: 'POST', body: {} })
      assert.check('客服未派单时用户不能确认派单（用户侧不能自己推进）', early.code !== 0, `code=${early.code} ${early.msg || ''}`)
      assert.eq('被拒两次后单据仍是 PENDING（没有被跳步改动）',
        (await adminConsultDetail(adminApi, id)).status, 'PENDING')
      assert.negative('状态机判据不是空判（伪造：PENDING 直接跳到 DISPATCHED 也算合法）',
        (s) => ['RECEIVED', 'DISPATCHED'].includes(s.from) && s.to === 'DISPATCHED',
        { from: 'PENDING', to: 'DISPATCHED' })
      await ctx.shot('02-cannot-jump')
    }),

    step('管理端接待：PENDING → RECEIVED（重复接待被拒）', async (ctx) => {
      const { assert, adminApi } = ctx
      const received = await receiveConsult(adminApi, ctx.state.consultId)
      assert.eq('接待后状态 = RECEIVED', received.status, 'RECEIVED')
      assert.eq('状态文案 = 客服已接待·拟方案', received.statusText, '客服已接待·拟方案')
      assert.check('接待客服与接待时间已留痕', !!received.receivedBy && !!received.receivedAt,
        `by=${received.receivedBy} at=${received.receivedAt}`)
      assert.gte('时间轴新增接待记录（长度 ≥ 2）', (received.timeline || []).length, 2,
        (received.timeline || []).map((t) => t.text).join(' | '))
      assert.check('时间轴含「已接待」',
        (received.timeline || []).some((t) => /已接待/.test(t.text)), (received.timeline || []).map((t) => t.text).join(' | '))
      const again = await adminApi.call(`/api/admin/consults/${ctx.state.consultId}/receive`, { method: 'POST', body: {} })
      assert.check('重复接待被拒（状态机不可重复）', again.code !== 0, `code=${again.code} ${again.msg || ''}`)
      ctx.state.timelineLen = (received.timeline || []).length
      await ctx.shot('03-received')
    }),

    step('管理端创建派单：RECEIVED → DISPATCHED（六项必填 + 报价区间落库）', async (ctx) => {
      const { assert, adminApi } = ctx
      const QUOTE = { lo: 30000, hi: 42000 }
      const dispatched = await dispatchConsult(adminApi, ctx.state.consultId, { quoteLo: QUOTE.lo, quoteHi: QUOTE.hi, note: '自动化测试派单' })
      assert.eq('派单后状态 = DISPATCHED', dispatched.status, 'DISPATCHED')
      assert.eq('状态文案 = 已派单·待你确认', dispatched.statusText, '已派单·待你确认')
      assert.match('生成派单号（D+日期-序号）', dispatched.dispatch?.id, /^D\d{8}-\d{4}/)
      assert.check('报价区间与客服填的一致（不是前端编的）',
        JSON.stringify(dispatched.dispatch.quoteRange) === JSON.stringify([QUOTE.lo, QUOTE.hi]),
        JSON.stringify(dispatched.dispatch.quoteRange))
      const mustFill = dispatched.dispatch.mustFill || []
      assert.gte('派单六项必填齐全（≥ 6 项）', mustFill.length, 6, mustFill.map((m) => `${m.key}=${m.value}`).join(' | '))
      assert.check('六项必填没有空值（缺项即合同约定不明）',
        mustFill.every((m) => m.value != null && String(m.value).trim() !== ''),
        mustFill.filter((m) => m.value == null || String(m.value).trim() === '').map((m) => m.key).join(','))
      assert.includes('时间轴有「创建派单」',
        (dispatched.timeline || []).map((t) => t.text).join(' | '), '创建派单')
      assert.gt('时间轴长度严格增加（接待 + 派单各一条）',
        (dispatched.timeline || []).length, ctx.state.timelineLen, `before=${ctx.state.timelineLen} after=${(dispatched.timeline || []).length}`)
      const dup = await dispatchConsult(adminApi, ctx.state.consultId).then(() => 0).catch((e) => e)
      assert.check('重复创建派单被拒（已有派单不能覆盖）', typeof dup !== 'number', String(dup && dup.message).slice(0, 120))
      ctx.state.dispatch = dispatched
      await ctx.shot('04-dispatched')
    }),

    step('H5 我的预约页真实 UI：状态「已派单·待你确认」+ 报价区间 + 全流程留痕', async (ctx) => {
      const { assert, h5 } = ctx
      await h5Load(h5, '/pages/consult/index')
      const itemOk = await waitVisible(h5, '.item', 12000)
      assert.check('我的预约页渲染出咨询单卡片', itemOk, itemOk ? '' : '12s 内未等到 .item')
      const ids = await textsVisible(h5, '.ih-no')
      assert.check('卡片里能看到这张咨询单的单号', ids.includes(ctx.state.consultId), ids.join(','))
      const statuses = await textsVisible(h5, '.ih-status')
      assert.includes('状态胶囊 = 已派单·待你确认', statuses.join(' | '), '已派单·待你确认', statuses.join(' | '))
      const prices = await textsVisible(h5, '.im-v.price')
      const quoteText = prices.join(' | ')
      assert.includes('报价区间下限来自派单', quoteText, '¥30,000', quoteText)
      assert.includes('报价区间上限来自派单', quoteText, '¥42,000', quoteText)
      const cardText = await topText(h5)
      assert.includes('卡片上显示派单号', cardText, ctx.state.dispatch.dispatch.id, ctx.state.dispatch.dispatch.id)

      // 真实点击「查看进度」展开时间轴
      const openBtn = await clickVisibleText(h5, ['查看进度'], { selector: 'button, .ghost-btn, .pb-inline' })
      assert.check('点「查看进度」展开明细', !!openBtn, '没找到「查看进度」按钮')
      await waitVisible(h5, '.tl-row', 6000)
      await sleep(300)
      const tl = await textsVisible(h5, '.tl-row')
      assert.gte('展开后流出全流程留痕（≥ 3 条）', tl.length, 3, tl.join(' | ').slice(0, 200))
      const tlAll = tl.join(' | ')
      assert.includes('留痕含「提交咨询单」', tlAll, '提交咨询单', tlAll.slice(0, 160))
      assert.includes('留痕含「已接待」', tlAll, '已接待', tlAll.slice(0, 160))
      assert.includes('留痕含「创建派单」', tlAll, '创建派单', tlAll.slice(0, 160))
      ctx.state.uiStatus = statuses.join(' | ')
      ctx.state.uiTimeline = tlAll
      await ctx.shot('05-consult-list')
    }),

    step('负控：状态/报价/留痕三条判据都不能空判', async (ctx) => {
      const { assert } = ctx
      assert.negative('状态判据不是空判（伪造：文案写已派单但状态还是 RECEIVED）',
        (s) => s.statusText === '已派单·待你确认' && s.status === 'DISPATCHED',
        { statusText: '已派单·待你确认', status: 'RECEIVED' })
      assert.negative('报价区间判据不是空判（伪造：页面把区间上下限写反）',
        (s) => s.lo === 30000 && s.hi === 42000,
        { lo: 42000, hi: 30000 })
      assert.negative('留痕判据不是空判（伪造：时间轴里没有接待记录）',
        (s) => /已接待/.test(String(s.timeline || '')),
        { timeline: '提交咨询单，等待客服接待 | 客服已创建派单 D20261104-0001' })
      assert.negative('派单号判据不是空判（伪造：派单号为空）',
        (s) => /^D\d{8}-\d{4}/.test(String(s.id || '')),
        { id: '' })
      // 正向对照：真实页面结果满足同一判据（防「判据恒 false」的假红）
      assert.check('真实页面状态满足判据', ctx.state.uiStatus.includes('已派单·待你确认'))
      assert.check('真实时间轴满足留痕判据', /已接待/.test(ctx.state.uiTimeline) && /创建派单/.test(ctx.state.uiTimeline))
    })
  ],

  // 环境归还：runner 每条用例新开 page，但同一 browser context 的 8090 localStorage 共享。
  // 本用例种了登录态，必须清掉，否则后续「冷启动必须无 token」的用例（h5-login-gate）会整片假红。
  teardown: async (ctx) => {
    if (!ctx.h5) return
    await ctx.h5.evaluate(() => {
      try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch (e) {}
    }).catch(() => {})
    ctx.log('已清理 H5 登录态（避免跨用例 localStorage 泄漏）')
  }
})
