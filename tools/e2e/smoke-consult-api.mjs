// 咨询单 / 人工派单 API 冒烟：走完整状态机 + 冲突废弃 + 权限边界
const BASE = 'http://localhost:8090'
const out = []
const log = (name, ok, extra = '') => { out.push(`${ok ? 'ok  ' : 'BAD '} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) process.exitCode = 1 }

async function call(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  return await r.json()
}

const admin = await call('POST', '/api/admin/login', { username: 'admin', password: 'admin123' })
const atk = admin.data.token
const reset = await call('POST', '/api/config/reset', {}, atk)
log('reset 演示数据（并播种示例咨询单）', reset.code === 0, reset.msg)

const list = await call('GET', '/api/admin/consults?page=1&size=20', null, atk)
log('管理端咨询列表', list.code === 0 && list.data.list.length === 3, `total=${list.data && list.data.total} counts=${JSON.stringify(list.data && list.data.counts)}`)
log('管理端列表带用户与状态文案', !!list.data.list.find(c => c.user && c.user.nickname && c.statusText))

const pending = list.data.list.find(c => c.status === 'PENDING')
const rec = await call('POST', `/api/admin/consults/${pending.id}/receive`, {}, atk)
log('客服接待 PENDING → RECEIVED', rec.code === 0 && rec.data.consult.status === 'RECEIVED', rec.msg)

const badDispatch = await call('POST', `/api/admin/consults/${pending.id}/dispatch`, { quoteLo: 10000, quoteHi: 12000, terms: { approvalOwner: '乙方' } }, atk)
log('六项没填满时派单被拒', badDispatch.code !== 0 && /必须填写/.test(badDispatch.msg), badDispatch.msg)

const terms = {
  approvalOwner: '承飞方（乙方）负责空域申请与备案',
  approvalFailLiability: '乙方未按时取得批复 → 全额退款',
  subcontractApproved: '是（甲方书面同意）',
  depositNature: '预付款',
  insuranceAmount: 1000000,
  scaleBasis: '投入规模'
}
const disp = await call('POST', `/api/admin/consults/${pending.id}/dispatch`, { quoteLo: 30000, quoteHi: 40000, terms, note: '冒烟测试' }, atk)
log('六项填满后创建派单 DISPATCHED', disp.code === 0 && disp.data.consult.status === 'DISPATCHED', disp.msg)
log('派单六项已写入（mustFill 6 项全有值）', !!disp.data.consult.dispatch.mustFill && disp.data.consult.dispatch.mustFill.filter(m => m.value !== null && m.value !== '').length === 6)

const user = await call('POST', '/api/auth/wechat-login', { nickname: '冒烟用户' })
const utk = user.data.token
const body = {
  need: { droneCount: 200, duration: 10, contentMode: 'template', screens: 'mid', dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: 600 },
  venue: { id: 'v1', name: '滨江世纪广场', address: '杭州', type: 'preset' },
  performDate: '2026-11-20', timeSlot: '20:00',
  judgment: { conclusion: 'SURVEY', conclusionText: '需勘察' },
  quote: { total: 38000 },
  reasons: [],
  note: '冒烟'
}
const c1 = await call('POST', '/api/consults', body, utk)
log('用户提交咨询单 → PENDING', c1.code === 0 && c1.data.consult.status === 'PENDING' && /^C\d{8}-/.test(c1.data.consult.id), c1.data && c1.data.consult && c1.data.consult.id)
const cid = c1.data.consult.id

const active = await call('GET', '/api/consults/active', null, utk)
log('用户查进行中的单', active.code === 0 && active.data.active && active.data.active.id === cid)

const c2 = await call('POST', '/api/consults', body, utk)
log('重复提交被拒 40901（同场地同时段）', c2.code === 40901 && c2.data && c2.data.sameVenue === true && c2.data.sameSlot === true, `code=${c2.code} sameVenue=${c2.data && c2.data.sameVenue} sameSlot=${c2.data && c2.data.sameSlot}`)

const c3 = await call('POST', '/api/consults', { ...body, timeSlot: '21:00', abandonActive: true }, utk)
log('确认后重新提交：旧单自动废弃 + 新单建立', c3.code === 0 && c3.data.consult.status === 'PENDING', c3.msg)
const mine = await call('GET', '/api/consults/mine', null, utk)
const oldOne = mine.data.list.find(c => c.id === cid)
log('旧单状态 = ABANDONED 且记录被谁替代', oldOne && oldOne.status === 'ABANDONED' && oldOne.supersede && oldOne.supersede.by === c3.data.consult.id, `${oldOne && oldOne.status} by=${oldOne && oldOne.supersede && oldOne.supersede.by}`)

const newId = c3.data.consult.id
const beforeConfirm = await call('POST', `/api/consults/${newId}/confirm-dispatch`, {}, utk)
log('没派单时用户点确认被拒（不能自己推进）', beforeConfirm.code !== 0, beforeConfirm.msg)

// 客服推进新单：接待 → 派单 → 用户确认
await call('POST', `/api/admin/consults/${newId}/receive`, {}, atk)
await call('POST', `/api/admin/consults/${newId}/dispatch`, { quoteLo: 35000, quoteHi: 42000, terms }, atk)
const conf = await call('POST', `/api/consults/${newId}/confirm-dispatch`, {}, utk)
log('客服派单后用户确认 → CONFIRMED', conf.code === 0 && conf.data.consult.status === 'CONFIRMED' && conf.data.consult.dispatch.status === 'CONFIRMED', conf.msg)

const dup = await call('POST', `/api/consults/${newId}/confirm-dispatch`, {}, utk)
log('重复确认被拒', dup.code !== 0, dup.msg)

// mock 的微信登录固定为 u-demo，造不出第二个登录用户；
// 用种子数据里属于 u1001 的单来验「查不到别人的单」
const foreignGet = await call('GET', `/api/consults/${list.data.list[0].id}`, null, utk)
log('别人的单查不到（不泄漏）', foreignGet.code === 40400, foreignGet.msg)

const noAuth = await fetch(BASE + '/api/consults/mine')
const anon = await noAuth.json()
log('未登录不能查咨询单', anon.code === 40100, anon.msg)

const dash = await call('GET', '/api/admin/dashboard', null, atk)
log('管理端首页待接待数量', dash.code === 0 && typeof dash.data.stats.pendingConsults === 'number', `pendingConsults=${dash.data && dash.data.stats.pendingConsults}`)

const adminGet = await call('GET', `/api/admin/consults/${newId}`, null, atk)
log('管理端详情带完整时间轴', adminGet.code === 0 && adminGet.data.consult.timeline.length >= 4, `timeline=${adminGet.data && adminGet.data.consult.timeline.length}`)

const rej = await call('POST', `/api/admin/consults/${c3.data.consult.id}/reject`, { reason: '场地不具备条件' }, atk)
log('已确认的单不能驳回到一半', rej.code !== 0, rej.msg)

console.log(out.join('\n'))
console.log(process.exitCode ? '\n有失败' : '\n全部通过')
