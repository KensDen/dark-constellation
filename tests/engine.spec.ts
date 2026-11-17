// Engine battery (spec Section 11.2): determinism, purity, the v1.3 rules
// (brief section 6) and win/loss reachability by real play. The
// determinism hash must match the committed snapshot; regenerate
// deliberately with UPDATE_SNAPSHOTS=1 after an intentional engine or
// content change, and record the new hash and why in the commit.
//
// THE SNAPSHOT MOVED ONCE IN v1.3 ROUND 0 (brief 6.10), for the loop pass:
// six turns, the reacting adversary, the new mitigation, coverage and
// economy, the debris call, fixed condition clocks, the intel brief, no
// tiers and no surge. Coverage is summed in whole hundredths in the same
// move, so the ledger's coverage figures carry no float noise. The v1.2
// proofs that rebuilt earlier snapshots from this engine (GUARD R3 (b),
// GUARD R5a (a) and the prepared line's second move) replayed v1.2 rules,
// which no longer exist, and left with them.
//
// IT MOVED ONCE MORE IN v1.3 ROUND 6b, the engine round before v1.3.0 (Ken,
// 22 October 2026, R6 Decisions Q1 and the parked engine items): link
// authentication off uplink jamming, downlink eavesdropping and backhaul
// exfiltration, and firmware attestation off the three LiDAR moves, so no
// pairing teaches a false defense; AML.T0020 under its current ATLAS name
// and first on the poisoning card; the docking dazzle striking the RPO sat
// when one is held (G-028); and every resolved event carrying the score it
// found and left (the per-event score). win f6025194..., loss e5160981...
//
// IT MOVED ONCE MORE IN v1.4.0 (Ken, 24 October 2026): one new defense a
// night. The engine plays every legal night exactly as before (the cap
// only refuses orders that add two), so the loss line, which orders
// nothing, keeps e5160981...; the prepared script ordered two defenses on
// four nights, which the engine now refuses, and was rewritten to one a
// night (tests/scripts.ts), so the win line's history is a different game:
// win 830b14f3... (the v1.3.0 engine gives the same hash for the new
// script). File sha1 ab375fc0.
//
// IT MOVED ONCE MORE IN v1.6 R1 (Ken, 26 October 2026): COLDVEIL varies
// per seed. Each seed plays one of two campaigns, drawn from its deck
// stream (src/engine/campaign.ts), and both anchor seeds, 20260712 and
// 4041, play the other one: the opening on the other layers, turns 4 and 5
// traded. The rules and every number are unchanged, so the move is the
// order the seeds now meet: win cf111d31..., loss b99db795..., file sha1
// b5017102.
//
// AND ONCE IN v1.6 R2 (27 October 2026), for a name, not a rule: the
// signature move's name went from "BLACKOUT CHAIN (...)" to "Blackout
// chain (...)", sentence case like every other move's (R1's fresh eyes,
// F14), and a turn's record carries the names of what it met. No rule,
// draw or number moved: the same games, the same scores, one name
// re-cased in the history: win 2ce7480c..., loss 37c25780..., file sha1
// 112140af.
//
// AND IN v1.7 R1, FOR THE RESPONSE: the night now asks the player what to
// do about a move that would land (a block or a halve, paid in credits),
// meter damage is 9 a point (5 before), and the record lost its notes. With
// every move ridden out nobody wins on STANDARD any more, so the win game
// is no longer WIN_SCRIPT alone: it is WIN_SCRIPT's orders with a fixed
// list of responses (WIN_RESPONSES, tests/scripts.ts), a won game again,
// and the loss game is LOSS_SCRIPT with every move ridden out, as before.
// The snapshot file and its sha1 below are regenerated once, at the end of
// the round, for those two games: win fed2ea6a..., loss 4d988547..., file
// sha1 96e819db.
//
// AND IN v2.0 R3, FOR ONE RULE SET (Ken's ruling of 15 November 2026: the
// pixel board is retired). Every game plays the 3D game's rules: the
// budget opens at the scenario's 80 CR with its funding a night, a hit costs the
// scenario's meter damage, the answers are a pool for the operation and
// cost no credits, a night can open on a hold, and the paid brief, the
// room and the cost of an answer are gone from the record. WIN_SCRIPT with
// WIN_RESPONSES no longer wins its seed, so the win game is a written game
// of its own (WIN_GAME, tests/written-games.ts: each night's orders, scans,
// placement, hold call and answers as literals); the loss game is
// LOSS_SCRIPT with every move ridden out, as before: win 40e73422...,
// loss d3641576..., file sha1 566d288d.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { adversaryPicks } from '../src/engine/adversary'
import {
  ASSET_DAMAGE_PER_SEVERITY,
  BURN_FUEL_CREDITS,
  CHAIN_BONUS,
  PRIMARY_MITIGATION,
  SECONDARY_MITIGATION,
  candidatesTonight,
  countersAfter,
  debrisTarget,
  meterDamageOf,
  mitigationOf,
  newGame,
  resolveTurn,
  scanPulses,
} from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { planFor } from '../src/engine/campaign'
import { holdTonight } from '../src/engine/holds'
import { worstCase } from '../src/engine/worstCase'
import { COVERAGE_PER_KIND, coverage, maiScore } from '../src/engine/scoring'
import { playNight, type Responder } from '../src/engine/responses'
import type { GameState, TurnActions } from '../src/engine/types'
import { ride, sensible } from './policies'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, a, debrisTurnOf, scripted } from './scripts'
import { WIN_GAME, WIN_GAME_SEED, playWritten } from './written-games'

const SNAPSHOT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'determinism.snap.json')

// WIN_SEED is a confirmed win for the written game; LOSS_SEED a confirmed
// loss for the do-nothing line. Both anchor the determinism snapshot.
// Since v2.0 R3 the win is a written game (playWin, below): the seed is
// the one WIN_GAME was written down on.
const WIN_SEED = WIN_GAME_SEED
const LOSS_SEED = 4041

// A written script as a line the engine takes: what the budget cannot meet
// on a night is left out (tests/scripts.ts, scripted). Every move is
// ridden out.
function playGame(seed: number, script: Record<number, TurnActions>, difficulty: GameState['difficulty'] = 'standard'): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  const line = scripted(script)
  while (state.status === 'playing') state = resolveTurn(state, line(state), turnRng(state.seed, state.turn))
  return state
}

// The won game (v2.0 R3): WIN_GAME's nights, each a fixed list of orders
// and answers, through plain resolveTurn.
const playWin = (): GameState => playWritten(newGame(DEFAULT_SCENARIO, WIN_SEED), WIN_GAME)

function gameLogHash(state: GameState): string {
  const log = { seed: state.seed, status: state.status, lossReason: state.lossReason ?? null, history: state.history }
  return createHash('sha256').update(JSON.stringify(log)).digest('hex')
}

const step = (state: GameState, actions: TurnActions = NO_OP) => resolveTurn(state, actions, turnRng(state.seed, state.turn))
const event = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)!

describe('determinism', () => {
  it('same seed and actions produce the identical log hash', () => {
    expect(gameLogHash(playGame(WIN_SEED, WIN_SCRIPT))).toBe(gameLogHash(playGame(WIN_SEED, WIN_SCRIPT)))
    // And with the night's answers among the actions (v1.7 R1): the same
    // written game with every move ridden out is another game.
    expect(gameLogHash(playWin())).toBe(gameLogHash(playWin()))
    const ridden = playWritten(newGame(DEFAULT_SCENARIO, WIN_SEED), WIN_GAME.map((night) => ({ ...night, responses: [] })).slice(0, 1))
    expect(JSON.stringify(ridden.history[0]), 'the responses changed nothing in the log').not.toBe(JSON.stringify(playWin().history[0]))
  })

  it('fixed-seed full-game replays match the committed snapshot', () => {
    // The win is a written game since v2.0 R3 (the header says why); the
    // loss rides every move out.
    const actual = { win: gameLogHash(playWin()), loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT)) }
    if (process.env.UPDATE_SNAPSHOTS) writeFileSync(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + '\n')
    expect(actual).toEqual(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')))
    // The committed file, pinned, so a regenerated snapshot is an edit to
    // this line as well as to the file: the snapshot moves deliberately or
    // not at all. be6509e3 was the v1.3 Round 0 move; 2a5966f1 the Round
    // 6b move; ab375fc0 the v1.4.0 move; b5017102 the v1.6 R1 move;
    // 112140af the v1.6 R2 move; 96e819db the v1.7 R1 move (see the
    // header); 10a75489 the v2.0 R1 move: mission funding 20 to 14 with
    // the scan in place of the paid brief; 566d288d the v2.0 R3
    // move, one rule set (see the header); 0c74b125 is the v2.0 R4 move:
    // 15 meter damage a point, 7 recovery and 7 funding a night, 3.5 points
    // for a wrong call, after the guard was loosened (Ken's rulings of 15
    // November 2026), regenerated at the round's end.
    expect(createHash('sha1').update(readFileSync(SNAPSHOT_PATH, 'utf8')).digest('hex'), 'the committed snapshot file changed').toBe(
      '0c74b125e0b2c4ed45560516610964f9a818c514',
    )
  })

  it('GUARD R5a (b), rewritten to D3 (a): the same seed and the same orders draw the same night; other orders may not', () => {
    // Under D3 (a) the Daily keeps the reacting adversary (brief 6.10), so
    // what COLDVEIL plays depends on the posture: two campaigns on a seed
    // with the same orders draw identical events, and two with different
    // orders may not. And the pick is always the move the plan marks
    // (tests/adversary.spec.ts holds that over 200 seeds).
    const draws = (state: GameState) => state.history.map((r) => r.events.map((e) => e.eventId))
    let differ = 0
    for (let seed = 1; seed <= 60; seed += 1) {
      expect(draws(playGame(seed, WIN_SCRIPT)), `seed ${seed}: the same orders drew different events`).toEqual(draws(playGame(seed, WIN_SCRIPT)))
      const prepared = draws(playGame(seed, WIN_SCRIPT))
      const idle = draws(playGame(seed, LOSS_SCRIPT))
      for (let t = 0; t < Math.min(prepared.length, idle.length); t += 1) if (JSON.stringify(prepared[t]) !== JSON.stringify(idle[t])) differ += 1
    }
    // The positive control: different postures do meet different moves,
    // which is the point of an adversary that reacts.
    expect(differ, 'a prepared posture and an idle one never met different moves').toBeGreaterThan(0)
  })

  it('GUARD R3 (a), the engine half: damage lands only on the tile an event names, and the record says how much', () => {
    let damaging = 0
    // The written game and the halving lines answer in the night (v1.7
    // R1), so a halved hit's integrity is held to the record too; the
    // others ride every move out.
    let halvedOnATile = 0
    const halve: Responder = ({ options }) => options.find((o) => o.fits && o.effect === 'halve')?.id ?? null
    const lined = (script: Record<number, TurnActions>, respond: Responder) => (state: GameState) => playNight(state, scripted(script)(state), respond)
    for (const [seed, night] of [
      [WIN_SEED, (state: GameState) => step(state, WIN_GAME[state.turn - 1])],
      [LOSS_SEED, lined(LOSS_SCRIPT, ride)],
      [7, lined(LOSS_SCRIPT, ride)],
      [11, lined(WIN_SCRIPT, ride)],
      [7, lined(LOSS_SCRIPT, halve)],
      [11, lined(WIN_SCRIPT, halve)],
    ] as [number, (state: GameState) => GameState][]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        // Replay the night by hand: every integrity the record says an
        // event left must be the asset's integrity at that moment, and no
        // asset may lose integrity that no event names.
        const after = night(state)
        const record = after.history.at(-1)!
        const integrity = new Map(state.assets.map((a) => [a.id, a.integrity]))
        for (const ev of record.events) {
          if (ev.integrityAfter === undefined) continue
          damaging += 1
          if (ev.response?.effect === 'halve') halvedOnATile += 1
          expect(ev.targetAssetId, `${ev.eventId} on turn ${record.turn} records a hit but names no tile`).toBeDefined()
          expect(integrity.get(ev.targetAssetId!), `${ev.eventId} on turn ${record.turn}: integrity before`).toBe(ev.integrityBefore)
          integrity.set(ev.targetAssetId!, ev.integrityAfter)
        }
        // After the close every asset is where the hits left it, healed by
        // the close's rule and nothing else.
        for (const asset of state.assets) {
          const hit = integrity.get(asset.id)!
          const final = after.assets.find((x) => x.id === asset.id)!.integrity
          expect(final, `${asset.id} on turn ${record.turn} moved without an event naming it`).toBe(
            record.ledger.insolvent || hit === 0 ? hit : Math.min(100, hit + 10),
          )
        }
        state = after
      }
    }
    expect(damaging, 'the sweep saw too few hits to mean anything').toBeGreaterThan(10)
    expect(halvedOnATile, 'no halved hit damaged a tile, so the halve went unchecked').toBeGreaterThan(0)
  })

  it('resolveTurn does not mutate its input state', () => {
    const state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = JSON.stringify(state)
    step(state, WIN_SCRIPT[1])
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('the v1.3 rules (brief 6.1)', () => {
  it('opens on the scenario\'s budget, six turns, the starter fleet at coverage 58, a full pool of answers and no allied feed past night 1', () => {
    const s = newGame(DEFAULT_SCENARIO, 1)
    expect(DEFAULT_SCENARIO.totalTurns).toBe(6)
    expect(s.credits).toBe(DEFAULT_SCENARIO.startCredits)
    expect(s.answersUsed ?? 0).toBe(0)
    expect(s.placed).toEqual({})
    expect(coverage(s.assets)).toBe(2 * COVERAGE_PER_KIND.sat + COVERAGE_PER_KIND.rpoSat + 2 * COVERAGE_PER_KIND.drone + COVERAGE_PER_KIND.groundStation)
    expect(coverage(s.assets)).toBe(58)
    expect(maiScore(s)).toBe(87.4)
    expect(s.briefFreeThrough).toBe(1)
  })

  it('mitigates by primary 2 and every other owned defense 1', () => {
    // The rogue ground station, the one move with two defenses since the
    // engine round of v1.3 R6 (Decisions Q1).
    const rogue = event('rogue-ground-station') // linkAuth, groundZeroTrust
    expect(mitigationOf(rogue, [])).toBe(0)
    expect(mitigationOf(rogue, ['linkAuth'])).toBe(PRIMARY_MITIGATION)
    expect(mitigationOf(rogue, ['groundZeroTrust'])).toBe(SECONDARY_MITIGATION)
    expect(mitigationOf(rogue, ['linkAuth', 'groundZeroTrust'])).toBe(PRIMARY_MITIGATION + SECONDARY_MITIGATION)
    // Brief 6.7: encryption first for the two listening threats, and, since
    // R6 Q1, alone: authentication gives no confidentiality.
    expect(event('downlink-eavesdropping').counters).toEqual(['encryptedBackhaul'])
    expect(event('backhaul-exfil').counters).toEqual(['encryptedBackhaul'])
    // Q1 too: authentication does not stop a jammer, and firmware
    // attestation does not stop a laser or a LiDAR spoof.
    expect(event('uplink-jamming').counters).toEqual(['antiJam'])
    for (const id of ['lidar-dazzle', 'lidar-injection', 'lidar-blinding']) expect(event(id).counters, id).toEqual(['sensorFusion'])
    // The debris is a call, not an attack.
    expect(mitigationOf(event('debris-conjunction'), ['ssaManeuver'])).toBe(0)
  })

  it('counts coverage per kind, in proportion to integrity', () => {
    const s = newGame(DEFAULT_SCENARIO, 1)
    const wounded = s.assets.map((a) => (a.id === 'start-sat-1' ? { ...a, integrity: 50 } : a))
    expect(coverage(wounded)).toBeCloseTo(58 - COVERAGE_PER_KIND.sat / 2, 10)
  })

  it('sums coverage exactly, so a fleet worth 60 sits on the bonus line rather than a hair under it', () => {
    // The starter fleet plus a drone, worn to exactly 6,000 hundredths.
    // Added term by term as fractions it came to 59.99999999999999, and
    // the close refused the coverage bonus to a fleet that had earned it.
    const kinds = ['sat', 'sat', 'rpoSat', 'drone', 'drone', 'groundStation', 'drone'] as const
    const integrity = [97, 66, 97, 100, 87, 99, 92]
    const layerOf = { sat: 'ORBIT', rpoSat: 'ORBIT', drone: 'AIR', groundStation: 'GROUND' } as const
    const fleet = kinds.map((kind, i) => ({ id: `a${i}`, kind, layer: layerOf[kind], integrity: integrity[i] }))
    expect(kinds.reduce((n, kind, i) => n + COVERAGE_PER_KIND[kind] * integrity[i], 0)).toBe(6000)
    expect(coverage(fleet)).toBe(DEFAULT_SCENARIO.slaBonus.coverageMin)
  })

  it('charges the orders as the night begins, and the turn closes with repairs, upkeep, funding and the coverage bonus after arrivals', () => {
    // A drone and anti-jam, with PNT authentication already owned (one new
    // defense a night, so a hand-built start holds the other turn-1
    // primary): nothing gets through, so no repairs.
    const s: GameState = { ...newGame(DEFAULT_SCENARIO, 3), counters: ['pntAuth'] }
    const after = step(s, a({ buyAssets: [{ kind: 'drone' }], buyCounters: ['antiJam'] }))
    const l = after.history[0].ledger
    expect(l.ordered).toBe(DEFAULT_SCENARIO.prices.drone + DEFAULT_SCENARIO.countermeasures.find((c) => c.id === 'antiJam')!.cost)
    expect(l.repairs).toBe(0)
    expect(l.upkeep).toBe(2 * DEFAULT_SCENARIO.upkeepPerDefense)
    // The drone arrives at this close, and coverage 67 earns the bonus.
    expect(l.arrivals).toEqual(['t1-drone-1'])
    expect(l.bonusCoverage).toBe(58 + COVERAGE_PER_KIND.drone)
    expect(l.coverageBonus).toBe(DEFAULT_SCENARIO.slaBonus.credits)
    // Funding is read from the scenario, as the opening budget, upkeep and
    // the bonus are, so the sum follows the scenario's own numbers.
    expect(l.funding).toBe(DEFAULT_SCENARIO.incomePerTurn)
    expect(after.credits).toBe(DEFAULT_SCENARIO.startCredits - l.ordered - l.upkeep + DEFAULT_SCENARIO.incomePerTurn + DEFAULT_SCENARIO.slaBonus.credits)
    expect(l.after).toBe(after.credits)
    expect(l.afterNight - l.repairs - l.upkeep + l.funding + l.coverageBonus).toBe(l.after)
  })

  it('lands a satellite two closes after its order, with no slip', () => {
    let s = step(newGame(DEFAULT_SCENARIO, 5), a({ buyAssets: [{ kind: 'sat' }] }))
    expect(s.assets.some((x) => x.id === 't1-sat-1')).toBe(false)
    expect(s.pipeline.find((p) => p.id === 't1-sat-1')?.etaTurns).toBe(1)
    s = step(s)
    expect(s.assets.some((x) => x.id === 't1-sat-1')).toBe(true)
  })

  it('ends the run insolvent when the close cannot cover repairs and upkeep, with funding frozen', () => {
    // A new defense every night and drones to the bottom of the budget:
    // the upkeep and the hits outrun funding sooner or later on some seed.
    // (Before the cap this ordered eight defenses on turn 1.)
    let found = false
    for (let seed = 1; seed <= 200 && !found; seed += 1) {
      let s = newGame(DEFAULT_SCENARIO, seed)
      while (s.status === 'playing') {
        const next = DEFAULT_SCENARIO.countermeasures.find((cm) => !s.counters.includes(cm.id) && cm.cost <= s.credits)
        const counters = next ? [next.id] : []
        const drones = Math.floor((s.credits - (next?.cost ?? 0)) / DEFAULT_SCENARIO.prices.drone)
        s = step(s, a({ buyCounters: counters, buyAssets: Array.from({ length: drones }, () => ({ kind: 'drone' as const })) }))
      }
      if (s.lossReason !== 'insolvency') continue
      found = true
      const l = s.history.at(-1)!.ledger
      expect(l.insolvent).toBe(true)
      expect(l.funding).toBe(0)
      expect(l.coverageBonus).toBe(0)
      expect(l.afterNight - l.repairs - l.upkeep).toBeLessThan(0)
    }
    expect(found, 'no seed went insolvent').toBe(true)
  })

  it('names every candidate while the allied feed covers the night, and after it only what the scan identified, what was named on sight and what is confirmed', () => {
    const s = newGame(DEFAULT_SCENARIO, 2)
    // Night 1 is inside the feed the game opens with (rules.ts, briefFree).
    const t1 = step(s)
    expect(t1.history[0].briefed).toBe(true)
    expect(t1.history[0].named).toEqual(candidatesTonight(s))
    expect(t1.history[0].named.length).toBeGreaterThan(0)
    // Night 2: no feed. With no scan sent, nothing is named.
    const candidates = candidatesTonight(t1)
    const confirmed = (planFor(t1, t1.turn)?.slots ?? []).flatMap((slot) => (slot.fixed ? [slot.fixed] : []))
    const drawn = candidates.filter((id) => !confirmed.includes(id))
    expect(drawn.length, 'night 2 of this seed draws too few moves to tell a scan from a sighting').toBeGreaterThan(scanPulses(t1))
    const unscanned = step(t1)
    expect(unscanned.history[1].briefed).toBe(false)
    expect(unscanned.history[1].named).toEqual([])
    // A scan names what it identified and the confirmed moves, in the
    // night's own order, and costs no credits.
    const scans = drawn.slice(0, scanPulses(t1))
    const scanned = step(t1, a({ scans }))
    expect(scanned.history[1].briefed).toBe(false)
    expect(scanned.history[1].scanned).toEqual(scans)
    expect(scanned.history[1].named).toEqual(candidates.filter((id) => scans.includes(id) || confirmed.includes(id)))
    expect(scanned.history[1].ledger.ordered).toBe(0)
    // A move named on sight is named with no pulse spent; one the scan
    // also named is the scan's.
    const sight = drawn[scanPulses(t1)]
    const sighted = step(t1, a({ scans, sighted: [sight, scans[0]] }))
    expect(sighted.history[1].sighted).toEqual([sight])
    expect(sighted.history[1].named).toEqual(candidates.filter((id) => scans.includes(id) || id === sight || confirmed.includes(id)))
    // And the watch has only so many pulses.
    expect(() => step(t1, a({ scans: drawn.slice(0, scanPulses(t1) + 1) }))).toThrow(/more scans than pulses/)
  })

  it('has COLDVEIL take the move the defenses mitigate least', () => {
    // Turn 1 is a jam against a spoof on either opening (v1.6 R1): uplink
    // jamming against GNSS spoofing as written, PNT jamming against a time
    // spoof on the other.
    const openings = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const s = newGame(DEFAULT_SCENARIO, seed)
      const [jam, spoof] = planFor(s, 1)!.slots[0].drawFrom!
      openings.add(`${jam} ${spoof}`)
      // Block the jam outright: the spoof lands.
      const blocked = step(s, a({ buyCounters: ['antiJam'] }))
      expect(blocked.history[0].events.map((e) => e.eventId)).toEqual([spoof])
      const other = step(s, a({ buyCounters: ['pntAuth'] }))
      expect(other.history[0].events.map((e) => e.eventId)).toEqual([jam])
    }
    expect([...openings].sort()).toEqual(['pnt-jamming time-spoof', 'uplink-jamming gnss-spoofing'])
  })

  it('leaves a condition with a fixed clock that presses the next night and lifts on time', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      // Turn 1, nothing owned: an uplink jam lands on some seeds.
      const s = step(newGame(DEFAULT_SCENARIO, seed))
      const ev = s.history[0].events[0]
      if (ev.eventId !== 'uplink-jamming') continue
      const cond = event('uplink-jamming').condition!
      expect(ev.condition).toEqual(cond)
      const jam = s.conditions.find((c) => c.eventId === 'uplink-jamming')!
      // Placed at the clock's length and counted down once at this close.
      expect(jam.remainingTurns).toBe(cond.turns - 1)
      const t2 = step(s)
      expect(t2.history[1].conditionsActive).toContain(cond.name)
      expect(t2.conditions.some((c) => c.instanceId === jam.instanceId)).toBe(cond.turns - 2 > 0)
      return
    }
    throw new Error('no seed landed the uplink jam on turn 1')
  })

  it('adds the chain bonus while GNSS denial is live, and WORST CASE counts it', () => {
    // Built by hand: under brief 6.2's plan and a 2-turn GNSS DENIED clock
    // no campaign reaches it (pnt-jamming is drawn on turns 2 and 3 only,
    // so GNSS denial is live on turns 3 and 4 at most, and every chain
    // exploit is drawn on turns 5 and 6). Raised with Ken in the R0 report.
    // The eve of the last night with sensor fusion owned, found rather
    // than pinned: the first seed whose idle line, answering while it has
    // an answer, is still playing on night 6 and meets the chain there.
    const eve = (seed: number): GameState => {
      let g = newGame(DEFAULT_SCENARIO, seed)
      while (g.status === 'playing' && g.turn < DEFAULT_SCENARIO.totalTurns) g = playNight(g, a({ buyCounters: g.turn === 1 ? ['sensorFusion'] : [] }), sensible)
      return g
    }
    const meetsChain = (g: GameState) => g.status === 'playing' && step(g).history.at(-1)!.events.some((e) => e.eventId === 'blackout-chain')
    let s = eve(1)
    for (let seed = 2; seed <= 200 && !meetsChain(s); seed += 1) s = eve(seed)
    expect(meetsChain(s), 'no seed reaches night 6 with the chain to meet').toBe(true)
    const denied = { ...s, conditions: [{ instanceId: 'pnt-jamming-t5', eventId: 'pnt-jamming', name: 'GNSS DENIED', startedTurn: 5, remainingTurns: 1, baseSeverity: 2 }] }
    const chained = step(denied).history.at(-1)!.events.find((e) => e.eventId === 'blackout-chain')!
    expect(chained.chainBonus).toBe(CHAIN_BONUS)
    expect(chained.effectiveSeverity).toBe(event('blackout-chain').baseSeverity + CHAIN_BONUS - PRIMARY_MITIGATION)
    const plain = step(s).history.at(-1)!.events.find((e) => e.eventId === 'blackout-chain')!
    expect(plain.chainBonus).toBe(0)
    expect(worstCase(denied, NO_OP).repairs).toBeGreaterThan(worstCase(s, NO_OP).repairs)
  })

  it('makes the debris a call: a burn costs fuel without SSA and nothing with it, a hold risks the satellite', () => {
    // The night of the call: turn 4 as written, turn 5 when the seed trades
    // turns 4 and 5 (v1.6 R1).
    const toTurn4 = (seed: number, buy: TurnActions['buyCounters'] = []) => {
      let s = newGame(DEFAULT_SCENARIO, seed)
      s = step(s, a({ buyCounters: buy }))
      while (s.status === 'playing' && s.turn < debrisTurnOf(seed)) s = step(s)
      return s
    }
    const s = toTurn4(9)
    const sat = debrisTarget(s)!
    expect(sat.id).toBe('start-sat-2')
    const burn = step(s, a({ debris: 'burn' })).history.at(-1)!
    const call = burn.events.find((e) => e.eventId === 'debris-conjunction')!
    expect(call.debris).toMatchObject({ choice: 'burn', assetId: sat.id, lost: false, fuel: BURN_FUEL_CREDITS, ssa: false })
    expect(burn.ledger.fuel).toBe(BURN_FUEL_CREDITS)
    // Off station for tonight's bonus check, and back for the score.
    expect(burn.ledger.bonusCoverage).toBeLessThan(burn.coverage)
    const withSsa = step(toTurn4(9, ['ssaManeuver']), a({ debris: 'burn' })).history.at(-1)!
    expect(withSsa.events.find((e) => e.eventId === 'debris-conjunction')!.debris!.fuel).toBe(0)
    // HOLD loses the satellite on some seeds, with a loss review queued.
    let lost = 0
    let kept = 0
    for (let seed = 1; seed <= 80; seed += 1) {
      // A watch that orders nothing can collapse before the debris night
      // at 15 meter damage a point (v2.0 R4): those seeds have no call.
      const night = toTurn4(seed)
      if (night.status !== 'playing') continue
      const held = step(night).history.at(-1)!.events.find((e) => e.eventId === 'debris-conjunction')!
      expect(held.debris!.choice).toBe('hold')
      if (held.debris!.lost) {
        lost += 1
        expect(held.integrityAfter).toBe(0)
        expect(held.repairCost).toBe(event('debris-conjunction').effect.repairCostPerSeverity * 2)
      } else kept += 1
    }
    expect(lost).toBeGreaterThan(10)
    expect(kept).toBeGreaterThan(lost)
  })

  it('aims the implant at any asset, and attestation blunts it to 1 without blocking it', () => {
    const implant = event('supply-chain-implant')
    expect(implant.name).not.toMatch(/Tier/)
    expect(implant.blurb).toContain('without firmware attestation')
    expect(Math.max(0, implant.baseSeverity - mitigationOf(implant, ['tierAAttestation']))).toBe(1)
  })

  it('scales damage and repair bills by 0.75 on EASY, and nothing else', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const std = step(newGame(DEFAULT_SCENARIO, seed, 'standard')).history[0]
      const easy = step(newGame(DEFAULT_SCENARIO, seed, 'easy')).history[0]
      const hit = std.events[0]
      expect(easy.events[0].eventId).toBe(hit.eventId)
      if (hit.integrityAfter === undefined) continue
      expect(hit.integrityBefore! - hit.integrityAfter).toBe(ASSET_DAMAGE_PER_SEVERITY * hit.effectiveSeverity)
      const easyHit = easy.events[0]
      expect(easyHit.integrityBefore! - easyHit.integrityAfter!).toBe(Math.round(ASSET_DAMAGE_PER_SEVERITY * hit.effectiveSeverity * 0.75))
      expect(easyHit.repairCost).toBe(Math.round(hit.repairCost * 0.75))
      expect(easy.ledger.funding).toBe(std.ledger.funding)
      return
    }
    throw new Error('no turn-1 hit damaged a tile')
  })

  it('counts a defense streak, points saved and what the player can now say', () => {
    // Both turn-1 moves blocked: anti-jam ordered, PNT authentication held
    // from a hand-built start (one new defense a night).
    const s: GameState = { ...newGame(DEFAULT_SCENARIO, 4), counters: ['pntAuth'] }
    // No hold tonight, so the meters below move for the hit alone.
    expect(holdTonight(s), 'night 1 of this seed opens on a hold').toBeUndefined()
    const held = step(s, a({ buyCounters: ['antiJam'] }))
    const ev = held.history[0].events[0]
    expect(ev.outcome).toBe('held')
    expect(held.streak).toBe(1)
    expect(held.bestStreak).toBe(1)
    expect(ev.saved).toBeGreaterThan(0)
    expect(held.saved).toBe(ev.saved)
    expect(held.learned).toEqual([{ counter: event(ev.eventId).counters[0], threat: ev.eventId, how: 'held' }])
    const open = step(s)
    expect(open.history[0].events[0].outcome).toBe('open')
    expect(open.streak).toBe(0)
    expect(open.learned[0].how).toBe('missed')
    // The meters it cost, at the damage rule.
    const hit = open.history[0].events[0]
    for (const m of event(hit.eventId).effect.meters) {
      expect(100 - open.history[0].meters[m] + DEFAULT_SCENARIO.recovery.base).toBe(meterDamageOf(s) * hit.effectiveSeverity)
    }
  })

  it('reads the plan and the engine through the same pick', () => {
    const s = newGame(DEFAULT_SCENARIO, 12)
    const orders = a({ buyCounters: ['antiJam'] })
    const read = adversaryPicks(s, countersAfter(s, orders))
    expect(read[0].least).toEqual(['gnss-spoofing'])
    expect(step(s, orders).history[0].events[0].eventId).toBe(read[0].pick)
  })
})

describe('reachability by real play', () => {
  it('the written game wins, and every choice it writes down is one the engine took', () => {
    // With its answers in the night (v1.7 R1): orders alone, every move
    // ridden out, do not win on STANDARD.
    const end = playWin()
    expect(end.status).toBe('won')
    expect(end.history).toHaveLength(DEFAULT_SCENARIO.totalTurns)
    expect(WIN_GAME).toHaveLength(DEFAULT_SCENARIO.totalTurns)
    // WIN_GAME is real play, not a list that happens to win: every scan it
    // writes was a scan, every answer was taken where it is written, every
    // defense stands where it was set down, and every hold call was the
    // call recorded.
    end.history.forEach((record, t) => {
      const night = WIN_GAME[t]
      expect(record.scanned ?? [], `night ${record.turn}: the scans`).toEqual(night.scans ?? [])
      expect(record.events.map((e) => e.response?.id ?? null).slice(0, night.responses!.length), `night ${record.turn}: the answers`).toEqual(night.responses)
      for (const [defense, asset] of Object.entries(night.placeOn ?? {})) expect(end.placed?.[defense as keyof typeof end.placed], `night ${record.turn}: ${defense}`).toBe(asset)
      expect(record.hold ? (record.hold.call === 'none' ? null : record.hold.call) : null, `night ${record.turn}: the hold call`).toBe(night.tiebreak ?? null)
    })
    const taken = end.history.flatMap((r) => r.events).filter((e) => e.response).length
    expect(taken, 'the won game took no response').toBeGreaterThan(0)
    expect(taken).toBe(end.answersUsed)
    expect(taken).toBeLessThanOrEqual(DEFAULT_SCENARIO.answers)
  })

  it('the do-nothing line loses', () => {
    const end = playGame(LOSS_SEED, LOSS_SCRIPT)
    expect(end.status).toBe('lost')
    expect(end.lossReason).toBeTruthy()
  })
})
