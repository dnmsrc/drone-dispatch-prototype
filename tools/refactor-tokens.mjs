// 全站字号 / 字色收敛到 h5/src/App.vue 里的那一套变量（--fs-* / --fw-* / --text-* / --step-*）。
// 只处理 <style> 段里的 font-size / font-weight / 十六进制颜色；注释行跳过，模板和脚本不动。
// 跑之前把每个页面都拷了 .bak（同名 + .bak），要回退就把 .bak 覆盖回去即可。
// 运行：cd tools && node refactor-tokens.mjs [--dry]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../h5/src')
const DRY = process.argv.includes('--dry')
// App.vue 是变量的定义处、StepBar.vue 上一轮已经接入：这两个跳过，免得把定义本身也替换掉
const SKIP = new Set(['App.vue', path.join('components', 'StepBar.vue')])

// 就近吸附表：12 档之外的散值（18→20、25→24、38→40、44/46/48→44、64/68→64）
const FS = {
  18: '--fs-1', 20: '--fs-1', 22: '--fs-2', 24: '--fs-3', 25: '--fs-3', 26: '--fs-4',
  28: '--fs-5', 30: '--fs-6', 32: '--fs-7', 34: '--fs-8', 36: '--fs-9', 38: '--fs-10',
  40: '--fs-10', 44: '--fs-11', 46: '--fs-11', 48: '--fs-11', 56: '--fs-12', 64: '--fs-12', 68: '--fs-12'
}
const FW = { 500: '--fw-medium', 600: '--fw-semibold', 700: '--fw-bold', 800: '--fw-heavy' }
// 只替换有明确语义的颜色；一次性装饰色（#3DE0C0 / #E8ECFF / #07C160 / #B9C6FF 等）留着不动
const COLOR = {
  '#4a6cf7': 'var(--primary)', '#1a1d2e': 'var(--text-1)', '#5a6072': 'var(--text-2)',
  '#9aa0b5': 'var(--text-3)', '#c9cede': 'var(--text-4)', '#b9bfd4': 'var(--text-4)',
  '#eceef5': 'var(--line)', '#f2f3f9': 'var(--bg-2)', '#f6f7fb': 'var(--bg)',
  '#2ba471': 'var(--success)', '#f56c6c': 'var(--danger)', '#e6a23c': 'var(--warn)',
  '#6c8bff': 'var(--primary-2)'
}

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!e.name.endsWith('.vue')) continue
    if (SKIP.has(path.relative(SRC, p))) continue
    files.push(p)
  }
})(SRC)

const stats = { files: 0, font: 0, weight: 0, color: 0 }
const unknownFont = new Map()
const usedTokens = new Set()
const perFile = []

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8')
  const cut = raw.indexOf('<style')
  if (cut < 0) continue
  const head = raw.slice(0, cut), body = raw.slice(cut)
  const out = body.split('\n').map(line => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return line   // 注释行不动
    let s = line
    s = s.replace(/font-size:\s*(\d+)rpx/g, (m, n) => {
      const tok = FS[Number(n)]
      if (!tok) { unknownFont.set(n, (unknownFont.get(n) || 0) + 1); return m }
      stats.font++; usedTokens.add(tok.replace(/^--/, ''))
      return `font-size: var(${tok})`
    })
    s = s.replace(/font-weight:\s*(\d+)\b/g, (m, n) => {
      const tok = FW[Number(n)]
      if (!tok) return m
      stats.weight++; usedTokens.add(tok.replace(/^--/, ''))
      return `font-weight: var(${tok})`
    })
    s = s.replace(/#[0-9a-fA-F]{6}\b/g, m => {
      const tok = COLOR[m.toLowerCase()]
      if (!tok) return m
      stats.color++; usedTokens.add(tok.replace(/^var\(--/, '').replace(/\)$/, ''))
      return tok
    })
    return s
  }).join('\n')
  if (out !== body) {
    stats.files++
    perFile.push({ file: path.relative(SRC, f), changed: out !== body })
    if (!DRY) {
      const bak = f + '.bak'
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw, 'utf8')
      fs.writeFileSync(f, head + out, 'utf8')
    }
  }
}

// 页面里用到的每一个 var(--xxx) 都必须在 App.vue 的 :root 里有定义（两边都去掉 -- 前缀再比）
const appvue = fs.readFileSync(path.join(SRC, 'App.vue'), 'utf8')
const defined = new Set([...appvue.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1]))
const missing = [...usedTokens].filter(name => !defined.has(name))

console.log(DRY ? '[dry-run] 只看统计，不写文件' : '[写入] 已写文件并留 .bak')
console.log(`扫描 ${files.length} 个 .vue（跳过 App.vue / StepBar.vue），改动 ${stats.files} 个`)
console.log(`font-size 替换 ${stats.font} 处，font-weight 替换 ${stats.weight} 处，颜色替换 ${stats.color} 处`)
if (unknownFont.size) {
  console.log('字号表里没有的散值（保留原样，需要决定归到哪一档）:')
  for (const [v, c] of [...unknownFont.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  ${v}rpx × ${c}`)
}
console.log(missing.length ? `缺定义的变量: ${missing.join(', ')}` : '所有引用的变量都在 App.vue 里有定义')
console.log('改动文件:')
for (const r of perFile) console.log(`  ${r.file}`)
process.exit(missing.length ? 1 : 0)
