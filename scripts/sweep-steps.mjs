#!/usr/bin/env node
// The one-step robustness sweep (v1.3 R0b, brief 11). Runs
// tests/sweep-steps.spec.ts once per step, each in its own process, and
// prints one table: Prepared (the gated line), the line that follows the
// flag (reported) and Novice, on STANDARD and EASY, 500 seeds each.
//
//   npm run sweep:steps                         the R0 numbers and Ken's ten steps
//   npm run sweep:steps -- '{"funding":25}'     the same ten steps around another point
//
// A step names only what it moves: meter (damage a point), asset (damage a
// point), bills (a factor on every repair bill and the loss review),
// upkeep (CR a turn a defense), funding (CR a turn). Everything else is the
// repo's own number.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const R0 = { meter: 5, asset: 12, bills: 1, upkeep: 2, funding: 20 }
const center = { ...R0, ...JSON.parse(process.argv[2] ?? '{}') }
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
const pct = (n) => `${((100 * n) / 500).toFixed(1)}`
const grades = (g) => ['S', 'A', 'B', 'C', 'D', 'F'].map((k) => g[k]).join('/')
const rows = []
for (const [i, [label, moved]] of STEPS.entries()) {
  const step = { ...center, ...moved }
  const out = join(dir, `step-${i}.json`)
  const res = spawnSync(join('node_modules', '.bin', 'vitest'), ['run', 'tests/sweep-steps.spec.ts'], {
    env: { ...process.env, SWEEP_STEP: JSON.stringify(step), SWEEP_STEP_OUT: out },
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    process.stderr.write(res.stdout + res.stderr)
    throw new Error(`step "${label}" failed`)
  }
  const r = JSON.parse(readFileSync(out, 'utf8'))
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
    `One-step sweep around ${JSON.stringify(center)}, 500 seeds each, win percent:`,
    '| Step | Prepared STANDARD | Prepared EASY | Novice STANDARD | Novice EASY | Prepared STD insolvent | Prepared STD S/A/B/C/D/F | Follows the flag STANDARD | Follows the flag EASY |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n'),
)
