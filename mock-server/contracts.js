// 电子合同 · 领域纯逻辑（与正式 drone-dispatch-web 的 contract/termination.ts 逐项对齐）
//
// 本文件不碰 db、不发请求，只做：
//   1) 分期付款拆分（installment：默认两期 50%+50%，尾差进最后一期，Σ 分期恒等于总额）
//   2) 终止结算试算（我方原因恒全额退；客户原因按「距演出整天数」三档比例）
//   3) 操作闸门（签署状态 × 是否收款 × 订单状态 × 角色 → 可执行动作）
// 规则事实来源：drone-dispatch-web/src/views/contract/termination.ts（2026-11 核对一致）。
'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// 分期付款（对齐 web/installment.ts）
// ─────────────────────────────────────────────────────────────

/**
 * 按等比例把合同总额拆成 N 期（默认两期 50%+50%）。
 * 最后一期承接舍入尾差，保证各期 planAmount 之和分毫不差等于总额。
 */
function splitInstallments(totalAmount, count = 2) {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const n = Number.isInteger(count) && count >= 1 ? count : 1;
  const ratio = 1 / n;
  const base = Math.floor((total / n) * 100) / 100;
  const result = [];
  let allocated = 0;
  for (let i = 0; i < n; i += 1) {
    const isLast = i === n - 1;
    const planAmount = isLast ? round2(total - allocated) : base;
    allocated = round2(allocated + planAmount);
    result.push({ no: i + 1, ratio, planAmount });
  }
  return result;
}

/** 汇总各期实付金额（退款基数） */
function sumPaidAmount(schedules) {
  return (schedules || []).reduce((sum, x) => sum + (Number(x.paidAmount) || 0), 0);
}

// ─────────────────────────────────────────────────────────────
// 终止 / 改期（对齐 web/termination.ts）
// ─────────────────────────────────────────────────────────────

/**
 * 客户原因退款阶梯（按「距离演出日的整天数」匹配，天数越少、沉没成本越高、退得越少）：
 *   演出前 ≥7 天   退 90%（扣除 10% 前期筹备成本）
 *   演出前 3~6 天  退 50%（设备调度/排班已锁定）
 *   演出前 <3 天   退 20%（临近演出，大部分成本已发生；含当天与已过期）
 * 无法取得演出日期时按最宽松的 ≥7 天档处理，避免误扣客户款项。
 */
const CUSTOMER_REFUND_RULES = [
  { label: '演出前 7 天以上，退 90%', minDays: 7, ratio: 0.9 },
  { label: '演出前 3~7 天，退 50%', minDays: 3, ratio: 0.5 },
  { label: '演出前 3 天内，退 20%', minDays: Number.NEGATIVE_INFINITY, ratio: 0.2 }
];

/** 我方原因统一全额退款（零扣除） */
const VENDOR_FULL_REFUND_LABEL = '我方原因无法履行，全额退还已付费用';

/** 终态：只能查看，不能再推进 */
const TERMINAL_STATUSES = new Set(['VOID', 'TERMINATED']);
/** 已履行完毕的订单状态：合同已实际履行，不能终止/改期（纠纷另走售后） */
const FULFILLED_ORDER_STATUSES = new Set(['COMPLETED', 'REVIEWED']);
/** 已进入现场服务：默认禁止，仅 ADMIN 兜底强制终止 */
const IN_SERVICE_ORDER_STATUSES = new Set(['IN_SERVICE']);

/**
 * 计算「今天」距离演出日的整天数（演出日 − 今天，向下取整到日）。
 * 今天演出=0；明天=1；已过演出日为负数。无法解析日期返回 null。
 */
function daysUntil(performDate) {
  if (!performDate) return null;
  const target = new Date(`${performDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target.getTime() - todayMid) / DAY_MS);
}

/** 按距演出天数匹配客户原因阶梯规则 */
function matchCustomerRule(days) {
  if (days === null || days === undefined) return CUSTOMER_REFUND_RULES[0];
  for (const rule of CUSTOMER_REFUND_RULES) {
    if (days >= rule.minDays) return rule;
  }
  return CUSTOMER_REFUND_RULES[CUSTOMER_REFUND_RULES.length - 1];
}

/**
 * 终止结算试算（纯函数，不落库）。
 * @param {object} contract 合同（取 schedules 实付额与 order.performDate）
 * @param {'CUSTOMER'|'VENDOR'} responsibility 责任方
 */
function quoteTermination(contract, responsibility) {
  const paidAmount = round2(sumPaidAmount(contract.schedules));
  const days = daysUntil(contract.order && contract.order.performDate);

  if (responsibility === 'VENDOR') {
    return {
      responsibility,
      paidAmount,
      ratio: 1,
      refundAmount: paidAmount,
      deductAmount: 0,
      daysToPerform: days,
      ruleLabel: VENDOR_FULL_REFUND_LABEL
    };
  }

  const rule = matchCustomerRule(days);
  const refundAmount = round2(paidAmount * rule.ratio);
  return {
    responsibility,
    paidAmount,
    ratio: rule.ratio,
    refundAmount,
    deductAmount: round2(paidAmount - refundAmount),
    daysToPerform: days,
    ruleLabel: rule.label
  };
}

/**
 * 判定一份合同当前可执行的操作（操作列闸门）。
 * @param {object} contract 合同
 * @param {boolean} isAdmin 当前登录人是否 ADMIN
 */
function availableActions(contract, isAdmin) {
  const blocked = (blockedReason) => ({
    canVoid: false,
    canTerminate: false,
    canReschedule: false,
    terminateRequiresAdmin: true,
    readonly: TERMINAL_STATUSES.has(contract.signStatus),
    blockedReason
  });

  // 终态合同：仅查看
  if (TERMINAL_STATUSES.has(contract.signStatus)) {
    return blocked(
      contract.signStatus === 'VOID' ? '合同已作废，仅可查看' : '合同已终止并完成结算，仅可查看'
    );
  }

  const orderStatus = (contract.order && contract.order.status) || '';
  // 已履行完毕：不能终止/改期
  if (FULFILLED_ORDER_STATUSES.has(orderStatus)) {
    return blocked('合同已履行完毕，不能终止或改期；如有纠纷请走售后/争议流程');
  }

  const paidAmount = round2(sumPaidAmount(contract.schedules));
  const isInService = IN_SERVICE_ORDER_STATUSES.has(orderStatus);
  const isEffective = contract.signStatus === 'SIGNED' || contract.signStatus === 'RESCHEDULED';

  // DRAFT / PENDING_SIGN：未生效，无结算，只能作废
  if (!isEffective) {
    return {
      canVoid: true,
      canTerminate: false,
      canReschedule: false,
      terminateRequiresAdmin: true,
      readonly: false,
      blockedReason: ''
    };
  }

  // 生效且执行中：默认禁止，仅 ADMIN 可兜底强制终止；改期已无意义
  if (isInService) {
    return {
      canVoid: false,
      canTerminate: !!isAdmin,
      canReschedule: false,
      terminateRequiresAdmin: true,
      readonly: false,
      blockedReason: isAdmin ? '' : '表演已进入执行阶段，强制终止需管理员操作'
    };
  }

  // 生效且未到现场：零付款可作废；已收款只能终止（带结算）；均可改期
  return {
    canVoid: paidAmount <= 0,
    canTerminate: true,
    canReschedule: true,
    terminateRequiresAdmin: true,
    readonly: false,
    blockedReason: ''
  };
}

module.exports = {
  DAY_MS,
  round2,
  splitInstallments,
  sumPaidAmount,
  CUSTOMER_REFUND_RULES,
  VENDOR_FULL_REFUND_LABEL,
  TERMINAL_STATUSES,
  FULFILLED_ORDER_STATUSES,
  IN_SERVICE_ORDER_STATUSES,
  daysUntil,
  matchCustomerRule,
  quoteTermination,
  availableActions
};
