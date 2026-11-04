// 通用派单系统 - Mock Server（零依赖 Node 服务）
// 当前装配业务档案：biz/drone.js（无人机编队表演）；换业务改 seed.js 顶部 require
// 启动：node server.js  （默认端口 8090，数据持久化到 data/db.json）
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSeed, buildDicts, profile, ADMINS, HOLIDAYS, fmtDate, addDays, CONSULT_STATUS_TEXT, DISPATCH_TERMS, DISPATCH_TERM_SPEC } = require('./seed');

const PORT = process.env.PORT || 8090;
// 2026-11-04：桌面打包版用环境变量把数据目录与两端构建产物指向 resources / %APPDATA%；
// 三个缺省值保持原样，开发与 e2e 流程行为完全不变。
const DATA_DIR = process.env.MOCK_DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------------- 数据存取 ----------------
let db;
function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      migrate();
      console.log(`[mock] 已加载数据文件（${db.orders.length} 个订单，种子时间 ${db.meta.seededAt}）`);
      return;
    }
  } catch (e) { console.warn('[mock] 数据文件损坏，重新生成种子数据', e.message); }
  db = buildSeed();
  save();
  console.log(`[mock] 已生成种子数据（${db.orders.length} 个订单）`);
}

// 旧版本数据文件迁移到 v2 结构（字典化配置）
function migrate() {
  let changed = false;
  const c = db.config || (db.config = {});
  if (!Array.isArray(db.dicts)) { db.dicts = buildDicts(); changed = true; }
  // 旧结构：priceRules/refundRules 内嵌在 config 中 → 标量参数上提，规则进字典
  if (c.priceRules) {
    c.customTextPrice = c.customTextPrice ?? c.priceRules.customTextPrice ?? 2000;
    c.customLogoPrice = c.customLogoPrice ?? c.priceRules.customLogoPrice ?? 5000;
    c.payExpireMinutes = c.payExpireMinutes ?? c.priceRules.payExpireMinutes ?? 15;
    delete c.priceRules;
    changed = true;
  }
  if (c.refundRules) { delete c.refundRules; changed = true; }
  if (c.payExpireMinutes == null) { c.payExpireMinutes = 15; changed = true; }
  if (c.customTextPrice == null) { c.customTextPrice = 2000; changed = true; }
  if (c.customLogoPrice == null) { c.customLogoPrice = 5000; changed = true; }
  if (!c.dayOverrides) { c.dayOverrides = {}; changed = true; }
  if (!c.customHolidays) { c.customHolidays = {}; changed = true; }
  // v4：档期口径从「每日限单数」改成「每日可接单时段」——
  // 一个时段 = 一个可接单名额（同日同时段只能接一单），三个时段即 3 单/日。
  if (!c.daySlots) { c.daySlots = {}; changed = true; }   // date -> ['19:00-20:00', …]（未配置 = 用 defaultSlots）
  // v5：时段从「单点时刻」改成「整点区间」—— "19:00" → "19:00-20:00"（用户 2026-11-03 口径）。
  //     默认时段、单日时段、字典项、订单/咨询单全部归一化，旧数据文件无需手工处理。
  {
    const cur = Array.isArray(c.defaultSlots) ? c.defaultSlots : null;
    const def = normSlots(cur);
    const next = def.length ? [...new Set(def)].sort() : DEFAULT_SLOTS.slice();
    if (!cur || JSON.stringify(next) !== JSON.stringify(cur)) { c.defaultSlots = next; changed = true; }
  }
  for (const [d, v] of Object.entries(c.daySlots || {})) {
    const nv = normSlots(v);
    if (JSON.stringify(nv) !== JSON.stringify(v)) { c.daySlots[d] = nv; changed = true; }
  }
  {
    const ref = (profile.dictRefs && profile.dictRefs.timeSlot) || 'time_slot';
    const dTime = (db.dicts || []).find(d => d.type === ref);
    for (const it of ((dTime && dTime.items) || [])) {
      const id = normSlot(it.key);
      if (id && it.key !== id) {
        it.key = id;
        it.label = `${id.slice(0, 5)} – ${id.slice(6)}`;
        changed = true;
      }
    }
  }
  for (const o of (db.orders || [])) {
    const id = normAnySlot(o.timeSlot);
    if (id && id !== o.timeSlot) { o.timeSlot = id; changed = true; }
  }
  for (const q of (db.consults || [])) {
    const id = normAnySlot(q.timeSlot);
    if (id && id !== q.timeSlot) { q.timeSlot = id; changed = true; }
  }
  if (!db.meta) db.meta = {};
  // v3：咨询单 / 人工派单（旧数据文件补空数组，示例单只在重新播种时出现）
  if (!Array.isArray(db.consults)) { db.consults = []; changed = true; }
  if (db.meta.version !== 5) { db.meta.version = 5; changed = true; }
  if (changed) { save(); console.log('[mock] 数据文件已迁移到 v5（时段改为整点区间）'); }
}
function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------------- 工具 ----------------
const tokens = new Map(); // token -> {type:'user'|'admin', id, role, name}
function pad(n) { return String(n).padStart(2, '0'); }
function nowIso() { return new Date().toISOString(); }
function orderSeq() { return String(db.orders.length + 1).padStart(4, '0'); }

function ok(data, msg = 'ok') { return { code: 0, msg, data }; }
// 第三个参数用于「结构化失败」：例如 40901 冲突时把进行中的单一起带回去，
// H5 才能弹「你在预约中 / 旧单会被自动废弃」而不是只收到一句文案。
function fail(msg, code = 40000, data) { const e = new Error(msg); e.bizCode = code; if (data !== undefined) e.bizData = data; return e; }

// 活跃订单状态（占档期）
const ACTIVE_STATUSES = ['PENDING_PAY', 'PENDING_ACCEPT', 'ACCEPTED', 'IN_SERVICE', 'COMPLETED', 'REVIEWED', 'REFUNDING'];
const STATUS_TEXT = {
  PENDING_PAY: '待支付', PENDING_ACCEPT: '待接单', ACCEPTED: '已接单·待执行',
  IN_SERVICE: '执行中', COMPLETED: '已完成', REVIEWED: '已评价',
  CANCELLED: '已取消', REFUNDING: '退款中', REFUNDED: '已退款'
};

function sweepExpired() {
  const now = Date.now();
  let changed = false;
  for (const o of db.orders) {
    if (o.status === 'PENDING_PAY' && new Date(o.expireAt).getTime() < now) {
      o.status = 'CANCELLED';
      o.cancelReason = '支付超时';
      o.timeline.push({ time: nowIso(), text: '支付超时，订单自动取消' });
      changed = true;
    }
  }
  if (changed) save();
}

// ===== 时段口径（2026-11-03 用户）=====
// 一个「时段」= 一块整点时间区间，形如 "19:00-20:00"；分钟固定 00。
// 用户原话：「时间段应该是我选择时间可以随意配置中间时间的……配置时间段时，只允许选择整数」
// → 起止可任意挑整点，但不接受 19:30 这类半点值；一个时段 = 一个可接单名额（同日同时段只接一单）。
const SLOT_ID_RE = /^([01]\d|2[0-3]):00-(([01]\d|2[0-3]|24):00)$/;
const DEFAULT_SLOTS = ['19:00-20:00', '20:00-21:00', '21:00-22:00'];
function slotPad2(n) { return String(n).padStart(2, '0'); }
function slotHourAfter(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  return h >= 23 ? '24:00' : `${slotPad2(h + 1)}:00`;
}
// 旧数据 "20:00" 一律按一小时区间解释；非法返回 ''
function normSlot(s) {
  if (typeof s !== 'string') return '';
  const raw = s.trim();
  if (SLOT_ID_RE.test(raw)) return raw.slice(6) > raw.slice(0, 5) ? raw : '';
  // 容错：历史上被写坏的 "19-20:00"（漏了 :00）也顺手修正，避免坏值在数据里长期留存
  const bad = raw.match(/^([01]\d|2[0-3])-(([01]\d|2[0-3]):00)$/);
  if (bad) return `${bad[1]}:00-${bad[2]}`;
  const m = raw.match(/^([01]\d|2[0-3]):00$/);
  return m ? `${m[0]}-${slotHourAfter(m[0])}` : '';
}
function normSlots(list) { return (Array.isArray(list) ? list : []).map(normSlot).filter(Boolean); }
// 连半点也收（"19:30" → "19:00-20:00"）：只用于迁移/展示历史订单，新配置仍然只收整点
function normAnySlot(s) {
  const id = normSlot(s);
  if (id) return id;
  const m = String(s || '').trim().match(/^([01]\d|2[0-3]):[0-5]\d$/);
  return m ? `${m[1]}:00-${slotHourAfter(m[1])}` : '';
}
function slotStartOf(s) { const id = normSlot(s); return id ? id.slice(0, 5) : ''; }

// ===== 时段重叠（2026-11-03 用户口径 · 三次修正）=====
// 用户原话：「相同或者有覆盖的时段还是允许选择，需要修复」
// 口径：① 完全相同一定算重叠；② 区间部分相交（19:00-21:00 与 20:00-22:00）也算重叠；
//       ③ 端点相接（19:00-20:00 与 20:00-21:00）不算重叠 —— 这是两个连续名额，业务上合法。
// 一个时段 = 一个可接单名额，同一时间不可能接两单，所以重叠没有语义。
const SLOT_MIN = t => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
function slotRange(id) {
  const norm = normSlot(id);
  if (!norm) return null;
  const i = norm.indexOf('-');
  return [SLOT_MIN(norm.slice(0, i)), SLOT_MIN(norm.slice(i + 1))];
}
function slotsOverlap(a, b) {
  const ra = slotRange(a), rb = slotRange(b);
  if (!ra || !rb) return false;
  return Math.max(ra[0], rb[0]) < Math.min(ra[1], rb[1]);
}
// 在一组时段里找第一对重叠。排序后只需比对相邻段：若不相邻的两段相交，夹在中间那段必然也与其中之一相交。
function findSlotOverlap(list) {
  const arr = [...new Set(list)].filter(Boolean).sort();
  for (let i = 1; i < arr.length; i++) {
    if (slotsOverlap(arr[i - 1], arr[i])) return [arr[i - 1], arr[i]];
  }
  return null;
}

function bookedCount(date) {
  return db.orders.filter(o => o.performDate === date && ACTIVE_STATUSES.includes(o.status)).length;
}
// 该日可接单时段：未单独配置 = 全局默认时段；配成空数组 = 当日不接单
function slotsOf(date) {
  const own = db.config.daySlots && db.config.daySlots[date];
  if (own) return normSlots(own);
  const base = normSlots(db.config.defaultSlots);
  return base.length ? base : DEFAULT_SLOTS.slice();
}
function bookedSlotsOf(date) {
  const m = {};
  for (const o of db.orders) {
    if (o.performDate === date && ACTIVE_STATUSES.includes(o.status)) {
      const id = normAnySlot(o.timeSlot) || String(o.timeSlot || '');
      m[id] = (m[id] || 0) + 1;
    }
  }
  return m;
}
function scheduleOf(date) {
  const closed = db.config.closedDates.includes(date);
  const ov = db.config.dayOverrides[date];
  const slots = slotsOf(date);
  const bookedSlots = bookedSlotsOf(date);
  const openSlots = slots.filter(s => (bookedSlots[s] || 0) < 1);
  const slotsOverridden = !!(db.config.daySlots && db.config.daySlots[date]);
  return {
    date,
    closed,
    slots,
    openSlots,
    bookedSlots,
    noSlots: slots.length === 0,
    // 每天可接单名额 = 开放时段数（limit 保留为派生值，旧下单页与旧前端不用改）
    limit: slots.length,
    booked: bookedCount(date),
    holiday: HOLIDAYS[date] || db.config.customHolidays[date] || '',
    customHoliday: !!db.config.customHolidays[date],
    overridden: slotsOverridden || !!(ov && ov.limit != null),
    slotsOverridden
  };
}

// ---------------- 字典 → 计价视图 ----------------
function dictItems(type) {
  const d = (db.dicts || []).find(x => x.type === type);
  if (!d) return [];
  return d.items.filter(i => i.status !== 0).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
// 保持与旧版 /api/config/pricing 相同的形状，H5 无需改动
// 字典类型标识全部来自业务档案 dictRefs，服务端与具体业务解耦
function priceRulesView() {
  const R = profile.dictRefs;
  return {
    tiers: dictItems(R.tier).map(i => ({ drones: Number(i.key), price: Number(i.value), desc: i.extra || '' })),
    durations: dictItems(R.duration).map(i => ({ minutes: Number(i.key), extra: Number(i.value), label: i.label })),
    customTextPrice: db.config.customTextPrice,
    customLogoPrice: db.config.customLogoPrice,
    addons: dictItems(R.addon).map(i => ({ key: i.key, label: i.label, price: Number(i.value) })),
    patterns: dictItems(R.pattern).map(i => ({ key: i.key, label: i.label })),
    timeSlots: dictItems(R.timeSlot).map(i => i.key),
    payExpireMinutes: db.config.payExpireMinutes
  };
}
function refundRulesView() {
  return dictItems(profile.dictRefs.refundRule)
    .map(i => ({ minHours: Number(i.key), ratio: Number(i.value), label: i.label }))
    .sort((a, b) => b.minHours - a.minHours);
}

function computePrice(body) {
  const rules = priceRulesView();
  const tier = rules.tiers.find(t => t.drones === Number(body.droneCount));
  if (!tier) throw fail('无效的架次档位');
  const dur = rules.durations.find(d => d.minutes === Number(body.duration));
  if (!dur) throw fail('无效的表演时长');
  const detail = [{ label: `${tier.drones} 架基础价（含 10 分钟）`, amount: tier.price }];
  if (dur.extra > 0) detail.push({ label: `时长 ${dur.minutes} 分钟加价`, amount: dur.extra });
  if (body.customText && String(body.customText).trim()) detail.push({ label: `定制文字「${String(body.customText).trim()}」`, amount: rules.customTextPrice });
  if (body.customLogo) detail.push({ label: 'LOGO/图片定制', amount: rules.customLogoPrice });
  for (const k of body.addons || []) {
    const a = rules.addons.find(x => x.key === k);
    if (!a) throw fail(`无效的附加服务：${k}`);
    detail.push({ label: a.label, amount: a.price });
  }
  return { detail, total: detail.reduce((s, i) => s + i.amount, 0) };
}

function performDateTime(o) {
  return new Date(`${o.performDate}T${slotStartOf(o.timeSlot) || '20:00'}:00+08:00`).getTime();
}

// 阶梯退款试算：返回 {ratio, amount, ruleLabel, refundable}
function refundPreview(o) {
  if (o.status === 'PENDING_ACCEPT') {
    return { refundable: true, ratio: 1, amount: o.totalAmount, ruleLabel: '订单未接单，可全额退款' };
  }
  if (o.status !== 'ACCEPTED') return { refundable: false, ratio: 0, amount: 0, ruleLabel: '当前状态不可退款' };
  const hours = (performDateTime(o) - Date.now()) / 3600000;
  const rules = refundRulesView();
  // 按键（距表演小时数下限）从高到低匹配第一条；无规则时不可退款
  const hit = rules.find(r => hours >= r.minHours) || { ratio: 0, label: '不可退款' };
  const ratio = hit.ratio, label = hit.label;
  return {
    refundable: ratio > 0, ratio,
    amount: Math.round(o.totalAmount * ratio),
    ruleLabel: label,
    hoursToPerform: Math.round(hours)
  };
}

function publicOrder(o) {
  return { ...o, statusText: STATUS_TEXT[o.status] || o.status };
}
// ---------------- 咨询单 / 人工派单 ----------------
// 状态机（严格顺序，不允许跳步，契约见 docs/consult-workflow.md）：
//   PENDING（待客服接待）→ RECEIVED（客服已接待）→ DISPATCHED（客服已派单·待用户确认）→ CONFIRMED（用户已确认）
//   未确认的单可被客服 REJECTED；用户重新申请时旧单自动 ABANDONED。
// 关键约束：用户侧永远不能把单往前推一步（提交、确认派单两步除外），接待与派单只发生在管理端。
const CONSULT_ACTIVE = ['PENDING', 'RECEIVED', 'DISPATCHED', 'CONFIRMED'];

function consultSeq(baseDate) {
  const prefix = 'C' + baseDate.replace(/-/g, '') + '-';
  return prefix + String(db.consults.filter(c => c.id.startsWith(prefix)).length + 1).padStart(4, '0');
}
function consultUser(c) {
  const u = db.users.find(x => x.id === c.userId) || {};
  return { id: c.userId, nickname: u.nickname || '未知用户', phone: u.phone || '', avatar: u.avatar || '' };
}
function publicConsult(c) {
  // 派单存在时把「六项必填」补齐成展示用结构（旧数据 / 直接改 db 时可能缺 terms，展示层兜一下）
  const d = c.dispatch ? {
    ...c.dispatch,
    mustFill: (c.dispatch.mustFill && c.dispatch.mustFill.length)
      ? c.dispatch.mustFill
      : DISPATCH_TERM_SPEC.map(t => ({ key: t.key, label: t.label, value: (c.dispatch.terms || {})[t.key] ?? null, required: true, note: t.note }))
  } : null;
  return { ...c, statusText: CONSULT_STATUS_TEXT[c.status] || c.status, dispatch: d };
}
function withUserConsult(c) { return { ...publicConsult(c), user: consultUser(c) }; }
function consultTimeline(c, by, text) {
  c.updatedAt = nowIso();
  c.timeline.push({ at: c.updatedAt, by, text });
}
function activeConsultOf(userId) {
  return db.consults
    .filter(c => c.userId === userId && CONSULT_ACTIVE.includes(c.status))
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))[0] || null;
}
// 重复申请冲突判定：同场地（id 或名称）或同「日期 + 时段」任一命中，都要让用户二次确认「旧单会被自动废弃」
function consultConflict(active, incoming) {
  const sameVenue = !!active.venue && !!incoming.venue && (
    (!!active.venue.id && active.venue.id === incoming.venue.id) ||
    (!!active.venue.name && active.venue.name === incoming.venue.name));
  const sameSlot = active.performDate === incoming.performDate && active.timeSlot === incoming.timeSlot;
  return { sameVenue, sameSlot };
}
function consultSummary(c) {
  if (!c) return null;
  return {
    id: c.id, status: c.status, statusText: CONSULT_STATUS_TEXT[c.status] || c.status,
    performDate: c.performDate, timeSlot: c.timeSlot,
    venue: c.venue ? { id: c.venue.id, name: c.venue.name } : null,
    submittedAt: c.submittedAt, note: c.note || '',
    dispatch: c.dispatch ? { id: c.dispatch.id, quoteRange: c.dispatch.quoteRange || [] } : null
  };
}
function consultOfOwner(id, userId) {
  const c = db.consults.find(x => x.id === id);
  if (!c) throw fail('咨询单不存在', 40400);
  if (userId && c.userId !== userId) throw fail('咨询单不存在', 40400);   // 不泄漏别人的单：统一报「不存在」
  return c;
}

function withUser(o) {
  const u = db.users.find(x => x.id === o.userId) || {};
  return { ...publicOrder(o), user: { id: o.userId, nickname: u.nickname || '未知用户', avatar: u.avatar || '', phone: u.phone || '' } };
}

// ---------------- 鉴权 ----------------
// 2026-11-03：用户 token 改成「无状态签名 token」。
// 原来 token 只存在内存 Map（tokens），Mock Server 一重启就全部失效 —— 而浏览器 localStorage 里还留着旧 token，
// 界面显示「已登录」、每个请求却被 40100 打回，用户看到的就是「明明登录了，点提交还让我登录」。
// 签名 token 里带 userId，服务端只用固定密钥验签，重启后依然有效（演示期内一次登录够用）。
const TOKEN_SECRET = process.env.MOCK_TOKEN_SECRET || 'sky-show-demo-token-secret';
function makeUserToken(id) {
  const b64 = Buffer.from('u:' + id + ':' + Date.now().toString(36)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(b64).digest('base64url').slice(0, 24);
  return 'utk_' + b64 + '.' + sig;
}
function parseUserToken(t) {
  if (!t || !/^utk_/.test(t)) return null;
  const rest = t.slice(4);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return null;
  const b64 = rest.slice(0, dot);
  const want = crypto.createHmac('sha256', TOKEN_SECRET).update(b64).digest('base64url').slice(0, 24);
  if (rest.slice(dot + 1) !== want) return null;
  let body = '';
  try { body = Buffer.from(b64, 'base64url').toString('utf8') } catch (e) { return null }
  const parts = body.split(':');
  if (parts.length < 2 || parts[0] !== 'u' || !parts[1]) return null;
  return { type: 'user', id: parts[1] };
}
function authUser(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  // 签名 token 优先（服务重启仍有效）；内存 Map 保留兼容
  const s = parseUserToken(t) || tokens.get(t);
  if (!s || s.type !== 'user') throw fail('请先登录', 40100);
  return s;
}
function authAdmin(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = tokens.get(t);
  if (!s || s.type !== 'admin') throw fail('请先登录管理端', 40100);
  return s;
}
function requireAdminRole(s) {
  if (s.role !== 'ADMIN') throw fail('仅管理员可执行此操作', 40300);
}

// ---------------- 路由表 ----------------
// 每项：{ method, pattern: '/api/orders/:id/pay', handler(req, params, body, query) }
const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

// ===== 公共/用户端 =====
route('POST', '/api/auth/wechat-login', (req, p, body) => {
  // 模拟微信 OAuth：真实环境此处用 code 换 openid
  const nickname = (body.nickname || '').trim() || '微信用户_' + String(Math.floor(1000 + Math.random() * 9000));
  let user = db.users.find(u => u.id === 'u-demo');
  if (!user) {
    user = { id: 'u-demo', nickname, avatar: body.avatar || '/api/media/avatar/u-demo', phone: '135****0000', createdAt: nowIso() };
    db.users.push(user); save();
  } else { user.nickname = nickname; if (body.avatar) user.avatar = body.avatar; save(); }
  const token = makeUserToken(user.id);
  tokens.set(token, { type: 'user', id: user.id });
  return ok({ token, user });
});

route('GET', '/api/auth/me', (req) => {
  const s = authUser(req);
  const user = db.users.find(u => u.id === s.id);
  return ok({ user });
});

// 业务档案（品牌/业务名）：双端启动时获取，通用模板换业务只改 biz 档案文件
route('GET', '/api/config/profile', () => {
  return ok({ key: profile.key, name: profile.name, brand: profile.brand });
});

route('GET', '/api/config/pricing', () => {
  return ok({
    priceRules: priceRulesView(),
    refundRules: refundRulesView(),
    venues: db.venues.filter(v => v.enabled),
    bookingWindowDays: db.config.bookingWindowDays,
    dailyLimit: (db.config.defaultSlots || []).length,
    defaultSlots: db.config.defaultSlots
  });
});

route('GET', '/api/schedule', (req, p, b, query) => {
  const from = query.from || fmtDate(new Date());
  const to = query.to || fmtDate(addDays(new Date(), db.config.bookingWindowDays));
  const days = [];
  let d = new Date(from + 'T00:00:00+08:00');
  const end = new Date(to + 'T00:00:00+08:00');
  while (d <= end) {
    days.push(scheduleOf(fmtDate(d)));
    d = addDays(d, 1);
  }
  return ok({ days });
});

route('GET', '/api/venue/search', (req, p, b, query) => {
  const kw = (query.keyword || '').trim();
  let list = db.poiPool.filter(x => !kw || x.name.includes(kw) || x.address.includes(kw));
  if (list.length < 3 && kw) {
    const suffix = ['广场', '公园', '体育中心', '商业街', '文化中心'];
    let i = 0;
    while (list.length < 5) {
      list.push({
        name: `${kw}${suffix[i % suffix.length]}`,
        address: `杭州市${kw}附近 ${100 + i * 11} 号`,
        lng: +(120.1 + Math.random() * 0.2).toFixed(3),
        lat: +(30.15 + Math.random() * 0.2).toFixed(3)
      });
      i++;
    }
  }
  return ok({ list: list.slice(0, 6) });
});

route('POST', '/api/orders', (req, p, body) => {
  const s = authUser(req);
  const { detail, total } = computePrice(body);
  // 档期校验
  const today = fmtDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.performDate || '')) throw fail('请选择表演日期');
  if (body.performDate <= today) throw fail('表演日期最早为明天');
  const maxDate = fmtDate(addDays(new Date(), db.config.bookingWindowDays));
  if (body.performDate > maxDate) throw fail(`最多可预约未来 ${db.config.bookingWindowDays} 天内`);
  const sch = scheduleOf(body.performDate);
  if (sch.closed) throw fail('该日期为休整日，请选择其他日期');
  const slot = normSlot(body.timeSlot);
  if (!slot) throw fail('无效的表演时段：时段为整点区间，如 19:00-20:00');
  if (!sch.slots.includes(slot)) throw fail('该时段当日未开放接单，请选择其他时段');
  if ((sch.bookedSlots[slot] || 0) >= 1) throw fail('该时段已被占用，请选择其他时段');
  // 时段由后台档期自由配置（任意整点区间），不再用字典枚举校验：档期里有 = 可下单
  if (!body.venue || !body.venue.name || !body.venue.address) throw fail('请填写表演场地');
  if (!body.contact || !body.contact.name || !/^1\d{10}$/.test(body.contact.phone || '')) throw fail('请填写正确的联系人姓名与 11 位手机号');

  const created = new Date();
  const o = {
    id: `D${fmtDate(created).replace(/-/g, '')}-${orderSeq()}`,
    userId: s.id,
    status: 'PENDING_PAY',
    droneCount: Number(body.droneCount),
    duration: Number(body.duration),
    patternPreset: body.patternPreset || [],
    customText: (body.customText || '').trim().slice(0, 10),
    customLogo: body.customLogo || '',
    addons: body.addons || [],
    occasion: body.occasion || '',
    performDate: body.performDate,
    timeSlot: slot,
    venue: body.venue,
    contact: body.contact,
    priceDetail: detail,
    totalAmount: total,
    payChannel: '', payTradeNo: '', paidAt: '',
    acceptedBy: '', acceptedAt: '', startedAt: '', completedAt: '',
    media: { photos: [], videos: [] },
    review: null, refund: null, cancelReason: '',
    timeline: [{ time: nowIso(), text: '提交订单' }],
    createdAt: nowIso(),
    expireAt: new Date(Date.now() + db.config.payExpireMinutes * 60000).toISOString()
  };
  db.orders.unshift(o); save();
  return ok({ order: publicOrder(o) }, '订单创建成功');
});

route('GET', '/api/orders', (req, p, b, query) => {
  const s = authUser(req);
  let list = db.orders.filter(o => o.userId === s.id);
  if (query.status) {
    const sts = query.status.split(',');
    list = list.filter(o => sts.includes(o.status));
  }
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok({ list: list.map(publicOrder) });
});

route('GET', '/api/orders/:id', (req, p) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  return ok({ order: publicOrder(o) });
});

route('POST', '/api/orders/:id/pay', (req, p, body) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'PENDING_PAY') throw fail('订单状态已变化，请刷新');
  if (new Date(o.expireAt).getTime() < Date.now()) { sweepExpired(); throw fail('订单已超时取消'); }
  if (!body.success) return ok({ paid: false }, '支付失败，可重试');
  const channel = body.channel === 'ALIPAY' ? 'ALIPAY' : 'WECHAT';
  o.payChannel = channel;
  o.payTradeNo = `${channel === 'WECHAT' ? 'WX' : 'ALI'}${Date.now()}`;
  o.paidAt = nowIso();
  o.status = 'PENDING_ACCEPT';
  o.timeline.push({ time: o.paidAt, text: `支付成功（${channel === 'WECHAT' ? '微信支付' : '支付宝'}），等待商户接单` });
  save();
  return ok({ paid: true, order: publicOrder(o) }, '支付成功');
});

route('POST', '/api/orders/:id/cancel', (req, p) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'PENDING_PAY') throw fail('仅待支付订单可取消');
  o.status = 'CANCELLED';
  o.cancelReason = '用户主动取消';
  o.timeline.push({ time: nowIso(), text: '用户主动取消订单' });
  save();
  return ok({ order: publicOrder(o) }, '订单已取消');
});

route('POST', '/api/orders/:id/refund-preview', (req, p) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  const pv = refundPreview(o);
  return ok({ preview: { ...pv, totalAmount: o.totalAmount, rules: refundRulesView() } });
});

route('POST', '/api/orders/:id/refund', (req, p, body) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  const pv = refundPreview(o);
  if (!pv.refundable) throw fail(pv.ruleLabel || '当前状态不可退款');
  if (!body.reason || !String(body.reason).trim()) throw fail('请填写退款原因');
  o.refund = {
    reason: String(body.reason).trim(),
    ratio: pv.ratio, applyAmount: pv.amount,
    status: 'PENDING', prevStatus: o.status,
    auditBy: '', auditNote: '', refundAmount: 0, refundNo: '',
    createdAt: nowIso(), auditedAt: ''
  };
  o.status = 'REFUNDING';
  o.timeline.push({ time: nowIso(), text: `用户申请退款（${pv.ruleLabel}，预计退 ¥${pv.amount}）` });
  save();
  return ok({ order: publicOrder(o) }, '退款申请已提交，等待审核');
});

route('POST', '/api/orders/:id/review', (req, p, body) => {
  const s = authUser(req);
  const o = db.orders.find(x => x.id === p.id && x.userId === s.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'COMPLETED') throw fail('仅已完成订单可评价');
  const stars = Math.min(5, Math.max(1, Number(body.stars) || 5));
  o.review = { stars, content: String(body.content || '').slice(0, 200), createdAt: nowIso() };
  o.status = 'REVIEWED';
  o.timeline.push({ time: nowIso(), text: '用户已评价' });
  save();
  return ok({ order: publicOrder(o) }, '评价成功');
});

// ===== 咨询单（用户侧）：提交、查询、确认派单 =====
// 用户在自己手机上只做两件事：提交咨询单、确认客服给出的派单。
// 接待与创建派单属于客服工作台（/api/admin/consults/:id/receive|dispatch），用户接口里没有这两个动作 ——
// 这是「用户不能自己推进流程」的结构性保证，不靠按钮隐藏。

route('POST', '/api/consults', (req, p, body) => {
  const s = authUser(req);
  const performDate = String(body.performDate || '');
  const timeSlot = normSlot(String(body.timeSlot || ''));
  const incoming = { performDate, timeSlot, venue: body.venue || null };
  if (!performDate || !timeSlot) throw fail('请先选择申请日期与时段');
  if (!incoming.venue || !incoming.venue.name) throw fail('请先选择场地');
  const need = body.need || {};
  if (!need.droneCount) throw fail('缺少规模与内容');

  // 重复申请：已有进行中的单时必须先让用户明确「旧单会被自动废弃」，客户端确认后才带 abandonActive
  const active = activeConsultOf(s.id);
  if (active && body.abandonActive !== true) {
    const cf = consultConflict(active, incoming);
    throw fail(`你已有一张进行中的咨询单（${active.id}）`, 40901, {
      active: consultSummary(active),
      sameVenue: cf.sameVenue,
      sameSlot: cf.sameSlot
    });
  }

  const v = incoming.venue;
  const venue = { id: v.id || '', name: v.name, type: v.type || 'preset', address: v.address || '', lng: v.lng, lat: v.lat };
  const quote = body.quote || {};
  const total = Number(quote.total) || 0;
  const c = {
    id: '',
    userId: s.id,
    status: 'PENDING',
    statusText: CONSULT_STATUS_TEXT.PENDING,
    submittedAt: nowIso(),
    updatedAt: nowIso(),
    note: String(body.note || '').slice(0, 500),
    need: {
      droneCount: Number(need.droneCount) || 0,
      duration: Number(need.duration) || 0,
      contentMode: need.contentMode || 'template',
      screens: need.screens || '',
      dimension: need.dimension || '',
      motion: need.motion || '',
      matrix: Number(need.matrix) || 1,
      addons: Array.isArray(need.addons) ? need.addons : [],
      audience: Number(need.audience) || 0
    },
    venue,
    judgment: {
      conclusion: (body.judgment && body.judgment.conclusion) || '',
      conclusionText: (body.judgment && body.judgment.conclusionText) || '',
      checks: (body.judgment && body.judgment.checks) || []
    },
    performDate, timeSlot,
    reasons: Array.isArray(body.reasons) ? body.reasons : [],
    quote: { total, lo: Math.round(total * 0.9), hi: Math.round(total * 1.15), fee: quote.fee || null },
    dispatch: null, supersede: null, reject: null,
    timeline: []
  };
  c.id = consultSeq(fmtDate(new Date()));
  c.timeline.push({ at: c.submittedAt, by: '用户', text: '提交咨询单，等待客服接待' });

  if (active) {
    active.status = 'ABANDONED';
    active.supersede = { by: c.id, at: c.submittedAt, text: '用户重新申请，本单自动废弃' };
    consultTimeline(active, '系统', `用户重新申请（${c.id}），本单自动废弃`);
    c.timeline.unshift({ at: c.submittedAt, by: '系统', text: `已自动废弃旧咨询单 ${active.id}` });
  }
  db.consults.push(c);
  save();
  return ok({ consult: publicConsult(c) }, '咨询单已提交，客服将在工作时间内接待');
});

route('GET', '/api/consults/active', (req) => {
  const s = authUser(req);
  const active = activeConsultOf(s.id);
  return ok({ active: active ? publicConsult(active) : null });
});

route('GET', '/api/consults/mine', (req) => {
  const s = authUser(req);
  const list = db.consults
    .filter(c => c.userId === s.id)
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
    .map(publicConsult);
  return ok({ list });
});

route('GET', '/api/consults/:id', (req, p) => {
  const s = authUser(req);
  return ok({ consult: publicConsult(consultOfOwner(p.id, s.id)) });
});

// 用户确认派单：这是用户侧唯一能推进的一步，且只能在「客服已派单」之后
route('POST', '/api/consults/:id/confirm-dispatch', (req, p) => {
  const s = authUser(req);
  const c = consultOfOwner(p.id, s.id);
  if (c.status === 'CONFIRMED') throw fail('派单已确认，无需重复确认');
  if (c.status !== 'DISPATCHED') throw fail('客服还没有创建派单，暂时无法确认');
  const name = (db.users.find(u => u.id === s.id) || {}).nickname || '用户';
  c.status = 'CONFIRMED';
  c.dispatch.status = 'CONFIRMED';
  c.dispatch.confirmedAt = nowIso();
  c.dispatch.confirmedBy = name;
  consultTimeline(c, name, `用户已确认派单 ${c.dispatch.id}`);
  save();
  return ok({ consult: publicConsult(c) }, '派单已确认');
});

// ===== 媒体占位（SVG，离线可用） =====
route('GET', '/api/media/photo/:seed', (req, p) => {
  const hues = [232, 265, 210, 190, 330];
  let h = 0; for (const c of p.seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${h},55%,22%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},60%,10%)"/>
  </linearGradient></defs>
  <rect width="640" height="400" fill="url(#g)"/>
  ${Array.from({ length: 60 }).map((_, i) => `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 400}" r="${1 + (i % 3)}" fill="hsla(${h},80%,80%,0.7)"/>`).join('')}
  <g fill="none" stroke="hsl(${h},85%,65%)" stroke-width="2">
    <circle cx="320" cy="180" r="60" opacity="0.9"/><circle cx="320" cy="180" r="90" opacity="0.4"/>
  </g>
  <text x="320" y="188" text-anchor="middle" font-size="26" fill="#fff" font-family="sans-serif">✦ 表演现场 ✦</text>
  <text x="320" y="360" text-anchor="middle" font-size="14" fill="rgba(255,255,255,.65)" font-family="sans-serif">${p.seed}</text>
</svg>`;
  return { raw: svg, contentType: 'image/svg+xml' };
});
route('GET', '/api/media/avatar/:seed', (req, p) => {
  let h = 0; for (const c of p.seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <rect width="120" height="120" rx="60" fill="hsl(${h},60%,55%)"/>
  <circle cx="60" cy="46" r="20" fill="rgba(255,255,255,.9)"/>
  <path d="M20 110 Q60 70 100 110 Z" fill="rgba(255,255,255,.9)"/>
</svg>`;
  return { raw: svg, contentType: 'image/svg+xml' };
});
route('GET', '/api/media/video/:seed', () => {
  // 演示：无真实视频，返回说明（前端展示占位卡片即可）
  return ok({ url: '', note: '演示版无真实视频文件' });
});

// ===== 管理端 =====
route('POST', '/api/admin/login', (req, p, body) => {
  const a = ADMINS.find(x => x.username === body.username && x.password === body.password);
  if (!a) throw fail('账号或密码错误');
  const token = 'atk_' + crypto.randomBytes(12).toString('hex');
  tokens.set(token, { type: 'admin', id: a.username, role: a.role, name: a.name });
  return ok({ token, admin: { username: a.username, role: a.role, name: a.name } }, '登录成功');
});

route('GET', '/api/admin/me', (req) => {
  const s = authAdmin(req);
  return ok({ admin: { username: s.id, role: s.role, name: s.name } });
});

route('GET', '/api/admin/dashboard', (req) => {
  authAdmin(req);
  const today = fmtDate(new Date());
  const month = today.slice(0, 7);
  const paidNotRefunded = o => o.paidAt && !['CANCELLED', 'REFUNDED'].includes(o.status);
  const stats = {
    todayOrders: db.orders.filter(o => o.createdAt.slice(0, 10) === today).length,
    pendingAccept: db.orders.filter(o => o.status === 'PENDING_ACCEPT').length,
    toExecute: db.orders.filter(o => ['ACCEPTED', 'IN_SERVICE'].includes(o.status)).length,
    pendingRefunds: db.orders.filter(o => o.status === 'REFUNDING').length,
    pendingConsults: db.consults.filter(c => c.status === 'PENDING').length,
    monthRevenue: db.orders.filter(o => paidNotRefunded(o) && o.paidAt.slice(0, 7) === month).reduce((s, o) => s + o.totalAmount, 0),
    totalOrders: db.orders.length,
    totalUsers: db.users.length
  };
  // 近 7 日趋势
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = fmtDate(addDays(new Date(), -i));
    trend.push({
      date: d,
      orders: db.orders.filter(o => o.createdAt.slice(0, 10) === d).length,
      revenue: db.orders.filter(o => paidNotRefunded(o) && o.paidAt.slice(0, 10) === d).reduce((s, o) => s + o.totalAmount, 0)
    });
  }
  // 架次分布（营收）
  const tierDist = priceRulesView().tiers.map(t => ({
    name: `${t.drones} 架`,
    value: db.orders.filter(o => o.droneCount === t.drones && paidNotRefunded(o)).reduce((s, o) => s + o.totalAmount, 0)
  }));
  const latest = db.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(withUser);
  return ok({ stats, trend, tierDist, latest });
});

route('GET', '/api/admin/orders', (req, p, b, query) => {
  authAdmin(req);
  let list = db.orders.slice();
  if (query.status) { const sts = query.status.split(','); list = list.filter(o => sts.includes(o.status)); }
  if (query.keyword) {
    const kw = query.keyword.trim();
    list = list.filter(o => o.id.includes(kw) || (o.contact && o.contact.phone.includes(kw)) ||
      (withUser(o).user.nickname || '').includes(kw));
  }
  if (query.dateFrom) list = list.filter(o => o.performDate >= query.dateFrom);
  if (query.dateTo) list = list.filter(o => o.performDate <= query.dateTo);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(query.size) || 10));
  const total = list.length;
  list = list.slice((page - 1) * size, page * size);
  return ok({ list: list.map(withUser), total, page, size });
});

route('GET', '/api/admin/orders/:id', (req, p) => {
  authAdmin(req);
  const o = db.orders.find(x => x.id === p.id);
  if (!o) throw fail('订单不存在', 40400);
  return ok({ order: withUser(o) });
});

route('POST', '/api/admin/orders/:id/accept', (req, p) => {
  const s = authAdmin(req);
  const o = db.orders.find(x => x.id === p.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'PENDING_ACCEPT') throw fail('仅待接单订单可接单');
  o.status = 'ACCEPTED';
  o.acceptedBy = s.id; o.acceptedAt = nowIso();
  o.timeline.push({ time: o.acceptedAt, text: `操作员 ${s.name} 已接单，表演筹备中` });
  save();
  return ok({ order: withUser(o) }, '已接单');
});

route('POST', '/api/admin/orders/:id/reject', (req, p, body) => {
  const s = authAdmin(req);
  const o = db.orders.find(x => x.id === p.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'PENDING_ACCEPT') throw fail('仅待接单订单可拒单');
  const reason = (body.reason || '').trim();
  if (!reason) throw fail('请填写拒单原因');
  o.refund = {
    reason: `商户拒单：${reason}`, ratio: 1, applyAmount: o.totalAmount,
    status: 'APPROVED', prevStatus: 'PENDING_ACCEPT', auditBy: s.id, auditNote: reason,
    refundAmount: o.totalAmount, refundNo: `R${o.id.slice(1)}`,
    createdAt: nowIso(), auditedAt: nowIso()
  };
  o.status = 'REFUNDED';
  o.timeline.push({ time: nowIso(), text: `商户拒单：${reason}，已全额退款 ¥${o.totalAmount}` });
  save();
  return ok({ order: withUser(o) }, '已拒单并全额退款');
});

route('POST', '/api/admin/orders/:id/start', (req, p) => {
  const s = authAdmin(req);
  const o = db.orders.find(x => x.id === p.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'ACCEPTED') throw fail('仅已接单订单可开始执行');
  o.status = 'IN_SERVICE';
  o.startedAt = nowIso();
  o.timeline.push({ time: o.startedAt, text: `操作员 ${s.name} 确认表演开始执行` });
  save();
  return ok({ order: withUser(o) }, '表演已开始执行');
});

route('POST', '/api/admin/orders/:id/complete', (req, p, body) => {
  const s = authAdmin(req);
  const o = db.orders.find(x => x.id === p.id);
  if (!o) throw fail('订单不存在', 40400);
  if (o.status !== 'IN_SERVICE') throw fail('仅执行中订单可完成');
  o.status = 'COMPLETED';
  o.completedAt = nowIso();
  const photos = Array.isArray(body.photos) && body.photos.length ? body.photos
    : [1, 2, 3, 4].map(i => `/api/media/photo/${o.id}-${i}`);
  const videos = Array.isArray(body.videos) && body.videos.length ? body.videos : [`/api/media/video/${o.id}-1`];
  o.media = { photos, videos };
  o.timeline.push({ time: o.completedAt, text: `表演完成，回传现场照片 ${photos.length} 张` });
  save();
  return ok({ order: withUser(o) }, '订单已完成');
});

// ===== 咨询受理（管理端）：客服接待 → 创建派单 / 驳回 =====
// 真实推进只发生在这里：用户提交后单子停在 PENDING，客服接待后进 RECEIVED，创建派单后进 DISPATCHED，
// 用户确认后才进 CONFIRMED。每个动作都写时间轴，留痕可在双端查。
route('GET', '/api/admin/consults', (req, p, b, query) => {
  authAdmin(req);
  let list = db.consults.slice();
  if (query.status && query.status !== 'ALL') {
    const sts = query.status.split(',');
    list = list.filter(c => sts.includes(c.status));
  }
  if (query.keyword) {
    const kw = query.keyword.trim();
    list = list.filter(c => {
      const u = consultUser(c);
      return c.id.includes(kw) || (c.note || '').includes(kw) || (u.nickname || '').includes(kw) || (u.phone || '').includes(kw);
    });
  }
  list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  const counts = {};
  for (const k of Object.keys(CONSULT_STATUS_TEXT)) counts[k] = db.consults.filter(c => c.status === k).length;
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(query.size) || 10));
  const total = list.length;
  return ok({
    list: list.slice((page - 1) * size, page * size).map(withUserConsult),
    total, page, size, counts
  });
});

route('GET', '/api/admin/consults/:id', (req, p) => {
  authAdmin(req);
  const c = db.consults.find(x => x.id === p.id);
  if (!c) throw fail('咨询单不存在', 40400);
  return ok({ consult: withUserConsult(c) });
});

route('POST', '/api/admin/consults/:id/receive', (req, p, body) => {
  const s = authAdmin(req);
  const c = db.consults.find(x => x.id === p.id);
  if (!c) throw fail('咨询单不存在', 40400);
  if (c.status !== 'PENDING') throw fail('只有「待接待」的咨询单可以接待');
  const by = s.name || s.id;
  c.status = 'RECEIVED';
  c.receivedBy = by;
  c.receivedAt = nowIso();
  if (String(body.note || '').trim()) c.adminNote = String(body.note).trim().slice(0, 500);
  consultTimeline(c, by, `${by} 已接待，开始拟定方案与报价区间`);
  save();
  return ok({ consult: withUserConsult(c) }, '已接待');
});

route('POST', '/api/admin/consults/:id/dispatch', (req, p, body) => {
  const s = authAdmin(req);
  const c = db.consults.find(x => x.id === p.id);
  if (!c) throw fail('咨询单不存在', 40400);
  if (c.status === 'PENDING') throw fail('请先接待用户，再创建派单');
  if (c.status !== 'RECEIVED') throw fail('只有「已接待」的咨询单可以创建派单');
  if (c.dispatch) throw fail('本单已有派单，不能重复创建');
  const lo = Math.round(Number(body.quoteLo));
  const hi = Math.round(Number(body.quoteHi));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) throw fail('报价区间必须填写正数');
  if (lo > hi) throw fail('报价下限不能大于上限');
  const terms = body.terms || {};
  for (const t of DISPATCH_TERM_SPEC) {
    const v = terms[t.key];
    const empty = v == null || (typeof v === 'string' && !v.trim()) || (t.key === 'insuranceAmount' && !(Number(v) > 0));
    if (empty) throw fail(`「${t.label}」必须填写（缺项即合同约定不明）`);
  }
  const by = s.name || s.id;
  c.dispatch = {
    id: `D${fmtDate(new Date()).replace(/-/g, '')}-${String(db.consults.filter(x => x.dispatch).length + 1).padStart(4, '0')}`,
    consultId: c.id,
    createdBy: by,
    createdAt: nowIso(),
    status: 'PENDING_CONFIRM',
    confirmedAt: '', confirmedBy: '',
    quoteRange: [lo, hi],
    terms: { ...terms, insuranceAmount: Number(terms.insuranceAmount) },
    mustFill: DISPATCH_TERM_SPEC.map(t => ({ key: t.key, label: t.label, value: terms[t.key], required: true, note: t.note })),
    note: String(body.note || '').trim().slice(0, 500)
  };
  c.status = 'DISPATCHED';
  consultTimeline(c, by, `客服已创建派单 ${c.dispatch.id}，报价区间 ¥${lo.toLocaleString()} - ¥${hi.toLocaleString()}，等待用户确认`);
  save();
  return ok({ consult: withUserConsult(c) }, '派单已创建');
});

route('POST', '/api/admin/consults/:id/reject', (req, p, body) => {
  const s = authAdmin(req);
  const c = db.consults.find(x => x.id === p.id);
  if (!c) throw fail('咨询单不存在', 40400);
  if (['CONFIRMED', 'ABANDONED', 'REJECTED'].includes(c.status)) throw fail('当前状态不可驳回');
  const reason = String(body.reason || '').trim();
  if (!reason) throw fail('请填写驳回原因');
  const by = s.name || s.id;
  c.status = 'REJECTED';
  c.reject = { reason: reason.slice(0, 300), by, at: nowIso() };
  consultTimeline(c, by, `客服驳回：${c.reject.reason}`);
  save();
  return ok({ consult: withUserConsult(c) }, '已驳回');
});

route('GET', '/api/admin/refunds', (req, p, b, query) => {
  authAdmin(req);
  let list = db.orders.filter(o => o.refund);
  if (query.status) { const sts = query.status.split(','); list = list.filter(o => sts.includes(o.refund.status)); }
  list.sort((a, b) => (b.refund.createdAt || '').localeCompare(a.refund.createdAt || ''));
  return ok({ list: list.map(withUser) });
});

route('POST', '/api/admin/refunds/:orderId/approve', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const o = db.orders.find(x => x.id === p.orderId);
  if (!o || !o.refund) throw fail('退款单不存在', 40400);
  if (o.refund.status !== 'PENDING') throw fail('该退款已处理');
  const amount = body.amount != null ? Number(body.amount) : o.refund.applyAmount;
  if (!(amount > 0 && amount <= o.totalAmount)) throw fail(`退款金额需在 0 ~ ¥${o.totalAmount} 之间`);
  o.refund.status = 'APPROVED';
  o.refund.refundAmount = amount;
  o.refund.auditBy = s.id;
  o.refund.auditNote = (body.note || '同意退款').trim();
  o.refund.auditedAt = nowIso();
  o.refund.refundNo = `R${o.id.slice(1)}`;
  o.status = 'REFUNDED';
  o.timeline.push({ time: nowIso(), text: `退款审批通过，退款 ¥${amount}（原路返回）` });
  save();
  return ok({ order: withUser(o) }, '退款已批准');
});

route('POST', '/api/admin/refunds/:orderId/reject', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const o = db.orders.find(x => x.id === p.orderId);
  if (!o || !o.refund) throw fail('退款单不存在', 40400);
  if (o.refund.status !== 'PENDING') throw fail('该退款已处理');
  const note = (body.note || '').trim();
  if (!note) throw fail('请填写拒绝理由');
  o.refund.status = 'REJECTED';
  o.refund.auditBy = s.id;
  o.refund.auditNote = note;
  o.refund.auditedAt = nowIso();
  o.status = o.refund.prevStatus || 'PENDING_ACCEPT';
  o.timeline.push({ time: nowIso(), text: `退款申请被拒绝：${note}` });
  save();
  return ok({ order: withUser(o) }, '已拒绝退款');
});

route('GET', '/api/admin/schedule', (req, p, b, query) => {
  authAdmin(req);
  const month = query.month || fmtDate(new Date()).slice(0, 7);
  const days = [];
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  for (let i = 1; i <= count; i++) days.push(scheduleOf(`${month}-${pad(i)}`));
  return ok({
    month, days,
    defaultSlots: normSlots(db.config.defaultSlots),
    timeSlots: dictItems(profile.dictRefs.timeSlot).map(i => i.key),
    closedDates: db.config.closedDates
  });
});

route('POST', '/api/admin/schedule/close', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const date = body.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw fail('日期格式错误');
  if (body.closed) {
    // 已有订单的日期不能停工：客户已经付了钱锁定了这一天，单方面设为休整日等于毁约
    const n = bookedCount(date);
    if (n > 0) throw fail(`该日已有 ${n} 单订单，不能设为休整日；请先与客户协商改期或退款`);
    if (!db.config.closedDates.includes(date)) db.config.closedDates.push(date);
  } else {
    db.config.closedDates = db.config.closedDates.filter(d => d !== date);
  }
  save();
  return ok({ closedDates: db.config.closedDates }, body.closed ? '已设为休整日' : '已恢复营业');
});

route('GET', '/api/admin/users', (req) => {
  authAdmin(req);
  const list = db.users.map(u => {
    const os = db.orders.filter(o => o.userId === u.id);
    const paid = os.filter(o => o.paidAt && !['CANCELLED', 'REFUNDED'].includes(o.status));
    return {
      ...u,
      orderCount: os.length,
      totalSpent: paid.reduce((s, o) => s + o.totalAmount, 0),
      lastOrderAt: os.length ? os.map(o => o.createdAt).sort().pop() : ''
    };
  }).sort((a, b) => b.totalSpent - a.totalSpent);
  return ok({ list });
});

route('GET', '/api/admin/reviews', (req) => {
  authAdmin(req);
  const list = db.orders.filter(o => o.review)
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt))
    .map(o => ({
      orderId: o.id, user: withUser(o).user, stars: o.review.stars, content: o.review.content,
      createdAt: o.review.createdAt, droneCount: o.droneCount, occasion: o.occasion
    }));
  return ok({ list });
});

route('GET', '/api/admin/venues', (req) => { authAdmin(req); return ok({ list: db.venues }); });
route('POST', '/api/admin/venues', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  if (!body.name || !body.address) throw fail('请填写场地名称与地址');
  const v = { id: 'v' + Date.now(), name: body.name, address: body.address, lng: Number(body.lng) || 0, lat: Number(body.lat) || 0, enabled: body.enabled !== false };
  db.venues.push(v); save();
  return ok({ venue: v }, '已新增场地');
});
route('PUT', '/api/admin/venues/:id', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const v = db.venues.find(x => x.id === p.id);
  if (!v) throw fail('场地不存在', 40400);
  Object.assign(v, { name: body.name ?? v.name, address: body.address ?? v.address, lng: Number(body.lng) ?? v.lng, lat: Number(body.lat) ?? v.lat, enabled: body.enabled ?? v.enabled });
  save();
  return ok({ venue: v }, '已保存');
});
route('DELETE', '/api/admin/venues/:id', (req, p) => {
  const s = authAdmin(req); requireAdminRole(s);
  const i = db.venues.findIndex(x => x.id === p.id);
  if (i < 0) throw fail('场地不存在', 40400);
  db.venues.splice(i, 1); save();
  return ok({}, '已删除');
});

route('GET', '/api/admin/config', (req) => {
  authAdmin(req);
  return ok({
    dailyLimit: db.config.dailyLimit,
    defaultSlots: normSlots(db.config.defaultSlots),
    bookingWindowDays: db.config.bookingWindowDays,
    payExpireMinutes: db.config.payExpireMinutes,
    customTextPrice: db.config.customTextPrice,
    customLogoPrice: db.config.customLogoPrice,
    closedDates: db.config.closedDates
  });
});
route('PUT', '/api/admin/config', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const checks = {
    dailyLimit: [1, 10, '每日限单数需在 1-10 之间'],
    bookingWindowDays: [7, 365, '预约窗口需在 7-365 天之间'],
    payExpireMinutes: [1, 120, '支付时限需在 1-120 分钟之间'],
    customTextPrice: [0, 100000, '定制文字价格需在 0-100000 之间'],
    customLogoPrice: [0, 100000, 'LOGO 定制价格需在 0-100000 之间']
  };
  for (const [field, [min, max, msg]] of Object.entries(checks)) {
    if (body[field] == null) continue;
    const n = Number(body[field]);
    if (!Number.isFinite(n) || n < min || n > max) throw fail(msg);
    db.config[field] = n;
  }
  // 全局默认可接单时段（档期页的默认值来源）——自由配置的整点区间，不再受字典枚举限制
  if (body.defaultSlots !== undefined) {
    if (!Array.isArray(body.defaultSlots)) throw fail('默认时段参数错误');
    for (const x of body.defaultSlots) {
      if (!normSlot(x)) throw fail(`时段「${x}」格式不正确：时段为整点区间，如 19:00-20:00`);
    }
    const v = [...new Set(normSlots(body.defaultSlots))].sort();
    if (!v.length) throw fail('默认接单时段不能为空');
    if (v.length > 12) throw fail('默认接单时段最多 12 段');
    const selfOverlap = findSlotOverlap(v);
    if (selfOverlap) {
      throw fail(`默认时段「${selfOverlap[0]}」与「${selfOverlap[1]}」重叠：同一时间只能接一单，请改成不重叠的区间`);
    }
    db.config.defaultSlots = v;
  }
  save();
  return ok({}, '配置已保存');
});

// ===== 档期：单日限单覆盖 / 节假日标注 =====
route('POST', '/api/admin/schedule/limit', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const date = body.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw fail('日期格式错误');
  if (body.limit == null) {
    delete db.config.dayOverrides[date]; // 清除覆盖，恢复默认
  } else {
    const n = Number(body.limit);
    if (!(n >= 0 && n <= 10)) throw fail('单日限单数需在 0-10 之间（0 表示当日不可预约）');
    db.config.dayOverrides[date] = { limit: n };
  }
  save();
  return ok({ day: scheduleOf(date) }, body.limit == null ? '已恢复默认限单' : '已设置单日限单');
});

// ===== 档期：设置「可接单时段」（单日 / 多选全选月-季-年，共用同一个接口）=====
// body.slots = null  → 恢复全局默认时段
// body.slots = []    → 当日不接单（停接）
// body.slots = [...] → 只开放这些整点区间（"19:00-20:00"）；可任意增删，不受字典枚举限制
// 已有订单占用的时段自动保留（不能单方面撤回已经承诺给客户的时段）
route('POST', '/api/admin/schedule/slots', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const dates = Array.isArray(body.dates) ? body.dates : [];
  if (!dates.length) throw fail('请先选择要配置的日期');
  if (dates.length > 400) throw fail('单次最多配置 400 天');
  const mode = body.mode === 'bulk' ? 'bulk' : 'single';
  const reset = body.slots == null;
  if (!reset && !Array.isArray(body.slots)) throw fail('时段参数错误');
  let wanted = null;
  if (!reset) {
    // 只允许整点区间：19:30-20:30 这类半点值直接拒绝，不静默截断（免得管理员以为存上了）
    for (const x of body.slots.slice(0, 20)) {
      if (!normSlot(x)) throw fail(`时段「${x}」格式不正确：时段为整点区间，如 19:00-20:00`);
    }
    wanted = [...new Set(normSlots(body.slots))].sort();
    if (wanted.length > 12) throw fail('单日最多 12 个时段');
    // 提交的这一组时段自己不许重叠（相同/部分覆盖都拒）：一个时段=一个名额，重叠等于同一时间放两单
    const selfOverlap = findSlotOverlap(wanted);
    if (selfOverlap) {
      throw fail(
        `时段「${selfOverlap[0]}」与「${selfOverlap[1]}」重叠：同一时间只能接一单，请改成不重叠的区间` +
        `（首尾相接如 19:00-20:00 与 20:00-21:00 是允许的）`
      );
    }
  }
  // 日期之间不许互相覆盖：批量配置不能改「已经单独配置过时段」的日期（否则一次全选就把前面的配置冲掉），
  // 休整日也不能配时段（语义冲突：不接单的日子配接单时段没有意义）。单日编辑自己那天的配置是允许的。
  // 「恢复默认时段」只是清掉该日配置，不算配置时段，休整日也可以清。
  const conflicts = new Map();
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const reasons = [];
    if (!reset) {
      if (mode === 'bulk' && db.config.daySlots && db.config.daySlots[d]) reasons.push('已单独配置过时段');
      if (db.config.closedDates.includes(d)) reasons.push('休整日');
    }
    if (reasons.length) conflicts.set(d, reasons);
  }
  if (conflicts.size) {
    const head = [...conflicts].slice(0, 3).map(([d, r]) => `${d}（${r.join('、')}）`).join('、');
    const more = conflicts.size > 3 ? ` 等 ${conflicts.size} 天` : '';
    const bulkOwn = [...conflicts.values()].some(r => r.includes('已单独配置过时段'));
    throw fail(
      `以下日期不能${mode === 'bulk' ? '批量' : ''}配置：${head}${more}；` +
      `${bulkOwn ? '已单独配置的日期请回到该日单日修改；' : ''}休整日请先恢复营业再配置时段`
    );
  }
  const defJson = JSON.stringify([...new Set(normSlots(db.config.defaultSlots))].sort());
  const blocked = [];
  let updated = 0;
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    let target = wanted;
    if (target) {
      const booked = bookedSlotsOf(d);
      const keep = target.slice();
      for (const slot of Object.keys(booked)) {
        if (!keep.includes(slot)) { blocked.push({ date: d, slot, orders: booked[slot] }); keep.push(slot); }
      }
      target = [...new Set(keep)].sort();
      // 自动保留下来的已订时段可能和新配的时段重叠（例如已订 20:00-21:00，管理员想开 19:00-21:00）：
      // 不能放行 —— 那等于把客户已经买断的半小时又卖一次。这类只能走改期/退款。
      const keptOverlap = findSlotOverlap(target);
      if (keptOverlap) {
        const bookedOne = keptOverlap.find(x => booked[x]);
        throw fail(
          bookedOne
            ? `${d} 的时段「${keptOverlap[0]}」与「${keptOverlap[1]}」重叠，其中「${bookedOne}」已有订单；` +
              `请避开已订时段再配置，或先走改期/退款流程`
            : `${d} 的时段「${keptOverlap[0]}」与「${keptOverlap[1]}」重叠`
        );
      }
    }
    if (target == null || JSON.stringify(target) === defJson) delete db.config.daySlots[d];
    else db.config.daySlots[d] = target;
    updated++;
  }
  save();
  return ok({ updated, blocked }, reset ? '已恢复默认时段' : `已更新 ${updated} 天的接单时段`);
});

route('POST', '/api/admin/schedule/holiday', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const date = body.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw fail('日期格式错误');
  const name = (body.name || '').trim().slice(0, 10);
  if (name) db.config.customHolidays[date] = name;
  else delete db.config.customHolidays[date];
  save();
  return ok({ day: scheduleOf(date) }, name ? `已标注为「${name}」` : '已取消特殊日标注');
});

// ===== 字典管理（若依风格） =====
function findDict(type) {
  const d = db.dicts.find(x => x.type === type);
  if (!d) throw fail('字典类型不存在', 40400);
  return d;
}

route('GET', '/api/admin/dict', (req) => {
  authAdmin(req);
  return ok({
    list: db.dicts.map(d => ({
      type: d.type, name: d.name, remark: d.remark || '',
      system: !!d.system, itemCount: d.items.length,
      enabledCount: d.items.filter(i => i.status !== 0).length
    }))
  });
});
route('POST', '/api/admin/dict/types', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const type = (body.type || '').trim();
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(type)) throw fail('类型标识需为小写字母开头的英文/数字/下划线（2-32 位）');
  if (db.dicts.some(d => d.type === type)) throw fail('类型标识已存在');
  if (!(body.name || '').trim()) throw fail('请填写类型名称');
  const d = { type, name: body.name.trim().slice(0, 20), remark: (body.remark || '').trim().slice(0, 100), system: false, items: [] };
  db.dicts.push(d); save();
  return ok({ dict: d }, '已新增字典类型');
});
route('PUT', '/api/admin/dict/types/:type', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const d = findDict(p.type);
  if (body.name != null && body.name.trim()) d.name = body.name.trim().slice(0, 20);
  if (body.remark != null) d.remark = body.remark.trim().slice(0, 100);
  save();
  return ok({}, '已保存');
});
route('DELETE', '/api/admin/dict/types/:type', (req, p) => {
  const s = authAdmin(req); requireAdminRole(s);
  const d = findDict(p.type);
  if (d.system) throw fail('系统内置字典被业务引用，不可删除（可停用或修改字典项）');
  db.dicts = db.dicts.filter(x => x.type !== p.type);
  save();
  return ok({}, '已删除字典类型');
});
route('GET', '/api/admin/dict/:type/items', (req, p) => {
  authAdmin(req);
  const d = findDict(p.type);
  return ok({ type: d.type, name: d.name, remark: d.remark || '', system: !!d.system, list: d.items });
});
route('POST', '/api/admin/dict/:type/items', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const d = findDict(p.type);
  const key = String(body.key ?? '').trim();
  if (!key) throw fail('请填写键');
  if (d.items.some(i => i.key === key)) throw fail(`键「${key}」已存在`);
  if (!(body.label || '').trim()) throw fail('请填写标签');
  const item = {
    id: `${d.type}_${Date.now().toString(36)}`,
    key: key.slice(0, 40), label: body.label.trim().slice(0, 40),
    value: Number(body.value) || 0,
    extra: (body.extra || '').trim().slice(0, 100),
    sort: Number(body.sort) || d.items.length + 1,
    status: body.status === 0 ? 0 : 1
  };
  d.items.push(item); save();
  return ok({ item }, '已新增字典项');
});
route('PUT', '/api/admin/dict/:type/items/:id', (req, p, body) => {
  const s = authAdmin(req); requireAdminRole(s);
  const d = findDict(p.type);
  const item = d.items.find(i => i.id === p.id);
  if (!item) throw fail('字典项不存在', 40400);
  if (body.key != null && String(body.key).trim() !== item.key) {
    const key = String(body.key).trim();
    if (d.items.some(i => i.key === key && i.id !== item.id)) throw fail(`键「${key}」已存在`);
    item.key = key.slice(0, 40);
  }
  if (body.label != null && body.label.trim()) item.label = body.label.trim().slice(0, 40);
  if (body.value != null) item.value = Number(body.value) || 0;
  if (body.extra != null) item.extra = body.extra.trim().slice(0, 100);
  if (body.sort != null) item.sort = Number(body.sort) || item.sort;
  if (body.status != null) item.status = body.status === 0 ? 0 : 1;
  save();
  return ok({ item }, '已保存');
});
route('DELETE', '/api/admin/dict/:type/items/:id', (req, p) => {
  const s = authAdmin(req); requireAdminRole(s);
  const d = findDict(p.type);
  const i = d.items.findIndex(x => x.id === p.id);
  if (i < 0) throw fail('字典项不存在', 40400);
  d.items.splice(i, 1); save();
  return ok({}, '已删除字典项');
});

route('POST', '/api/config/reset', (req) => {
  const s = authAdmin(req); requireAdminRole(s);
  db = buildSeed(); save();
  return ok({}, '演示数据已重置');
});

// ---------------- HTTP 服务 ----------------
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

function makeHandler(STATIC_DIR) {
return async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    sweepExpired();
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const keys = [];
      const rx = new RegExp('^' + r.pattern.replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
      const mth = url.pathname.match(rx);
      if (!mth) continue;
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(mth[i + 1]); });
      const result = await r.handler(req, params, body, query);
      if (result && result.raw != null) {
        res.writeHead(200, { 'Content-Type': result.contentType || 'text/plain; charset=utf-8' });
        res.end(result.raw);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      }
      return;
    }
    if (url.pathname === '/api') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(ok({ name: `${profile.brand.appName} Mock Server`, version: 2, routes: routes.map(r => `${r.method} ${r.pattern}`) })));
      return;
    }
    // 静态托管前端构建产物（若存在）：同源访问，API 无需代理
    if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
      let fp = path.normalize(path.join(STATIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
      if (!fp.startsWith(STATIC_DIR)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(STATIC_DIR, 'index.html');
      const ext = path.extname(fp).toLowerCase();
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }[ext] || 'application/octet-stream';
      // HTML 不缓存（避免旧 index.html 引用已删除的旧构建资源）；带 hash 的静态资源可长缓存
      const cacheControl = ext === '.html' ? 'no-store' : 'public, max-age=86400';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cacheControl });
      fs.createReadStream(fp).pipe(res);
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(ok({ name: `${profile.brand.appName} Mock Server`, version: 2, routes: routes.map(r => `${r.method} ${r.pattern}`) })));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 40404, msg: `接口不存在：${req.method} ${url.pathname}` }));
  } catch (e) {
    const code = e.bizCode || 50000;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const payload = { code, msg: e.message || '服务器错误' };
    if (e.bizData !== undefined) payload.data = e.bizData;
    res.end(JSON.stringify(payload));
  }
};
}

load();
// 端口被占用时给出友好提示，而不是一屏英文堆栈
function listenOrExplain(server, port, label, optional) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[mock] 端口 ${port} 已被占用 —— 说明已经有一个 Mock Server 在运行。`);
      console.log(`[mock] 直接访问 http://localhost:${port} 即可，无需重复启动。`);
      console.log(`[mock] 如需重启：先运行 taskkill /F /IM node.exe（会停掉所有 node 进程），再启动本服务。`);
      // 管理端静态端口允许被 admin 的 vite dev server 占用（开发时 8080 归 vite，API 仍在 8090）
      if (optional) return;
      process.exit(0);
    }
    throw err;
  });
  server.listen(port, () => {
    console.log(`[mock] ${label}: http://localhost:${port}`);
  });
}
// 8090：API + H5 构建产物（用户端）
listenOrExplain(http.createServer(makeHandler(process.env.H5_DIST_DIR || path.join(__dirname, '..', 'h5', 'dist', 'build', 'h5'))), PORT, 'API + 用户端 H5');
// 8080：API + 管理端构建产物（若存在）
const ADMIN_PORT = process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : 8080;
const ADMIN_DIST = process.env.ADMIN_DIST_DIR || path.join(__dirname, '..', 'admin', 'dist');
if (fs.existsSync(ADMIN_DIST)) {
  listenOrExplain(http.createServer(makeHandler(ADMIN_DIST)), ADMIN_PORT, 'API + 管理端(构建产物)', true);
}
