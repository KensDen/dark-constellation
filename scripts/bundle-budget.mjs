// The bundle budget's arithmetic, in one place so the battery and the
// suite agree on it.
//
// Headroom is DERIVED from the bundle that was just measured, never
// written down. The battery used to print budget minus the recorded
// BASELINE, which is a fact about last round rather than about this build:
// when a round grew the bundle past its baseline, the printed headroom was
// stale, and Round 4c copied that stale number into its report twice.
// Round 2 flagged the recorded headroom as hand-maintained with nothing
// computing or checking it; this is the first time it went wrong, so the
// field is gone rather than guarded.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

export function headroomFor(measuredGzipBytes, budgetGzipBytes) {
  return budgetGzipBytes - measuredGzipBytes
}

// The whole bundle layer, including the reading, so the battery has no
// wiring of its own to get wrong. Guarding only the arithmetic was the
// weak form: a mutation that had the battery hand it the recorded baseline
// instead of the measured chunk went straight through, because nothing
// exercised the argument the battery passes. There is no such argument
// now; the defaults below are the real path and the suite drives them
// against a temporary file.
//
// Returns the line the battery prints and the figures behind it. Throws on
// the conditions the battery fails: a recorded headroom, a stale chunk, no
// chunk, or a bundle over budget.
export function measureBundle({
  budget,
  dir = join('dist', 'assets'),
  chunks = readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f)),
  gzipOf = (chunk) => gzipSync(readFileSync(join(dir, chunk))).length,
  mtimeOf = (chunk) => statSync(join(dir, chunk)).mtimeMs,
  startedAt,
}) {
  // The one argument the battery still passes, and the one the staleness
  // check depends on: omitted, `mtime < undefined` is false and the guard
  // switches itself off without a word. Three lenses of the Round 4c
  // re-review found that independently, so it fails loudly instead.
  if (!Number.isFinite(startedAt)) {
    throw new Error('measureBundle needs the timestamp the battery started at, or the stale-chunk check cannot run')
  }
  if ('headroomGzipBytes' in budget) {
    throw new Error('bundle-budget.json records a headroom; it is derived from the measured chunk, not written')
  }
  if (chunks.length !== 1) throw new Error(`expected one main chunk, found ${chunks.length}`)
  const chunk = chunks[0]
  if (mtimeOf(chunk) < startedAt) {
    throw new Error(`${chunk} predates this battery run; dist is stale, rebuild before measuring`)
  }
  const gz = gzipOf(chunk)
  const delta = gz - budget.baselineGzipBytes
  const headroom = headroomFor(gz, budget.budgetGzipBytes)
  const line =
    `${chunk} ${gz} bytes gzipped (baseline ${budget.baselineGzipBytes}, ` +
    `${delta >= 0 ? '+' : ''}${delta}; budget ${budget.budgetGzipBytes}, headroom ${headroom})`
  if (gz > budget.budgetGzipBytes) {
    throw new Error(`main chunk is ${gz} bytes gzipped, over the ${budget.budgetGzipBytes} byte budget`)
  }
  return { gz, delta, headroom, line }
}
