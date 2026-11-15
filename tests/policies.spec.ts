// The sweep's lines do what their comments say (v1.3 R0b; the game's lines
// since v2.0 R3).
//
// The gate's bands mean something only if each line is the player its
// comment describes. These hold the gated lines of tests/policies.ts to
// their own descriptions on every night they meet, so a later edit that
// changes how one reads the signatures, places its piece or calls a hold
// fails here by name rather than moving the sweep quietly.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import { planFor } from '../src/engine/campaign'
import { holdTonight, rightCall } from '../src/engine/holds'
import { newGame } from '../src/engine/reducer'
import { playNight } from '../src/engine/responses'
import { NEW_DEFENSES_PER_NIGHT, countersAfter, domainOf, eventById, newDefenses, scanPulses } from '../src/engine/rules'
import type { GameState, TurnActions } from '../src/engine/types'
import { worstCase } from '../src/engine/worstCase'
import { spotFor } from '../src/ui/three/gameModel'
import { FIXED, WATCH, WATCH_REPORTED, type WatchLine } from './policies'

const SEEDS = 100
const line = (name: string): WatchLine => [...WATCH, ...FIXED, ...WATCH_REPORTED].find((l) => l.name === name)!

// Every state a line meets, with its orders, over SEEDS seeds on both
// difficulties, answered in the night as the sweep answers for it.
function* decisions(l: WatchLine): Generator<{ state: GameState; actions: TurnActions; after: GameState; where: string }> {
  for (const difficulty of ['standard', 'easy'] as const) {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
      while (state.status === 'playing') {
        const actions = l.policy(state)
        const after = playNight(state, actions, l.respond)
        yield { state, actions, after, where: `${difficulty} seed ${seed} night ${state.turn}` }
        state = after
      }
    }
  }
}
const drawnTonight = (state: GameState) => (planFor(state, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [] : (s.drawFrom ?? [])))
const fixedTonight = (state: GameState) => (planFor(state, state.turn)?.slots ?? []).flatMap((s) => (s.fixed ? [s.fixed] : []))

describe('the sweep lines do what their comments say', () => {
  it('Prepared: scans within its pulses, orders 1 defense at most and only against a move it has identified, never below WORST CASE 0, on the recommended spot, and reads every hold right', () => {
    let ordered = 0
    let held = 0
    for (const { state, actions, after, where } of decisions(line('prepared'))) {
      const scans = actions.scans ?? []
      expect(scans.length, `${where}: scans`).toBeLessThanOrEqual(scanPulses(state))
      for (const id of scans) expect(drawnTonight(state), `${where}: scanned a move not on a drawn track`).toContain(id)
      expect(actions.sighted, `${where}: Prepared names nothing on sight`).toBeUndefined()
      expect(worstCase(state, actions).value, `${where}: WORST CASE`).toBeGreaterThanOrEqual(0)
      const bought = newDefenses(state, actions)
      expect(bought.length, where).toBeLessThanOrEqual(NEW_DEFENSES_PER_NIGHT)
      if (bought.length) {
        ordered += 1
        // The piece answers a move COLDVEIL favored on some track before it
        // was ordered, and that move is one the line could name.
        const known = [...scans, ...fixedTonight(state)]
        const favored = adversaryPicks(state, countersAfter(state, { buyCounters: [] })).flatMap((read) => read.least)
        const answers = favored.filter((id) => known.includes(id) && eventById(state.scenario, id).counters.includes(bought[0]))
        expect(answers.length, `${where}: ${bought[0]} answers no favored move the line had identified`).toBeGreaterThan(0)
        // Set down where its card recommends.
        const spot = spotFor(state, { defense: null, assets: actions.buyAssets.map((b) => b.kind), scans }, bought[0])
        expect(actions.placeOn?.[bought[0]], `${where}: not on the recommended spot`).toBe(spot)
        const asset = state.assets.find((a) => a.id === spot)
        expect(asset && domainOf(state.scenario, bought[0]).includes(asset.kind), `${where}: a spot the piece cannot sit on`).toBe(true)
      }
      const hold = holdTonight(state)
      if (hold) {
        held += 1
        expect(actions.tiebreak, `${where}: the call`).toBe(rightCall(hold))
        expect(after.history.at(-1)!.hold?.right).toBe(true)
      } else expect(actions.tiebreak ?? null).toBeNull()
    }
    // Not vacuous: it orders on most nights, and meets its holds.
    expect(ordered).toBeGreaterThan(SEEDS * 2)
    expect(held).toBeGreaterThan(SEEDS * 2)
  })

  it('the beginner: scans the first signatures it sees, places a piece only inside WORST CASE, and calls a hold right about 2 times in 3', () => {
    let holds = 0
    let right = 0
    let lit = 0
    for (const { state, actions, after, where } of decisions(line('novice'))) {
      expect(actions.scans, where).toEqual(drawnTonight(state).slice(0, scanPulses(state)))
      expect(worstCase(state, actions).value, `${where}: WORST CASE`).toBeGreaterThanOrEqual(0)
      const bought = newDefenses(state, actions)
      expect(bought.length, where).toBeLessThanOrEqual(NEW_DEFENSES_PER_NIGHT)
      // A piece the tray lit: it answers a move the scan named.
      if (bought.length && (actions.scans ?? []).some((id) => eventById(state.scenario, id).counters.includes(bought[0]))) lit += 1
      const rec = after.history.at(-1)!
      if (rec.hold) {
        holds += 1
        if (rec.hold.right) right += 1
      }
    }
    expect(holds).toBeGreaterThan(SEEDS * 2)
    expect(right / holds, 'holds called right').toBeGreaterThan(0.58)
    expect(right / holds).toBeLessThan(0.75)
    expect(lit, 'it never placed a piece the tray lit').toBeGreaterThan(SEEDS)
  })

  it('the lines that name on sight name only what the scan did not, and the guesser about 1 in 3 of those', () => {
    let offered = 0
    let guessed = 0
    for (const { state, actions, after, where } of decisions(line('preparedSight'))) {
      const scans = actions.scans ?? []
      const rest = drawnTonight(state).filter((id) => !scans.includes(id))
      expect(actions.sighted ?? [], where).toEqual(rest)
      expect(after.history.at(-1)!.sighted ?? []).toEqual(rest)
    }
    for (const { state, actions } of decisions(line('preparedGuess'))) {
      const scans = actions.scans ?? []
      const rest = drawnTonight(state).filter((id) => !scans.includes(id))
      for (const id of actions.sighted ?? []) expect(rest).toContain(id)
      offered += rest.length
      guessed += (actions.sighted ?? []).length
    }
    expect(offered).toBeGreaterThan(SEEDS * 4)
    expect(guessed / offered, 'the guesser is right about 1 time in 3').toBeGreaterThan(0.28)
    expect(guessed / offered).toBeLessThan(0.39)
  })

  it('Nothing orders nothing, makes no call and takes no answer', () => {
    for (const { actions, after, where } of decisions(line('nothing'))) {
      expect(actions.buyAssets.length + actions.buyCounters.length, where).toBe(0)
      expect(actions.tiebreak ?? null).toBeNull()
      const rec = after.history.at(-1)!
      expect(rec.events.some((e) => e.response)).toBe(false)
      if (rec.hold) expect(rec.hold.call).toBe('none')
    }
  })
})
