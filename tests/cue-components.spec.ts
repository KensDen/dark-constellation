// Behavioural coverage for the cue components (Round 3). The hooks
// themselves need a DOM, which this suite deliberately does not add, but
// their pure decisions and their contract with the stylesheet are
// node-testable and are exactly where a silent regression would live: a
// tone that maps the wrong way, or a phase whose class was renamed out of
// the CSS and now animates nothing.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { FLASH_CLASS, toneForDelta } from '../src/ui/cues/Meter'
import { PHASE_CLASS, PHASE_MS, nextPhases, type BadgePhase } from '../src/ui/cues/ConditionBadge'
import { kindLabels, vectorLabels } from '../src/ui/labels'
import { DEFAULT_SCENARIO } from '../src/content'
import type { ActiveCondition, AssetKind, Vector } from '../src/engine/types'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const declares = (className: string) => new RegExp(`\\.${className}\\s*[{,]`).test(CSS)

describe('meter tone', () => {
  it('maps the sign of a change, with no change reading as neutral', () => {
    expect(toneForDelta(1)).toBe('good')
    expect(toneForDelta(42)).toBe('good')
    expect(toneForDelta(-1)).toBe('bad')
    expect(toneForDelta(-42)).toBe('bad')
    expect(toneForDelta(0)).toBe('neutral')
    expect(toneForDelta(-0)).toBe('neutral')
  })

  it('backs each non-neutral tone with a class the stylesheet declares', () => {
    expect(FLASH_CLASS.neutral).toBe('')
    for (const tone of ['good', 'bad'] as const) {
      expect(FLASH_CLASS[tone], `${tone} has no class`).not.toBe('')
      expect(declares(FLASH_CLASS[tone]), `${FLASH_CLASS[tone]} is not in the stylesheet`).toBe(true)
    }
    expect(FLASH_CLASS.good).not.toBe(FLASH_CLASS.bad)
  })
})

describe('condition badge phases', () => {
  it('gives every phase but the resting one a class the stylesheet declares', () => {
    const phases: BadgePhase[] = ['attached', 'applying', 'ticking', 'clearing']
    expect(Object.keys(PHASE_CLASS).sort()).toEqual([...phases].sort())
    expect(PHASE_CLASS.attached).toBe('')
    for (const phase of ['applying', 'ticking', 'clearing'] as const) {
      expect(PHASE_CLASS[phase], `${phase} has no class`).not.toBe('')
      expect(declares(PHASE_CLASS[phase]), `${PHASE_CLASS[phase]} is not in the stylesheet`).toBe(true)
    }
    // Three distinct cues, not one class wearing three names.
    expect(new Set(['applying', 'ticking', 'clearing'].map((p) => PHASE_CLASS[p as BadgePhase])).size).toBe(3)
  })

  it('runs each phase for as long as its own animation', () => {
    // One shared constant truncated the tick, which is the longest of the
    // three. The durations are read back out of the stylesheet so the
    // timer and the animation cannot drift apart again.
    const declaredMs = (className: string): number | undefined => {
      const rule = new RegExp(`\\.${className}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([0-9.]+)(m?s)`).exec(CSS)
      if (!rule) return undefined
      return rule[2] === 's' ? Number(rule[1]) * 1000 : Number(rule[1])
    }
    for (const phase of ['applying', 'ticking'] as const) {
      const css = declaredMs(PHASE_CLASS[phase])
      expect(css, `${PHASE_CLASS[phase]} declares no duration`).toBeDefined()
      expect(PHASE_MS[phase], `${phase} would cut its animation short`).toBe(css)
    }
    // A badge on its way out holds its end state: the keyframes finish at
    // opacity zero and it is about to leave the DOM, so clearing the class
    // would flash it back into view first.
    expect(PHASE_MS.clearing).toBe(0)
    expect(PHASE_MS.attached).toBe(0)
  })

  it('decides the phases a turn produces, including the tick nothing emitted before', () => {
    // The decision is pure, so it is called rather than grepped for: the
    // earlier version of this test counted a string literal in the source
    // and would have passed against a renamed or commented-out producer.
    const cond = (id: string, startedTurn: number): ActiveCondition => ({
      instanceId: id,
      eventId: 'pnt-jamming',
      name: 'PNT jamming',
      startedTurn,
      remainingTurns: 2,
      baseSeverity: 2,
    })
    const a = cond('a', 6)
    const b = cond('b', 7)

    // A condition that lands is applying.
    expect(nextPhases({ prev: [], next: [a], sameTurn: true, reduced: false })).toEqual({ a: 'applying' })
    // One that survives into a new turn ticks.
    expect(nextPhases({ prev: [a], next: [a], sameTurn: false, reduced: false })).toEqual({ a: 'ticking' })
    // The same list inside one turn is not a cue at all.
    expect(nextPhases({ prev: [a], next: [a], sameTurn: true, reduced: false })).toEqual({})
    // One that goes is clearing, and a new one alongside it still attaches.
    expect(nextPhases({ prev: [a], next: [b], sameTurn: false, reduced: false })).toEqual({
      b: 'applying',
      a: 'clearing',
    })
    // Reduced motion records the resting state instead of a cue, so no
    // phase can latch and replay when the preference is turned off.
    expect(nextPhases({ prev: [], next: [a], sameTurn: false, reduced: true })).toEqual({ a: 'attached' })
    expect(nextPhases({ prev: [a], next: [], sameTurn: false, reduced: true })).toEqual({})
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
