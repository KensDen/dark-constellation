#!/usr/bin/env node
// The one-step robustness sweep (v1.3 R0b, brief 11; the game's numbers
// since v2.0 R3). Runs tests/sweep-steps.spec.ts once per step, each in
// its own process, and prints one table: Prepared and Novice (the gated
// lines) and the Expert (reported), on STANDARD and EASY, over the sweep's
// seeds (tests/sweep-run.ts SEEDS, 500).
//
//   npm run sweep:steps                         the scenario's numbers and a step either side of each
//   npm run sweep:steps -- '{"funding":8}'      the same steps around another point
//
// A step names only what it moves: meter (meter damage a point), asset
// (asset damage a point), bills (a factor on every repair bill and the
// loss review), upkeep (CR a night a defense), funding (CR a night) and
// recovery (points a night on every meter; the IR retainer keeps its 2 on
// top). Everything else is the repo's own number. Any other key, or a
// value that is not a number, is refused: the R0b review found a center
// with a mistyped key silently played at the default.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// The numbers FIRST LIGHT carries (src/content/scenarios/firstLight.ts and
// src/engine/rules.ts); the spec proves each step is live on the engine.
const R0 = { meter: 15, asset: 12, bills: 1, upkeep: 2, funding: 7, recovery: 7 }
const KNOWN = new Set(Object.keys(R0))
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
  ['funding -2', { funding: center.funding - 2 }],
  ['funding +2', { funding: center.funding + 2 }],
  ['recovery -1', { recovery: center.recovery - 1 }],
  ['recovery +1', { recovery: center.recovery + 1 }],
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
  const x = r['expert:standard']
  const shown = Object.entries(moved).map(([k, v]) => `${k} ${v}`).join(', ') || JSON.stringify(step)
  rows.push(
    `| ${label} (${shown}) | ${pct(p.wins)} | ${pct(r['prepared:easy'].wins)} | ${pct(r['novice:standard'].wins)} | ${pct(r['novice:easy'].wins)} | ${p.insolvencies} | ${grades(p.grades)} | ${pct(x.wins)} | ${pct(r['expert:easy'].wins)} |`,
  )
  process.stderr.write(`${label} done\n`)
}
console.log(
  [
    `One-step sweep around ${JSON.stringify(center)}, ${seeds} seeds each, win percent:`,
    '| Step | Prepared STANDARD | Prepared EASY | Novice STANDARD | Novice EASY | Prepared STD insolvent | Prepared STD S/A/B/C/D/F | Expert STANDARD | Expert EASY |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n'),
)
