// THE 3D SLICE'S MODEL (experiment). The slice plays one night through the
// real engine; this holds the few things its screen depends on: the night
// it plays always has two moves, what is aimed before the night is what
// the night plays, a block and a response can both happen in it, and the
// budget always has room for one response.

import { describe, expect, it } from 'vitest'
import { RESPONSE_TEXT } from '../src/content/responseText'
import { SLICE_TURN, aimsFor, answered, choicesFor, handFor, nightNow, sliceStart, verdictOf } from '../src/ui/three/sliceModel'

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1)

describe('the 3D slice plays one night of the real game', () => {
  it('starts on the third night with the moves named', () => {
    const s = sliceStart(1)
    expect(s.turn).toBe(SLICE_TURN)
    expect(s.briefFreeThrough).toBe(SLICE_TURN)
    expect(s.history).toHaveLength(0)
  })

  it('aims two moves at live tiles, and the night plays exactly those', () => {
    for (const seed of SEEDS) {
      const s = sliceStart(seed)
      for (const defense of [null, ...handFor(s).map((c) => c.id)]) {
        const aims = aimsFor(s, defense)
        expect(aims).toHaveLength(2)
        const { night } = nightNow(s, defense, [])
        const threats = night.steps.filter((x) => x.kind === 'threat')
        expect(threats.map((x) => x.def.id)).toEqual(aims.map((a) => a.def.id))
        expect(threats.map((x) => x.ev.targetAssetId)).toEqual(aims.map((a) => a.targetId))
        for (const a of aims) expect(s.assets.some((x) => x.id === a.targetId)).toBe(true)
      }
    }
  })

  it('deals a short hand, each card answering a move tonight could play', () => {
    for (const seed of SEEDS) {
      const hand = handFor(sliceStart(seed))
      expect(hand.length).toBeGreaterThanOrEqual(2)
      expect(hand.length).toBeLessThanOrEqual(4)
    }
  })

  it('anti-jam blocks the first track on its shield, and the second still asks for a response', () => {
    for (const seed of SEEDS) {
      const s = sliceStart(seed)
      const now = nightNow(s, 'antiJam', [])
      const threats = now.night.steps.filter((x) => x.kind === 'threat')
      expect(verdictOf(threats[0].ev)).toBe('blocked')
      expect(now.open).toBe(threats[1].index)
      const choices = choicesFor(s, 'antiJam', [], now.open, threats[1])
      // The strongest answer always fits a fresh budget, and riding it out is always there.
      expect(choices[0].fits).toBe(true)
      expect(choices.at(-1)).toMatchObject({ id: null, effect: 'ride', cost: 0 })
      expect(choices.at(-1)!.score).toBeLessThan(0)
      // Every option has its words.
      for (const c of choices) if (c.id) expect(RESPONSE_TEXT[threats[1].def.id][c.id]).toBeTruthy()
      const done = nightNow(s, 'antiJam', answered([], now.open, choices[0].id))
      expect(done.open).toBe(-1)
      expect(done.after.history).toHaveLength(1)
    }
  })

  it('with no defense both moves ask, and the one response a night is spent on the first taken', () => {
    const s = sliceStart(11)
    const first = nightNow(s, null, [])
    expect(first.open).toBe(0)
    const c0 = choicesFor(s, null, [], 0, first.night.steps[0])
    const second = nightNow(s, null, answered([], 0, c0[0].id))
    expect(second.open).toBe(1)
    const c1 = choicesFor(s, null, answered([], 0, c0[0].id), 1, second.night.steps[1])
    expect(c1.filter((c) => c.id !== null).every((c) => !c.fits && c.why === 'used')).toBe(true)
  })
})
