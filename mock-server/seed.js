// 通用派单系统 - Mock Server 种子数据（当前装配：无人机编队表演业务档案）
// 所有日期均相对“今天”生成，保证任何时间演示都可用
// 换业务：复制 mock-server/biz/drone.js 为新业务档案，改下面这一行 require 即可
'use strict';

const profile = require('./biz/drone');
const { splitInstallments } = require('./contracts');

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
function iso(d) { return d.toISOString(); }

// ---------- 基础配置（来自业务档案） ----------
const PRICE_RULES = profile.pricing

// 时段是「整点区间」："19:00" → "19:00-20:00"。种子里的单点时刻按一小时区间解释，
// 与 server.js 的 normSlot 同一口径（这里不能 import server.js，避免循环依赖）。
function slotId(v) {
  const raw = String(v || '20:00').trim();
  const bad = raw.match(/^([01]\d|2[0-3])-(([01]\d|2[0-3]):00)$/);
  if (bad) return `${bad[1]}:00-${bad[2]}`;
  const m = raw.match(/^([01]\d|2[0-3]):00$/);
  if (!m) return raw;
  const h = Number(m[0].slice(0, 2));
  return `${m[0]}-${h >= 23 ? '24:00' : String(h + 1).padStart(2, '0') + ':00'}`;
}
;
const REFUND_RULES = profile.refundRules;

// ---------- 字典（若依风格：类型 + 键值项，由业务档案的 dictRefs 驱动） ----------
// 字典项结构：{ id, key, label, value, extra, sort, status }  status: 1 启用 / 0 停用
// value 语义由各类型约定：档位/时长/附加服务=价格(元)，退款阶梯=退款比例(0-1)
function buildDicts() {
  const R = profile.dictRefs;
  const mk = (type, items) => items.map((it, i) => ({ id: `${type}_${i + 1}`, sort: i + 1, status: 1, extra: '', value: 0, ...it }));
  return [
    {
      type: R.tier, name: '架次档位', system: true,
      remark: '下单可选的规格档位；值=基础价（元），说明=适用场景',
      items: mk(R.tier, PRICE_RULES.tiers.map(t => ({ key: String(t.drones), label: `${t.drones} 架`, value: t.price, extra: t.desc })))
    },
    {
      type: R.duration, name: '表演时长', system: true,
      remark: '可选服务时长；值=在基础价上的加价（元），0 表示含在基础价内',
      items: mk(R.duration, PRICE_RULES.durations.map(d => ({ key: String(d.minutes), label: d.label, value: d.extra })))
    },
    {
      type: R.pattern, name: '预设图案', system: true,
      remark: 'H5 下单页可选的预设图案（任选，不加价；本业务特有选项）',
      items: mk(R.pattern, PRICE_RULES.patterns.map(p => ({ key: p.key, label: p.label })))
    },
    {
      type: R.addon, name: '附加服务', system: true,
      remark: '下单可叠加的增值服务；值=加价（元）',
      items: mk(R.addon, PRICE_RULES.addons.map(a => ({ key: a.key, label: a.label, value: a.price })))
    },
    {
      type: R.timeSlot, name: '演出时段', system: true,
      remark: '每日可预约的服务开始时间（HH:mm）',
      items: mk(R.timeSlot, PRICE_RULES.timeSlots.map(t => ({ key: t, label: t })))
    },
    {
      type: R.refundRule, name: '退款阶梯', system: true,
      remark: '键=距服务小时数下限，值=退款比例（0-1）；按小时数从高到低匹配第一条',
      items: mk(R.refundRule, REFUND_RULES.map(r => ({ key: String(r.minHours), label: r.label, value: r.ratio })))
    },
    {
      type: 'order_status', name: '订单状态', system: false,
      remark: '订单生命周期状态枚举（通用字典用法示例，可按业务扩展）',
      items: mk('order_status', [
        { key: 'PENDING_PAY', label: '待支付' }, { key: 'PENDING_ACCEPT', label: '待接单' },
        { key: 'ACCEPTED', label: '已接单' }, { key: 'IN_SERVICE', label: '执行中' },
        { key: 'COMPLETED', label: '已完成' }, { key: 'REVIEWED', label: '已评价' },
        { key: 'CANCELLED', label: '已取消' }, { key: 'REFUNDING', label: '退款中' },
        { key: 'REFUNDED', label: '已退款' }
      ])
    }
  ];
}

// ---------- 内置法定节假日 ----------
// 原型使用今年默认数据；正式系统由后台定时任务每年从国务院公布数据更新
// （以下为 2026 年近似安排，仅供演示）
const HOLIDAYS = {
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节', '2026-02-18': '春节',
  '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节',
  '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节', '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
  '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
  '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节', '2026-10-04': '国庆节',
  '2026-10-05': '国庆节', '2026-10-06': '国庆节', '2026-10-07': '国庆节',
  '2027-01-01': '元旦', '2027-01-02': '元旦', '2027-01-03': '元旦',
  '2027-02-05': '春节', '2027-02-06': '春节', '2027-02-07': '春节', '2027-02-08': '春节',
  '2027-02-09': '春节', '2027-02-10': '春节', '2027-02-11': '春节'
};

const VENUES = [
  { id: 'v1', name: '滨江世纪广场', address: '杭州市滨江区江南大道 100 号', lng: 120.212, lat: 30.208, enabled: true },
  { id: 'v2', name: '奥体中心体育场', address: '杭州市萧山区博奥路 588 号', lng: 120.235, lat: 30.231, enabled: true },
  { id: 'v3', name: '西湖文化广场', address: '杭州市拱墅区环城北路 47 号', lng: 120.165, lat: 30.277, enabled: true },
  { id: 'v4', name: '钱江新城城市阳台', address: '杭州市上城区解放东路 58 号', lng: 120.214, lat: 30.246, enabled: true },
  { id: 'v5', name: '未来科技城中央公园', address: '杭州市余杭区文一西路 998 号', lng: 119.998, lat: 30.279, enabled: true }
];

// 模拟高德地址联想 POI 池
const POI_POOL = [
  { name: '星光大道广场', address: '杭州市滨江区星光大道 288 号', lng: 120.208, lat: 30.206 },
  { name: '金沙湖公园', address: '杭州市钱塘区金沙大道 600 号', lng: 120.326, lat: 30.305 },
  { name: '西溪湿地东门广场', address: '杭州市西湖区天目山路 518 号', lng: 120.062, lat: 30.274 },
  { name: '武林广场', address: '杭州市拱墅区体育场路 208 号', lng: 120.167, lat: 30.273 },
  { name: '黄龙体育中心', address: '杭州市西湖区黄龙路 1 号', lng: 120.134, lat: 30.268 },
  { name: '钱塘江大桥观景平台', address: '杭州市西湖区之江路 16 号', lng: 120.142, lat: 30.201 },
  { name: '良渚文化村艺术中心', address: '杭州市余杭区良渚街道美丽洲路 1 号', lng: 120.002, lat: 30.384 },
  { name: '湘湖城山广场', address: '杭州市萧山区湘湖路 132 号', lng: 120.218, lat: 30.158 }
];

const ADMINS = [
  { username: 'admin', password: 'admin123', role: 'ADMIN', name: '系统管理员', avatar: '' },
  { username: 'operator', password: 'operator123', role: 'OPERATOR', name: '调度操作员', avatar: '' }
];

const USERS = [
  { id: 'u1001', nickname: '追风的李先生', phone: '138****6601', gender: 1 },
  { id: 'u1002', nickname: '甜甜圈小姐', phone: '137****2209', gender: 0 },
  { id: 'u1003', nickname: '星辰大海', phone: '139****8832', gender: 1 },
  { id: 'u1004', nickname: 'Ann', phone: '186****3315', gender: 0 },
  { id: 'u1005', nickname: '老王不老王', phone: '150****7742', gender: 1 },
  { id: 'u1006', nickname: '一颗奶糖', phone: '159****1180', gender: 0 }
].map(u => ({ ...u, avatar: `/api/media/avatar/${u.id}`, createdAt: iso(addDays(new Date(), -90)) }));

// ---------- 订单种子 ----------
// 便捷构造器
function tierOf(drones) { return PRICE_RULES.tiers.find(t => t.drones === drones); }
function durOf(min) { return PRICE_RULES.durations.find(d => d.minutes === min); }

function buildPrice(o) {
  const detail = [{ label: `${o.droneCount} 架基础价（含 10 分钟）`, amount: tierOf(o.droneCount).price }];
  const d = durOf(o.duration);
  if (d.extra > 0) detail.push({ label: `时长 ${o.duration} 分钟加价`, amount: d.extra });
  if (o.customText) detail.push({ label: `定制文字「${o.customText}」`, amount: PRICE_RULES.customTextPrice });
  if (o.customLogo) detail.push({ label: 'LOGO/图片定制', amount: PRICE_RULES.customLogoPrice });
  for (const k of o.addons || []) {
    const a = PRICE_RULES.addons.find(x => x.key === k);
    if (a) detail.push({ label: a.label, amount: a.price });
  }
  return { detail, total: detail.reduce((s, i) => s + i.amount, 0) };
}

function mkOrder(seq, now, spec) {
  const created = addDays(now, -spec.createdDaysAgo || 0);
  created.setHours(10 + (seq % 8), (seq * 17) % 60, 0, 0);
  const performDate = fmtDate(addDays(now, spec.performInDays));
  const { detail, total } = buildPrice(spec);
  const id = `D${fmtDate(created).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
  const paid = !['PENDING_PAY', 'CANCELLED_UNPAID'].includes(spec.status);
  const o = {
    id,
    userId: spec.userId,
    status: spec.status,
    droneCount: spec.droneCount,
    duration: spec.duration,
    patternPreset: spec.patternPreset || ['heart'],
    customText: spec.customText || '',
    customLogo: spec.customLogo || '',
    addons: spec.addons || [],
    occasion: spec.occasion || '',
    performDate,
    timeSlot: slotId(spec.timeSlot || '20:00'),
    venue: spec.venue,
    contact: spec.contact,
    priceDetail: detail,
    totalAmount: total,
    payChannel: paid ? (seq % 2 ? 'WECHAT' : 'ALIPAY') : '',
    payTradeNo: paid ? `${seq % 2 ? 'WX' : 'ALI'}${fmtDate(created).replace(/-/g, '')}${String(100000 + seq)}` : '',
    paidAt: paid ? new Date(created.getTime() + 5 * 60000).toISOString() : '',
    acceptedBy: '', acceptedAt: '', startedAt: '', completedAt: '',
    media: { photos: [], videos: [] },
    review: null,
    refund: null,
    cancelReason: '',
    timeline: [{ time: iso(created), text: '提交订单' }],
    createdAt: iso(created),
    expireAt: new Date(created.getTime() + PRICE_RULES.payExpireMinutes * 60000).toISOString()
  };
  const paidTime = o.paidAt;
  if (paid) o.timeline.push({ time: paidTime, text: `支付成功（${o.payChannel === 'WECHAT' ? '微信支付' : '支付宝'}）` });
  if (['ACCEPTED', 'IN_SERVICE', 'COMPLETED', 'REVIEWED'].includes(spec.status)) {
    o.acceptedBy = 'operator';
    o.acceptedAt = new Date(created.getTime() + 2 * 3600000).toISOString();
    o.timeline.push({ time: o.acceptedAt, text: '操作员已接单，表演筹备中' });
  }
  if (['IN_SERVICE', 'COMPLETED', 'REVIEWED'].includes(spec.status)) {
    o.startedAt = `${performDate}T${o.timeSlot.slice(0, 5)}:00+08:00`;
    o.timeline.push({ time: o.startedAt, text: '表演开始执行' });
  }
  if (['COMPLETED', 'REVIEWED'].includes(spec.status)) {
    o.completedAt = `${performDate}T${o.timeSlot.slice(0, 2)}:40:00+08:00`;
    o.media = {
      photos: [1, 2, 3, 4].map(i => `/api/media/photo/${id}-${i}`),
      videos: [`/api/media/video/${id}-1`]
    };
    o.timeline.push({ time: o.completedAt, text: '表演完成，现场照片已回传' });
  }
  return o;
}

// ---------- 咨询单种子（2026-11-02 用户要求：咨询派单必须由人工客服在管理端审核确认） ----------
// 示例单属于「其他用户」，不占演示登录用户 u-demo 的进行中名额；
// 管理端「咨询受理」因此有真实待办可审：待接待 1 张、已接待 1 张、已派单待用户确认 1 张。
// 状态机与文案见 docs/consult-workflow.md，全流程只能由「客服接待 → 客服派单 → 用户确认」推进。
const CONSULT_STATUS_TEXT = {
  PENDING: '待客服接待', RECEIVED: '客服已接待·拟方案', DISPATCHED: '已派单·待你确认',
  CONFIRMED: '已确认派单', REJECTED: '客服已驳回', ABANDONED: '已自动废弃'
};

// 派单上必须写清的六项（缺一项就是合同里的「约定不明」）。
// 管理端创建派单时逐项填写；这里既是种子数据的取值，也是接口校验用的规格表（键、标签、依据说明）。
const DISPATCH_TERMS = {
  approvalOwner: '承飞方（乙方）负责空域申请与备案',
  approvalFailLiability: '明确约定：乙方未按时取得批复 → 乙方全责退还已付费用',
  subcontractApproved: '是（甲方书面同意）',
  depositNature: '预付款（未约定定金条款，不适用定金罚则）',
  insuranceAmount: 1000000,
  scaleBasis: '投入规模（实际投入的机队数）；同时升空峰值由编舞决定，不作为计价与验收口径'
};
const DISPATCH_TERM_SPEC = [
  { key: 'approvalOwner', label: '审批义务承担主体', note: '' },
  { key: 'approvalFailLiability', label: '审批失败责任划分', note: '约定不明 → 双方共同承担、互不支付违约金或赔偿利息（(2025)鄂01民终396号）' },
  { key: 'subcontractApproved', label: '转包是否经甲方书面同意', note: '未经书面同意的转包费用可能不被认定为共同履约成本' },
  { key: 'depositNature', label: '签约节点是定金还是预付款', note: '未明确约定「定金」条款，解除时只能退还未履行部分，无法适用定金罚则（民法典第五百八十七条）' },
  { key: 'insuranceAmount', label: '责任保险保额', note: '行业实操要求不低于 100 万元' },
  { key: 'scaleBasis', label: '计价与验收按投入规模还是峰值', note: '派单只写投入规模（实际投入的机队数）；同时升空峰值由编舞决定，不作为计价与验收口径' }
];

function buildConsults(now) {
  const specs = [
    {
      userId: 'u1001', status: 'PENDING', vIdx: 0, inDays: 5, slot: '20:00', drones: 200, audience: 600,
      total: 38000, conclusion: 'SURVEY', conclusionText: '无实测数据，需实地勘察（判定结论以现场勘察为准）', daysAgo: 1,
      note: '现场有 10kV 架空线，已联系物业确认',
      reasons: [{ key: 'SURVEY', label: '无实测数据，需实地勘察', why: '判定结论以现场勘察为准，勘察前不能出正式报价' }]
    },
    {
      userId: 'u1004', status: 'RECEIVED', vIdx: 1, inDays: 6, slot: '19:00', drones: 300, audience: 900,
      total: 52000, conclusion: 'FIRST_EVAL', conclusionText: '初次活动，须做官方可行性评估', daysAgo: 2,
      reasons: [{ key: 'FIRST_EVAL', label: '官方可行性评估未做过', why: '初次活动前须由公安机关会同空管、气象、无线电管理等部门评估' }]
    },
    {
      userId: 'u1006', status: 'DISPATCHED', vIdx: 2, inDays: 4, slot: '21:00', drones: 400, audience: 1200,
      total: 68000, conclusion: 'CROWD', conclusionText: '1000 人以上，须办大型群众性活动安全许可', daysAgo: 3,
      reasons: [{ key: 'CROWD', label: '1000 人以上大型群众性活动', why: '需安全许可证，承办者应在活动日 20 日前向公安机关申请' }]
    }
  ];
  return specs.map((spec, i) => {
    const submitted = iso(addDays(now, -spec.daysAgo));
    const v = VENUES[spec.vIdx];
    const at = (mins) => new Date(new Date(submitted).getTime() + mins * 60000).toISOString();
    const c = {
      id: `C${fmtDate(addDays(now, -spec.daysAgo)).replace(/-/g, '')}-${String(i + 1).padStart(4, '0')}`,
      userId: spec.userId, status: spec.status, statusText: CONSULT_STATUS_TEXT[spec.status],
      submittedAt: submitted, updatedAt: submitted, note: spec.note || '',
      need: {
        droneCount: spec.drones, duration: 10, contentMode: 'template', screens: 'mid',
        dimension: '2D', motion: 'static', matrix: 1, addons: [], audience: spec.audience
      },
      venue: { id: v.id, name: v.name, type: 'preset', address: v.address, lng: v.lng, lat: v.lat },
      judgment: { conclusion: spec.conclusion, conclusionText: spec.conclusionText, checks: [] },
      performDate: fmtDate(addDays(now, spec.inDays)), timeSlot: slotId(spec.slot),
      reasons: spec.reasons,
      quote: {
        total: spec.total, lo: Math.round(spec.total * 0.9), hi: Math.round(spec.total * 1.15),
        fee: { payable: 0, factors: [], waived: { condition: '', effect: '' } }
      },
      dispatch: null, supersede: null, reject: null,
      timeline: [{ at: submitted, by: '用户', text: '提交咨询单，等待客服接待' }]
    };
    if (spec.status === 'RECEIVED' || spec.status === 'DISPATCHED') {
      c.receivedBy = '调度操作员';
      c.receivedAt = at(45);
      c.updatedAt = c.receivedAt;
      c.timeline.push({ at: c.receivedAt, by: '调度操作员', text: '客服已接待，正在拟定方案与报价区间' });
    }
    if (spec.status === 'DISPATCHED') {
      const createdAt = at(240);
      const terms = { ...DISPATCH_TERMS };
      c.dispatch = {
        id: `D${fmtDate(addDays(now, -spec.daysAgo)).replace(/-/g, '')}-${String(1000 + i)}`,
        createdBy: '调度操作员', createdAt,
        status: 'PENDING_CONFIRM', confirmedAt: '', confirmedBy: '',
        quoteRange: [Math.round(spec.total * 0.95), Math.round(spec.total * 1.1)],
        terms,
        mustFill: DISPATCH_TERM_SPEC.map(t => ({ key: t.key, label: t.label, value: terms[t.key] ?? null, required: true, note: t.note })),
        note: '按 400 架 + 10 分钟定制文字排期，含现场勘察一次'
      };
      c.updatedAt = createdAt;
      c.timeline.push({
        at: createdAt, by: '调度操作员',
        text: `客服已创建派单 ${c.dispatch.id}，报价区间 ¥${c.dispatch.quoteRange[0].toLocaleString()} - ¥${c.dispatch.quoteRange[1].toLocaleString()}，等待用户确认`
      });
    }
    return c;
  });
}

// ---------- 电子合同种子 ----------
// 与正式 drone-dispatch-web 的 contract/mock.ts 同构：合同与订单 1:1，有效订单创建即生成合同草稿；
// 默认两期 50%+50%（预付款/尾款）。结束态区分 VOID 作废（无资金）/ TERMINATED 终止（带结算退款）/
// RESCHEDULED 改期（非终态，款项不退）。种子覆盖文档要求的全部演示形态。
const PARTY_B = { name: '杭州承飞科技有限公司', creditCode: '91330108MA2H7XK51P' };
const CONTRACT_TEMPLATE_CODE = 'STANDARD_PERFORMANCE';
const CONTRACT_TEMPLATE_VERSION = 'v1.0';
const CONTRACT_PAYMENT_TERMS =
  '签约付 50% 预付款，演出前 7 天付清尾款（里程碑分期，客户主动付款，不做自动代扣）';

function maskIdNo(phone) {
  const tail = (String(phone || '').replace(/\D/g, '') || '0000').slice(-4);
  return `330108199${tail.padStart(4, '0')}****`;
}

/** 造一份两期付款计划（50%+50%），按签署/演示形态填期次状态 */
function buildContractSchedules(contract, order, signStatus, demo) {
  const [sp1, sp2] = splitInstallments(contract.totalAmount, 2);
  const signDate = fmtDate(new Date(contract.createdAt));
  const tailDue = order.performDate
    ? fmtDate(addDays(new Date(`${order.performDate}T00:00:00`), -7))
    : null;
  const mk = (no, stageName, triggerEvent, dueDate, planAmount, ratio) => ({
    id: `${contract.id}-s${no}`,
    installmentNo: no,
    stageName,
    triggerEvent,
    dueDate,
    ratio,
    planAmount,
    paidAmount: 0,
    status: 'PENDING',
    paidAt: null
  });
  const s1 = mk(1, '预付款', '合同签署完成', signDate, sp1.planAmount, sp1.ratio);
  const s2 = mk(2, '尾款', '演出前7天', tailDue, sp2.planAmount, sp2.ratio);

  if (signStatus === 'SIGNED' || signStatus === 'RESCHEDULED' || signStatus === 'TERMINATED') {
    // 预付款一律已结清
    s1.status = 'PAID';
    s1.paidAmount = sp1.planAmount;
    s1.paidAt = order.paidAt || contract.createdAt;
    if (demo === 'pending-tail') {
      s2.status = 'PENDING'; // 大额分期进行中：尾款待付
    } else if (demo === 'overdue-tail') {
      s2.status = 'OVERDUE'; // 尾款逾期（演示红色预警）
    } else {
      s2.status = 'PAID';
      s2.paidAmount = sp2.planAmount;
      s2.paidAt = order.paidAt || contract.createdAt;
    }
  }
  return [s1, s2];
}

/** 从一份订单派生合同草稿（合同与订单 1:1） */
function buildContract(order, seq, overrides = {}, demo = 'normal') {
  const created = order.createdAt || iso(new Date());
  const contractNo = `HT${fmtDate(new Date(created)).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;
  const signStatus = overrides.signStatus || 'DRAFT';
  const contract = {
    id: `c${seq}`,
    contractNo,
    orderId: order.id,
    templateCode: CONTRACT_TEMPLATE_CODE,
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    partyAName: order.contact?.name || '客户',
    partyAIdType: 'ID_CARD',
    partyAIdNo: maskIdNo(order.contact?.phone),
    partyAContact: order.contact?.name || '',
    partyAPhone: order.contact?.phone || '',
    partyBName: PARTY_B.name,
    partyBCreditCode: PARTY_B.creditCode,
    totalAmount: order.totalAmount || 0,
    paymentTerms: CONTRACT_PAYMENT_TERMS,
    signStatus,
    esignFlowId: '',
    sealId: '',
    signedPdfUrl: '',
    partyASignedAt: null,
    partyBSignedAt: null,
    signedAt: null,
    voidReason: '',
    terminateReason: '',
    terminateResponsibility: '',
    terminatedAt: null,
    refundNo: '',
    rescheduleReason: '',
    rescheduleResponsibility: '',
    originalPerformDate: null,
    rescheduledPerformDate: null,
    rescheduledAt: null,
    createdAt: created,
    updatedAt: created,
    order: {
      orderNo: order.id,
      status: order.status,
      userId: order.userId,
      droneCount: order.droneCount,
      duration: order.duration,
      performDate: order.performDate,
      timeSlot: order.timeSlot,
      venueName: order.venue?.name || ''
    },
    schedules: []
  };
  contract.schedules = buildContractSchedules(contract, order, signStatus, demo);
  if (signStatus === 'SIGNED' || signStatus === 'RESCHEDULED' || signStatus === 'TERMINATED') {
    const signedAt = order.paidAt || created;
    contract.partyASignedAt = signedAt;
    contract.partyBSignedAt = signedAt;
    contract.signedAt = signedAt;
    contract.signedPdfUrl = `/api/media/contract/${contractNo}.pdf`;
  }
  Object.assign(contract, overrides);
  return contract;
}

/**
 * 生成全量合同种子。有效订单（非取消、非未支付）按下单时间生成合同；
 * 再挑选特定订单覆盖「已作废 / 已终止（客户&我方）/ 已改期」演示形态。
 */
function buildContracts(orders) {
  const valid = orders.filter(
    o => o.status !== 'CANCELLED' && !(o.status === 'PENDING_PAY' && !o.payChannel)
  );
  // 已签大额合同候选：安排尾款待付/逾期两种形态
  const signedLarge = valid
    .map((o, i) => ({ o, i }))
    .filter(x => (x.o.totalAmount || 0) >= 50000 && ['ACCEPTED', 'IN_SERVICE', 'COMPLETED', 'REVIEWED', 'REFUNDING'].includes(x.o.status));
  const pendingTailIdx = signedLarge.length ? signedLarge[signedLarge.length - 1].i : -1;
  const overdueTailIdx = signedLarge.length > 1 ? signedLarge[0].i : -1;

  const contracts = valid.map((order, i) => {
    const seq = i + 1;
    // 推导初始签署状态（对齐 web mock.deriveSignStatus）
    let signStatus = 'SIGNED';
    if (order.status === 'PENDING_PAY') signStatus = 'DRAFT';
    else if (order.status === 'PENDING_ACCEPT') signStatus = seq % 3 === 0 ? 'PENDING_SIGN' : 'SIGNED';
    const demo = i === pendingTailIdx ? 'pending-tail' : i === overdueTailIdx ? 'overdue-tail' : 'normal';
    return buildContract(order, seq, { signStatus }, demo);
  });

  // —— 覆盖特定演示形态：用确定的订单做合同动作快照（不改动订单主数据，仅合同侧留痕）——
  const findOrder = (pred) => valid.find(pred);
  let extraSeq = contracts.length;

  // 1) 已作废（零付款生效合同，无资金动作）
  const voidOrder = findOrder(o => o.status === 'PENDING_ACCEPT');
  if (voidOrder) {
    const c = contracts.find(x => x.orderId === voidOrder.id);
    if (c) {
      c.signStatus = 'VOID';
      c.voidReason = '客户资料待补充，合同暂缓签署，运营作废后重新拟定';
      c.updatedAt = iso(addDays(new Date(c.createdAt), 1));
      c.schedules.forEach(s => { s.status = 'PENDING'; s.paidAmount = 0; s.paidAt = null; });
      c.partyASignedAt = c.partyBSignedAt = c.signedAt = null;
      c.signedPdfUrl = '';
    }
  }

  // 2) 已终止 · 客户原因（带 PENDING 退款单，退款管理页可见）
  const custOrder = findOrder(o => o.status === 'ACCEPTED' && (o.totalAmount || 0) >= 30000);
  if (custOrder) {
    extraSeq += 1;
    const c = buildContract(custOrder, extraSeq, {
      signStatus: 'TERMINATED',
      terminateResponsibility: 'CUSTOMER',
      terminateReason: '客户企业活动预算调整，提前解除合同',
      terminatedAt: iso(addDays(new Date(), -1)),
      refundNo: `R${custOrder.id.slice(1)}C`
    }, 'normal');
    c.contractNo = `HT${fmtDate(new Date()).replace(/-/g, '')}-${String(extraSeq).padStart(4, '0')}`;
    contracts.push(c);
  }

  // 3) 已终止 · 我方原因（全额退，零扣除）
  const vendorOrder = findOrder(o => o.status === 'ACCEPTED' && o.id !== (custOrder && custOrder.id) && (o.totalAmount || 0) >= 20000);
  if (vendorOrder) {
    extraSeq += 1;
    const c = buildContract(vendorOrder, extraSeq, {
      signStatus: 'TERMINATED',
      terminateResponsibility: 'VENDOR',
      terminateReason: '空域审批未按时取得，我方无法履行，全额退还已付费用',
      terminatedAt: iso(addDays(new Date(), -2)),
      refundNo: `R${vendorOrder.id.slice(1)}V`
    }, 'normal');
    c.contractNo = `HT${fmtDate(new Date()).replace(/-/g, '')}-${String(extraSeq).padStart(4, '0')}`;
    contracts.push(c);
  }

  // 4) 已改期（非终态：原日期留底、新日期、责任方、原因类型，款项不退）
  const rsOrder = findOrder(o => o.status === 'ACCEPTED');
  if (rsOrder) {
    const c = contracts.find(x => x.orderId === rsOrder.id && x.signStatus === 'SIGNED');
    if (c) {
      c.originalPerformDate = rsOrder.performDate;
      c.rescheduledPerformDate = fmtDate(addDays(new Date(`${rsOrder.performDate}T00:00:00`), 7));
      c.rescheduleResponsibility = 'VENDOR';
      c.rescheduleReason = '气象预报显示当日风速超限，经沟通顺延，重新备案审批';
      c.rescheduledAt = iso(addDays(new Date(), -1));
      c.signStatus = 'RESCHEDULED';
      c.updatedAt = c.rescheduledAt;
    }
  }

  return contracts;
}

function buildSeed() {
  const now = new Date();
  const v = VENUES;
  let seq = 1;
  const orders = [];

  const specs = [
    // 进行中/待接单（未来日期）
    { userId: 'u1001', status: 'PENDING_ACCEPT', droneCount: 300, duration: 15, customText: '嫁给我吧', addons: ['music', 'aerial'], occasion: '求婚仪式', performInDays: 9, timeSlot: '20:00', venue: { type: 'preset', name: v[0].name, address: v[0].address, lng: v[0].lng, lat: v[0].lat }, contact: { name: '李先生', phone: '13866668801' }, createdDaysAgo: 1 },
    { userId: 'u1002', status: 'PENDING_ACCEPT', droneCount: 100, duration: 10, patternPreset: ['heart', 'star'], addons: [], occasion: '生日惊喜', performInDays: 5, timeSlot: '19:00', venue: { type: 'manual', name: '幸福里小区中心广场', address: '杭州市西湖区文三路 200 号幸福里小区', lng: 120.13, lat: 30.28 }, contact: { name: '甜甜', phone: '13722229909' }, createdDaysAgo: 1 },
    { userId: 'u1003', status: 'PENDING_ACCEPT', droneCount: 500, duration: 20, customText: '星耀科技十周年', customLogo: 'company-logo.png', addons: ['music', 'narration', 'aerial'], occasion: '企业周年庆', performInDays: 15, timeSlot: '20:00', venue: { type: 'preset', name: v[1].name, address: v[1].address, lng: v[1].lng, lat: v[1].lat }, contact: { name: '张总', phone: '13988880032' }, createdDaysAgo: 2 },
    { userId: 'u1004', status: 'PENDING_ACCEPT', droneCount: 200, duration: 15, customText: 'Happy Anniversary', addons: ['music'], occasion: '结婚纪念', performInDays: 6, timeSlot: '21:00', venue: { type: 'map', name: '钱塘江大桥观景平台', address: '杭州市西湖区之江路 16 号', lng: 120.142, lat: 30.201 }, contact: { name: 'Ann', phone: '18633331115' }, createdDaysAgo: 0 },

    // 已接单（含距表演不同天数以演示阶梯退款）
    { userId: 'u1005', status: 'ACCEPTED', droneCount: 300, duration: 15, customText: '开业大吉', addons: ['narration'], occasion: '开业庆典', performInDays: 10, timeSlot: '19:00', venue: { type: 'preset', name: v[3].name, address: v[3].address, lng: v[3].lng, lat: v[3].lat }, contact: { name: '王老板', phone: '15077774442' }, createdDaysAgo: 3 },
    { userId: 'u1006', status: 'ACCEPTED', droneCount: 100, duration: 10, patternPreset: ['rose'], customText: '生日快乐', addons: [], occasion: '生日派对', performInDays: 5, timeSlot: '20:00', venue: { type: 'manual', name: '天空之城露台餐厅', address: '杭州市拱墅区莫干山路 972 号', lng: 120.13, lat: 30.31 }, contact: { name: '糖糖', phone: '15911118880' }, createdDaysAgo: 4 },
    { userId: 'u1001', status: 'ACCEPTED', droneCount: 200, duration: 10, addons: ['urgent', 'music'], occasion: '告白惊喜', performInDays: 2, timeSlot: '20:00', venue: { type: 'preset', name: v[2].name, address: v[2].address, lng: v[2].lng, lat: v[2].lat }, contact: { name: '李先生', phone: '13866668801' }, createdDaysAgo: 5 },
    { userId: 'u1003', status: 'ACCEPTED', droneCount: 1000, duration: 20, customText: '城市之光', customLogo: 'city-logo.png', addons: ['music', 'narration', 'aerial'], occasion: '城市灯光节', performInDays: 0, timeSlot: '19:00', venue: { type: 'preset', name: v[1].name, address: v[1].address, lng: v[1].lng, lat: v[1].lat }, contact: { name: '张总', phone: '13988880032' }, createdDaysAgo: 6 },

    // 执行中（今天）
    { userId: 'u1002', status: 'IN_SERVICE', droneCount: 300, duration: 15, customText: '新婚快乐', addons: ['music', 'aerial'], occasion: '婚礼庆典', performInDays: 0, timeSlot: '19:00', venue: { type: 'preset', name: v[4].name, address: v[4].address, lng: v[4].lng, lat: v[4].lat }, contact: { name: '甜甜', phone: '13722229909' }, createdDaysAgo: 7 },

    // 已完成/已评价（过去日期）
    { userId: 'u1004', status: 'COMPLETED', droneCount: 200, duration: 15, patternPreset: ['ring', 'heart'], customText: 'Marry Me', addons: ['music'], occasion: '求婚仪式', performInDays: -2, timeSlot: '20:00', venue: { type: 'preset', name: v[0].name, address: v[0].address, lng: v[0].lng, lat: v[0].lat }, contact: { name: 'Ann', phone: '18633331115' }, createdDaysAgo: 10 },
    { userId: 'u1005', status: 'COMPLETED', droneCount: 500, duration: 20, customText: '品牌之夜', customLogo: 'brand.png', addons: ['music', 'narration'], occasion: '品牌发布', performInDays: -5, timeSlot: '20:00', venue: { type: 'preset', name: v[1].name, address: v[1].address, lng: v[1].lng, lat: v[1].lat }, contact: { name: '王老板', phone: '15077774442' }, createdDaysAgo: 12 },
    { userId: 'u1006', status: 'COMPLETED', droneCount: 100, duration: 10, patternPreset: ['star'], addons: [], occasion: '毕业纪念', performInDays: -8, timeSlot: '19:00', venue: { type: 'manual', name: '大学城中心草坪', address: '杭州市西湖区留和路 288 号', lng: 120.03, lat: 30.22 }, contact: { name: '糖糖', phone: '15911118880' }, createdDaysAgo: 15 },

    // 已评价
    { userId: 'u1001', status: 'REVIEWED', droneCount: 300, duration: 15, customText: '宝宝满月啦', addons: ['music', 'aerial'], occasion: '满月宴', performInDays: -12, timeSlot: '19:00', venue: { type: 'preset', name: v[3].name, address: v[3].address, lng: v[3].lng, lat: v[3].lat }, contact: { name: '李先生', phone: '13866668801' }, createdDaysAgo: 20, review: { stars: 5, content: '效果太震撼了！300 架无人机组成的图案非常清晰，家人都很感动，航拍视频也很棒。' } },
    { userId: 'u1002', status: 'REVIEWED', droneCount: 100, duration: 10, patternPreset: ['heart', 'ring'], addons: [], occasion: '周年纪念', performInDays: -18, timeSlot: '21:00', venue: { type: 'map', name: '武林广场', address: '杭州市拱墅区体育场路 208 号', lng: 120.167, lat: 30.273 }, contact: { name: '甜甜', phone: '13722229909' }, createdDaysAgo: 25, review: { stars: 4, content: '整体很浪漫，就是当天有点风，图案稍微晃了一点，瑕不掩瑜。' } },

    // 退款中
    { userId: 'u1003', status: 'REFUNDING', droneCount: 200, duration: 15, customText: '新品大卖', addons: ['music'], occasion: '产品发布', performInDays: 8, timeSlot: '20:00', venue: { type: 'preset', name: v[4].name, address: v[4].address, lng: v[4].lng, lat: v[4].lat }, contact: { name: '张总', phone: '13988880032' }, createdDaysAgo: 2, refund: { reason: '公司活动时间调整，需要改期', ratio: 1, note: '待接单状态，全额退款' } },

    // 已退款（用户申请审批通过）
    { userId: 'u1004', status: 'REFUNDED', droneCount: 300, duration: 15, customText: '店庆狂欢', addons: ['narration'], occasion: '店庆活动', performInDays: 3, timeSlot: '19:00', venue: { type: 'preset', name: v[2].name, address: v[2].address, lng: v[2].lng, lat: v[2].lat }, contact: { name: 'Ann', phone: '18633331115' }, createdDaysAgo: 6, refundApproved: { reason: '场地审批未通过，无法举办', ratio: 0.9, note: '已接单，距表演 3-7 天按 90% 退款' } },

    // 已退款（商户拒单全额退）
    { userId: 'u1005', status: 'REFUNDED_REJECT', droneCount: 1000, duration: 20, customText: '跨年狂欢', addons: ['music', 'narration', 'aerial'], occasion: '跨年活动', performInDays: 4, timeSlot: '21:00', venue: { type: 'manual', name: '山顶观景平台', address: '杭州市西湖区北高峰山顶', lng: 120.1, lat: 30.25 }, contact: { name: '王老板', phone: '15077774442' }, createdDaysAgo: 3, rejectReason: '该场地位于航线管制区，无法执行飞行' },

    // 已取消（未支付）
    { userId: 'u1006', status: 'CANCELLED', droneCount: 100, duration: 10, addons: [], occasion: '表白', performInDays: 7, timeSlot: '20:00', venue: { type: 'preset', name: v[0].name, address: v[0].address, lng: v[0].lng, lat: v[0].lat }, contact: { name: '糖糖', phone: '15911118880' }, createdDaysAgo: 1, cancelReason: '用户主动取消' },
    { userId: 'u1002', status: 'CANCELLED_TIMEOUT', droneCount: 200, duration: 10, addons: ['music'], occasion: '生日', performInDays: 12, timeSlot: '19:00', venue: { type: 'preset', name: v[1].name, address: v[1].address, lng: v[1].lng, lat: v[1].lat }, contact: { name: '甜甜', phone: '13722229909' }, createdDaysAgo: 2 },

    // 满档演示：+3 天占满 3 单
    { userId: 'u1001', status: 'PENDING_ACCEPT', droneCount: 100, duration: 10, occasion: '告白', performInDays: 3, timeSlot: '19:00', venue: { type: 'preset', name: v[0].name, address: v[0].address, lng: v[0].lng, lat: v[0].lat }, contact: { name: '李先生', phone: '13866668801' }, createdDaysAgo: 1 },
    { userId: 'u1004', status: 'ACCEPTED', droneCount: 200, duration: 15, customText: '周年快乐', addons: ['music'], occasion: '店庆', performInDays: 3, timeSlot: '20:00', venue: { type: 'preset', name: v[2].name, address: v[2].address, lng: v[2].lng, lat: v[2].lat }, contact: { name: 'Ann', phone: '18633331115' }, createdDaysAgo: 2 },
    { userId: 'u1006', status: 'PENDING_ACCEPT', droneCount: 300, duration: 10, occasion: '开业', performInDays: 3, timeSlot: '21:00', venue: { type: 'preset', name: v[3].name, address: v[3].address, lng: v[3].lng, lat: v[3].lat }, contact: { name: '糖糖', phone: '15911118880' }, createdDaysAgo: 1 }
  ];

  for (const spec of specs) {
    const realStatus = spec.status.startsWith('CANCELLED') ? 'CANCELLED'
      : spec.status === 'REFUNDED_REJECT' ? 'REFUNDED' : spec.status;
    const o = mkOrder(seq, now, { ...spec, status: realStatus });
    // 附加状态修饰
    if (spec.review) {
      o.review = { ...spec.review, createdAt: iso(addDays(now, spec.performInDays + 1)) };
      o.timeline.push({ time: o.review.createdAt, text: '用户已评价' });
    }
    if (spec.status === 'REFUNDING') {
      o.refund = {
        reason: spec.refund.reason, ratio: spec.refund.ratio,
        applyAmount: Math.round(o.totalAmount * spec.refund.ratio),
        status: 'PENDING', prevStatus: 'PENDING_ACCEPT',
        auditBy: '', auditNote: '', refundAmount: 0, refundNo: '',
        createdAt: iso(addDays(now, 0)), auditedAt: ''
      };
      o.timeline.push({ time: o.refund.createdAt, text: `用户申请退款：${spec.refund.reason}` });
    }
    if (spec.refundApproved) {
      o.acceptedBy = 'operator';
      o.acceptedAt = new Date(new Date(o.createdAt).getTime() + 2 * 3600000).toISOString();
      const amt = Math.round(o.totalAmount * spec.refundApproved.ratio);
      o.refund = {
        reason: spec.refundApproved.reason, ratio: spec.refundApproved.ratio, applyAmount: amt,
        status: 'APPROVED', prevStatus: 'ACCEPTED', auditBy: 'admin', auditNote: '同意退款',
        refundAmount: amt, refundNo: `R${o.id.slice(1)}`,
        createdAt: iso(addDays(now, -2)), auditedAt: iso(addDays(now, -1))
      };
      o.timeline.push({ time: o.refund.createdAt, text: `用户申请退款：${spec.refundApproved.reason}` });
      o.timeline.push({ time: o.refund.auditedAt, text: `退款审批通过，退款 ¥${amt}` });
    }
    if (spec.status === 'REFUNDED_REJECT') {
      o.refund = {
        reason: `商户拒单：${spec.rejectReason}`, ratio: 1, applyAmount: o.totalAmount,
        status: 'APPROVED', prevStatus: 'PENDING_ACCEPT', auditBy: 'operator', auditNote: spec.rejectReason,
        refundAmount: o.totalAmount, refundNo: `R${o.id.slice(1)}`,
        createdAt: iso(addDays(now, -1)), auditedAt: iso(addDays(now, -1))
      };
      o.timeline.push({ time: o.refund.auditedAt, text: `商户拒单，已全额退款：${spec.rejectReason}` });
    }
    if (spec.status === 'CANCELLED') {
      o.cancelReason = spec.cancelReason || '用户主动取消';
      o.timeline.push({ time: iso(addDays(now, 0)), text: `订单取消（${o.cancelReason}）` });
    }
    if (spec.status === 'CANCELLED_TIMEOUT') {
      o.cancelReason = '支付超时';
      o.timeline.push({ time: o.expireAt, text: '支付超时，订单自动取消' });
    }
    orders.push(o);
    seq++;
  }


  return {
    meta: { seededAt: iso(now), version: 4 },
    config: {
      dailyLimit: PRICE_RULES.dailyLimit,      // 已由时段口径取代，保留只为兼容旧接口
      // 档期口径（2026-11-03）：一个时段 = 一个可接单名额，默认三个时段
      defaultSlots: PRICE_RULES.timeSlots.slice(),
      daySlots: {
        // 演示：+9 天只开放两个时段（管理员在档期页可关掉 21:00）
        [fmtDate(addDays(now, 9))]: PRICE_RULES.timeSlots.filter(x => x !== '21:00')
      },
      bookingWindowDays: PRICE_RULES.bookingWindowDays,
      payExpireMinutes: PRICE_RULES.payExpireMinutes,
      customTextPrice: PRICE_RULES.customTextPrice,
      customLogoPrice: PRICE_RULES.customLogoPrice,
      closedDates: [fmtDate(addDays(now, 7))], // +7 天休整日演示
      dayOverrides: {},                        // 旧版单日限单覆盖（仅兼容历史数据）
      customHolidays: { [fmtDate(addDays(now, 14))]: '店庆日' } // 手动标注的特殊日（演示）
    },
    dicts: buildDicts(),
    venues: JSON.parse(JSON.stringify(VENUES)),
    users: JSON.parse(JSON.stringify(USERS)),
    orders,
    consults: buildConsults(now),
    contracts: buildContracts(orders),
    poiPool: POI_POOL
  };
}

module.exports = { buildSeed, buildDicts, buildContracts, profile, PRICE_RULES, REFUND_RULES, ADMINS, HOLIDAYS, fmtDate, addDays, CONSULT_STATUS_TEXT, DISPATCH_TERMS, DISPATCH_TERM_SPEC };
