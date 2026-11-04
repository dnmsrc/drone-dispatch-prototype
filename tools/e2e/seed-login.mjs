// 判据前置：把「已登录用户」种进浏览器（2026-11-03 新增登录门之后的统一做法）。
//
// 背景：2026-11-03 用户要求「没登录不允许点进预约流程」——首页 CTA、档位卡、各 apply 页 onLoad
// 都会先过 store.requireLogin，未登录直接跳 /pages/login/login。所以所有 H5 判据脚本
// 如果只 goto 页面而不种登录态，量到的是登录页，第 1 步之后的判据会整片假红。
//
// 做法：走接口拿一个真实签名 token（mock-server 的 wechat-login 返回的是无状态签名 token，
// 服务重启也有效），再用 evaluateOnNewDocument 写进 localStorage —— 与真实登录（setLogin）
// 写入的键完全一致（uni-h5 的 uni.setStorageSync 落 localStorage 时值就是原值，不是 JSON 包裹）。
// 必须在 page.goto / page.reload 之前调用，初始化脚本才会在文档创建时执行。
export async function seedUserLogin(page, H5, opts = {}) {
  const r = await fetch(H5 + '/api/auth/wechat-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '微信用户_8848', avatar: '/api/media/avatar/wechat-demo' })
  })
  const j = await r.json()
  if (j.code !== 0 || !j.data || !j.data.token) throw new Error('用户登录接口失败：' + JSON.stringify(j).slice(0, 200))
  const { token, user } = j.data
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

// 管理端同款：拿 admin token 写 localStorage 的两个键（admin_token / admin_info）。
export async function seedAdminLogin(page, ADMIN, opts = {}) {
  const r = await fetch(ADMIN + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: opts.username || 'admin', password: opts.password || 'admin123' })
  })
  const j = await r.json()
  if (j.code !== 0 || !j.data || !j.data.token) throw new Error('管理端登录接口失败：' + JSON.stringify(j).slice(0, 200))
  const { token, admin } = j.data
  await page.evaluateOnNewDocument((tk, info) => {
    try {
      localStorage.setItem('admin_token', tk)
      localStorage.setItem('admin_info', info)
    } catch (e) {}
  }, token, JSON.stringify(admin))
  return { token, admin }
}
