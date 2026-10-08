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
  METER_DAMAGE_PER_SEVERITY,
  PRIMARY_MITIGATION,
  SECONDARY_MITIGATION,
  countersAfter,
  debrisTarget,
  mitigationOf,
  newGame,
  resolveTurn,
} from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { worstCase } from '../src/engine/worstCase'
import { COVERAGE_PER_KIND, coverage, maiScore } from '../src/engine/scoring'
import type { GameState, TurnActions } from '../src/engine/types'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, a } from './scripts'

const SNAPSHOT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'determinism.snap.json')

// WIN_SEED is a confirmed win for the prepared line; LOSS_SEED a confirmed
// loss for the do-nothing line. Both anchor the determinism snapshot.
const WIN_SEED = 20260712
const LOSS_SEED = 4041

function playGame(seed: number, script: Record<number, TurnActions>, difficulty: GameState['difficulty'] = 'standard'): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  while (state.status === 'playing') state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}

function gameLogHash(state: GameState): string {
  const log = { seed: state.seed, status: state.status, lossReason: state.lossReason ?? null, history: state.history }
  return createHash('sha256').update(JSON.stringify(log)).digest('hex')
}

const step = (state: GameState, actions: TurnActions = NO_OP) => resolveTurn(state, actions, turnRng(state.seed, state.turn))
const event = (id: string) => DEFAULT_SCENARIO.events.find((e) => e.id === id)!

describe('determinism', () => {
  it('same seed and actions produce the identical log hash', () => {
    expect(gameLogHash(playGame(WIN_SEED, WIN_SCRIPT))).toBe(gameLogHash(playGame(WIN_SEED, WIN_SCRIPT)))
  })

  it('fixed-seed full-game replays match the committed snapshot', () => {
    const actual = { win: gameLogHash(playGame(WIN_SEED, WIN_SCRIPT)), loss: gameLogHash(playGame(LOSS_SEED, LOSS_SCRIPT)) }
    if (process.env.UPDATE_SNAPSHOTS) writeFileSync(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + '\n')
    expect(actual).toEqual(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')))
    // The committed file, pinned, so a regenerated snapshot is an edit to
    // this line as well as to the file: the snapshot moves deliberately or
    // not at all. be6509e3 is the v1.3 Round 0 move (see the header).
    expect(createHash('sha1').update(readFileSync(SNAPSHOT_PATH, 'utf8')).digest('hex'), 'the committed snapshot file changed').toBe(
      'be6509e378fad32093941207caa84e632b8a30da',
    )
  })

  it('GUARD R5a (b), rewritten to D3 (a): the same seed and the same orders draw the same night; other orders may not', () => {
    // Under D3 (a) the Daily keeps the reacting adversary (brief 6.10), so
    // what COLDVEIL plays depends on the posture: two campaigns on a seed
    // with the same orders draw identical events, and two with different
    // orders may not. And the pick is always the board's LIKELY TARGET
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
    for (const [seed, script] of [
      [WIN_SEED, WIN_SCRIPT],
      [LOSS_SEED, LOSS_SCRIPT],
      [7, LOSS_SCRIPT],
      [11, WIN_SCRIPT],
    ] as const) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const actions = script[state.turn] ?? NO_OP
        // Replay the night by hand: every integrity the record says an
        // event left must be the asset's integrity at that moment, and no
        // asset may lose integrity that no event names.
        const after = step(state, actions)
        const record = after.history.at(-1)!
        const integrity = new Map(state.assets.map((a) => [a.id, a.integrity]))
        for (const ev of record.events) {
          if (ev.integrityAfter === undefined) continue
          damaging += 1
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
  })

  it('resolveTurn does not mutate its input state', () => {
    const state = newGame(DEFAULT_SCENARIO, WIN_SEED)
    const before = JSON.stringify(state)
    step(state, WIN_SCRIPT[1])
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('the v1.3 rules (brief 6.1)', () => {
  it('opens on 100 CR, six turns, the starter fleet at coverage 58, a free first brief', () => {
    const s = newGame(DEFAULT_SCENARIO, 1)
    expect(DEFAULT_SCENARIO.totalTurns).toBe(6)
    expect(s.credits).toBe(100)
    expect(coverage(s.assets)).toBe(2 * COVERAGE_PER_KIND.sat + COVERAGE_PER_KIND.rpoSat + 2 * COVERAGE_PER_KIND.drone + COVERAGE_PER_KIND.groundStation)
    expect(coverage(s.assets)).toBe(58)
    expect(maiScore(s)).toBe(87.4)
    expect(s.briefFreeThrough).toBe(1)
  })

  it('mitigates by primary 2 and every other owned defense 1', () => {
    const uplink = event('uplink-jamming') // antiJam, linkAuth
    expect(mitigationOf(uplink, [])).toBe(0)
    expect(mitigationOf(uplink, ['antiJam'])).toBe(PRIMARY_MITIGATION)
    expect(mitigationOf(uplink, ['linkAuth'])).toBe(SECONDARY_MITIGATION)
    expect(mitigationOf(uplink, ['antiJam', 'linkAuth'])).toBe(PRIMARY_MITIGATION + SECONDARY_MITIGATION)
    // Brief 6.7: encryption first for the two listening threats.
    expect(event('downlink-eavesdropping').counters[0]).toBe('encryptedBackhaul')
    expect(event('backhaul-exfil').counters[0]).toBe('encryptedBackhaul')
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

  it('charges the orders at EXECUTE, and the turn closes with repairs, upkeep, funding and the coverage bonus after arrivals', () => {
    const s = newGame(DEFAULT_SCENARIO, 3)
    // A drone and both turn-1 primaries: nothing gets through, so no repairs.
    const after = step(s, a({ buyAssets: [{ kind: 'drone' }], buyCounters: ['antiJam', 'pntAuth'] }))
    const l = after.history[0].ledger
    expect(l.ordered).toBe(15 + 10 + 10)
    expect(l.repairs).toBe(0)
    expect(l.upkeep).toBe(2 * DEFAULT_SCENARIO.upkeepPerDefense)
    // The drone arrives at this close, and coverage 67 earns the bonus.
    expect(l.arrivals).toEqual(['t1-drone-1'])
    expect(l.bonusCoverage).toBe(58 + COVERAGE_PER_KIND.drone)
    expect(l.coverageBonus).toBe(DEFAULT_SCENARIO.slaBonus.credits)
    expect(after.credits).toBe(100 - 35 - 4 + 20 + 10)
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
    // Every defense the budget allows on turn 1, then nothing: the upkeep
    // and the hits outrun funding sooner or later on some seed.
    let found = false
    for (let seed = 1; seed <= 200 && !found; seed += 1) {
      let s = newGame(DEFAULT_SCENARIO, seed)
      s = step(s, a({ buyCounters: ['sensorFusion', 'groundZeroTrust', 'tierAAttestation', 'irRetainer', 'antiJam', 'pntAuth', 'linkAuth', 'encryptedBackhaul'] }))
      while (s.status === 'playing') s = step(s)
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

  it('makes the first brief free, names every candidate when briefed, and charges 8 CR on a later night', () => {
    const s = newGame(DEFAULT_SCENARIO, 2)
    const t1 = step(s)
    expect(t1.history[0].briefed).toBe(true)
    expect(t1.history[0].named).toEqual(['uplink-jamming', 'gnss-spoofing'])
    const t2 = step(t1, a({ intelBrief: true }))
    expect(t2.history[1].briefed).toBe(true)
    expect(t2.history[1].ledger.ordered).toBe(DEFAULT_SCENARIO.prices.intelBrief)
    const unbriefed = step(t1)
    expect(unbriefed.history[1].briefed).toBe(false)
    expect(unbriefed.history[1].named).toEqual([])
  })

  it('has COLDVEIL take the move the defenses mitigate least', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const s = newGame(DEFAULT_SCENARIO, seed)
      // Block uplink jamming outright: the spoofing lands.
      const blocked = step(s, a({ buyCounters: ['antiJam'] }))
      expect(blocked.history[0].events.map((e) => e.eventId)).toEqual(['gnss-spoofing'])
      const other = step(s, a({ buyCounters: ['pntAuth'] }))
      expect(other.history[0].events.map((e) => e.eventId)).toEqual(['uplink-jamming'])
    }
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
    let s = newGame(DEFAULT_SCENARIO, 21)
    while (s.turn < 6) s = step(s, a({ buyCounters: s.turn === 1 ? ['sensorFusion'] : [] }))
    expect(s.status).toBe('playing')
    const denied = { ...s, conditions: [{ instanceId: 'pnt-jamming-t5', eventId: 'pnt-jamming', name: 'GNSS DENIED', startedTurn: 5, remainingTurns: 1, baseSeverity: 2 }] }
    const chained = step(denied).history.at(-1)!.events.find((e) => e.eventId === 'blackout-chain')!
    expect(chained.chainBonus).toBe(CHAIN_BONUS)
    expect(chained.effectiveSeverity).toBe(event('blackout-chain').baseSeverity + CHAIN_BONUS - PRIMARY_MITIGATION)
    const plain = step(s).history.at(-1)!.events.find((e) => e.eventId === 'blackout-chain')!
    expect(plain.chainBonus).toBe(0)
    expect(worstCase(denied, NO_OP).repairs).toBeGreaterThan(worstCase(s, NO_OP).repairs)
  })

  it('makes the debris a call: a burn costs fuel without SSA and nothing with it, a hold risks the satellite', () => {
    const toTurn4 = (seed: number, buy: TurnActions['buyCounters'] = []) => {
      let s = newGame(DEFAULT_SCENARIO, seed)
      s = step(s, a({ buyCounters: buy }))
      while (s.turn < 4) s = step(s)
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
      const held = step(toTurn4(seed)).history.at(-1)!.events.find((e) => e.eventId === 'debris-conjunction')!
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
    const s = newGame(DEFAULT_SCENARIO, 4)
    const held = step(s, a({ buyCounters: ['antiJam', 'pntAuth'] }))
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
      expect(100 - open.history[0].meters[m] + DEFAULT_SCENARIO.recovery.base).toBe(METER_DAMAGE_PER_SEVERITY * hit.effectiveSeverity)
    }
  })

  it('reads the board and the engine through the same pick', () => {
    const s = newGame(DEFAULT_SCENARIO, 12)
    const orders = a({ buyCounters: ['antiJam'] })
    const read = adversaryPicks(s, countersAfter(s, orders))
    expect(read[0].least).toEqual(['gnss-spoofing'])
    expect(step(s, orders).history[0].events[0].eventId).toBe(read[0].pick)
  })
})

describe('reachability by real play', () => {
  it('the prepared-architect line wins', () => {
    const end = playGame(WIN_SEED, WIN_SCRIPT)
    expect(end.status).toBe('won')
    expect(end.history).toHaveLength(DEFAULT_SCENARIO.totalTurns)
  })

  it('the do-nothing line loses', () => {
    const end = playGame(LOSS_SEED, LOSS_SCRIPT)
    expect(end.status).toBe('lost')
    expect(end.lossReason).toBeTruthy()
  })
})
