// 模板引用审计（2026-11-03）：选项式 API 下，模板里直接调用的标识符必须是实例上的键
// （methods / computed / data / props / 组件），只 import 不进 methods 的话，模板求值抛
// `X is not a function`，Vue 会把出错的那个节点渲染成 <!----> —— 整行静默消失，控制台只有一条 error。
// 这正是「我的预约」页派单号行 / 报价行消失的原因，所以做成静态判据，防止同类问题再混进来。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../h5/src')
const BUILTIN = new Set(['String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'parseInt',
  'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'encodeURI', 'slice', 'filter', 'map', 'join', 'includes',
  'toFixed', 'match', 'replace', 'split', 'trim', 'push', 'concat', 'keys', 'values', 'entries', 'max', 'min',
  '$emit', '$nextTick', '$forceUpdate', '$refs'])
const files = []
const walk = d => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (f.name.endsWith('.vue') && !f.name.endsWith('.bak')) files.push(p)
  }
}
walk(ROOT)

const keyOf = (src, file) => {
  // 取 `methods: {` / `computed: {` / `data() { return {` 里的键名（一层足够）
  const set = new Set()
  const block = (name, kind = 'obj') => {
    let i = src.indexOf(`${name}: {`)
    if (i < 0) return
    i = src.indexOf('{', i)
    let depth = 0
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') { depth--; if (depth === 0) { collect(src.slice(i, j)); return } }
    }
  }
  const collect = s => {
    // 键写法三种：`fn() {` / `key: val` / 简写 `fn,`（mine 页的 fmtStamp 是简写，第一版正则漏了它；
    // 单行块 `methods: { fmtTime, summary: orderSummary }` 里的第一个键也要能匹配）
    const re = /(?:^|[\n{;,])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|:|,)/g
    let m
    while ((m = re.exec(s))) set.add(m[1])
    // data() { return { ... } } 的键
    const rr = src.match(/return\s*\{([^}]*)\}/)
    if (rr) { let m2; const r2 = /([A-Za-z_$][\w$]*)\s*:/g; while ((m2 = r2.exec(rr[1]))) set.add(m2[1]) }
  }
  block('methods'); block('computed')
  // props
  const pm = src.match(/props\s*:\s*(?:\{[^}]*\}|\[[^\]]*\])/s)
  if (pm) { let m3; const r3 = /([A-Za-z_$][\w$]*)\s*:\s*\{/g; while ((m3 = r3.exec(pm[0]))) set.add(m3[1]) }
  // mixins：`mixins: [ackPop]` 的方法也挂在实例上（open/confirmGate 就在 mixins/ackPop.js 里）
  for (const mm of src.matchAll(/mixins\s*:\s*\[([^\]]*)\]/g)) {
    for (const name of mm[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const mixFile = path.join(path.dirname(file), '..', '..', 'mixins', name + '.js')
      if (fs.existsSync(mixFile)) {
        const ms = fs.readFileSync(mixFile, 'utf8')
        const re = /(?:^|[\n{;,])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|:|,)/g
        let m4
        while ((m4 = re.exec(ms))) set.add(m4[1])
      }
    }
  }
  // data() { return { ... } } 单独再取一次（上面 collect 只在 block 里跑）
  return set
}

const importsOf = src => {
  const set = new Set()
  for (const m of src.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
    if (m[1]) set.add(m[1])
    if (m[2]) m[2].split(',').forEach(x => { const n = x.split(/\s+as\s+/).pop().trim(); if (n) set.add(n) })
  }
  return set
}

let bad = 0, warn = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const tpl = (src.match(/<template>([\s\S]*?)<\/template>/) || [, ''])[1]
  const script = (src.match(/<script[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1]
  if (!tpl || !script) continue
  const defined = keyOf(script, f)
  const imports = importsOf(script)
  // 模板里的表达式集合
  const exprs = []
  for (const m of tpl.matchAll(/\{\{([\s\S]*?)\}\}/g)) exprs.push(m[1])
  for (const m of tpl.matchAll(/(?:v-if|v-else-if|v-show|v-for|v-model(?::\w+)?|:\w+(?:\.\w+)?|@\w+)\s*=\s*"([^"]*)"/g)) exprs.push(m[1])
  const called = new Set()
  for (const e of exprs) {
    for (const m of e.matchAll(/(?<![.\w$'"`])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const n = m[1]
      if (['if', 'for', 'return', 'typeof', 'new', 'in', 'of', 'void', 'await', 'function', 'catch'].includes(n)) continue
      if (BUILTIN.has(n)) continue
      called.add(n)
    }
  }
  const issues = []
  for (const n of called) {
    if (defined.has(n)) continue
    if (imports.has(n)) { issues.push(`BUG  ${n} 从 import 直接用在模板，但没挂到 methods/computed`); continue }
    // v-for 局部变量遮蔽：`(e, i) in` / `x in list`
    const shadowed = new RegExp(`(?:^|[,(]\\s*)${n}\\b|\\b${n}\\s+(?:in|of)\\b`).test(tpl)
    if (shadowed) continue
    issues.push(`WARN ${n} 在模板里调用，但 script 里找不到定义`)
  }
  if (issues.length) {
    console.log(`\n${path.relative(ROOT, f).replace(/\\/g, '/')}`)
    issues.forEach(i => console.log('  ' + i))
    if (issues.some(i => i.startsWith('BUG'))) bad++
    else warn++
  }
}
console.log(`\n扫描 ${files.length} 个 .vue · 模板直调未挂实例（会静默吞节点）${bad} 个文件 · 未定义函数 ${warn} 个文件`)
process.exitCode = bad ? 1 : 0
