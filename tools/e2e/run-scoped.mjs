// 按影响面挑判据脚本（2026-10-29 用户要求：改部分文案不该全量跑）。
// 用法：
//   node run-scoped.mjs h5/src/components/AckEntry.vue ...   显式给改动文件
//   node run-scoped.mjs                                      不给参数 = 用 git diff --name-only HEAD
//   node run-scoped.mjs --all                                全量
// 规则：
//   1) 只跑影响面命中的脚本；没命中的列出来但不跑。
//   2) status=stale（断言已被放弃的设计）不跑，但警告——留在判据里会让"全绿"变成假信号。
//   3) narrow=page 的脚本按改动页窄跑；改动落在共用文件（components / mixins / styles / App.vue）
//      时窄跑无效（结构判据量的是所有页的 rect），才跑全套。
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const E2E = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(E2E, '../..')
const scope = JSON.parse(fs.readFileSync(path.join(E2E, 'scope.json'), 'utf8'))

const argv = process.argv.slice(2)
const wantAll = argv.includes('--all')
let files = argv.filter(a => !a.startsWith('--'))
if (!files.length) {
  try {
    files = execSync('git diff --name-only HEAD', { cwd: ROOT }).toString().split('\n').filter(Boolean)
  } catch (e) {
    files = []
  }
}
if (!files.length) {
  console.log('没有改动文件可读（不是 git 仓库或无 diff）：把文件路径当参数传进来。')
  process.exit(2)
}

const toRx = p => new RegExp('^' + p.split('/').map(s =>
  s === '**' ? '.*' : s === '*' ? '[^/]+' : s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$')

const SHARED = /h5\/src\/(components|mixins|styles)\/|h5\/src\/App\.vue$/
const pageOf = f => {
  const m = f.match(/^h5\/src\/pages\/(apply|order)\/([A-Za-z]+)\.vue$/)
  return m ? m[1] + '/' + m[2] : null
}

const hits = []
const skipped = []
for (const [name, def] of Object.entries(scope.scripts)) {
  const matched = files.filter(f => def.match.some(p => toRx(p).test(f)))
  if (!matched.length) { skipped.push([name, def.status, '不在影响面']); continue }
  if (def.status === 'stale') { skipped.push([name, 'stale', def.why]); continue }
  let extra = []
  if (def.narrow === 'page') {
    const pages = [...new Set(matched.map(pageOf).filter(Boolean))]
    const shared = matched.some(f => SHARED.test(f))
    extra = shared || !pages.length ? [] : pages
    if (shared) console.log(`  ${name} ← 共用文件（${matched.filter(f => SHARED.test(f)).join(', ')}）→ 跑全套，不能窄跑`)
    else console.log(`  ${name} ← 只改了 ${pages.join(', ')} → 窄跑这 ${pages.length} 页`)
  }
  hits.push([name, matched, extra])
}

console.log(`影响面 ${files.length} 个文件 → 跑 ${hits.length} 个脚本`)
for (const [n, m] of hits) if (!scope.scripts[n].narrow) console.log(`  ${n} ← ${m.join(', ')}`)
if (skipped.length) {
  console.log(`不跑 ${skipped.length} 个：`)
  for (const [n, st, why] of skipped) console.log(`  ${n} [${st}] ${why}`)
}

if (wantAll) { console.log('\n(--all) 全量'); }
let failed = 0
for (const [name, matched, extra] of hits) {
  console.log(`\n=== ${name}${extra.length ? ' · ' + extra.join(' ') : ''} ===`)
  const r = spawnSync(process.execPath, [path.join(E2E, name), ...extra], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const out = (r.stdout || '').trim().split('\n')
  console.log(out.slice(-6).join('\n'))
  if (r.stderr && r.stderr.trim()) console.log('stderr: ' + r.stderr.trim().split('\n').slice(-3).join('\n'))
  if (r.status !== 0) failed++
}
console.log(`\n跑完 ${hits.length} 个 · 失败 ${failed}`)
process.exit(failed ? 1 : 0)
