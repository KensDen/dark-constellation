// The mix record describes the sources that ship (Round 7).
//
// A render is a snapshot. Without this check a voice made louder after the
// measurement left every figure in tests/mix-measurement.json describing a
// sound that no longer ships, and a mutation that did exactly that slept.
// It fires on ANY edit to the two files, comments included, because a
// snapshot cannot tell a comment from a gain: re-render and update the
// record when it does.
//
// Kept in a file of its own so the mutation harness can exclude it. A
// tripwire that fires on every edit makes every mutation in these two files
// read CAUGHT whatever the behavioural guards did, which blinds the one
// instrument that tells a guard from an assumption.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const record = JSON.parse(readFileSync(join(here, 'mix-measurement.json'), 'utf8'))

describe('the mix measurement is not stale', () => {
  it('was taken from the voices and the bed that ship', () => {
    for (const [file, recorded] of Object.entries(record.measuredSources as Record<string, string>)) {
      const now = createHash('sha256').update(readFileSync(join(here, '..', file))).digest('hex')
      expect(now, `${file} changed since the mix was measured; re-render and update tests/mix-measurement.json`).toBe(recorded)
    }
  })
})
