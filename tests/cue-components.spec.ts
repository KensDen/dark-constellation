// What is left of the cue components' coverage (Round 3): the hidden-page
// policy every channel answers to, and the labels a player reads for the
// engine's enum values. Both are pure and node-testable.
//
// RETIRED in v2.0 R3, with the pixel board's components: "meter tone" and
// "condition badge phases" (ui/cues/Meter.tsx and ConditionBadge.tsx, and
// their classes in the stylesheet), and "the prelude controls", which read
// ui/Game.tsx and the dock for EXECUTE's wiring and the manifest entrance.
// The press that begins a night in the 3D game is held in
// tests/sound.spec.ts.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { audioSuspended, countUpMode } from '../src/ui/cues/visibility'
import { kindLabels, vectorLabels } from '../src/ui/labels'
import { DEFAULT_SCENARIO } from '../src/content'
import type { AssetKind, Vector } from '../src/engine/types'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

describe('the hidden-page policy', () => {
  it('states one policy the channels answer to', () => {
    // The policy is a decision, so it is asserted rather than inferred:
    // hidden means paused, and every channel lands on the truth of the
    // beat being shown. Playback has had nothing to pause since v1.3 Round
    // 0, because every beat waits for a tap, so the decision that used to
    // stand here for it is gone; sound still has one, and it is the same
    // decision.
    expect(audioSuspended(false)).toBe(true)
    expect(audioSuspended(true)).toBe(false)
    // A hidden page and a reduced-motion preference mean the same thing to
    // a number: show it, do not animate it.
    expect(countUpMode(true, false)).toBe('ease')
    expect(countUpMode(false, false)).toBe('snap')
    expect(countUpMode(true, true)).toBe('snap')
    expect(countUpMode(false, true)).toBe('snap')
  })

  it('keeps the hidden-page decision in one place', () => {
    // The point of the policy is that the channels stop guessing
    // separately. A second module reading document.hidden is that
    // guessing coming back, so the DOM surface stays inside the policy.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue
        if (full.endsWith(join('cues', 'visibility.ts'))) continue
        const source = readFileSync(full, 'utf8')
        if (/document\.(hidden|visibilityState)|'visibilitychange'|"visibilitychange"/.test(source)) {
          offenders.push(full.slice(SRC.length + 1))
        }
      }
    }
    walk(SRC)
    expect(offenders.join(', '), 'these read the page state directly instead of the policy').toBe('')
  })
})

describe('player-facing labels', () => {
  it('covers every asset kind and vector the deck uses', () => {
    const kinds = new Set<AssetKind>(DEFAULT_SCENARIO.starterAssets.map((a) => a.kind))
    for (const k of ['sat', 'rpoSat', 'drone', 'groundStation'] as AssetKind[]) kinds.add(k)
    for (const kind of kinds) {
      expect(kindLabels[kind], `${kind} has no label`).toBeTruthy()
    }
    const vectors = new Set<Vector>(DEFAULT_SCENARIO.events.map((e) => e.vector))
    for (const vector of vectors) {
      expect(vectorLabels[vector], `${vector} has no label`).toBeTruthy()
    }
  })

  it('never lets a camelCase identifier through as a label', () => {
    for (const label of [...Object.values(kindLabels), ...Object.values(vectorLabels)]) {
      expect(label, `${label} reads as an identifier`).not.toMatch(/[a-z][A-Z]/)
      expect(label).not.toContain('_')
    }
  })

  it('keeps the label maps free of the engine keys they translate', () => {
    // A label that is just its own key would pass the camelCase check and
    // still leak an enum value to the player.
    for (const [key, label] of Object.entries(vectorLabels)) {
      if (key === 'optical' || key === 'cyber' || key === 'human' || key === 'environmental') continue
      expect(label).not.toBe(key)
    }
    for (const [key, label] of Object.entries(kindLabels)) expect(label).not.toBe(key)
  })
})
