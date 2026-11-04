// 用例 DSL：defineCase / step。
//
// 用例 = 元数据（可被 --list / --impact / Junit 报告消费）+ 有序步骤（runner 逐步执行、逐步计时、失败即停）。
//
// defineCase({
//   id, title, tags, priority, impact, need, timeoutMs, reset,
//   requires, // 前置说明（人读，报告里打印）
//   setup(ctx), steps: [ step('...', async ctx => {...}) ], teardown(ctx)
// })
//
// 约定：
//   - id 用小写 kebab，全局唯一（= 报告 case 名、--case 参数值）；
//   - tags 至少含 smoke / regression 之一，外加领域标签（h5/admin/order/consult/schedule/dict/dashboard/ack）；
//   - priority：P0 阻断（主链路挂了就不能演示）/ P1 重要 / P2 辅助；
//   - impact：改动会命中这条用例的源码路径（相对项目根，支持目录前缀）。--impact 就按它选用例；
//   - 隐式前置：若 reset !== false，runner 会在用例开始前 POST /api/config/reset（数据隔离约定）；
//   - need 声明需要哪些页面：{ h5:true, admin:false }，runner 按需开页面，避免无谓开销。

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PRIORITY_RE = /^P[0-2]$/

/**
 * 定义一个步骤。
 * @param {string} name 步骤名（失败信息会带上它）
 * @param {(ctx:any)=>Promise<any>} run 步骤体
 * @param {{timeoutMs?:number, soft?:boolean}} [opts] soft=true 允许失败后继续（默认硬步骤，失败即停）
 */
export function step(name, run, opts = {}) {
  return { name, run, timeoutMs: opts.timeoutMs || 0, soft: !!opts.soft }
}

/**
 * 定义一条用例并做元数据校验（配置错误在 --list 阶段就暴露，不等到跑起来）。
 */
export function defineCase(spec) {
  const {
    id, title, tags = [], priority = 'P1', impact = [], need = {}, timeoutMs = 240000,
    reset = true, requires = '', steps = [], setup = null, teardown = null, description = ''
  } = spec

  if (!id || !ID_RE.test(id)) throw new Error(`defineCase: id「${id}」不合法（要求小写 kebab，如 order-pay-full）`)
  if (!title) throw new Error(`defineCase(${id}): 缺少 title`)
  if (!PRIORITY_RE.test(priority)) throw new Error(`defineCase(${id}): priority 必须是 P0/P1/P2，得到「${priority}」`)
  if (!Array.isArray(tags) || !tags.length) throw new Error(`defineCase(${id}): tags 不能为空（至少含 smoke 或 regression）`)
  if (!Array.isArray(impact)) throw new Error(`defineCase(${id}): impact 必须是数组（可空）`)
  if (!Array.isArray(steps) || !steps.length) throw new Error(`defineCase(${id}): 至少要有 1 个 step`)
  for (const s of steps) {
    if (!s || typeof s.name !== 'string' || typeof s.run !== 'function') {
      throw new Error(`defineCase(${id}): step 结构错误（需要 { name, run }）`)
    }
  }
  if (setup && typeof setup !== 'function') throw new Error(`defineCase(${id}): setup 必须是函数`)
  if (teardown && typeof teardown !== 'function') throw new Error(`defineCase(${id}): teardown 必须是函数`)

  return {
    id,
    title,
    tags: [...new Set(tags)],
    priority,
    impact: [...new Set(impact.map((p) => String(p).replace(/\\/g, '/').replace(/^(?:drone-dispatch-)?prototype\//, '')), )],
    need: { h5: !!need.h5, admin: !!need.admin },
    timeoutMs,
    reset: reset !== false,
    requires,
    description,
    setup,
    steps,
    teardown,
    // 估算用时（报告表用，实际以运行为准）
    estimateSeconds: spec.estimateSeconds || 0
  }
}

/**
 * impact 匹配：改动文件 → 相关用例。
 * 支持「目录前缀」：impact 里写 `h5/src/pages/order` 能命中 `h5/src/pages/order/create.vue`。
 */
export function matchImpact(caseSpec, changedFiles = []) {
  const files = changedFiles.map((f) => String(f).replace(/\\/g, '/').replace(/^(?:drone-dispatch-)?prototype\//, '').replace(/^\.\//, ''))
  if (!files.length) return false
  if (!caseSpec.impact.length) return false
  return caseSpec.impact.some((scope) => {
    const s = scope.replace(/\/+$/, '')
    return files.some((f) => f === s || f.startsWith(s + '/') || s.startsWith(f) || f.includes(s))
  })
}
