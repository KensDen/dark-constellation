#!/usr/bin/env node
// The one-step robustness sweep (v1.3 R0b, brief 11). Runs
// tests/sweep-steps.spec.ts once per step, each in its own process, and
// prints one table: Prepared (the gated line), the line that follows the
// flag (reported) and Novice, on STANDARD and EASY, over the sweep's seeds
// (tests/sweep-run.ts SEEDS, 500).
//
//   npm run sweep:steps                         the R0 numbers and Ken's ten steps
//   npm run sweep:steps -- '{"funding":25}'     the same ten steps around another point
//
// A step names only what it moves: meter (damage a point), asset (damage a
// point), bills (a factor on every repair bill and the loss review),
// upkeep (CR a turn a defense), funding (CR a turn), and, for a center only,
// intelBrief (the brief's price in CR). Everything else is the repo's own
// number. Any other key, or a value that is not a number, is refused: the
// R0b review found a center like {"intelBrief":4} silently played at 8.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const R0 = { meter: 5, asset: 12, bills: 1, upkeep: 2, funding: 20 }
const KNOWN = new Set([...Object.keys(R0), 'intelBrief'])
const given = JSON.parse(process.argv[2] ?? '{}')
for (const [key, value] of Object.entries(given)) {
  if (!KNOWN.has(key)) throw new Error(`unknown number "${key}"; a center can set ${[...KNOWN].join(', ')}`)
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`"${key}" must be a number, got ${JSON.stringify(value)}`)
}
const center = { ...R0, ...given }
const STEPS = [
  ['center', {}],
  ['meter damage -1', { meter: center.meter - 1 }],
  ['meter damage +1', { meter: center.meter + 1 }],
  ['asset damage -2', { asset: center.asset - 2 }],
  ['asset damage +2', { asset: center.asset + 2 }],
  ['upkeep -1', { upkeep: center.upkeep - 1 }],
  ['upkeep +1', { upkeep: center.upkeep + 1 }],
  ['funding -5', { funding: center.funding - 5 }],
  ['funding +5', { funding: center.funding + 5 }],
  ['repair bills -25%', { bills: center.bills * 0.75 }],
  ['repair bills +25%', { bills: center.bills * 1.25 }],
]

const dir = mkdtempSync(join(tmpdir(), 'dc-sweep-steps-'))
let seeds = 0
const grades = (g) => ['S', 'A', 'B', 'C', 'D', 'F'].map((k) => g[k]).join('/')
const rows = []
for (const [i, [label, moved]] of STEPS.entries()) {
  const step = { ...center, ...moved }
  const out = join(dir, `step-${i}.json`)
  const res = spawnSync(join(ROOT, 'node_modules', '.bin', 'vitest'), ['run', 'tests/sweep-steps.spec.ts'], {
    cwd: ROOT,
    env: { ...process.env, SWEEP_STEP: JSON.stringify(step), SWEEP_STEP_OUT: out },
    encoding: 'utf8',
  })
  if (res.error) throw new Error(`step "${label}" could not run vitest: ${res.error.message}`)
  if (res.status !== 0) {
    process.stderr.write(`${res.stdout ?? ''}${res.stderr ?? ''}`)
    throw new Error(`step "${label}" failed`)
  }
  const r = JSON.parse(readFileSync(out, 'utf8'))
  seeds = r.seeds
  const pct = (n) => `${((100 * n) / r.seeds).toFixed(1)}`
  const p = r['prepared:standard']
  const f = r['follow:standard']
  const shown = Object.entries(moved).map(([k, v]) => `${k} ${v}`).join(', ') || JSON.stringify(step)
  rows.push(
    `| ${label} (${shown}) | ${pct(p.wins)} | ${pct(r['prepared:easy'].wins)} | ${pct(r['novice:standard'].wins)} | ${pct(r['novice:easy'].wins)} | ${p.insolvencies} | ${grades(p.grades)} | ${pct(f.wins)} (${f.insolvencies} F) | ${pct(r['follow:easy'].wins)} (${r['follow:easy'].insolvencies} F) |`,
  )
  process.stderr.write(`${label} done\n`)
}
console.log(
  [
    `One-step sweep around ${JSON.stringify(center)}, ${seeds} seeds each, win percent:`,
    '| Step | Prepared STANDARD | Prepared EASY | Novice STANDARD | Novice EASY | Prepared STD insolvent | Prepared STD S/A/B/C/D/F | Follows the flag STANDARD | Follows the flag EASY |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n'),
)
