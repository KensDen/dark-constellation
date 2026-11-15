// What is left of the opening's guards (brief v2.3 Round 7b, principle
// 16's level above the code), for the things they held that still ship.
//
// This file was written to assert that by the end of a new player's third
// turn the game had shown them what it does. It did that with a model of
// what the pixel night presented (its overlay, strike, result tiles, cards
// and END OF TURN, each joined to a section 6 row), and by rendering the
// pixel night's cards and reading their words. The pixel night was retired
// in v2.0 R3, and both went with it: the 3D game's night is played in a
// world a test DOM cannot start, and its cards are not these.
//
// TWO THINGS IT HELD STILL SHIP, and are held here:
//
//   - THE JOIN. A section 6 row is identified by its own (visual, sound)
//     pair, never by a moment alone: `Section6Row.moments` names one
//     moment on two rows ('strike-hit' carries both "Adversary event
//     lands" and "BLACKOUT CHAIN fires", and 'outcome' both "Campaign won"
//     and "Campaign lost"). The registry (src/cues.ts) is the 3D game's
//     too, so the pairs must still tell the rows apart.
//   - THE NIGHT'S MODEL TELLS THE TRUTH ABOUT RECOVERY. Nothing in the
//     night raises a meter before the close, the close heals by what the
//     cap allows and not by what the scenario offers, and a move held
//     outright is credited to a defense the player owns. The 3D game
//     plays the same model (src/ui/night/nightModel.ts).
//
// RETIRED with the pixel night (v2.0 R3): the breadth sweep over what each
// of the first three turns presented and the rows it met, the computed
// excuses for the rows the opening cannot reach, the collector's orphan
// report, the coverage bonus as END OF TURN told it and printed it (never
// 60 on a fleet a hair under the minimum), the words on the cards of a
// night held outright, and the floor on the first screen's word count.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { CONDITION_CUES, SECTION_6_ROWS, type Section6Row, type SoundCue, type VisualCue } from '../src/cues'
import { holdTonight } from '../src/engine/holds'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { METER_CAP } from '../src/engine/scoring'
import type { CountermeasureId, Difficulty, GameState, TurnActions } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import * as nightCopy from '../src/ui/night/nightCopy'
import { defensesFor, nightOf, type Night } from '../src/ui/night/nightModel'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, a, scripted } from './scripts'

type CuePair = `${VisualCue}|${SoundCue}`

const pairOf = (visual: VisualCue, sound: SoundCue): CuePair => `${visual}|${sound}`

// Every (visual, sound) pair a row can legitimately present. One pair for
// most rows; the condition family expands, because the brief asks for an
// alarm unique per condition and the registry carries one per condition
// while the row names the family's stand-in.
function pairsForRow(row: Section6Row): CuePair[] {
  if (row.soundPerSubject === 'condition') {
    return [...new Set(Object.values(CONDITION_CUES).map((c) => c.sound))].map((s) => pairOf(row.visual, s))
  }
  const own = [pairOf(row.visual, row.sound)]
  for (const partner of row.soundPartners ?? []) own.push(pairOf(row.visual, partner))
  return own
}

// The reverse index, built by walking SECTION_6_ROWS rather than by
// listing anything. A pair claimed by two rows is recorded as claimed by
// both, so nothing is silently attributed to the first match.
function rowIndex(): Map<CuePair, string[]> {
  const index = new Map<CuePair, string[]>()
  for (const row of SECTION_6_ROWS) {
    for (const pair of pairsForRow(row)) {
      index.set(pair, [...(index.get(pair) ?? []), row.beat])
    }
  }
  return index
}

describe('the opening: the join itself (Round 7b)', () => {
  it('lets every (visual, sound) pair identify exactly one row', () => {
    // The whole reason the join is on the pair rather than on the moment
    // is that the moment is ambiguous. A pair that two rows claim would be
    // ambiguous in the same way.
    //
    // Note the near misses this protects: `resolve-chime` belongs to BOTH
    // "Opportunity lands" and "End of turn", and `data-burst` to both
    // "Turn start, a transmission arrives" and "FILE TO DOSSIER". Their
    // VISUALS differ, so the pairs differ, which is precisely why the pair
    // is the join and the sound alone is not.
    const index = rowIndex()
    expect(index.size, 'the index is empty, so nothing below can fail').toBeGreaterThan(SECTION_6_ROWS.length - 1)
    const shared: string[] = []
    for (const [pair, rows] of index) {
      if (rows.length > 1) shared.push(`${pair} is claimed by ${rows.join(' and ')}`)
    }
    expect(shared.join('\n')).toBe('')
  })
})

// EASY and STANDARD since v1.3 Round 0, which retired Expert (brief 5.1).
const DIFFS: Difficulty[] = ['easy', 'standard']
const SEEDS = 24

// The orders that hold turn 1 outright: both of its candidates' primary
// defenses (brief 6.2, M2). One new defense a night since v1.4, so no
// real first night holds both: the start is hand-built to own PNT
// authentication, and the night orders anti-jam, as the prepared script
// does (read off the script rather than spelled, and checked where it is
// used).
const HELD_FROM_START: CountermeasureId[] = ['pntAuth']
const HOLDS_TURN_1: TurnActions = a({ buyCounters: WIN_SCRIPT[1].buyCounters })
const holding = (s: GameState): GameState => ({ ...s, counters: [...HELD_FROM_START] })

// A first night the policy engine does not stop an asset on (v2.0 R2,
// src/engine/holds.ts): a hold left to stand can cost a meter its stake,
// and the cases below need a night where only the close moves one. Found
// by asking the engine, seed by seed, not written down.
function quietFirstNight(): GameState {
  for (let seed = 1; seed <= 200; seed += 1) {
    const state = holding(newGame(DEFAULT_SCENARIO, seed, 'standard'))
    if (!holdTonight(state)) return state
  }
  throw new Error('every seed puts a hold on night 1, so no first night is the close alone')
}

type MeterKey = keyof GameState['meters']
const meterKeys = (s: GameState) => Object.keys(s.meters) as MeterKey[]

// The board the night ends on before the close: the last event's, or on a
// night with none the hold's, or the opening's.
const beforeClose = (night: Night) => night.steps.at(-1)?.after ?? night.hold?.after ?? night.opening

const signsOf = (before: GameState, after: GameState) => new Map([...callSigns(before), ...callSigns(after)])

describe('the opening: the night tells the truth (Round 7b)', () => {
  it('raises no meter anywhere in the night, and heals only at the close, on turns that healed and turns that did not', () => {
    // Principle 16's product form, found inside the beat Round 7b was
    // about: the turn-start title interpolated `recovery +N` on every
    // turn, and on turn 1 every meter sits at the cap, so the first card a
    // new player ever saw asserted a change that did not happen.
    //
    // Recovery left the turn start for the close in v1.3 Round 0 (brief
    // 5.5 item 6 and 6.1). The truth the night's model must keep is that
    // nothing in the night raises a meter before the close, and that the
    // close is where the healing is, on a turn the close healed as much as
    // on one it did not. Until v2.0 R3 this also read the pixel night's
    // cards for the word "recover"; the cards are gone.
    expect(nightCopy.MOVING, 'what the night opens on').toBe('COLDVEIL IS MOVING')
    let sawFull = false
    let sawHealed = false
    let officers = 0
    const lines: [string, Record<number, TurnActions>, (s: GameState) => GameState][] = [
      ['passive', LOSS_SCRIPT, (s) => s],
      // The passive line never leaves every meter at the cap: each of its
      // nights lands a move on a meter. The prepared script from a start
      // that owns PNT authentication can hold turn 1 outright, so its
      // close has nothing to heal; under one new defense a night (v1.4) no
      // real first night holds both turn-1 moves, so the start is
      // hand-built.
      ['prepared', WIN_SCRIPT, (s) => s],
      ['prepared, PNT authentication held from the start', WIN_SCRIPT, holding],
    ]
    for (const [name, script, start] of lines) {
      const line = scripted(script)
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let state = start(newGame(DEFAULT_SCENARIO, seed, difficulty))
          while (state.status === 'playing') {
            const before = state
            const after = resolveTurn(before, line(before), turnRng(before.seed, before.turn))
            const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}`
            const night = nightOf(before, after)
            // The board the night opens on: tonight's orders landed and
            // the live conditions pressed, which can only lower a meter.
            // The hold, and then each move, can only lower one too.
            for (const k of meterKeys(before)) {
              expect(night.opening.meters[k], `${at}: the opening raises ${k}`).toBeLessThanOrEqual(before.meters[k])
              if (night.hold) expect(night.hold.after.meters[k], `${at}: the hold raises ${k}`).toBeLessThanOrEqual(night.hold.before.meters[k])
              for (const step of night.steps) {
                expect(step.after.meters[k], `${at}: the ${step.def.id} step raises ${k}`).toBeLessThanOrEqual(step.before.meters[k])
              }
            }
            // The POSITIVE half: each move has its watch officer's line,
            // and the line reads the right side of a block.
            for (const step of night.steps) {
              if (step.kind !== 'threat') continue
              const id = step.ev.eventId
              expect(nightCopy.OFFICER[id]?.length, `${at}: ${id} has no watch officer's line`).toBeTruthy()
              const sign = step.ev.targetAssetId ? signsOf(before, after).get(step.ev.targetAssetId) : undefined
              const said = nightCopy.officerFor(step, sign)
              // A move a response blocked has no line (nightCopy says why).
              if (step.ev.response?.effect === 'block') {
                expect(said, `${at}: ${id} was blocked by a response and still has a line`).toBeNull()
                continue
              }
              const blocked = step.ev.effectiveSeverity === 0 && !!nightCopy.HELD[id]
              expect(said, `${at}: ${id} has no line for this meeting`).not.toBeNull()
              expect(said!.held, `${at}: ${id} reads the wrong side of the block`).toBe(blocked)
              expect(said!.line, `${at}: ${id} leaves its asset unnamed`).not.toContain('{t}')
              officers += 1
            }
            // Where the recovery went: the close, which only heals.
            const healed = meterKeys(before).map((k) => after.meters[k] - beforeClose(night).meters[k])
            for (const d of healed) expect(d, `${at}: the close lowered a meter`).toBeGreaterThanOrEqual(0)
            if (healed.some((d) => d > 0)) sawHealed = true
            else sawFull = true
            state = after
          }
        }
      }
    }
    // Both branches, asserted separately. As one alternation a branch that
    // never fires reads as covered because the other one did.
    expect(sawFull, 'no turn in the sweep left every meter where the close found it').toBe(true)
    expect(sawHealed, 'no turn in the sweep healed a meter').toBe(true)
    expect(officers, 'no move in the sweep was read for its line').toBeGreaterThan(SEEDS)
  })

  it('heals by what the clamp allowed, not what the scenario offered', () => {
    // The discriminating case, and the one the sweep almost never reaches:
    // every meter ONE below the cap while the scenario offers more. A
    // close adding `recovery` instead of the applied amount fails here and
    // nowhere else. Turn 1's two moves are held, so nothing lands on a
    // meter before the close.
    const base = quietFirstNight()
    const offered = DEFAULT_SCENARIO.recovery.base
    expect(offered, 'the scenario now offers 1, so the clamp cannot be observed this way').toBeGreaterThan(1)
    const nearCap: GameState = {
      ...base,
      meters: { linkAvailability: METER_CAP - 1, dataIntegrity: METER_CAP - 1, sensorIntegrity: METER_CAP - 1 },
    }
    const after = resolveTurn(nearCap, HOLDS_TURN_1, turnRng(nearCap.seed, nearCap.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.map((e) => e.outcome), 'turn 1 was not held outright').toEqual(record.events.map(() => 'held'))
    const night = nightOf(nearCap, after)
    expect(beforeClose(night).meters, 'the night moved a meter before the close').toEqual(nearCap.meters)
    const deltas = meterKeys(nearCap).map((k) => after.meters[k] - beforeClose(night).meters[k])
    expect(deltas, 'the three meters did not heal by the same clipped amount').toEqual([1, 1, 1])
    expect(after.meters, 'the clamp let a meter past the cap').toEqual({ linkAvailability: METER_CAP, dataIntegrity: METER_CAP, sensorIntegrity: METER_CAP })
  })

  it('heals two meters by different amounts at the close, each by its own clamp', () => {
    // One meter one below the cap and one meter further below than the
    // scenario's recovery reaches, so a single recovery constant clamps
    // differently on each. Without this the uneven case is a branch of the
    // clamp that reads as covered.
    const base = quietFirstNight()
    const offered = DEFAULT_SCENARIO.recovery.base
    const uneven: GameState = {
      ...base,
      meters: { linkAvailability: METER_CAP - 1, dataIntegrity: METER_CAP - 2 * offered, sensorIntegrity: METER_CAP },
    }
    const after = resolveTurn(uneven, HOLDS_TURN_1, turnRng(uneven.seed, uneven.turn))
    const night = nightOf(uneven, after)
    expect(beforeClose(night).meters, 'the night moved a meter before the close').toEqual(uneven.meters)
    const deltas = meterKeys(uneven).map((k) => after.meters[k] - beforeClose(night).meters[k])
    expect(deltas.filter((d) => d > 0).length, 'the hand-built state did not heal two meters').toBeGreaterThan(1)
    expect(new Set(deltas.filter((d) => d > 0)).size, 'the hand-built state healed them by the same amount').toBeGreaterThan(1)
    expect(deltas, 'a meter did not heal by its own clamped amount').toEqual(
      meterKeys(uneven).map((k) => Math.min(METER_CAP - uneven.meters[k], offered)),
    )
  })

  it('credits a turn held outright, move by move, to a defense the player owns and the orders bought', () => {
    const before = quietFirstNight()
    const after = resolveTurn(before, HOLDS_TURN_1, turnRng(before.seed, before.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.length, 'turn 1 scripted no move, so nothing was held').toBeGreaterThan(0)
    expect(record.events.map((e) => e.outcome), 'turn 1 was not held outright').toEqual(record.events.map(() => 'held'))
    const night = nightOf(before, after)
    expect(night.steps.length, 'a move held outright has no step in the night').toBe(record.events.length)
    for (const step of night.steps) {
      expect(step.ev.effectiveSeverity, `${step.def.id}: something got through`).toBe(0)
      const { held } = defensesFor(step.def, step.after.counters, step.after.scenario)
      expect(held, `${step.def.id}: no defense is named as having held it`).toBeDefined()
      expect(after.counters, `${step.def.id}: the defense named is one the player does not own`).toContain(held!.id)
      expect(step.def.counters, `${step.def.id}: the defense named does not answer it`).toContain(held!.id)
      expect([...HOLDS_TURN_1.buyCounters, ...HELD_FROM_START], `${step.def.id}: the defense named is one the orders did not buy`).toContain(held!.id)
      expect(nightCopy.HELD[step.ev.eventId], `${step.def.id}: the block has no held line of its own`).toBeTruthy()
      const sign = step.ev.targetAssetId ? signsOf(night.before, after).get(step.ev.targetAssetId) : undefined
      const said = nightCopy.officerFor(step, sign)!
      expect(said.held, `${step.def.id}: the officer reports a hit on a block`).toBe(true)
    }
  })
})
