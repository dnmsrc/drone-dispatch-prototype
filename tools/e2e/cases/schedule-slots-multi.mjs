// 档期批量配置（多选 bulk）→ 服务端 → 管理端日历 → 用户端日历
//
// 覆盖点：
//   ① 用管理端批量接口（mode='bulk'）一次给未来 3 天设置同一组「可接单时段」，
//      并验证 bulk 的冲突保护：已单独配置过的日期不能用批量覆盖（要先回到单日改），休整日也不能配；
//   ② GET /api/schedule 这 3 天与设置完全一致（时段数组、openSlots、slotsOverridden），
//      且没有波及未配置的日期（仍为默认时段）；
//   ③ 管理端 /schedule 真实日历渲染：目标日期格子的时段摘要（shortSlot，如 19-20 · 21-22）与单独设置标记；
//   ④ 用户端 /pages/apply/date 真实日历：选中被配置的日期后，时段列表只出现配置的两段（不是写死的三段），
//      且都可点；对照一个未配置日期仍是默认三段 —— 证明用户端是按后台配置渲染的；
//   ⑤ teardown 用 slots:null 恢复默认，并重新读接口断言恢复成功（不留脏档期）。
//
// 依赖源码口径（只读确认，未改）：
//   mock-server/server.js  POST /api/admin/schedule/slots：mode==='bulk' 才做「已单独配置/休整日」冲突校验；
//                          slots=null 恢复默认；slots=[] = 当日不接单
//   admin/src/views/schedule/index.vue  .month-ctrl / .grid / .day-cell / .day-num / .day-slots / .day-booked
//   h5/src/components/ApplyCalendar.vue .cal / .ym / .nav / .cell / .day
//   h5/src/pages/apply/date.vue         .slot / .sl-t；时段来自 GET /api/schedule 的 slotsByDate
//
// 关于管理端路由：admin 用 createWebHistory（admin/src/router/index.js），`/#/schedule` 的 hash 不参与路由，
// 会被兜底重定向到首页；因此这里按源码打开 `${ADMIN}/schedule` 才是档期页（用例里也断言行内的月历真的渲染了）。
import { defineCase, step } from '../lib/case.mjs'
import { H5, ADMIN, sleep } from '../lib/browser.mjs'
import {
  h5Load, waitVisible, textsVisible, topText, readH5
} from '../lib/nav.mjs'
import { seedUserLogin, seedAdminLogin } from '../lib/auth.mjs'
import {
  getScheduleDay, setSlots, getPricing, dateStr
} from '../lib/api.mjs'

const SLOTS = ['19:00-20:00', '21:00-22:00']
const SLOT_LABELS = ['19:00 – 20:00', '21:00 – 22:00'] // h5 fmtSlot 的展示格式
const SLOT_SHORT = '19-20 · 21-22'                       // admin shortSlot 的展示格式

/** 往后找 n 天「可安全批量配置」的日期：非休整日、未被单独配置、当天没有订单占用。 */
async function pickDates(api, n, fromOffset = 16, maxOffset = 45) {
  const out = []
  for (let i = fromOffset; i <= maxOffset && out.length < n; i++) {
    const date = dateStr(i)
    const day = await getScheduleDay(api, date)
    if (!day || day.closed) continue
    if (day.slotsOverridden) continue
    if (day.booked > 0) continue
    if (!day.slots || !day.slots.length) continue
    out.push({ date, offset: i, day })
  }
  if (out.length < n) throw new Error(`未来 ${fromOffset}~${maxOffset} 天找不到 ${n} 个可批量配置的日期`)
  return out
}

/** 读完 H5 日期页当前月份的标题（ApplyCalendar 的 .ym）。 */
async function h5MonthTitle(page) {
  return (await textsVisible(page, '.ym'))[0] || ''
}

/** 在 H5 日历里翻到目标月份（点可见的左右箭头）。 */
async function h5EnsureMonth(page, date) {
  const wantY = date.slice(0, 4), wantM = Number(date.slice(5, 7))
  for (let i = 0; i < 6; i++) {
    const title = await h5MonthTitle(page)
    const m = title.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/)
    const curY = m ? m[1] : ''
    const curM = m ? Number(m[2]) : 0
    if (curY === wantY && curM === wantM) return true
    const forward = !m || (curY < wantY) || (curY === wantY && curM < wantM)
    const flipped = await readH5(page, (top, vis, dir) => {
      const navs = vis('.cal .nav')
      const target = dir ? navs.find((e) => /›/.test(e.innerText)) || navs[navs.length - 1]
        : navs.find((e) => /‹/.test(e.innerText)) || navs[0]
      if (!target || /off/.test(target.className || '')) return false
      target.click(); return true
    }, forward)
    if (!flipped) return false
    await sleep(450)
  }
  return false
}

/** 在 H5 日历里点某个日（返回是否点到 / 是否置灰）。 */
async function h5ClickDay(page, date) {
  const day = Number(date.slice(8))
  return readH5(page, (top, vis, d) => {
    const cells = vis('.cal .cell').filter((c) => !/pad/.test(c.className || ''))
    const c = cells.find((e) => {
      const t = e.querySelector('.day')
      return t && String(t.innerText).trim() === String(d)
    })
    if (!c) return { ok: false }
    const disabled = /\boff\b/.test(c.className || '')
    c.click()
    return { ok: true, disabled }
  }, day)
}

/** 读 H5 当前选中日期的时段列表（.slot / .sl-t / .dis）。 */
async function h5SlotState(page) {
  return readH5(page, (top, vis) => vis('.slot').map((s) => ({
    label: ((s.querySelector('.sl-t') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
    dis: /\bdis\b/.test(s.className || ''),
    on: /\bon\b/.test(s.className || '')
  })))
}

/** 管理端月历翻月（.month-ctrl 的第一个/第二个按钮分别是上/下月）。 */
async function adminEnsureMonth(page, ym) {
  for (let i = 0; i < 8; i++) {
    const cur = await page.evaluate(() => {
      const inp = document.querySelector('.month-ctrl input')
      return inp ? inp.value.trim() : ''
    }).catch(() => '')
    if (cur === ym) return true
    const forward = !cur || cur < ym
    const flipped = await page.evaluate((f) => {
      const btns = [...document.querySelectorAll('.month-ctrl button')]
      const b = f ? btns[1] : btns[0]
      if (!b) return false
      b.click(); return true
    }, forward).catch(() => false)
    if (!flipped) return false
    await sleep(1400)
  }
  return false
}

/** 读管理端某一天的日历格子（slot 摘要 / 已订 / 类名）。 */
async function adminReadCell(page, date) {
  const day = Number(date.slice(8))
  return page.evaluate((d) => {
    const cells = [...document.querySelectorAll('.day-cell')].filter((c) => !c.classList.contains('empty'))
    const c = cells.find((x) => {
      const n = x.querySelector('.day-num')
      return n && String(n.innerText).trim() === String(d)
    })
    if (!c) return { ok: false }
    return {
      ok: true,
      cls: String(c.className || ''),
      slots: ((c.querySelector('.day-slots') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
      booked: ((c.querySelector('.day-booked') || {}).innerText || '').replace(/\s+/g, ' ').trim()
    }
  }, day).catch(() => ({ ok: false }))
}

export default defineCase({
  id: 'schedule-slots-multi',
  title: '档期批量配置 3 天（bulk）→ 接口 / 管理端日历 / 用户端日历三端一致，并恢复默认',
  tags: ['regression', 'admin', 'h5', 'schedule'],
  priority: 'P1',
  impact: [
    'admin/src/views/schedule/index.vue',
    'admin/src/utils/slot.js',
    'h5/src/pages/apply/date.vue',
    'h5/src/components/ApplyCalendar.vue',
    'h5/src/engine/calendar.js',
    'mock-server/server.js'
  ],
  need: { h5: true, admin: true },
  timeoutMs: 240000,
  estimateSeconds: 75,
  requires: '种子数据；选 ≥ +16 天（避开提前量不足导致用户端把整日置灰），3 天必须无订单、非休整日、未单独配置过',
  setup: async (ctx) => {
    const pricing = await getPricing(ctx.userApi)
    const venue = pricing.venues[0]
    // 用户端日期页需要草稿里有场地/规模，否则日历算不出可提交日
    await seedUserLogin(ctx.h5, H5, {
      token: ctx.user.token,
      user: ctx.user.user,
      keepDraft: true,
      draftJson: JSON.stringify({
        step: 3, acks: [], wxAcks: [],
        need: { droneCount: 200, duration: 15, contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 800 },
        venue, date: '', slot: '', anchor: 'flex', quote: null, judgment: null
      })
    })
    await seedAdminLogin(ctx.adminPage, ADMIN)
    ctx.state.venue = venue
  },
  steps: [
    step('选 3 天可批量配置的日期（非休整日 / 未单独配置 / 无订单占用）', async (ctx) => {
      const { assert, userApi } = ctx
      const picked = await pickDates(userApi, 3, 16)
      assert.eq('找到 3 天候选日期', picked.length, 3)
      const dates = picked.map((p) => p.date)
      ctx.state.dates = dates
      // 对照日期：3 天之后再顺延找一天「未配置、非休整、有默认时段」的日期，
      // 用来证明 bulk 只改了这 3 天（不是把整个月都覆盖了）。
      // 必须跳过周一：H5 日历把周一定为场地检修日（calendar.js MAINTENANCE_WEEKDAY=[1]），
      // 整日不可点，点了日期不会切换，后面「默认三段」的判据会读到上一天的时段。
      let other = null
      for (let i = picked[2].offset + 1; i <= picked[2].offset + 12 && !other; i++) {
        const d = dateStr(i)
        if (dates.includes(d)) continue
        if (new Date(`${d}T00:00:00`).getDay() === 1) continue
        const day = await getScheduleDay(userApi, d)
        if (day && !day.closed && !day.slotsOverridden && day.slots && day.slots.length) other = { date: d, day }
      }
      assert.check('找到对照日期（未配置 / 非休整 / 有默认时段）', !!other,
        `从 +${picked[2].offset + 1} 天起找了 12 天都没找到可用对照日`)
      ctx.state.otherDate = other.date
      const months = [...new Set(dates.map((d) => d.slice(0, 7)))]
      ctx.state.months = months
      ctx.log(`目标日期：${dates.join('、')}（月份 ${months.join('、')}）`)
      // 与默认时段做区分：配置的时段必须真的不等于默认三段，否则「设置成功」看不出来
      const def = picked[0].day.slots
      ctx.state.defaultSlots = def
      assert.check('配置用的时段与默认时段不同（否则判据区分不出是否生效）',
        JSON.stringify(SLOTS) !== JSON.stringify(def), `默认=${def.join(',')}`)
      assert.check('3 天都是未来日期且非休整日', picked.every((p) => p.offset > 0 && !p.day.closed),
        picked.map((p) => `${p.date} closed=${p.day.closed}`).join(' | '))
      assert.check('3 天当前都是默认时段（可被批量覆盖）',
        picked.every((p) => !p.day.slotsOverridden && JSON.stringify(p.day.slots) === JSON.stringify(def)),
        picked.map((p) => `${p.date}=${p.day.slots.join('/')}`).join(' | '))
      await ctx.shot('01-picked')
    }),

    step('bulk 冲突保护：已单独配置的日期不能用批量覆盖（先单日配、再批量被拒、再恢复）', async (ctx) => {
      const { assert, adminApi } = ctx
      const [d0] = ctx.state.dates
      const single = await setSlots(adminApi, [d0], ['18:00-19:00'], 'single')
      assert.check('单日配置成功（mode=single）', single.code === 0 && single.data.updated === 1,
        `code=${single.code} ${single.msg || ''}`)
      const afterSingle = await getScheduleDay(adminApi, d0)
      assert.check('单日配置后该日被标记为「单独配置」',
        afterSingle.slotsOverridden === true, `slotsOverridden=${afterSingle.slotsOverridden}`)

      const bulkConflict = await setSlots(adminApi, ctx.state.dates, SLOTS, 'bulk')
      assert.check('批量配置已单独配置的日期被拒（bulk 冲突保护生效）',
        bulkConflict.code !== 0, `code=${bulkConflict.code} ${bulkConflict.msg || ''}`)
      assert.includes('拒绝原因指向「已单独配置过时段」', bulkConflict.msg || '', '已单独配置', bulkConflict.msg || '')

      // 把这一天恢复成默认，后面的批量配置才能过
      const undo = await setSlots(adminApi, [d0], null, 'single')
      assert.check('单日恢复默认成功', undo.code === 0, `code=${undo.code} ${undo.msg || ''}`)
      const afterUndo = await getScheduleDay(adminApi, d0)
      assert.check('恢复后不再标记为单独配置', afterUndo.slotsOverridden === false,
        `slotsOverridden=${afterUndo.slotsOverridden}`)
      // 负控：伪造「PENDING 态被批量改掉」样本必须被判失败（判据防空判）
      assert.negative('批量冲突判据不是空判（伪造：已单独配置也被判为可批量覆盖）',
        (s) => s.code === 0 && s.conflictDays === 0,
        { code: 0, conflictDays: 1 })
      await ctx.shot('02-bulk-conflict')
    }),

    step('批量设置 3 天时段（mode=bulk）→ 接口读回逐日一致', async (ctx) => {
      const { assert, adminApi, userApi } = ctx
      const dates = ctx.state.dates
      const r = await setSlots(adminApi, dates, SLOTS, 'bulk')
      assert.check('批量设置接口成功', r.code === 0, `code=${r.code} ${r.msg || ''}`)
      assert.eq('一次批量更新 3 天（bulk 多选语义）', r.data.updated, 3)
      assert.includes('返回文案写明更新 3 天', r.msg || '', '3 天', r.msg || '')
      assert.check('没有被占用时段导致的保留（blocked 为空）',
        !r.data.blocked || r.data.blocked.length === 0, JSON.stringify(r.data.blocked))

      const sched = await userApi.call('/api/schedule', { query: { from: dates[0], to: dates[2] } })
      assert.check('GET /api/schedule 返回成功', sched.code === 0, `code=${sched.code} ${sched.msg || ''}`)
      const days = sched.data.days || []
      assert.eq('读回的天数与设置的一致', days.length, 3)
      for (const day of days) {
        assert.check(`${day.date} 时段与设置完全一致`,
          JSON.stringify(day.slots) === JSON.stringify(SLOTS), day.slots.join(','))
        assert.eq(`${day.date} 标记为单独配置`, day.slotsOverridden, true)
        assert.check(`${day.date} 两个时段都可约（openSlots 两条）`,
          JSON.stringify(day.openSlots) === JSON.stringify(SLOTS), day.openSlots.join(','))
      }
      // 未配置的对照日期：按 offset 顺延找一天没被配置、也没休整的（证明批量没有波及全月）
      const other = ctx.state.otherDate
      const otherDay = await getScheduleDay(userApi, other)
      assert.check(`对照日期 ${other} 确实未被单独配置（判据前提成立）`,
        otherDay && !otherDay.slotsOverridden && !otherDay.closed && !dates.includes(other),
        `closed=${otherDay?.closed} overridden=${otherDay?.slotsOverridden}`)
      assert.check(`未配置的 ${other} 仍是默认时段（批量没有波及全月）`,
        JSON.stringify(otherDay.slots) === JSON.stringify(ctx.state.defaultSlots), otherDay.slots.join(','))
      ctx.state.schedDays = days
      await ctx.shot('03-api-verified')
    }),

    step('管理端 /schedule 真实日历：目标日期渲染出配置的两段时段 + 单独设置标记', async (ctx) => {
      const { assert, adminPage } = ctx
      // admin 是 history 路由：/#/schedule 会被兜底到首页，按源码打开 /schedule
      await adminPage.goto(`${ADMIN}/schedule`, { waitUntil: 'domcontentloaded' })
      const gridded = await adminPage.waitForFunction(
        () => document.querySelectorAll('.day-cell').length > 10, { timeout: 20000, polling: 250 }
      ).then(() => true).catch(() => false)
      assert.check('管理端档期页渲染出月历网格', gridded, '未等到 .day-cell')
      assert.check('档期页标题/工具条存在（不是被路由到别的页）',
        await adminPage.evaluate(() => document.body.innerText.includes('档期管理') || !!document.querySelector('.month-ctrl')),
        (await adminPage.evaluate(() => document.body.innerText.slice(0, 120))))
      const cellCount = await adminPage.evaluate(() => document.querySelectorAll('.day-cell:not(.empty)').length)
      assert.gte('月历渲染出 ≥ 28 个日期格', cellCount, 28, `实际 ${cellCount}`)

      // 按月逐个断言（同月只需一次；跨月自动翻月）
      const byMonth = {}
      for (const d of ctx.state.dates) (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || []).push(d)
      for (const [ym, ds] of Object.entries(byMonth)) {
        const atMonth = await adminEnsureMonth(adminPage, ym)
        assert.check(`管理端切到 ${ym} 月`, atMonth, '翻月失败（读不到 .month-ctrl input）')
        for (const d of ds) {
          const cell = await adminReadCell(adminPage, d)
          assert.check(`${d} 的日历格子渲染出来`, cell.ok, JSON.stringify(cell))
          assert.includes(`${d} 格子时段摘要 = 19-20 · 21-22（来自后台配置）`, cell.slots, SLOT_SHORT, cell.slots)
          assert.includes(`${d} 格子带「单独设置」标记（*）`, cell.booked, '*', cell.booked)
        }
      }
      await ctx.shot('04-admin-calendar', 'admin')
    }),

    step('用户端 /pages/apply/date 真实日历：配置日只出现两段且可选，未配置日仍是三段', async (ctx) => {
      const { assert, h5 } = ctx
      await h5Load(h5, '/pages/apply/date')
      const calOk = await waitVisible(h5, '.cal', 15000)
      assert.check('用户端日历渲染出来', calOk, calOk ? '' : '15s 内未等到 .cal')
      const cells = await textsVisible(h5, '.cal .cell')
      assert.gte('日历格子 ≥ 28 格', cells.length, 28, `实际 ${cells.length}`)

      const target = ctx.state.dates[0]
      const atMonth = await h5EnsureMonth(h5, target)
      assert.check(`用户端翻到 ${target.slice(0, 7)} 月`, atMonth, `当前标题=${await h5MonthTitle(h5)}`)
      const click = await h5ClickDay(h5, target)
      assert.check(`点中配置日期 ${target}`, click.ok, JSON.stringify(click))
      assert.check('该日期没有被提前量置灰（可选）', click.ok && !click.disabled, `disabled=${click.disabled}`)
      await sleep(900)
      const state = await h5SlotState(h5)
      const labels = state.map((s) => s.label)
      assert.eq('时段列表只渲染后台配置的两段（不是写死的三段）', state.length, 2, labels.join(' | '))
      assert.check('两段文案与配置一致', JSON.stringify(labels) === JSON.stringify(SLOT_LABELS), labels.join(' | '))
      assert.check('两段都可点（没有被置灰）', state.every((s) => !s.dis), JSON.stringify(state))
      const pageText = await topText(h5)
      assert.check('页面没有把该日判成「本日无可用时段」', !pageText.includes('本日无可用时段'), pageText.slice(0, 140))
      ctx.state.uiConfiguredDay = { date: target, slots: state }

      // 对照：未配置日期仍是默认三段（证明用户端确实按后台配置渲染，不是固定渲染）
      const other = ctx.state.otherDate
      const atOther = await h5EnsureMonth(h5, other)
      assert.check(`用户端翻到对照日期所在月（${other}）`, atOther, await h5MonthTitle(h5))
      const clickOther = await h5ClickDay(h5, other)
      assert.check(`点中未配置日期 ${other}`, clickOther.ok, JSON.stringify(clickOther))
      assert.check('对照日期在用户端可选（不是检修日/提前量不足）', !clickOther.disabled, `disabled=${clickOther.disabled}`)
      await sleep(900)
      const otherState = await h5SlotState(h5)
      assert.eq('未配置日期仍是默认三段时段', otherState.length, ctx.state.defaultSlots.length,
        otherState.map((s) => s.label).join(' | '))
      ctx.state.uiOtherDay = { date: other, slots: otherState }
      await ctx.shot('05-h5-date')
    }),

    step('负控：三端一致性判据不能空判', async (ctx) => {
      const { assert } = ctx
      const slots = SLOTS
      assert.negative('时段一致性判据不是空判（伪造：服务端只存了一段）',
        (s) => JSON.stringify(s.slots) === JSON.stringify(slots),
        { slots: ['19:00-20:00'] })
      assert.negative('批量语义判据不是空判（伪造：bulk 只更新了 1 天）',
        (s) => Number(s.updated) === 3,
        { updated: 1 })
      assert.negative('用户端渲染判据不是空判（伪造：用户端仍渲染默认三段）',
        (s) => s.count === 2,
        { count: 3 })
      assert.negative('管理端渲染判据不是空判（伪造：格子摘要还是默认三段）',
        (s) => s.text === '19-20 · 21-22',
        { text: '19-20 · 20-21 · 21-22' })
      // 正向对照：真实数据满足同一判据（防「判据恒 false」的假红）
      assert.check('真实接口数据满足一致性判据',
        ctx.state.schedDays.every((d) => JSON.stringify(d.slots) === JSON.stringify(SLOTS)))
      assert.check('真实用户端渲染满足判据', ctx.state.uiConfiguredDay.slots.length === 2)
    })
  ],

  // 恢复档期：不留脏数据；恢复后必须重新读接口断言真的回到默认
  teardown: async (ctx) => {
    const dates = ctx.state.dates
    if (!dates || !dates.length) return
    const { assert, adminApi } = ctx
    const r = await setSlots(adminApi, dates, null)
    assert.check('teardown：恢复默认时段接口成功', r.code === 0, `code=${r.code} ${r.msg || ''}`)
    assert.includes('teardown：返回文案说明已恢复默认', r.msg || '', '恢复默认', r.msg || '')
    const days = await Promise.all(dates.map((d) => getScheduleDay(adminApi, d)))
    for (const d of days) {
      assert.check(`teardown：${d.date} 已恢复默认时段`,
        JSON.stringify(d.slots) === JSON.stringify(ctx.state.defaultSlots || d.slots), d.slots.join(','))
      assert.eq(`teardown：${d.date} 不再标记为单独配置`, d.slotsOverridden, false)
    }
    ctx.log(`已恢复档期：${dates.join('、')}`)
    // 环境归还：同一 browser context 的 8090 localStorage 共享，本用例种过用户登录态，清掉再走
    if (ctx.h5) {
      await ctx.h5.evaluate(() => {
        try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch (e) {}
      }).catch(() => {})
      ctx.log('已清理 H5 登录态（避免跨用例 localStorage 泄漏）')
    }
  }
})
