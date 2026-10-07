#!/usr/bin/env node
// 对比两次 snapshot.mjs 的输出：node scripts/api-regression/compare.mjs ./snap-old ./snap-new [--ignore a,b,c]
// --ignore 填新版本有意新增的字段名（旧快照里没有的字段），这些字段只在新快照中出现时不算差异。
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [oldDir, newDir, ...rest] = process.argv.slice(2)
const ignoreIdx = rest.indexOf('--ignore')
const ignore = new Set(ignoreIdx >= 0 ? (rest[ignoreIdx + 1] || '').split(',').filter(Boolean) : [])
// --skip-values：只比较字段是否存在、不比较值（如测试模式下按当前时间生成的 updatedAt）
const skipIdx = rest.indexOf('--skip-values')
const skipValues = new Set(skipIdx >= 0 ? (rest[skipIdx + 1] || '').split(',').filter(Boolean) : [])
if (!oldDir || !newDir) {
  console.error('usage: compare.mjs <oldDir> <newDir> [--ignore field1,field2]')
  process.exit(2)
}

const diffs = []
const orderDiffs = []
function walk(a, b, path) {
  if (diffs.length > 2000) return
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return diffs.push(`${path}: type ${typeof a} vs ${typeof b}`)
    if (a.length !== b.length) diffs.push(`${path}: length ${a.length} vs ${b.length}`)
    // 同样一批记录只是顺序不同（如创建时间相同的单据），只报一条“顺序不同”，再按 id 逐条比较内容
    const ids = list => list.map(x => (x && typeof x === 'object' ? x.id : undefined))
    const [ia, ib] = [ids(a), ids(b)]
    if (a.length === b.length && ia.every(Boolean) && ib.every(Boolean) && ia.join() !== ib.join()
        && [...ia].sort().join() === [...ib].sort().join()) {
      const moved = ia.filter((id, i) => id !== ib[i]).length
      orderDiffs.push(`${path}: same ${a.length} records, ${moved} in different order`)
      const byId = new Map(b.map(x => [x.id, x]))
      a.forEach(x => walk(x, byId.get(x.id), `${path}{id=${x.id}}`))
      return
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a) && ignore.has(k)) continue
      if (!(k in b)) { diffs.push(`${path}.${k}: missing in new`); continue }
      if (!(k in a)) { diffs.push(`${path}.${k}: added in new`); continue }
      if (skipValues.has(k)) continue
      walk(a[k], b[k], `${path}.${k}`)
    }
    return
  }
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) return
  if (a !== b) diffs.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`)
}

let files = 0
for (const f of readdirSync(oldDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  files++
  const newFile = join(newDir, f)
  if (!existsSync(newFile)) { diffs.push(`${f}: missing in new snapshot`); continue }
  walk(JSON.parse(readFileSync(join(oldDir, f), 'utf8')), JSON.parse(readFileSync(newFile, 'utf8')), f)
}

const timing = dir => existsSync(join(dir, '_timings.json')) ? JSON.parse(readFileSync(join(dir, '_timings.json'), 'utf8')) : []
const sum = (list, key) => list.reduce((s, t) => s + t[key], 0)
const [to, tn] = [timing(oldDir), timing(newDir)]
if (to.length && tn.length) {
  console.log(`old: ${sum(to, 'ms')} ms, ${(sum(to, 'bytes') / 1048576).toFixed(2)} MB | new: ${sum(tn, 'ms')} ms, ${(sum(tn, 'bytes') / 1048576).toFixed(2)} MB`)
}
if (orderDiffs.length) {
  console.log(`order-only differences (same records, ties in sort key):`)
  orderDiffs.forEach(d => console.log('  ' + d))
}
if (diffs.length) {
  const perFile = {}
  diffs.forEach(d => { const f = d.split(/[.[{:]/)[0]; perFile[f] = (perFile[f] || 0) + 1 })
  console.log(`${diffs.length} difference(s) across ${files} snapshot files:`)
  Object.entries(perFile).forEach(([f, n]) => console.log(`  ${f}: ${n}`))
  diffs.slice(0, 60).forEach(d => console.log('  ' + d))
  process.exit(1)
}
console.log(`OK: ${files} snapshot files identical${ignore.size ? ` (ignoring added fields: ${[...ignore].join(', ')})` : ''}`)
