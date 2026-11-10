// THE 3D GAME'S MODEL AND RULES (v2.0 R1). The world is a presentation and
// is watched by the bot (scripts/game3d-bot.mjs); what it shows is decided
// here and in the engine, and this holds both: the signatures over the
// fleet are the engine's own candidates and say what the adversary will
// do, the scan and the timed tap are engine inputs with the limits the
// rules give them, a game played through the model is the game the engine
// plays, and a finished game replays to itself with every input it took.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { RESPONSE_TEXT } from '../src/content/responseText'
import { adversaryPicks } from '../src/engine/adversary'
import { candidatesTonight } from '../src/engine/campaign'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { SCANS_PER_NIGHT, TIMING_BONUS, scanPulses, timingRefund } from '../src/engine/rules'
import type { GameState, TimingGrade } from '../src/engine/types'
import {
  ASSIST_GRADE,
  GOOD_WINDOW_S,
  NO_INPUTS,
  NO_ORDERS,
  PERFECT_WINDOW_S,
  actionsOf,
  choicesFor,
  coachRun,
  contactsFor,
  domainOf,
  finalScore,
  gestureOf,
  gradeTap,
  inputsOf,
  kitFor,
  nightNow,
  nightsOf,
  scanState,
  stakesFor,
  timeline,
  withResponse,
  withTiming,
  type NightInputs,
  type Orders,
} from '../src/ui/three/gameModel'
import { TAG } from '../src/ui/three/copy3d'
import { SIGNATURE } from '../src/ui/three/signatures'
import { MOTIF } from '../src/ui/three/sounds3d'
import { unlocksFor } from '../src/ui/three/store3d'
import { maiScore } from '../src/engine/scoring'

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1)
const THREATS = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
const fresh = (seed: number, difficulty: 'easy' | 'standard' = 'standard') => newGame(DEFAULT_SCENARIO, seed, difficulty)

// A whole game through the model, as the 3D game plays it: scan what the
// pulses allow, place the piece that answers the first favored signature
// the scan has named, order a drone on night 1 (each only while the
// stakes' WORST CASE stays at 0 or more), take the first answer that fits,
// burn on the debris, and tap every move at `grade`.
function playThrough(start: GameState, grade: TimingGrade | 0 = 0): GameState {
  let state = start
  while (state.status === 'playing') {
    let orders: Orders = NO_ORDERS
    for (const c of contactsFor(state, orders)) if (!c.known && scanState(state, orders).left > 0) orders = { ...orders, scans: [...orders.scans, c.id] }
    const contacts = contactsFor(state, orders)
    const want = contacts.find((c) => c.known && !c.debris && c.exposed > 0 && c.favor !== 'unlikely')
    const piece = want && kitFor(state, orders, contacts).find((p) => !p.blocked && p.answers.some((a) => a.contact.id === want.id))
    const safe = (o: Orders) => stakesFor(state, o, contacts, 0).worst >= 0
    if (piece && safe({ ...orders, defense: piece.cm.id })) orders = { ...orders, defense: piece.cm.id }
    if (state.turn === 1 && safe({ ...orders, assets: ['drone'] })) orders = { ...orders, assets: ['drone'] }
    let inputs: NightInputs = { ...NO_INPUTS, debris: 'burn' }
    for (;;) {
      const now = nightNow(state, orders, inputs)
      now.night.steps.forEach((s) => {
        if (grade && s.kind === 'threat' && inputs.timing[s.index] === undefined) inputs = withTiming(inputs, s.index, grade)
      })
      const again = nightNow(state, orders, inputs)
      if (again.open < 0) {
        state = again.after
        break
      }
      const step = again.night.steps[again.open]
      const pick = choicesFor(state, orders, inputs, again.open, step).find((c) => c.id !== null && c.fits)
      inputs = withResponse(inputs, again.open, pick?.id ?? null)
    }
  }
  return state
}

describe('the signatures over the fleet are the engine’s own (v2.0 R1)', () => {
  it('shows every candidate tonight, each on an asset, unidentified until the scan names it', () => {
    for (const seed of SEEDS) {
      const state = fresh(seed)
      const contacts = contactsFor(state, NO_ORDERS)
      expect(contacts.map((c) => c.id), `seed ${seed}`).toEqual(candidatesTonight(state))
      for (const c of contacts) {
        expect(c.targetId, `seed ${seed}: ${c.id} has no asset to show over`).toBeTruthy()
        expect(c.known, `seed ${seed}: ${c.id} is named before any scan`).toBe(c.fixed)
      }
      const scanned = contactsFor(state, { ...NO_ORDERS, scans: [contacts[0].id] })
      expect(scanned[0].known).toBe(true)
      expect(scanned.filter((c) => c.known && !c.fixed).length, 'one pulse named more than one signature').toBe(1)
    }
  })

  it('says what COLDVEIL does with each: its favor is the adversary’s own read, with the piece placed counted', () => {
    let moved = 0
    for (const seed of SEEDS) {
      let state = fresh(seed)
      for (let turn = 1; turn <= 3; turn += 1) {
        for (const defense of [null, 'antiJam', 'pntAuth', 'encryptedBackhaul'] as const) {
          if (defense && state.counters.includes(defense)) continue
          const orders: Orders = { ...NO_ORDERS, defense }
          const contacts = contactsFor(state, orders)
          const reads = adversaryPicks(state, [...state.counters, ...(defense ? [defense] : [])])
          reads.forEach((read, slot) => {
            for (const c of contacts.filter((x) => x.slot === slot)) {
              const want = read.fixed ? 'confirmed' : read.least.length === 1 && read.least[0] === c.id ? 'likely' : read.least.includes(c.id) ? 'either' : 'unlikely'
              expect(c.favor, `seed ${seed} turn ${turn} ${c.id} with ${defense}`).toBe(want)
              if (want === 'unlikely') moved += 1
            }
          })
          // The move the engine plays is shown over the asset it strikes.
          const after = resolveTurn(state, actionsOf(orders), turnRng(state.seed, state.turn))
          after.history[after.history.length - 1].events.forEach((ev, slot) => {
            const shown = contacts.find((c) => c.slot === slot && c.id === ev.eventId)
            if (shown && ev.targetAssetId) expect(shown.targetId, `seed ${seed} turn ${turn}: ${ev.eventId}`).toBe(ev.targetAssetId)
          })
        }
        state = resolveTurn(state, actionsOf(NO_ORDERS), turnRng(state.seed, state.turn))
        if (state.status !== 'playing') break
      }
    }
    // Not vacuous: a placed piece moved COLDVEIL off a signature somewhere.
    expect(moved).toBeGreaterThan(50)
  })

  it('gives every threat a signature, a sound and a short name of its own, and every defense somewhere to go', () => {
    const looks = new Set<string>()
    for (const ev of THREATS) {
      expect(SIGNATURE[ev.id], `${ev.id} has no signature`).toBeTruthy()
      expect(MOTIF[ev.id]?.length, `${ev.id} has no sound`).toBeGreaterThan(0)
      expect(TAG[ev.id], `${ev.id} has no short name`).toBeTruthy()
      looks.add(`${SIGNATURE[ev.id].form}:${SIGNATURE[ev.id].color}:${SIGNATURE[ev.id].wide ?? ''}`)
      for (const r of ev.responses ?? []) expect(['reroute', 'isolate', 'shield'], `${ev.id} ${r.id}`).toContain(gestureOf(r.id))
    }
    expect(looks.size, 'two threats look the same').toBe(THREATS.length)
    expect(new Set(Object.values(MOTIF).map((m) => JSON.stringify(m))).size, 'two threats sound the same').toBe(Object.keys(MOTIF).length)
    expect(Object.keys(SIGNATURE).sort()).toEqual(THREATS.map((e) => e.id).sort())
    const gestures = new Set(Object.values(RESPONSE_TEXT).flatMap((r) => Object.keys(r).map(gestureOf)))
    expect([...gestures].sort()).toEqual(['isolate', 'reroute', 'shield'])
    const state = fresh(1)
    for (const cm of DEFAULT_SCENARIO.countermeasures) expect(domainOf(state, cm.id).length, `${cm.id} has nowhere to be placed`).toBeGreaterThan(0)
  })
})

describe('the scan and the timed tap are engine inputs, with the rules’ limits (v2.0 R1)', () => {
  it('refuses more scans than the watch has pulses, and has 1 under the dark posture', () => {
    const state = { ...fresh(7), turn: 3 }
    const ids = candidatesTonight(state)
    expect(ids.length).toBeGreaterThan(SCANS_PER_NIGHT)
    expect(scanPulses(state)).toBe(SCANS_PER_NIGHT)
    const ok = resolveTurn(state, actionsOf({ ...NO_ORDERS, scans: ids.slice(0, SCANS_PER_NIGHT) }), turnRng(state.seed, state.turn))
    expect(ok.history[0].scanned).toEqual(ids.slice(0, SCANS_PER_NIGHT))
    expect(ok.history[0].named).toEqual(ids.slice(0, SCANS_PER_NIGHT))
    expect(() => resolveTurn(state, actionsOf({ ...NO_ORDERS, scans: ids.slice(0, SCANS_PER_NIGHT + 1) }), turnRng(state.seed, state.turn))).toThrow(/more scans than pulses/)
    const dark = { ...newGame(DEFAULT_SCENARIO, 7, 'standard', 'dark'), turn: 3 }
    expect(scanPulses(dark)).toBe(1)
    expect(() => resolveTurn(dark, actionsOf({ ...NO_ORDERS, scans: ids.slice(0, 2) }), turnRng(dark.seed, dark.turn))).toThrow(/more scans than pulses/)
    // What a scan names is knowledge: the night itself is the same night.
    const blind = resolveTurn(state, actionsOf(NO_ORDERS), turnRng(state.seed, state.turn))
    expect(ok.history[0].events).toEqual(blind.history[0].events)
    expect(ok.history[0].maiScore).toBe(blind.history[0].maiScore)
  })

  it('lets a tap take a little off a hit or pay a little of a block back, and never decide a move', () => {
    let hits = 0
    let refunds = 0
    for (const seed of SEEDS) {
      const plain = playThrough(fresh(seed), 0)
      for (const grade of [1, 2] as const) {
        const tapped = playThrough(fresh(seed), grade)
        // Same moves, same landings: the tap changes how much, never whether.
        tapped.history.forEach((rec, t) => {
          rec.events.forEach((ev, i) => {
            if (ev.timing === undefined) return
            expect(ev.timing).toBe(grade)
            if (ev.refund) {
              refunds += 1
              expect(ev.response?.effect).toBe('block')
              expect(ev.refund).toBe(timingRefund(ev.response!.cost, grade))
            }
            if (ev.effectiveSeverity > 0) hits += 1
            const same = plain.history[t]?.events[i]
            if (t === 0 && same) {
              expect(ev.eventId).toBe(same.eventId)
              expect(ev.effectiveSeverity, `seed ${seed}: a tap changed whether ${ev.eventId} landed`).toBe(same.effectiveSeverity)
              expect(ev.repairCost).toBe(same.repairCost)
              expect(ev.scoreAfter, `seed ${seed}: a tap made ${ev.eventId} worse`).toBeGreaterThanOrEqual(same.scoreAfter)
            }
          })
        })
      }
    }
    expect(hits).toBeGreaterThan(100)
    expect(refunds).toBeGreaterThan(20)
    expect(TIMING_BONUS[2]).toBeLessThanOrEqual(0.05)
    expect(TIMING_BONUS[1]).toBe(TIMING_BONUS[2] / 2)
  })

  it('grades a tap generously, and grants Assist the good grade', () => {
    expect(gradeTap(null)).toBe(0)
    expect(gradeTap(0)).toBe(2)
    expect(gradeTap(-PERFECT_WINDOW_S)).toBe(2)
    expect(gradeTap(PERFECT_WINDOW_S + 0.01)).toBe(1)
    expect(gradeTap(-GOOD_WINDOW_S)).toBe(1)
    expect(gradeTap(GOOD_WINDOW_S + 0.01)).toBe(0)
    expect(GOOD_WINDOW_S, 'the window is not generous').toBeGreaterThanOrEqual(0.3)
    expect(ASSIST_GRADE).toBe(1)
  })
})

describe('a game through the model is the engine’s game, and replays to itself (v2.0 R1)', () => {
  it('reaches an end on every seed, with the stakes read off the engine', () => {
    let won = 0
    for (const seed of SEEDS.slice(0, 30)) {
      for (const difficulty of ['easy', 'standard'] as const) {
        const start = fresh(seed, difficulty)
        const contacts = contactsFor(start, NO_ORDERS)
        const stakes = stakesFor(start, NO_ORDERS, contacts, maiScore(start))
        expect(stakes.atStake, `seed ${seed}: nothing at stake on night 1`).toBeLessThan(0)
        expect(stakes.line).toBe(DEFAULT_SCENARIO.winThreshold)
        const end = playThrough(start)
        expect(end.status).not.toBe('playing')
        // WORST CASE on the stakes is the engine's: a line that keeps it at 0
        // or more never closes a night below zero.
        expect(end.lossReason, `seed ${seed} ${difficulty}: a line that kept WORST CASE at 0 or more went insolvent`).not.toBe('insolvency')
        if (end.status === 'won') won += 1
      }
    }
    expect(won, 'a careful line through the model wins some games').toBeGreaterThan(20)
  })

  it('replays a finished game from its record, scans, taps, assets, the debris call and all', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const end = playThrough(fresh(seed), seed % 3 === 0 ? 2 : seed % 3 === 1 ? 1 : 0)
      const states = timeline(end, inputsOf(end))
      expect(states.length, `seed ${seed}`).toBe(end.history.length + 1)
      expect(states[states.length - 1].history, `seed ${seed}: the record did not replay to itself`).toEqual(end.history)
      const nights = nightsOf(states)
      expect(nights.length).toBe(end.history.length)
      expect(nights[nights.length - 1].record.maiScore).toBe(finalScore(states))
    }
  })

  it('has a ghost to show on every seed: a careful watch that ends its game', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const end = playThrough(fresh(seed))
      const ghost = coachRun(end)
      expect(ghost[ghost.length - 1].status, `seed ${seed}`).not.toBe('playing')
      expect(ghost[0].history.length).toBe(0)
      expect(coachRun(end).map((s) => s.history.length)).toEqual(ghost.map((s) => s.history.length))
    }
  })
})

describe('the guard on the one way to lose by accident (v2.0 R1)', () => {
  it('marks as risky exactly the pieces and assets that would put WORST CASE below 0', () => {
    let risky = 0
    let safe = 0
    for (const seed of SEEDS.slice(0, 20)) {
      // Deep in a game that has spent freely, so some orders are risky.
      let state = fresh(seed)
      for (let turn = 1; turn <= 4 && state.status === 'playing'; turn += 1) {
        const piece = kitFor(state, NO_ORDERS, contactsFor(state, NO_ORDERS)).find((p) => !p.blocked)
        try {
          state = resolveTurn(state, actionsOf({ ...NO_ORDERS, defense: piece?.cm.id ?? null, assets: turn === 1 ? ['sat'] : [] }), turnRng(state.seed, state.turn))
        } catch {
          break
        }
      }
      if (state.status !== 'playing') continue
      const contacts = contactsFor(state, NO_ORDERS)
      for (const p of kitFor(state, NO_ORDERS, contacts)) {
        if (p.blocked) {
          expect(p.risky, `${p.cm.id} is blocked and risky at once`).toBe(false)
          continue
        }
        const worst = stakesFor(state, { ...NO_ORDERS, defense: p.cm.id }, contacts, 0).worst
        expect(p.risky, `seed ${seed} turn ${state.turn}: ${p.cm.id} at WORST CASE ${worst}`).toBe(worst < 0)
        if (p.risky) risky += 1
        else safe += 1
      }
    }
    // Not vacuous either way.
    expect(risky).toBeGreaterThan(5)
    expect(safe).toBeGreaterThan(5)
  })
})

describe('what finished games unlock (v2.0 R1)', () => {
  it('earns finishes, a posture and an opening by playing, and nothing any other way', () => {
    const none = unlocksFor({ finished: 0, wins: 0, standardWins: 0 }, 0)
    expect(none.skins).toEqual({ standard: true, foil: false, nightwatch: false, signal: false })
    expect(none.postures.dark).toBe(false)
    expect(none.openings.polar).toBe(false)
    expect(unlocksFor({ finished: 1, wins: 0, standardWins: 0 }, 0).skins.foil).toBe(true)
    expect(unlocksFor({ finished: 1, wins: 1, standardWins: 0 }, 0).skins.nightwatch).toBe(true)
    expect(unlocksFor({ finished: 1, wins: 1, standardWins: 0 }, 0).postures.dark).toBe(false)
    expect(unlocksFor({ finished: 2, wins: 1, standardWins: 1 }, 9)).toEqual({ skins: { standard: true, foil: true, nightwatch: true, signal: true }, postures: { standard: true, dark: true }, openings: { standard: true, polar: true } })
  })
})
