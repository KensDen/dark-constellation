// THE PLAYFIELD'S MODEL (v1.5 R2, Ken's ruling of 24 October 2026: the
// night is seen on the board itself). The drawing needs a browser and is
// checked in one (scripts/phone-layout.mjs, and the round's captures);
// these hold what it is drawn from: every move in the deck has a shape,
// and the night's traces are its moves, in order, with the right result.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { shapeOf } from '../src/ui/board/moveShape'
import { tracesOf } from '../src/ui/board/strike'
import { NO_OP, WIN_SCRIPT } from './scripts'

describe('the playfield (v1.5 R2)', () => {
  it('draws every threat in the deck by how it travels, the spoofs as a ghost and the debris as debris', () => {
    const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
    const shapes = new Set(threats.map((e) => shapeOf(e.id)))
    expect(shapes).toEqual(new Set(['waves', 'ghost', 'beam', 'packets', 'chip', 'hook', 'debris']))
    expect(shapeOf('gnss-spoofing')).toBe('ghost')
    expect(shapeOf('uplink-jamming')).toBe('waves')
    expect(shapeOf('blackout-chain')).toBe('beam')
    expect(shapeOf('debris-conjunction')).toBe('debris')
  })

  it("keeps the night's moves as traces: every threat and the debris in order, no opportunity, a hit when any of it got through", () => {
    let traced = 0
    let opportunities = 0
    const results = new Set<string>()
    // Ten seeds since v1.6 R1, so both of the campaign's orders and an
    // opportunity are met.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20260712]) {
      let s = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (s.status === 'playing') {
        s = resolveTurn(s, WIN_SCRIPT[s.turn] ?? NO_OP, turnRng(s.seed, s.turn))
        const rec = s.history.at(-1)!
        const traces = tracesOf(rec.turn, rec.events, DEFAULT_SCENARIO)
        const moves = rec.events.filter((e) => (DEFAULT_SCENARIO.events.find((d) => d.id === e.eventId)?.kind ?? 'threat') === 'threat')
        opportunities += rec.events.length - moves.length
        expect(traces.map((t) => t.eventId)).toEqual(moves.map((e) => e.eventId))
        for (const [i, t] of traces.entries()) {
          const ev = moves[i]
          expect(t.hit, `${t.eventId} on turn ${rec.turn}`).toBe(ev.debris ? ev.debris.lost : ev.effectiveSeverity > 0)
          // The night log's word and figure (v1.5 R2): what the record says.
          const full = ev.baseSeverity + ev.chainBonus
          const want = ev.debris ? (ev.debris.lost ? 'lost' : 'clear') : ev.effectiveSeverity === 0 ? 'blocked' : ev.effectiveSeverity < full ? 'partial' : 'hit'
          expect(t.result).toBe(want)
          expect(t.delta).toBeCloseTo(ev.scoreAfter - ev.scoreBefore, 1)
          results.add(t.result)
          expect(t.assetId).toBe(ev.targetAssetId ?? ev.debris?.assetId)
          traced += 1
        }
        // The first n, as the night shows them before its later moves.
        expect(tracesOf(rec.turn, rec.events, DEFAULT_SCENARIO, 1).length).toBeLessThanOrEqual(1)
      }
    }
    // Not vacuous: moves were traced, and opportunities were met and left out.
    expect(traced).toBeGreaterThan(20)
    expect(opportunities).toBeGreaterThan(0)
    for (const r of ['blocked', 'partial', 'hit']) expect(results.has(r), `no ${r} met`).toBe(true)
  })
})
