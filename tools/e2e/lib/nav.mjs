// 导航与页面操作：uni-app hash 路由、转场期禁止 evaluate、可见性过滤点击。
//
// 三个必须遵守的坑（都是既有脚本实测出来的，不是推测）：
//   ① uni-app 的 navigateTo/redirectTo 转场期间发 page.evaluate 会把 CDP 执行上下文挂住
//      （实测 150s 不返回，表现为「卡在某一步不动、也不报错」）。
//      正确做法：点击前先 register page.waitForNavigation(...)，点击后 await 导航，再用 page.url() 读路由。
//      withNavigation() 就是这个封装；h5Route() 只读 page.url()，不在转场中 evaluate。
//   ② 只改 location.hash 时 uni-app 不会挂载新页面；整页判据必须「改 hash + reload + 等 uni-page-body 可见」。
//      h5Load() 就是这条；h5Go() 只用于同文档内的轻量切换，不能作为跨页判据。
//   ③ uni-app 页面栈里旧页仍留在 DOM：所有查询都要按 getClientRects().length > 0 过滤可见元素，
//      并且默认只查「最上层可见的 uni-page-body」（topBody）。
import { sleep, H5, ADMIN } from './browser.mjs'

/** 取当前 URL 的 hash 路由（不含 '#'）。转场中也可安全调用（page.url() 不走 CDP evaluate）。 */
export function h5Route(page) {
  const u = page.url()
  const i = u.indexOf('#')
  return i >= 0 ? u.slice(i + 1) : ''
}

/** 是否在某路由（支持子串匹配，例如 '/pages/apply/venue'）。 */
export function routeIncludes(page, part) {
  return h5Route(page).includes(part)
}

/**
 * H5 整页加载某个 hash 路由（既有 run.mjs h5load 的等价封装）：
 * 页内改 hash → reload(domcontentloaded) → 等最上层 uni-page-body 真的渲染出可见区域 → 短暂 settle。
 * 新 page 是 about:blank 时先落到 origin 再改 hash，否则 reload 会挂住。
 */
export async function h5Load(page, hashPath, opts = {}) {
  const { timeout = 12000, settle = 500 } = opts
  const h = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath
  if (!/^http/i.test(page.url())) {
    await page.goto(`${H5}/#${h}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(settle)
    return
  }
  await page.evaluate((hh) => { location.hash = '#' + hh }, h).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitTopBody(page, timeout)
  await sleep(settle)
}

/** 同文档 hash 切换（uni-app 会自己渲染新页，但不保证跨页判据；只用于演示/轻量跳转）。 */
export async function h5Go(page, hashPath, opts = {}) {
  const { settle = 1200 } = opts
  const h = hashPath.startsWith('#') ? hashPath.slice(1) : hashPath
  await page.evaluate((hh) => { location.hash = '#' + hh }, h)
  await waitTopBody(page, opts.timeout || 9000)
  await sleep(settle)
}

/** 等最上层 uni-page-body 渲染出可见区域。 */
export async function waitTopBody(page, timeout = 10000) {
  return page.waitForFunction(
    () => [...document.querySelectorAll('uni-page-body')].some((e) => e.getClientRects().length),
    { timeout, polling: 200 }
  ).then(() => true).catch(() => false)
}

/**
 * 转场安全点击：先 register waitForNavigation，再执行 clickFn，再等导航完成。
 * 返回 { navigated:boolean, route:string }；route 用 page.url() 读（不在转场中 evaluate）。
 * @param {() => Promise<any>} clickFn 点击动作
 */
export async function withNavigation(page, clickFn, opts = {}) {
  const { timeout = 12000, settle = 1200, waitUntil = 'domcontentloaded' } = opts
  const navP = page.waitForNavigation({ timeout, waitUntil }).then(() => true).catch(() => false)
  await clickFn()
  const navigated = await Promise.race([navP, sleep(timeout).then(() => false)])
  await sleep(settle)
  return { navigated, route: h5Route(page) }
}

/** 在页面里执行一段只读查询（非转场期调用；失败返回 fallback，绝不抛）。 */
export async function evaluateSafe(page, fn, ...args) {
  try {
    return await page.evaluate(fn, ...args)
  } catch (e) {
    return { __error: String(e.message || e).slice(0, 160) }
  }
}

/** 顶层可见页的 DOM 查询（uni-app 旧页仍在 DOM，必须只认可见页）。 */
export async function readH5(page, fn, arg) {
  return page.evaluate((fnStr, a) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    const vis = (sel) => [...top.querySelectorAll(sel)].filter((e) => e.getClientRects().length)
    // eslint-disable-next-line no-new-func
    const f = new Function('top', 'vis', 'arg', `return (${fnStr})(top, vis, arg)`)
    return f(top, vis, a)
  }, String(fn), arg)
}

/** 可见元素计数。 */
export async function countVisible(page, sel) {
  return page.evaluate((s) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    return [...top.querySelectorAll(s)].filter((e) => e.getClientRects().length).length
  }, sel).catch(() => 0)
}

/** 可见元素的文本（数组）。 */
export async function textsVisible(page, sel) {
  return page.evaluate((s) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    return [...top.querySelectorAll(s)].filter((e) => e.getClientRects().length)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
  }, sel).catch(() => [])
}

/** 顶层可见页的整段文字（转场后判断状态文案用）。 */
export async function topText(page) {
  return page.evaluate(() => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    return (top.innerText || '').replace(/\s+/g, ' ').trim()
  }).catch(() => '')
}

/** 可见性过滤点击：按选择器点第 i 个可见元素。返回是否点到。 */
export async function clickVisible(page, sel, i = 0) {
  return page.evaluate((s, idx) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    const e = [...top.querySelectorAll(s)].filter((x) => x.getClientRects().length)[idx]
    if (!e) return false
    e.click()
    return true
  }, sel, i)
}

/** 可见性过滤点击：在可选选择器组里，找文本包含任一目标词的可见元素。返回命中的文本或 false。 */
export async function clickVisibleText(page, targets, opts = {}) {
  const sel = opts.selector || 'button, .btn, .pb-btn, .bb-btn, .pay-btn, [class*=btn]'
  const scope = opts.scope || null
  return page.evaluate((sels, texts, scopeSel) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    const root = scopeSel ? [...(scopeSel.startsWith('.') ? document.querySelectorAll(scopeSel) : top.querySelectorAll(scopeSel))]
      .find((e) => e.getClientRects().length) : top
    if (!root) return false
    for (const t of texts) {
      const el = [...root.querySelectorAll(sels)].find(
        (e) => (e.innerText || '').replace(/\s+/g, '').includes(String(t).replace(/\s+/g, '')) && e.getClientRects().length
      )
      if (el) { el.click(); return t }
    }
    return false
  }, sel, targets, scope)
}

/** 等可见元素出现（uni-app 过渡期元素可能暂时不可见，不能只等 DOM 存在）。 */
export async function waitVisible(page, sel, timeout = 10000) {
  return page.waitForFunction((s) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    return [...top.querySelectorAll(s)].some((e) => e.getClientRects().length)
  }, { timeout, polling: 200 }, sel).then(() => true).catch(() => false)
}

/** 等顶层页文字包含某段（状态文案判据）。 */
export async function waitText(page, text, timeout = 10000) {
  return page.waitForFunction((t) => {
    const top = [...document.querySelectorAll('uni-page-body')].filter((e) => e.getClientRects().length).pop() || document.body
    return (top.innerText || '').includes(t)
  }, { timeout, polling: 200 }, text).then(() => true).catch(() => false)
}

/** toast / uni-toast 的当前可见文案。 */
export async function getToast(page) {
  return page.evaluate(() => [...document.querySelectorAll('[class*="toast"], .uni-toast, .uni-simple-toast')]
    .filter((e) => e.getClientRects().length)
    .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
    .join(' | ')).catch(() => '')
}

/**
 * 真实鼠标+键盘输入 uni-input（placeholder 关键字匹配）。
 * 合成事件（evaluate 里改 value + dispatch）无法发现「输入框塌缩导致真实用户无法输入」这类 bug，
 * 联系人姓名/手机号这种关键字段必须用真实输入（既有 run.mjs 已用这条判据抓到过回归）。
 */
export async function typeIntoUniInput(page, placeholderKeyword, value) {
  const loc = await page.evaluate((ph) => {
    const hosts = [...document.querySelectorAll('uni-input')].filter((e) => e.getClientRects().length > 0)
    const host = hosts.find((h) => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph))
    if (!host) return null
    const r = host.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }, placeholderKeyword)
  if (!loc) throw new Error(`未找到输入框（placeholder 含「${placeholderKeyword}」）`)
  await page.mouse.click(loc.cx, loc.cy)
  await sleep(180)
  // 先清空（点击后光标位置不确定，全选替换最稳）
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
  await page.keyboard.type(String(value), { delay: 25 })
  await sleep(180)
}

/** 读 uni-input 的实际值（按 placeholder 关键字）。 */
export async function readUniInput(page, placeholderKeyword) {
  return page.evaluate((ph) => {
    const hosts = [...document.querySelectorAll('uni-input')].filter((e) => e.getClientRects().length > 0)
    const host = hosts.find((h) => ((h.querySelector('.uni-input-placeholder') || {}).innerText || '').includes(ph))
    const i = host && host.querySelector('input')
    return i ? i.value : ''
  }, placeholderKeyword)
}

// ---------------- 管理端（Element Plus） ----------------

/** 可见 Element Plus 元素查询（管理端不涉及 uni-app 页面栈）。 */
export async function countVisibleEl(page, sel) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).length, sel).catch(() => 0)
}

/** 管理端可见文本。 */
export async function adminText(page) {
  return page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '')
}

/**
 * 管理端按文案点按钮/tab（等于去空白的包含匹配）。
 * 返回 { ok, clicked } —— 失败不抛，便于断言里带实际值。
 */
export async function adminClick(page, text, opts = {}) {
  const scope = opts.scope || null
  const selectors = opts.selectors || 'button, .el-button, .el-tabs__item, a'
  return page.evaluate((t, s, sels) => {
    const root = s ? [...document.querySelectorAll(s)].find((e) => e.getClientRects().length) : document
    if (!root) return { ok: false, why: `scope ${s} 不存在` }
    const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, '')
    const cands = [...root.querySelectorAll(sels)].filter((e) => e.getClientRects().length)
    const el = cands.find((e) => norm(e.innerText).includes(norm(t)))
    if (!el) return { ok: false, why: `未找到「${t}」`, visible: cands.map((e) => norm(e.innerText).slice(0, 18)).slice(0, 12) }
    el.click()
    return { ok: true, clicked: norm(el.innerText).slice(0, 30) }
  }, text, scope, selectors)
}

/** 管理端精确文案点击（取 innerText 去空白后完全相等），用于「批准退款」等同名按钮区分。 */
export async function adminClickExact(page, text, opts = {}) {
  const scope = opts.scope || null
  const selectors = opts.selectors || 'button, .el-button'
  return page.evaluate((t, s, sels) => {
    const root = s ? [...document.querySelectorAll(s)].find((e) => e.getClientRects().length) : document
    if (!root) return { ok: false, why: `scope ${s} 不存在` }
    const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, '')
    const el = [...root.querySelectorAll(sels)].filter((e) => e.getClientRects().length)
      .find((e) => norm(e.innerText) === norm(t))
    if (!el) return { ok: false, why: `未找到精确文案「${t}」` }
    el.click()
    return { ok: true, clicked: norm(el.innerText) }
  }, text, scope, selectors)
}

/** 管理端在可见表格行里按订单号/单号定位并点行内按钮。 */
export async function adminRowClick(page, containsText, btnText) {
  return page.evaluate((c, b) => {
    const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, '')
    const rows = [...document.querySelectorAll('.el-table__row')].filter((e) => e.getClientRects().length)
    const row = rows.find((r) => norm(r.innerText).includes(norm(c)))
    if (!row) return { ok: false, why: `表格里没有含「${c}」的可见行`, rows: rows.map((r) => norm(r.innerText).slice(0, 40)).slice(0, 5) }
    const btn = [...row.querySelectorAll('button, .el-button')].find((e) => norm(e.innerText).includes(norm(b)))
    if (!btn) return { ok: false, why: `行内没有「${b}」按钮`, row: norm(row.innerText).slice(0, 80) }
    btn.click()
    return { ok: true, clicked: norm(btn.innerText).slice(0, 20) }
  }, containsText, btnText)
}

/** 管理端表格可见行文本。 */
export async function adminRows(page) {
  return page.evaluate(() => [...document.querySelectorAll('.el-table__row')].filter((e) => e.getClientRects().length)
    .map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim())).catch(() => [])
}

/**
 * 处理 ElMessageBox 二次确认框：在可见弹框里按文案点按钮。
 * @returns {Promise<string|false>} 点到的按钮文案 / false（弹框可见但没目标按钮 / 没有弹框）
 */
export async function confirmBox(page, targets, opts = {}) {
  await sleep(opts.waitBefore ?? 350)
  for (let i = 0; i < (opts.tries ?? 20); i++) {
    const r = await page.evaluate((texts) => {
      const box = [...document.querySelectorAll('.el-message-box')].find((bx) => bx.getClientRects().length)
      if (!box) return null
      const btn = [...box.querySelectorAll('button')].find((x) => texts.some((t) => {
        const a = String(x.innerText || '').replace(/\s+/g, '')
        return a === String(t).replace(/\s+/g, '') || a.includes(String(t).replace(/\s+/g, ''))
      }))
      if (btn) { btn.click(); return String(btn.innerText || '').trim() }
      return false
    }, targets)
    if (r) return r
    if (r === false) return false
    await sleep(250)
  }
  return false
}

/** 等管理端可见文字包含某段（ElMessage / 表格状态文案）。 */
export async function adminWaitText(page, text, timeout = 10000) {
  return page.waitForFunction((t) => (document.body.innerText || '').includes(t), { timeout, polling: 200 }, text)
    .then(() => true).catch(() => false)
}

/** 等管理端可见元素。 */
export async function adminWaitVisible(page, sel, timeout = 10000) {
  return page.waitForFunction((s) => [...document.querySelectorAll(s)].some((e) => e.getClientRects().length),
    { timeout, polling: 200 }, sel).then(() => true).catch(() => false)
}

/** 当前可见的 ElMessage 文案。 */
export async function adminMessages(page) {
  return page.evaluate(() => [...document.querySelectorAll('.el-message')].filter((e) => e.getClientRects().length)
    .map((e) => (e.innerText || '').trim()).join(' | ')).catch(() => '')
}

/** 管理端登录页表单填写（账密+验证码）并点登录，等到离开 /login。 */
export async function adminLoginByForm(page, username, password, opts = {}) {
  const base = opts.adminBase || ADMIN
  await page.goto(`${base}/login`, { waitUntil: 'networkidle2' })
  await page.evaluate(() => { try { localStorage.clear() } catch (e) {} })
  await page.goto(`${base}/login`, { waitUntil: 'networkidle2' })
  const set = (ph, v) => page.evaluate((p, val) => {
    const el = [...document.querySelectorAll(`input[placeholder="${p}"]`)].find((e) => e.getClientRects().length)
    if (!el) return false
    const proto = HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, ph, v)
  if (!(await set('请输入账号', username))) throw new Error('未找到账号输入框')
  if (!(await set('请输入密码', password))) throw new Error('未找到密码输入框')
  await set('验证码', '1234')
  await adminClick(page, '登录', { selectors: 'button, .el-button' })
  const ok = await page.waitForFunction(
    () => location.pathname !== '/login' && (document.body.innerText || '').includes('管理后台'),
    { timeout: 12000, polling: 200 }
  ).then(() => true).catch(() => false)
  if (!ok) throw new Error(`admin 表单登录未成功（${username}）：` + (await adminText(page)).slice(0, 80))
  await sleep(700)
}

/** 供管理端读取单页数据的小工具：在页面上下文里 fetch 管理端 API（带 localStorage token）。 */
export async function adminFetch(page, path) {
  return page.evaluate(async (p) => {
    const tk = localStorage.getItem('admin_token') || ''
    const r = await fetch('/api' + p, { headers: tk ? { Authorization: 'Bearer ' + tk } : {} })
    return r.json()
  }, path)
}

/** 供 H5 页面上下文里读取 API（带 localStorage token）。 */
export async function h5Fetch(page, path) {
  return page.evaluate(async (p) => {
    const tk = localStorage.getItem('token') || ''
    const r = await fetch('/api' + p, { headers: tk ? { Authorization: 'Bearer ' + tk } : {} })
    return r.json()
  }, path)
}
