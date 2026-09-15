// The bundle budget's arithmetic and the shape of its record.
//
// Round 2 flagged the recorded headroom as a hand-maintained number with
// nothing computing or checking it. Round 4c is the first time it actually
// went wrong: the battery printed budget minus the recorded BASELINE, a
// fact about the previous round's build, and the report carried that stale
// figure in two places while the bundle had grown 58 bytes past it. The
// field is gone now and the number is derived from the chunk the battery
// measures, so these tests hold that shape rather than the old value.

import { gzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { headroomFor, measureBundle } from '../scripts/bundle-budget.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const budget = JSON.parse(readFileSync(join(ROOT, 'tests', 'bundle-budget.json'), 'utf8'))

describe('bundle budget', () => {
  it('derives headroom from the chunk that was measured, not from the baseline', () => {
    expect(headroomFor(124237, 140000)).toBe(15763)
    // The distinction that matters: once a round grows the bundle past its
    // recorded baseline, the two answers differ, and the one a reader acts
    // on is the one about the build in front of them.
    const measured = budget.baselineGzipBytes + 58
    expect(headroomFor(measured, budget.budgetGzipBytes)).toBe(budget.budgetGzipBytes - measured)
    expect(headroomFor(measured, budget.budgetGzipBytes)).not.toBe(
      budget.budgetGzipBytes - budget.baselineGzipBytes,
    )
    // A bundle over budget reports negative room rather than clamping,
    // because the battery's own threshold check is what fails on it.
    expect(headroomFor(budget.budgetGzipBytes + 100, budget.budgetGzipBytes)).toBe(-100)
  })

  it('records no headroom of its own', () => {
    // Nothing to go stale, which is the whole of the fix: the battery
    // throws if this field comes back.
    expect(Object.keys(budget)).not.toContain('headroomGzipBytes')
    expect(budget.baselineGzipBytes).toBeGreaterThan(0)
    expect(budget.budgetGzipBytes).toBeGreaterThan(budget.baselineGzipBytes)
  })

  it('measures the chunk in front of it, which is the call site the defect was in', () => {
    // Guarding headroomFor alone was the weak form: a call site passing the
    // baseline instead of the measured size went straight through it. This
    // drives the layer the battery actually runs.
    const budget = { baselineGzipBytes: 124237, budgetGzipBytes: 140000 }
    const grown = measureBundle({
      budget,
      chunks: ['index-abc.js'],
      gzipOf: () => 124237 + 58,
      mtimeOf: () => 1000,
      startedAt: 0,
    })
    expect(grown.headroom, 'headroom followed the baseline rather than the chunk').toBe(140000 - (124237 + 58))
    expect(grown.line).toContain('headroom ' + (140000 - (124237 + 58)))
    expect(grown.line).toContain('+58')
    // A shrinking round reports more room, not less.
    const shrunk = measureBundle({
      budget,
      chunks: ['index-abc.js'],
      gzipOf: () => 124237 - 100,
      mtimeOf: () => 1000,
      startedAt: 0,
    })
    expect(shrunk.headroom).toBe(140000 - (124237 - 100))
    expect(shrunk.line).toContain('-100')
  })

  it('refuses the conditions the battery exists to catch', () => {
    const budget = { baselineGzipBytes: 124237, budgetGzipBytes: 140000 }
    const call = (over: Record<string, unknown>) =>
      measureBundle({ budget, chunks: ['index-abc.js'], gzipOf: () => 124237, mtimeOf: () => 1000, startedAt: 0, ...over })
    // A written headroom, the thing this round removed.
    expect(() => call({ budget: { ...budget, headroomGzipBytes: 15763 } })).toThrow(/records a headroom/)
    // A chunk older than the run measuring it.
    expect(() => call({ startedAt: 5000 })).toThrow(/stale/)
    // No chunk, or more than one.
    expect(() => call({ chunks: [] })).toThrow(/expected one main chunk/)
    expect(() => call({ chunks: ['a.js', 'b.js'] })).toThrow(/expected one main chunk/)
    // Over budget.
    expect(() => call({ gzipOf: () => 140001 })).toThrow(/over the 140000 byte budget/)
  })

  it('reads and gzips the chunk itself, so the battery has no wiring to get wrong', () => {
    // The default path, not an injected one. Guarding only the arithmetic
    // let a mutation that handed the layer the recorded baseline instead
    // of the measured chunk go straight through, because nothing exercised
    // the argument the battery passed. The battery passes none now, and
    // this drives the reading the layer does for itself.
    const dir = mkdtempSync(join(tmpdir(), 'dc-bundle-'))
    const body = 'x'.repeat(50_000) + Math.random()
    writeFileSync(join(dir, 'index-real.js'), body)
    const expected = gzipSync(Buffer.from(body)).length
    const measured = measureBundle({
      budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000 },
      dir,
      startedAt: 0,
    })
    expect(measured.gz, 'the layer did not gzip the file it was pointed at').toBe(expected)
    expect(measured.headroom).toBe(10_000_000 - expected)
    expect(measured.line).toContain('index-real.js')

    // And the stale-dist guard on the same real file, through the default
    // mtimeOf rather than an injected one: the previous version of this
    // test injected both readers, so the default that the battery actually
    // uses was never exercised and could have been removed unnoticed.
    expect(() =>
      measureBundle({
        budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000 },
        dir,
        startedAt: Date.now() + 60_000,
      }),
    ).toThrow(/stale/)

    // The battery's own wiring: omitting the stamp used to switch the
    // staleness check off in silence, because a comparison against
    // undefined is false. It refuses now.
    expect(() =>
      measureBundle({ budget: { baselineGzipBytes: 1, budgetGzipBytes: 10_000_000 }, dir }),
    ).toThrow(/timestamp the battery started at/)

    rmSync(dir, { recursive: true, force: true })
  })
})
