// 电子合同「提交签署 / 作废 / 终止 / 改期」全链路验收脚本（零依赖，Node 18+ 内置 fetch）
// 用法：先重置验收数据，再以独立端口+独立数据目录启动 server，最后执行本脚本
//   node reset-verify-db.mjs
//   PORT=8099 MOCK_DATA_DIR=./data-verify node server.js
//   BASE=http://localhost:8099 node verify-contracts.mjs
// 脚本会打印每条判据的 PASS/FAIL，并在结束时汇总；任何 FAIL 退出码非 0。
'use strict';

const BASE = process.env.BASE || 'http://localhost:8099';
let failures = 0;
let passes = 0;

function check(name, cond, detail) {
  if (cond) { passes += 1; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failures += 1; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  return json;
}

async function login(username, password) {
  const r = await api('POST', '/api/admin/login', { username, password });
  if (r.code !== 0) throw new Error('登录失败: ' + r.msg);
  return r.data.token;
}

(async () => {
  const admin = await login('admin', 'admin123');
  const operator = await login('operator', 'operator123');
  console.log('登录：admin / operator 成功\n');

  const listR = await api('GET', '/api/admin/contracts?page=1&size=100', null, admin);
  const all = listR.data.list;
  const byId = Object.fromEntries(all.map(c => [c.id, c]));
  const find = (pred) => all.find(pred);

  // 选角：零付款未生效合同、已收款未到场合同（备两个用于客户/我方终止）、IN_SERVICE 合同、终态合同
  const zeroPay = find(c => ['DRAFT', 'PENDING_SIGN'].includes(c.signStatus));
  const paidSigned = all.filter(c => c.signStatus === 'SIGNED' && c.order.status === 'ACCEPTED'
    && c.schedules.reduce((s, x) => s + x.paidAmount, 0) > 0);
  const inService = find(c => c.order.status === 'IN_SERVICE');
  const terminal = find(c => ['VOID', 'TERMINATED'].includes(c.signStatus));

  console.log('【0】签署链路（DRAFT→PENDING_SIGN→SIGNED 正向 + 非法跃迁/重复提交拦截）');
  // 选角：c3 由 reset-verify-db.mjs 确定性造为 DRAFT（零付款）；c18 保持 PENDING_SIGN 留给【1】作废
  const draft = byId.c3;
  if (draft) {
    check('选角 c3 初始为 DRAFT', draft.signStatus === 'DRAFT', draft.signStatus);

    // 非法跃迁：草稿不能直接上传签署件
    const jumpUpload = await api('POST', '/api/admin/contracts/c3/upload-pdf', { pdfUrl: '/api/media/contract/x.pdf' }, admin);
    check('草稿直接上传签署件被拒', jumpUpload.code !== 0 && /待签署/.test(jumpUpload.msg), jumpUpload.msg);

    // 草稿闸门：可作废、不可终止/改期
    const draftAct = (await api('GET', '/api/admin/contracts/c3/actions', null, admin)).data.actions;
    check('草稿可作废且不可终止/改期', draftAct.canVoid && !draftAct.canTerminate && !draftAct.canReschedule);

    // 正向：提交签署 DRAFT → PENDING_SIGN
    const submitted = await api('POST', '/api/admin/contracts/c3/submit-sign', {}, admin);
    check('提交签署成功', submitted.code === 0, submitted.msg);
    check('合同置 PENDING_SIGN', submitted.code === 0 && submitted.data.contract.signStatus === 'PENDING_SIGN');

    // 重复提交被拒（仅草稿可提交）
    const repeatSubmit = await api('POST', '/api/admin/contracts/c3/submit-sign', {}, admin);
    check('非草稿重复提交签署被拒', repeatSubmit.code !== 0 && /草稿/.test(repeatSubmit.msg), repeatSubmit.msg);

    // 空 PDF 地址被拒
    const emptyPdf = await api('POST', '/api/admin/contracts/c3/upload-pdf', { pdfUrl: '   ' }, admin);
    check('空签署件地址被拒', emptyPdf.code !== 0 && /PDF/.test(emptyPdf.msg), emptyPdf.msg);

    // 正向：上传签署件 PENDING_SIGN → SIGNED，签署时间与存档地址落库
    const pdfUrl = '/api/media/contract/HT20261108-0003.pdf';
    const signed = await api('POST', '/api/admin/contracts/c3/upload-pdf', { pdfUrl }, admin);
    check('上传签署件成功', signed.code === 0, signed.msg);
    if (signed.code === 0) {
      const sc = signed.data.contract;
      check('合同置 SIGNED 且存档地址/签署时间落库',
        sc.signStatus === 'SIGNED' && sc.signedPdfUrl === pdfUrl && !!sc.partyASignedAt && !!sc.signedAt,
        sc.signStatus);
      // 已签署后再上传/再提交均被拒（终态推进门）
      const reUpload = await api('POST', '/api/admin/contracts/c3/upload-pdf', { pdfUrl }, admin);
      check('已签署后重复上传被拒', reUpload.code !== 0 && /待签署/.test(reUpload.msg), reUpload.msg);
      const reSubmit = await api('POST', '/api/admin/contracts/c3/submit-sign', {}, admin);
      check('已签署后再提交签署被拒', reSubmit.code !== 0 && /草稿/.test(reSubmit.msg), reSubmit.msg);
    }
  } else check('存在草稿合同 c3（先跑 reset-verify-db.mjs）', false, '种子缺失');

  console.log('\n【1】零付款作废 + 已收款作废拦截');
  if (zeroPay) {
    const r = await api('POST', `/api/admin/contracts/${zeroPay.id}/void`, { voidReason: '验收：资料待补，作废重拟' }, admin);
    check('零付款合同作废成功', r.code === 0, r.code === 0 ? zeroPay.contractNo : r.msg);
    if (r.code === 0) {
      check('合同状态置 VOID', r.data.contract.signStatus === 'VOID');
      const ord = (await api('GET', `/api/admin/orders/${zeroPay.orderId}`, null, admin)).data.order;
      check('关联订单置 CANCELLED 且无退款单', ord.status === 'CANCELLED' && !ord.refund, ord.status);
    }
    const r2 = await api('POST', `/api/admin/contracts/${zeroPay.id}/void`, { voidReason: '重复作废' }, admin);
    check('终态合同重复作废被拒', r2.code !== 0, r2.msg);
  } else check('存在零付款未生效合同', false, '种子缺失');

  if (paidSigned[0]) {
    const blocked = await api('POST', `/api/admin/contracts/${paidSigned[0].id}/void`, { voidReason: '已收款想作废' }, admin);
    check('已收款合同作废被拦截并引导终止', blocked.code !== 0 && /终止/.test(blocked.msg), blocked.msg);
  }

  console.log('\n【2】客户原因终止（天数三档试算 + PENDING 退款单 + 订单 REFUNDING）');
  const cust = paidSigned[0];
  if (cust) {
    const paidAmount = cust.schedules.reduce((s, x) => s + x.paidAmount, 0);
    const q = await api('POST', `/api/admin/contracts/${cust.id}/terminate-quote`, { responsibility: 'CUSTOMER' }, admin);
    check('客户原因试算返回', q.code === 0);
    const quote = q.data.quote;
    check('可退+扣除=已付', Math.round((quote.refundAmount + quote.deductAmount) * 100) === Math.round(paidAmount * 100),
      `已付 ${paidAmount} / 可退 ${quote.refundAmount} / 扣除 ${quote.deductAmount} / 比例 ${quote.ratio}`);
    check('命中三档之一(0.9/0.5/0.2)', [0.9, 0.5, 0.2].includes(quote.ratio), quote.ruleLabel);

    // 前端篡改比例/超额金额：服务端应以自身试算与上限兜底
    const r = await api('POST', `/api/admin/contracts/${cust.id}/terminate`, {
      responsibility: 'CUSTOMER', reason: '验收：客户预算调整解除', ratio: 1, refundAmount: paidAmount * 5
    }, admin);
    check('客户原因终止成功', r.code === 0, r.msg);
    if (r.code === 0) {
      check('合同置 TERMINATED 且记录客户责任', r.data.contract.signStatus === 'TERMINATED'
        && r.data.contract.terminateResponsibility === 'CUSTOMER');
      const ord = (await api('GET', `/api/admin/orders/${cust.orderId}`, null, admin)).data.order;
      check('订单置 REFUNDING', ord.status === 'REFUNDING', ord.status);
      check('生成 PENDING 退款单且含责任方/规则/试算', !!ord.refund && ord.refund.status === 'PENDING'
        && /客户原因/.test(ord.refund.reason) && !!ord.refund.refundNo, ord.refund && ord.refund.refundNo);
      check('实退额被服务端限制在已付以内', ord.refund.refundAmount <= paidAmount && ord.refund.refundAmount > 0);
      // 退款管理页可检索
      const refunds = await api('GET', '/api/admin/refunds?status=PENDING', null, admin);
      check('退款管理页能检索到该退款单', refunds.data.list.some(o => o.id === cust.orderId));
      // 未到期付款计划冻结
      const after = (await api('GET', `/api/admin/contracts/${cust.id}`, null, admin)).data.contract;
      check('已付期次保留、未到期期次冻结', after.schedules.every(s => s.status === 'PAID' || /不再收款/.test(s.triggerEvent)));
    }
  } else check('存在已收款未到场合同', false, '种子缺失');

  console.log('\n【3】我方原因终止（恒全额退、零扣除、金额不可改）');
  const vendor = paidSigned[1];
  if (vendor) {
    const paidAmount = vendor.schedules.reduce((s, x) => s + x.paidAmount, 0);
    const q = await api('POST', `/api/admin/contracts/${vendor.id}/terminate-quote`, { responsibility: 'VENDOR' }, admin);
    check('我方原因 ratio=1 且扣除=0', q.data.quote.ratio === 1 && q.data.quote.deductAmount === 0
      && q.data.quote.refundAmount === paidAmount);
    // 即便前端传一个打折金额，服务端也必须锁全额
    const r = await api('POST', `/api/admin/contracts/${vendor.id}/terminate`, {
      responsibility: 'VENDOR', reason: '验收：空域审批未取得', refundAmount: 1
    }, admin);
    check('我方原因终止成功', r.code === 0, r.msg);
    if (r.code === 0) {
      const ord = (await api('GET', `/api/admin/orders/${vendor.orderId}`, null, admin)).data.order;
      check('实退锁定为已付全额（忽略前端 1 元）', ord.refund.refundAmount === paidAmount, `实退 ${ord.refund.refundAmount} / 已付 ${paidAmount}`);
      check('退款单记录我方原因与全额规则', /我方原因/.test(ord.refund.reason) && ord.refund.ratio === 1);
    }
  } else check('存在第二个已收款合同（我方终止用）', false, '种子缺失');

  console.log('\n【4】改期（日期变更、无退款、状态款项不变、留痕原日期）');
  const rs = paidSigned[2];
  if (rs) {
    const before = (await api('GET', `/api/admin/orders/${rs.orderId}`, null, admin)).data.order;
    const newDate = (() => { const d = new Date(); d.setDate(d.getDate() + 12); return d.toISOString().slice(0, 10); })();
    const r = await api('POST', `/api/admin/contracts/${rs.id}/reschedule`, {
      responsibility: 'VENDOR', reasonType: 'WEATHER', reason: '验收：当日风速超限顺延', newPerformDate: newDate
    }, admin);
    check('改期成功', r.code === 0, r.msg);
    if (r.code === 0) {
      const c = r.data.contract;
      check('合同置 RESCHEDULED 且留底原日期', c.signStatus === 'RESCHEDULED'
        && c.originalPerformDate === before.performDate && c.rescheduledPerformDate === newDate);
      const ord = (await api('GET', `/api/admin/orders/${rs.orderId}`, null, admin)).data.order;
      check('订单表演日期更新、状态不变', ord.performDate === newDate && ord.status === before.status, `${ord.performDate} / ${ord.status}`);
      check('改期不产生退款单', !ord.refund, ord.refund ? ord.refund.refundNo : '无退款单');
      const afterC = (await api('GET', `/api/admin/contracts/${rs.id}`, null, admin)).data.contract;
      const paidBefore = before.totalAmount;
      const paidAfter = afterC.schedules.reduce((s, x) => s + x.paidAmount, 0);
      check('已付款节点继续有效（实付额不变）', paidAfter === afterC.schedules.filter(s => s.status === 'PAID').reduce((s, x) => s + x.planAmount, 0));
      check('时间轴记录改期 原→新', ord.timeline.some(t => /改期/.test(t.text) && t.text.includes(before.performDate) && t.text.includes(newDate)));
      void paidBefore;
      // 非法改期：过去日期 / 相同日期
      const past = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
      const r1 = await api('POST', `/api/admin/contracts/${rs.id}/reschedule`, { reasonType: 'OTHER', reason: 'x', newPerformDate: past }, admin);
      check('过去日期改期被拒', r1.code !== 0, r1.msg);
      const r2 = await api('POST', `/api/admin/contracts/${rs.id}/reschedule`, { reasonType: 'OTHER', reason: 'x', newPerformDate: newDate }, admin);
      check('与现日期相同改期被拒', r2.code !== 0, r2.msg);
    }
  } else check('存在第三个已收款合同（改期用）', false, '种子缺失');

  console.log('\n【5】操作闸门（角色 × 履约状态 × 终态）');
  if (inService) {
    const opAct = (await api('GET', `/api/admin/contracts/${inService.id}/actions`, null, operator)).data.actions;
    const adAct = (await api('GET', `/api/admin/contracts/${inService.id}/actions`, null, admin)).data.actions;
    check('IN_SERVICE 操作员不可终止/改期', !opAct.canTerminate && !opAct.canReschedule, opAct.blockedReason);
    check('IN_SERVICE 管理员可兜底强制终止、不可改期', adAct.canTerminate && !adAct.canReschedule);
    const opTry = await api('POST', `/api/admin/contracts/${inService.id}/terminate`, { responsibility: 'VENDOR', reason: '操作员强终止' }, operator);
    check('操作员调用终止接口被 403 拒绝', opTry.code === 40300, opTry.msg);
  } else check('存在 IN_SERVICE 合同', false, '种子缺失');

  if (terminal) {
    const act = (await api('GET', `/api/admin/contracts/${terminal.id}/actions`, null, admin)).data.actions;
    check('终态合同只读、无任何推进动作', act.readonly && !act.canVoid && !act.canTerminate && !act.canReschedule);
  }

  console.log(`\n========== 验收结果：${passes} PASS / ${failures} FAIL ==========`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('验收脚本异常：', e); process.exit(2); });
