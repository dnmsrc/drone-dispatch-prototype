// H5 登录门（2026-11-03 需求：没登录不允许进入预约流程）
//
// 覆盖点：
//   ① 未登录点首页 CTA → 必须被拦到登录页，且 redirect 参数带对「登录后回哪」（第 1 步 /pages/apply/venue）；
//   ② 真实走微信模拟登录（不是种 token）→ token 落库、自动回跳第 1 步，不绕回首页；
//   ③ 第 1 步真的渲染出来（场地列表 ≥ 4、无事件对象泄漏 JSON、填报页无旧确认入口）；
//   ④ 负控：伪造「未登录直接进预约页」「登录后回首页」样本必须被判失败（防判据空判）。
//
// 为什么这条不种 token：种 token 后量到的永远是已登录路径，登录门有没有真的拦住就没人验了。
// 所以本用例的 page 保持干净，由真实登录动作产生 token。
import { defineCase, step } from '../lib/case.mjs'
import { H5 } from '../lib/browser.mjs'
import { h5Load, h5Route, waitVisible, topText, textsVisible } from '../lib/nav.mjs'
import { clickWechatAllow } from '../lib/auth.mjs'
import { sleep } from '../lib/browser.mjs'

export default defineCase({
  id: 'h5-login-gate',
  title: 'H5 登录门：未登录点预约被拦住，真实微信登录后回跳到第 1 步',
  tags: ['smoke', 'h5', 'auth'],
  priority: 'P0',
  impact: ['h5/src/pages/index/index.vue', 'h5/src/pages/login/login.vue', 'h5/src/store/index.js', 'h5/src/pages/apply/venue.vue'],
  need: { h5: true, admin: false },
  timeoutMs: 120000,
  estimateSeconds: 25,
  requires: 'mock-server 8090/8080 运行中；H5 产物已构建（登录门在源码 h5/src/store 里，构建产物才是被测对象）',
  steps: [
    step('冷启动首页：无登录态，CTA 可见', async (ctx) => {
      const { assert, h5 } = ctx
      await h5Load(h5, '/pages/index/index')
      assert.check('首页渲染出主 CTA', await waitVisible(h5, '.cta', 10000), '未等到 .cta 可见')
      const token = await h5.evaluate(() => localStorage.getItem('token'))
      assert.eq('冷启动时 localStorage 无 token', token, null)
      const ctaText = (await textsVisible(h5, '.cta')).join(' | ')
      assert.includes('CTA 文案是「立即预约表演」', ctaText, '立即预约表演', ctaText)
      await ctx.shot('01-home-guest')
    }),

    step('点 CTA → 登录门拦截并带对回跳地址', async (ctx) => {
      const { assert, h5 } = ctx
      const loc = await h5.evaluate(() => {
        const el = [...document.querySelectorAll('.cta')].find((e) => e.getClientRects().length)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
      })
      assert.check('找不到可点击的 CTA 坐标', !!loc, JSON.stringify(loc))
      // 真实鼠标点击（合成 click() 也会传事件对象，真实点击更贴近用户路径）
      await h5.mouse.click(loc.cx, loc.cy)
      await sleep(1500)
      // 转场完成后才读路由：page.url() 不走 evaluate，转场中也能安全读
      const route = h5Route(h5)
      assert.includes('未登录点预约被登录门拦住（落在登录页）', route, '/pages/login/login', route)
      // redirect 参数可能被多层编码，循环解到明文
      const raw = h5.url()
      let redirect = raw.includes('redirect=') ? raw.split('redirect=')[1].split('&')[0] : ''
      for (let i = 0; i < 3; i++) { try { redirect = decodeURIComponent(redirect) } catch (e) { break } }
      assert.includes('登录门带对回跳地址（登录后回第 1 步场地页）', redirect, '/pages/apply/venue', `redirect=${redirect}`)
      assert.check('跳转后仍未登录（token 为空）', !(await h5.evaluate(() => localStorage.getItem('token'))), '未登录却已有 token')
      await ctx.shot('02-login-gate')
    }),

    step('真实微信模拟登录：授权 → 回跳第 1 步', async (ctx) => {
      const { assert, h5 } = ctx
      // 「允许」会触发一次真实页面导航（login → venue）：
      // 先 register waitForNavigation，再点；点完等导航完成，然后才 evaluate（转场中 evaluate 会挂住 CDP）。
      const navP = h5.waitForNavigation({ timeout: 12000, waitUntil: 'domcontentloaded' }).then(() => true).catch(() => false)
      const opened = await clickWechatAllow(h5)
      assert.check('点击微信登录并打开授权弹层', opened, '未找到 .wx-btn 或授权层未打开')
      const navigated = await Promise.race([navP, sleep(12000).then(() => false)])
      await sleep(1500)
      const route = h5Route(h5) // page.url()，不在转场中 evaluate
      const token = await h5.evaluate(() => localStorage.getItem('token')).catch(() => null)
      assert.check('授权真实触发了页面导航（不是停在登录页）', navigated, `navigated=${navigated} route=${route}`)
      assert.includes('登录后自动回跳到第 1 步', route, '/pages/apply/venue', route)
      assert.check('登录 token 已写入 localStorage', !!token, `token=${token ? '有' : '空'}`)
      ctx.state.token = token
      ctx.state.routeAfterLogin = route
      await ctx.shot('03-after-login')
    }),

    step('第 1 步场地页真实渲染（无事件 JSON / 无旧确认入口）', async (ctx) => {
      const { assert, h5 } = ctx
      assert.check('场地列表渲染出来', await waitVisible(h5, '.venue-item', 10000), '未等到 .venue-item')
      const venues = await textsVisible(h5, '.venue-item')
      assert.gte('场地数量 ≥ 4', venues.length, 4, `实际 ${venues.length} 个`)
      const body = await topText(h5)
      // 回归：@click 无括号把事件对象写进 data，页面会把 {"type":...} 渲染出来
      assert.check('页面没有渲染事件对象 JSON（事件对象泄漏回归）',
        !body.includes('"type"') && !body.includes('changedTouches'), body.slice(0, 120))
      // 2026-10-29 口径：填报时只选择/输入，不弹窗、不显示确认入口
      const entry = await textsVisible(h5, '.entry-chip')
      assert.eq('填报页没有「需确认/已确认」状态按钮', entry.length, 0, entry.join(' | '))
      assert.check('右下角有统一回看入口（申请说明）', (await textsVisible(h5, '.ack-fab')).length === 1)
      await ctx.shot('04-step1-venue')
    }),

    step('负控：伪造「放行/回首页」样本必须被判失败', async (ctx) => {
      const { assert } = ctx
      // 判据：未登录必须落登录页；伪造「直接进预约页」必须被判失败
      assert.negative('登录门判据不是空判（伪造：未登录却直接进预约页）',
        (s) => String(s.route || '').includes('/pages/login/login'),
        { route: '/pages/apply/venue' })
      // 判据：登录后必须回第 1 步；伪造「回首页」必须被判失败
      assert.negative('回跳判据不是空判（伪造：登录后回了首页）',
        (s) => String(s.route || '').includes('/pages/apply/venue'),
        { route: '/pages/index/index' })
      // 判据：登录成功必须有 token；伪造「无 token」必须被判失败
      assert.negative('token 判据不是空判（伪造：登录后无 token）',
        (s) => !!s.token,
        { token: '' })
      // 负向对照：真实结果满足判据（防「判据恒 false」的假红）
      assert.check('真实结果的登录门判据成立', String(ctx.state.routeAfterLogin || '').includes('/pages/apply/venue'))
    })
  ]
})
