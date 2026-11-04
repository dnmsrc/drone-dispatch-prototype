// 登录态种子：H5 微信模拟登录 token + 管理端账号 token。
//
// 为什么必须种登录态（2026-11-03 起）：
//   首页 CTA、档位卡、各 apply 页 onLoad 都会先过 store.requireLogin，未登录直接跳 /pages/login/login。
//   不种 token 就 goto，量到的是登录页 —— 后面的判据会整片假红（看着像业务回归，其实只是没登录）。
//
// 做法（沿用 seed-login.mjs，已在 verify-ackflow / verify-calendar / verify-consult 验证过）：
//   ① 走 /api/auth/wechat-login 拿一个真实签名 token（服务重启也有效，无状态）；
//   ② 用 evaluateOnNewDocument 写 localStorage.token / user —— 与真实登录 setLogin 写的键完全一致
//      （uni-h5 的 uni.setStorageSync 落 localStorage 时值就是原值，不是 JSON 包裹）；
//   ③ 必须在 page.goto / page.reload 之前调用，初始化脚本才会在文档创建时执行。
//
// 注意：evaluateOnNewDocument 是「每次新文档都执行」的持久钩子。
//   - 需要「未登录态」的用例（如 h5-login-gate）不要先 seed；
//   - 同一个 page 种过登录态后，不能靠 localStorage.removeItem 回到未登录（reload 时又会被种回去），
//     需要未登录态请新开 page。
import { H5, ADMIN } from './browser.mjs'

async function postJson(base, path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const j = await r.json().catch(() => ({ code: -1, msg: '响应不是 JSON' }))
  return j
}

/** 接口层用户登录：返回 { token, user }。用例的 API 客户端与 UI 种 token 都用它。 */
export async function userLoginApi(base = H5, opts = {}) {
  const j = await postJson(base, '/api/auth/wechat-login', {
    nickname: opts.nickname || '微信用户_8848',
    avatar: opts.avatar || '/api/media/avatar/wechat-demo'
  })
  if (j.code !== 0 || !j.data || !j.data.token) {
    throw new Error('用户登录接口失败：' + JSON.stringify(j).slice(0, 200))
  }
  return { token: j.data.token, user: j.data.user }
}

/** 接口层管理端登录：返回 { token, admin }。 */
export async function adminLoginApi(base = ADMIN, opts = {}) {
  const j = await postJson(base, '/api/admin/login', {
    username: opts.username || 'admin',
    password: opts.password || 'admin123'
  })
  if (j.code !== 0 || !j.data || !j.data.token) {
    throw new Error('管理端登录接口失败：' + JSON.stringify(j).slice(0, 200))
  }
  return { token: j.data.token, admin: j.data.admin }
}

/**
 * 把已登录用户种进页面（必须在任何 goto/reload 之前调用）。
 * @returns {Promise<{token:string, user:object}>}
 */
export async function seedUserLogin(page, base = H5, opts = {}) {
  const { token, user } = opts.token
    ? { token: opts.token, user: opts.user }
    : await userLoginApi(base, opts)
  await page.evaluateOnNewDocument((tk, u, keepDraft, draftJson) => {
    try {
      localStorage.setItem('token', tk)
      localStorage.setItem('user', u)
      if (keepDraft && draftJson) sessionStorage.setItem('apply_draft', draftJson)
      else if (!keepDraft) sessionStorage.removeItem('apply_draft')
    } catch (e) {}
  }, token, JSON.stringify(user), !!opts.keepDraft, opts.draftJson || '')
  return { token, user }
}

/**
 * 把管理端登录态种进页面（admin_token / admin_info 两个键，与前端 store 一致）。
 * @returns {Promise<{token:string, admin:object}>}
 */
export async function seedAdminLogin(page, base = ADMIN, opts = {}) {
  const { token, admin } = opts.token
    ? { token: opts.token, admin: opts.admin }
    : await adminLoginApi(base, opts)
  await page.evaluateOnNewDocument((tk, info) => {
    try {
      localStorage.setItem('admin_token', tk)
      localStorage.setItem('admin_info', info)
    } catch (e) {}
  }, token, JSON.stringify(admin))
  return { token, admin }
}

/**
 * 走真实 UI 微信登录（不是种 token）：点 .wx-btn → 授权弹层 → 点「允许」。
 * 点击「允许」会触发一次真实页面导航，必须先 register waitForNavigation 再点，
 * 点完不要立刻 evaluate（转场中途发 evaluate 会把 CDP 执行上下文挂住，实测 150s 不返回）。
 * 这里只负责最后一步点击；导航等待由 nav.mjs 的 withNavigation 包住调用方。
 * @returns {Promise<boolean>} 是否成功点到「允许」
 */
export async function clickWechatAllow(page) {
  const opened = await page.waitForFunction(
    () => [...document.querySelectorAll('.wx-btn')].some((e) => e.getClientRects().length),
    { timeout: 8000, polling: 200 }
  ).then(() => true).catch(() => false)
  if (!opened) return false
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.wx-btn')].find((e) => e.getClientRects().length)
    if (el) el.click()
  })
  await page.waitForFunction(
    () => [...document.querySelectorAll('.auth-sheet')].some((e) => e.getClientRects().length),
    { timeout: 8000, polling: 200 }
  ).catch(() => {})
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.btn.allow')].find((e) => e.getClientRects().length)
    if (b) b.click()
  })
  return true
}
