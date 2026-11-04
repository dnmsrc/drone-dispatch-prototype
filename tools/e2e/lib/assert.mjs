// 结构化断言收集：PASS / FAIL / 负控 / 软断言，失败信息必须能定位到「步骤 + 实际值」。
//
// 语义：
//   check(name, ok, detail)     硬断言：不通过 → 抛 AssertionError，当前用例停止后续步骤（继续下一条用例）。
//   soft(name, ok, detail)      软断言：不通过只记账，不打断（用于「有更好、没有也不该红」的辅助判据）。
//   negative(name, judge, sample) 负控：给一条必然失败的伪造样本，judge(sample) 必须返回 false。
//                                如果伪造样本被判通过 → 判据是空判，记 FAIL（这类假绿比假红危险）。
//   eq/includes/match/gt        语法糖，detail 里自动带 expected / actual。
import util from 'node:util'

export class AssertionError extends Error {
  constructor(message, record) {
    super(message)
    this.name = 'AssertionError'
    this.record = record
  }
}

export class Asserts {
  constructor(caseId = '') {
    this.caseId = caseId
    this.step = '(初始化)'
    this.records = []
  }

  beginStep(name) { this.step = name }

  _fmt(v) {
    if (typeof v === 'string') return v.length > 180 ? v.slice(0, 180) + '…' : v
    try { return util.inspect(v, { breakLength: Infinity, depth: 3 }).slice(0, 220) } catch (e) { return String(v) }
  }

  _push(record) {
    this.records.push(record)
    const icon = record.ok ? '✅' : '❌'
    const kind = record.kind === 'negative' ? ' [负控]' : record.kind === 'soft' ? ' [软]' : ''
    console.log(`  ${icon}${kind} ${record.name}${record.detail ? ' — ' + record.detail : ''}`)
    return record
  }

  /**
   * 硬断言。失败抛 AssertionError（带 step / detail）。
   */
  check(name, ok, detail = '') {
    const rec = this._push({ kind: 'hard', step: this.step, name, ok: !!ok, detail: String(detail || '') })
    if (!rec.ok) {
      const msg = `步骤「${this.step}」断言失败：${name}${detail ? `\n  实际：${detail}` : ''}`
      throw new AssertionError(msg, rec)
    }
    return rec
  }

  /** 软断言：不通过只记账，不打断。 */
  soft(name, ok, detail = '') {
    return this._push({ kind: 'soft', step: this.step, name, ok: !!ok, detail: String(detail || '') })
  }

  /**
   * 负控：judge(sample) 必须为 false（伪造样本必须被判失败）。
   * @param {(sample:any)=>boolean} judge 被测判据
   * @param {any} sample 伪造样本
   */
  negative(name, judge, sample) {
    let passed
    try { passed = !!judge(sample) } catch (e) { passed = false }
    return this._push({
      kind: 'negative', step: this.step, name, ok: !passed,
      detail: passed ? `空判：伪造样本被判通过（${this._fmt(sample)}）` : `伪造样本已被判失败（${this._fmt(sample)}）`
    })
  }

  eq(name, actual, expected, detail = '') {
    return this.check(name, actual === expected, `expected=${this._fmt(expected)} / actual=${this._fmt(actual)}${detail ? ' · ' + detail : ''}`)
  }

  /** 数值相等（容忍浮点误差）。 */
  eqNum(name, actual, expected, eps = 0.5, detail = '') {
    return this.check(name, Math.abs(Number(actual) - Number(expected)) <= eps,
      `expected≈${this._fmt(expected)} / actual=${this._fmt(actual)}${detail ? ' · ' + detail : ''}`)
  }

  includes(name, haystack, needle, detail = '') {
    return this.check(name, String(haystack || '').includes(String(needle)),
      `应包含「${needle}」/ actual=${this._fmt(haystack)}${detail ? ' · ' + detail : ''}`)
  }

  notIncludes(name, haystack, needle, detail = '') {
    return this.check(name, !String(haystack || '').includes(String(needle)),
      `不应包含「${needle}」/ actual=${this._fmt(haystack)}${detail ? ' · ' + detail : ''}`)
  }

  match(name, actual, re, detail = '') {
    return this.check(name, re.test(String(actual || '')),
      `应匹配 ${re} / actual=${this._fmt(actual)}${detail ? ' · ' + detail : ''}`)
  }

  gt(name, actual, min, detail = '') {
    return this.check(name, Number(actual) > Number(min), `应 > ${min} / actual=${this._fmt(actual)}${detail ? ' · ' + detail : ''}`)
  }

  gte(name, actual, min, detail = '') {
    return this.check(name, Number(actual) >= Number(min), `应 ≥ ${min} / actual=${this._fmt(actual)}${detail ? ' · ' + detail : ''}`)
  }

  fail(name, detail = '') {
    return this.check(name, false, detail)
  }

  get failed() { return this.records.filter((r) => !r.ok) }
  get hardFailed() { return this.records.filter((r) => !r.ok && r.kind !== 'soft') }
  get softFailed() { return this.records.filter((r) => !r.ok && r.kind === 'soft') }
  get passed() { return this.records.filter((r) => r.ok).length }

  /** 供报告使用的结构化结果。 */
  toJSON() {
    return {
      caseId: this.caseId,
      total: this.records.length,
      passed: this.passed,
      failed: this.hardFailed.length,
      softFailed: this.softFailed.length,
      records: this.records
    }
  }

  /** 单行摘要（runner 打印 / report.md 用）。 */
  summary() {
    return `${this.passed}/${this.records.length} 通过 · ${this.hardFailed.length} 硬失败 · ${this.softFailed.length} 软失败`
  }
}
