#!/usr/bin/env node
// 标准自动化测试套件入口：加载 cases/ → 筛选 → 逐条执行 → 输出 JUnit/JSON/Markdown 报告。
//
// 用法：
//   node run-suite.mjs --list                 # 列出全部用例（id/优先级/标签/需要页面/估算耗时）
//   node run-suite.mjs                        # 跑全部
//   node run-suite.mjs --tag=smoke            # 按标签跑（多个 --tag 取并集）
//   node run-suite.mjs --case=order-pay-full  # 按 id 跑（逗号分隔）
//   node run-suite.mjs --impact=drone-dispatch-prototype/h5/src/pages/order/create.vue   # 按改动文件跑相关用例
//   node run-suite.mjs --tag=smoke --impact=h5/src/pages/order       # 多个条件按交集
//   node run-suite.mjs --no-reset             # 不自动重置演示数据（默认每条用例前 reset）
//   node run-suite.mjs --headed=false         # 传参给浏览器（默认有头，仅调试用）
//
// 输出：reports/junit.xml、reports/report.json、reports/report.md；任何 FAIL 退出码 1。
// 前置：mock-server 在 8090(API+H5 产物) 与 8080(admin 产物) 运行中（Lead 的后台任务，勿重启）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  launchBrowser, closeBrowserSafe, newH5Page, newAdminPage, closePageSafe, shot, sleep,
  SHOTS_DIR, REPORTS_DIR, H5, ADMIN, API, EDGE
} from './lib/browser.mjs'
import { Asserts, AssertionError } from './lib/assert.mjs'
import { matchImpact } from './lib/case.mjs'
import {
  ApiClient, makeAdminClient, makeH5Client, resetDemoData, adminClient, userClient
} from './lib/api.mjs'

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))
const CASES_DIR = path.join(E2E_DIR, 'cases')

// ---------------- CLI ----------------
function parseArgs(argv) {
  const out = { list: false, cases: [], tags: [], impact: [], reset: true, help: false }
  for (const a of argv.slice(2)) {
    if (a === '--list' || a === '-l') out.list = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--no-reset') out.reset = false
    else if (a.startsWith('--case=')) out.cases.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean))
    else if (a.startsWith('--tag=')) out.tags.push(...a.slice(6).split(',').map((s) => s.trim()).filter(Boolean))
    else if (a.startsWith('--impact=')) out.impact.push(...a.slice(9).split(',').map((s) => s.trim()).filter(Boolean))
    else if (a.startsWith('--only=')) out.cases.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean))
    else if (a.startsWith('--')) throw new Error(`未知参数：${a}`)
    else out.cases.push(a)
  }
  return out
}

const HELP = `星穹 SkyShow 自动化测试套件

  node run-suite.mjs --list
  node run-suite.mjs [--case=id[,id]] [--tag=smoke|regression|...] [--impact=<改动文件或目录>] [--no-reset] [--list]

  前置服务：${API}（API + H5 构建产物）、${ADMIN}（admin 构建产物）
  报告目录：${REPORTS_DIR}
  截图目录：${SHOTS_DIR}
`

// ---------------- 加载用例 ----------------
async function loadCases() {
  if (!fs.existsSync(CASES_DIR)) throw new Error(`cases 目录不存在：${CASES_DIR}`)
  const files = fs.readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort()
  const list = []
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(CASES_DIR, f)).href)
    const spec = mod.default
    if (!spec || !spec.id) throw new Error(`用例文件 ${f} 没有 default defineCase 导出`)
    if (spec.__file === undefined) spec.__file = f
    list.push(spec)
  }
  const dup = new Set()
  for (const c of list) { if (dup.has(c.id)) throw new Error(`用例 id 重复：${c.id}`); dup.add(c.id) }
  const rank = { P0: 0, P1: 1, P2: 2 }
  return list.sort((a, b) => (rank[a.priority] - rank[b.priority]) || a.id.localeCompare(b.id))
}

function selectCases(all, opts) {
  return all.filter((c) => {
    if (opts.cases.length && !opts.cases.includes(c.id)) return false
    if (opts.tags.length && !opts.tags.some((t) => c.tags.includes(t))) return false
    if (opts.impact.length && !matchImpact(c, opts.impact)) return false
    return true
  })
}

// ---------------- 服务可用性预检 ----------------
async function preflight() {
  const problems = []
  for (const [label, base] of [['H5/API', API], ['admin', ADMIN]]) {
    try {
      const r = await fetch(`${base}/api/config/pricing`, { signal: AbortSignal.timeout(6000) })
      const j = await r.json()
      if (j.code !== 0) problems.push(`${label} ${base} 返回 code=${j.code}`)
    } catch (e) {
      problems.push(`${label} ${base} 不可达：${String(e.message || e).slice(0, 120)}`)
    }
  }
  if (!fs.existsSync(EDGE)) problems.push(`本机 Edge 不存在：${EDGE}（用 EDGE_PATH 覆盖）`)
  return problems
}

// ---------------- 单条用例执行 ----------------
const TERM = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP' }

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise
  let timer
  return Promise.race([
    promise,
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} 超时（${ms}ms）`)), ms) })
  ]).finally(() => clearTimeout(timer))
}

async function runCase(caseSpec, browser, globalOpts, runIndex) {
  const t0 = Date.now()
  const assert = new Asserts(caseSpec.id)
  const runId = `${caseSpec.id.split('-')[0]}${String(runIndex).padStart(2, '0')}`
  const result = {
    id: caseSpec.id,
    title: caseSpec.title,
    tags: caseSpec.tags,
    priority: caseSpec.priority,
    impact: caseSpec.impact,
    need: caseSpec.need,
    status: TERM.FAIL,
    durationMs: 0,
    steps: [],
    asserts: null,
    failure: null,
    shots: [],
    skippedSteps: []
  }

  console.log(`\n═══ [${caseSpec.priority}] ${caseSpec.id} · ${caseSpec.title} ═══`)
  if (caseSpec.requires) console.log(`    前置：${caseSpec.requires}`)

  let h5Page = null
  let adminPage = null
  let ctx = null
  let teardownError = null

  try {
    // 1. 登录态与 API 客户端（reset 前拿 admin token；reset 后重新发一次 user 登录确保 u-demo 在库里）
    let adminTok, adminInfo
    try {
      const a = await adminClient(ADMIN, { username: 'admin', password: 'admin123' })
      adminTok = a.token
    } catch (e) {
      // operator 账号也允许（部分用例只读看板）
      const a = await adminClient(ADMIN, { username: 'admin', password: 'admin123' })
      adminTok = a.token
    }
    const adminApi = makeAdminClient(ADMIN).setToken(adminTok)

    // 2. 数据隔离：默认每条用例前重置到种子态（订单无删除接口，只能靠 reset）
    if (globalOpts.reset && caseSpec.reset) {
      await resetDemoData(adminApi)
    }
    const u = await userClient(API)
    const userApi = u.api

    // 3. 按 need 开页面（每条用例新开，避免上一条的登录态/页面栈残留）
    if (caseSpec.need.h5) h5Page = await newH5Page(browser)
    if (caseSpec.need.admin) adminPage = await newAdminPage(browser)

    ctx = {
      caseId: caseSpec.id,
      runId,
      assert,
      browser,
      h5: h5Page,
      admin: adminPage,
      h5Page,
      adminPage,
      userApi,
      adminApi,
      user: { token: u.token, user: u.user },
      admin: { token: adminTok },
      state: {},
      log: (msg) => console.log(`  · ${msg}`),
      shot: async (name, which = 'h5') => {
        const page = which === 'admin' ? adminPage : h5Page
        if (!page) return ''
        const file = await shot(page, `${caseSpec.id}-${name}`, { dir: path.join(SHOTS_DIR, caseSpec.id) })
        if (file) result.shots.push(file)
        return file
      }
    }

    // 4. setup → steps（逐步计时；硬失败即停，后续步骤标记 skipped）
    if (caseSpec.setup) {
      assert.beginStep('setup')
      await withTimeout(caseSpec.setup(ctx), Math.min(caseSpec.timeoutMs, 60000), 'setup')
    }
    for (const st of caseSpec.steps) {
      assert.beginStep(st.name)
      const st0 = Date.now()
      console.log(`  ▶ ${st.name}`)
      let stepStatus = 'PASS'
      try {
        const remain = caseSpec.timeoutMs - (Date.now() - t0)
        const stepMs = st.timeoutMs || Math.max(0, remain)
        await withTimeout(st.run(ctx), stepMs, `步骤「${st.name}」`)
      } catch (e) {
        stepStatus = st.soft ? 'FAIL' : 'FAIL'
        const msg = e instanceof AssertionError
          ? e.message
          : `步骤「${st.name}」异常：${String(e.message || e).slice(0, 400)}`
        result.failure = result.failure || { step: st.name, message: msg, errorName: e.name || 'Error' }
        console.log(`  ❌ ${st.name} — ${msg.split('\n')[0]}`)
        // 失败现场截图（两页都拍，便于事后定位）
        await shot(h5Page, `${caseSpec.id}-FAIL`, { dir: path.join(SHOTS_DIR, caseSpec.id) }).then((f) => f && result.shots.push(f))
        await shot(adminPage, `${caseSpec.id}-FAIL-admin`, { dir: path.join(SHOTS_DIR, caseSpec.id) }).then((f) => f && result.shots.push(f))
        if (!st.soft) {
          const rest = caseSpec.steps.slice(caseSpec.steps.indexOf(st) + 1).map((s) => s.name)
          result.skippedSteps = rest
        }
        result.steps.push({ name: st.name, status: stepStatus, durationMs: Date.now() - st0 })
        if (!st.soft) break
        continue
      }
      result.steps.push({ name: st.name, status: stepStatus, durationMs: Date.now() - st0 })
      console.log(`  ✅ ${st.name} (${((Date.now() - st0) / 1000).toFixed(1)}s)`)
    }
  } catch (e) {
    const msg = e instanceof AssertionError ? e.message : `用例异常：${String(e.message || e).slice(0, 500)}`
    result.failure = result.failure || { step: assert.step, message: msg, errorName: e.name || 'Error' }
    console.log(`  ❌ ${msg.split('\n')[0]}`)
    if (ctx) await ctx.shot('FAIL-pre').catch(() => {})
  } finally {
    if (caseSpec.teardown && ctx) {
      assert.beginStep('teardown')
      try { await withTimeout(caseSpec.teardown(ctx), 30000, 'teardown') }
      catch (e) { teardownError = String(e.message || e) }
    }
    await closePageSafe(h5Page)
    await closePageSafe(adminPage)
  }

  result.durationMs = Date.now() - t0
  result.asserts = assert.toJSON()
  const failed = result.failure || assert.hardFailed.length ? TERM.FAIL : TERM.PASS
  result.status = failed
  if (teardownError) {
    result.status = TERM.FAIL
    result.failure = result.failure || { step: 'teardown', message: teardownError }
  }
  // 断言级失败但没抛错（软断言/负控空判不会抛）也要判 FAIL
  if (assert.hardFailed.length && !result.failure) {
    result.failure = { step: assert.hardFailed[0].step, message: assert.hardFailed[0].name + '：' + assert.hardFailed[0].detail }
  }
  console.log(`  ${result.status === TERM.PASS ? '✅ PASS' : '❌ FAIL'} · ${assert.summary()} · ${(result.durationMs / 1000).toFixed(1)}s`)
  if (result.skippedSteps.length) console.log(`  ⏭ 未执行步骤（前面已失败）：${result.skippedSteps.join(' / ')}`)
  if (result.failure) {
    console.log('  ✖ 失败定位：' + result.failure.step + ' → ' + result.failure.message.replace(/\n/g, '\n      '))
  }
  return result
}

// ---------------- 报告 ----------------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function writeJunit(results, meta) {
  const failures = results.filter((r) => r.status === 'FAIL').length
  const skipped = results.filter((r) => r.status === 'SKIP').length
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="sky-show-e2e" tests="${results.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${(meta.durationMs / 1000).toFixed(3)}">`,
    `  <testsuite name="sky-show-e2e" tests="${results.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${(meta.durationMs / 1000).toFixed(3)}" timestamp="${esc(meta.startedAt)}">`
  ]
  for (const r of results) {
    lines.push(`    <testcase classname="e2e.${esc(r.priority)}" name="${esc(r.id)}" time="${(r.durationMs / 1000).toFixed(3)}">`)
    if (r.status === 'FAIL' && r.failure) {
      const detail = [
        `step: ${r.failure.step}`,
        `message: ${r.failure.message}`,
        '',
        ...(r.asserts ? r.asserts.records.filter((x) => !x.ok).map((x) => `[${x.kind}] ${x.step} · ${x.name} :: ${x.detail}`) : [])
      ].join('\n')
      lines.push(`      <failure type="${esc(r.failure.errorName || 'AssertionError')}" message="${esc(r.failure.message)}">${esc(detail)}</failure>`)
    }
    if (r.status === 'SKIP') lines.push(`      <skipped message="${esc(r.failure ? r.failure.message : '跳过')}"/>`)
    lines.push(`      <system-out>${esc((r.steps || []).map((s) => `${s.status} ${s.name} (${(s.durationMs / 1000).toFixed(1)}s)`).join('\n'))}</system-out>`)
    lines.push('    </testcase>')
  }
  lines.push('  </testsuite>', '</testsuites>', '')
  return lines.join('\n')
}

function writeMarkdown(results, meta) {
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  const L = []
  L.push('# 星穹 SkyShow 自动化测试报告', '')
  L.push(`- 运行时间：${meta.startedAt}（耗时 ${(meta.durationMs / 1000).toFixed(1)}s）`)
  L.push(`- 被测服务：H5 ${meta.h5} · admin ${meta.admin}`)
  L.push(`- 筛选条件：${meta.filterText}`)
  L.push(`- 结果：**${passed} 通过 / ${failed} 失败 / ${results.length} 条**`, '')
  L.push('## 分项结果', '')
  L.push('| 状态 | 用例 | 优先级 | 标签 | 断言 | 耗时 | 失败步骤 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const r of results) {
    const a = r.asserts || { passed: 0, total: 0 }
    L.push(`| ${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | \`${r.id}\` ${r.title} | ${r.priority} | ${r.tags.join(', ')} | ${a.passed}/${a.total} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.failure ? r.failure.step : '—'} |`)
  }
  L.push('', '## 步骤明细', '')
  for (const r of results) {
    L.push(`### ${r.id}（${r.status}）`, '')
    for (const s of r.steps) L.push(`- ${s.status === 'PASS' ? '✅' : '❌'} ${s.name} · ${(s.durationMs / 1000).toFixed(1)}s`)
    if (r.skippedSteps.length) L.push(`- ⏭ 未执行：${r.skippedSteps.join(' / ')}`)
    if (r.failure) L.push('', `**失败定位**：步骤「${r.failure.step}」`, '', '```', r.failure.message, '```')
    const failedAsserts = (r.asserts && r.asserts.records || []).filter((x) => !x.ok)
    if (failedAsserts.length) {
      L.push('', '失败断言：')
      for (const x of failedAsserts) L.push(`- [${x.kind}] ${x.step} · ${x.name} — ${x.detail}`)
    }
    if (r.shots.length) L.push('', `截图：${r.shots.map((s) => '`' + path.relative(E2E_DIR, s).replace(/\\/g, '/') + '`').join('、')}`)
    L.push('')
  }
  return L.join('\n')
}

function writeReports(results, meta) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const junit = writeJunit(results, meta)
  const md = writeMarkdown(results, meta)
  const json = {
    meta,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      skipped: results.filter((r) => r.status === 'SKIP').length,
      durationMs: meta.durationMs
    },
    cases: results
  }
  const paths = {
    junit: path.join(REPORTS_DIR, 'junit.xml'),
    json: path.join(REPORTS_DIR, 'report.json'),
    md: path.join(REPORTS_DIR, 'report.md')
  }
  fs.writeFileSync(paths.junit, junit)
  fs.writeFileSync(paths.json, JSON.stringify(json, null, 2))
  fs.writeFileSync(paths.md, md)
  return paths
}

// ---------------- 主流程 ----------------
async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) { console.log(HELP); return 0 }
  const all = await loadCases()
  const selected = selectCases(all, opts)

  const filterText = [
    opts.cases.length ? `--case=${opts.cases.join(',')}` : '',
    opts.tags.length ? `--tag=${opts.tags.join(',')}` : '',
    opts.impact.length ? `--impact=${opts.impact.join(',')}` : ''
  ].filter(Boolean).join(' ') || '全部用例'

  if (opts.list) {
    console.log(`\n共 ${all.length} 条用例（${filterText} 命中 ${selected.length} 条）\n`)
    const head = ['ID', '优先级', '标签', '页面', '估算', '标题']
    const rows = selected.map((c) => [
      c.id, c.priority, c.tags.join(','),
      [c.need.h5 ? 'h5' : '', c.need.admin ? 'admin' : ''].filter(Boolean).join('+') || '-',
      c.estimateSeconds ? `${c.estimateSeconds}s` : '-',
      c.title
    ])
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
    const fmt = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padEnd(widths[i]))).join('  ')
    console.log(fmt(head))
    console.log(widths.map((w) => '-'.repeat(w)).join('  '))
    for (const r of rows) console.log(fmt(r))
    console.log('')
    return 0
  }

  if (!selected.length) {
    console.error(`没有匹配的用例（${filterText}）。用 --list 查看全部用例。`)
    return 2
  }

  const problems = await preflight()
  if (problems.length) {
    console.error('\n前置检查失败：')
    for (const p of problems) console.error('  - ' + p)
    console.error('\n请先启动 mock-server（8090=API+H5 产物，8080=admin 产物）后重跑。')
    return 2
  }

  const startedAt = new Date()
  const meta = {
    suite: 'sky-show-e2e',
    startedAt: startedAt.toISOString(),
    h5: H5,
    admin: ADMIN,
    api: API,
    filterText,
    reset: opts.reset,
    node: process.version,
    edge: EDGE
  }

  console.log(`\n星穹 SkyShow 自动化套件：${selected.length}/${all.length} 条用例`)
  console.log(`被测：H5 ${H5} · admin ${ADMIN} · 筛选：${filterText}\n`)

  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  const browser = await launchBrowser()
  const results = []
  try {
    for (const c of selected) {
      try {
        results.push(await runCase(c, browser, opts, results.length + 1))
      } catch (e) {
        // 兜底：runCase 自身异常也不能中断整轮
        results.push({
          id: c.id, title: c.title, tags: c.tags, priority: c.priority, impact: c.impact, need: c.need,
          status: TERM.FAIL, durationMs: 0, steps: [], asserts: null, shots: [],
          failure: { step: '(runner)', message: `执行器异常：${String(e.message || e).slice(0, 300)}` }, skippedSteps: []
        })
        console.error(`  ❌ ${c.id} 执行器异常：${e.message}`)
      }
    }
  } finally {
    await closeBrowserSafe(browser)
  }

  meta.finishedAt = new Date().toISOString()
  meta.durationMs = Date.now() - startedAt.getTime()
  const paths = writeReports(results, meta)

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log('\n' + '─'.repeat(72))
  console.log(`结果：${passed}/${results.length} 通过 · ${failed} 失败 · 耗时 ${(meta.durationMs / 1000).toFixed(1)}s`)
  for (const r of results) {
    const a = r.asserts || { passed: 0, total: 0 }
    console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.id.padEnd(28)} ${(r.durationMs / 1000).toFixed(1).padStart(6)}s  断言 ${a.passed}/${a.total}${r.failure ? '  ← ' + r.failure.step : ''}`)
  }
  console.log(`\n报告：${paths.junit}`)
  console.log(`      ${paths.json}`)
  console.log(`      ${paths.md}`)
  console.log(`截图：${SHOTS_DIR}`)
  if (failed) {
    console.log('\n失败明细：')
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  · ${r.id}｜${r.failure.step}｜${r.failure.message.split('\n')[0].slice(0, 160)}`)
    }
  }
  return failed ? 1 : 0
}

main().then((code) => { process.exitCode = code }).catch((e) => { console.error('FATAL', e.stack || e.message); process.exitCode = 2 })
