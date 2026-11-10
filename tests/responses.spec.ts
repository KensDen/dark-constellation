// THE RESPONSE, AS THE ENGINE RULES IT (v1.7 R1). The night asks the player
// what to do about a move that would land: block it, halve it, or ride it
// out. The answers are part of the orders (TurnActions.responses), so the
// turn resolver takes them with everything else and a seed with the
// player's choices replays exactly. This file holds the rules as pure
// tests, with no card and no DOM:
//
//   - REPLAY: a seed, its orders and its responses give one game.
//   - What each answer does: a block lets nothing through and extends the
//     streak; a halve does half of everything the move does; riding out is
//     free. Each costs what the rules say (RESPONSE_COST_PER_POINT).
//   - ONE response a night (RESPONSES_PER_NIGHT).
//   - THE ROOM: a response may only spend what tonight's bills, the upkeep
//     and the nights ahead do not need, so a turn that read WORST CASE 0
//     or more at EXECUTE still cannot close insolvent, whatever the player
//     answers. An answer that does not fit, or does not exist, is ridden
//     out without a throw.
//   - responseOptions (what the card shows) and resolveTurn (what happens)
//     agree on every offer.
//   - heldForLater and worstCase.
//   - What never offers a response: the debris call, an opportunity, a
//     move the defenses stop.
//   - openChoice, answered and playNight, as src/engine/responses.ts
//     documents them.
//
// The sweep's own gate (tests/sweep.spec.ts) holds the balance these rules
// produce; the night's cards are driven in the DOM specs.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  ASSET_DAMAGE_PER_SEVERITY,
  METER_DAMAGE_PER_SEVERITY,
  RESPONSE_COST_PER_POINT,
  RESPONSE_DAMAGE_SHARE,
  countersAfter,
  exposedOf,
  newGame,
  resolveTurn,
  responseCost,
  scaled,
} from '../src/engine/reducer'
import { answered, openChoice, playNight, responseOptions, type Offer, type Responder } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import { RESPONSES_PER_NIGHT } from '../src/engine/rules'
import type { Difficulty, GameState, ResolvedEvent, ThreatEvent, TurnActions } from '../src/engine/types'
import { heldForLater, worstCase } from '../src/engine/worstCase'
import { POLICIES, careless, ride, sensible } from './policies'
import { LOSS_SCRIPT, NO_OP, WIN_RESPONSES, WIN_RESPONSES_SEED, WIN_SCRIPT, playFixed } from './scripts'

const DIFFS: Difficulty[] = ['standard', 'easy']
const METERS = ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const

const event = (id: string): ThreatEvent => DEFAULT_SCENARIO.events.find((e) => e.id === id)!
const lastOf = (state: GameState) => state.history[state.history.length - 1]
// One turn through the engine as the UI calls it, with the night's answers.
const step = (state: GameState, actions: TurnActions = NO_OP, responses: (string | null | undefined)[] = []) =>
  resolveTurn(state, { ...actions, responses }, turnRng(state.seed, state.turn))
// Everything about a state but the scenario, which is static content: what
// two resolutions must share to be the same game.
const playOf = ({ scenario: _content, ...rest }: GameState) => rest

// A responder that takes the first answer on the card whether or not it
// fits: the engine, not the responder, is what must refuse it.
const grabby: Responder = ({ options }) => options[0]?.id ?? null

describe('REPLAY: a seed, its orders and its responses are one game', () => {
  it('plays a fixed list of orders and responses to deeply equal states, twice from newGame', () => {
    const once = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT, WIN_RESPONSES)
    const again = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT, WIN_RESPONSES)
    expect(again).toEqual(once)
    // Equal, and not the same objects: neither game leaned on the other.
    expect(again.history).not.toBe(once.history)
    expect(once.status).toBe('won')
    expect(once.history.flatMap((r) => r.events).filter((e) => e.response).length, 'the list took no response').toBeGreaterThan(2)
  })

  it('plays a different list of responses to a different game', () => {
    const fixed = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT, WIN_RESPONSES)
    // Every move ridden out.
    const ridden = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT)
    expect(playOf(ridden)).not.toEqual(playOf(fixed))
    expect(ridden.status).toBe('lost')
    // One answer changed: the first night's block for the same move's halve.
    const first = lastOf(step(newGame(DEFAULT_SCENARIO, WIN_RESPONSES_SEED), WIN_SCRIPT[1])).events[0]
    const [block, halve] = event(first.eventId).responses!
    expect(WIN_RESPONSES[1]).toEqual([block.id])
    expect(halve.effect).toBe('halve')
    const other = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT, { ...WIN_RESPONSES, 1: [halve.id] })
    expect(other.history[0]).not.toEqual(fixed.history[0])
    expect(other.history[0].events[0].response).toEqual({ id: halve.id, effect: 'halve', cost: responseCost('halve', exposedOf(first)) })
  })

  it('takes the responses on both difficulties and with other orders, and replays each', () => {
    for (const difficulty of DIFFS) {
      for (const seed of [1, 7, 11, 4041]) {
        for (const respond of [sensible, careless]) {
          // Played once by a responder, with its answers kept, then again
          // from the list alone.
          const lists: Record<number, (string | null)[]> = {}
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const { after, responses } = nightWith(state, LOSS_SCRIPT[state.turn] ?? NO_OP, respond)
            lists[state.turn] = responses
            state = after
          }
          expect(playFixed(seed, LOSS_SCRIPT, lists, difficulty), `seed ${seed} on ${difficulty}`).toEqual(state)
        }
      }
    }
  })
})

// A night with a responder making each choice as it comes, as playNight
// plays it, keeping the answers as well as the state.
function nightWith(state: GameState, actions: TurnActions, respond: Responder): { after: GameState; responses: (string | null)[] } {
  let responses: (string | null)[] = []
  for (;;) {
    const after = step(state, actions, responses)
    const events = lastOf(after).events
    const i = openChoice(events, responses)
    if (i < 0) return { after, responses }
    const def = event(events[i].eventId)
    responses = answered(responses, i, respond({ state, index: i, ev: events[i], def, options: responseOptions(def, events[i], state.difficulty) }))
  }
}

describe('what each answer does', () => {
  // A first night with nothing ordered, from meters worn to 80 so that no
  // loss hides under the cap when the close recovers them. The move is
  // whatever the seed draws; the three answers are resolved side by side.
  const opening = (seed: number, difficulty: Difficulty): GameState => ({
    ...newGame(DEFAULT_SCENARIO, seed, difficulty),
    meters: { linkAvailability: 80, dataIntegrity: 80, sensorIntegrity: 80 },
  })
  const meterLoss = (before: GameState, after: GameState, m: (typeof METERS)[number]) => before.meters[m] - (after.meters[m] - lastOf(after).ledger.recovery)

  it('costs nothing to ride out, and the move lands whole', () => {
    let landed = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const s = opening(seed, difficulty)
        const after = step(s)
        const ev = lastOf(after).events[0]
        const def = event(ev.eventId)
        const where = `seed ${seed} on ${difficulty}, ${ev.eventId}`
        expect(ev.room, `${where}: an open move offered nothing`).toBeDefined()
        expect(ev.response, where).toBeUndefined()
        expect(ev.answered, where).toBeUndefined()
        expect(ev.effectiveSeverity, where).toBe(def.baseSeverity)
        expect(ev.outcome, where).toBe('open')
        expect(lastOf(after).ledger.responses, `${where}: the ledger charged a response`).toBeUndefined()
        expect(lastOf(after).ledger.afterNight, where).toBe(s.credits)
        // Null, absent and an empty list are all riding it out.
        expect(step(s, NO_OP, [null]), where).toEqual(after)
        expect(resolveTurn(s, NO_OP, turnRng(s.seed, s.turn)), where).toEqual(after)
        for (const m of METERS) {
          expect(meterLoss(s, after, m), `${where}: ${m}`).toBe(def.effect.meters.includes(m) ? scaled(METER_DAMAGE_PER_SEVERITY * ev.effectiveSeverity, difficulty) : 0)
        }
        landed += 1
      }
    }
    expect(landed).toBe(80)
  })

  it('lets nothing through on a block, extends the streak and costs 8 a point', () => {
    let blocked = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const s = opening(seed, difficulty)
        const ridden = step(s)
        const open = lastOf(ridden).events[0]
        const def = event(open.eventId)
        const block = def.responses!.find((r) => r.effect === 'block')
        if (!block) continue
        blocked += 1
        const where = `seed ${seed} on ${difficulty}, ${open.eventId}`
        const after = step(s, NO_OP, [block.id])
        const record = lastOf(after)
        const ev = record.events[0]
        const exposed = exposedOf(open)
        const cost = RESPONSE_COST_PER_POINT.block * exposed
        expect(cost, where).toBe(8 * exposed)
        expect(ev.response, where).toEqual({ id: block.id, effect: 'block', cost })
        expect(responseCost('block', exposed), where).toBe(cost)
        // Nothing through: no strength, no damage, no bill, no condition,
        // no technique fired, and the score where the move found it.
        expect(ev.effectiveSeverity, where).toBe(0)
        expect(ev.outcome, where).toBe('held')
        expect(ev.repairCost, where).toBe(0)
        expect(ev.integrityBefore, where).toBeUndefined()
        expect(ev.integrityAfter, where).toBeUndefined()
        expect(ev.condition, where).toBeUndefined()
        expect(ev.firedTechniqueRefs, where).toEqual([])
        expect(ev.scoreAfter, where).toBe(ev.scoreBefore)
        expect(after.conditions, where).toEqual([])
        for (const m of METERS) expect(meterLoss(s, after, m), `${where}: ${m}`).toBe(0)
        for (const a of after.assets) expect(a.integrity, `${where}: ${a.id}`).toBe(100)
        // The streak counts it as it counts a defense's block, where the
        // ridden-out night broke it.
        expect(after.streak, where).toBe(1)
        expect(after.bestStreak, where).toBe(1)
        expect(ridden.streak, where).toBe(0)
        // The mitigation is the defenses' own: a response is not one.
        expect(ev.mitigation, where).toBe(0)
        expect(ev.saved, `${where}: a block saved nothing`).toBeGreaterThan(0)
        // Paid in the night, and the ledger says so.
        expect(record.ledger.responses, where).toBe(cost)
        expect(record.ledger.afterNight, where).toBe(s.credits - cost)
        expect(record.ledger.repairs, where).toBe(0)
        expect(after.credits, where).toBe(s.credits - cost + record.ledger.funding + record.ledger.coverageBonus)
      }
    }
    expect(blocked, 'too few first moves offer a block to mean anything').toBeGreaterThan(30)
  })

  it('does half the meter damage, half the asset damage and half the repair bill on a halve, rounding as the engine does, for 4 a point', () => {
    // Every night of a ridden-out campaign, not the first alone, so the
    // moves halved are of every strength: the night's first move that
    // offers a halve the budget can meet, resolved ridden out and halved
    // from the same state (meters worn to 80 again each night, so nothing
    // hides at 0 or under the cap). Only that move differs between the two
    // resolutions, so the meters differ by the half it did not do.
    let halved = 0
    let onATile = 0
    let billed = 0
    const strengths = new Set<number>()
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const s: GameState = { ...state, meters: { linkAvailability: 80, dataIntegrity: 80, sensorIntegrity: 80 } }
          const ridden = step(s)
          state = ridden
          const i = lastOf(ridden).events.findIndex((e) => e.room !== undefined && responseOptions(event(e.eventId), e, difficulty).some((o) => o.effect === 'halve' && o.fits))
          if (i < 0) continue
          const open = lastOf(ridden).events[i]
          const def = event(open.eventId)
          const halve = def.responses!.find((r) => r.effect === 'halve')!
          halved += 1
          const where = `seed ${seed} on ${difficulty}, turn ${s.turn}, ${open.eventId}`
          const after = step(s, NO_OP, answered([], i, halve.id))
          const record = lastOf(after)
          const ev = record.events[i]
          const exposed = exposedOf(open)
          strengths.add(exposed)
          const cost = RESPONSE_COST_PER_POINT.halve * exposed
          expect(cost, where).toBe(4 * exposed)
          expect(ev.response, where).toEqual({ id: halve.id, effect: 'halve', cost })
          // It lands at its strength (the record says what came at the
          // player), and does half: so it breaks the streak, leaves its
          // condition and fires its techniques, as the whole hit does.
          expect(ev.effectiveSeverity, where).toBe(open.effectiveSeverity)
          expect(ev.effectiveSeverity, where).toBe(exposed)
          expect(ev.outcome, where).toBe('reduced')
          expect(ev.condition, where).toEqual(open.condition)
          expect(ev.firedTechniqueRefs, where).toEqual(open.firedTechniqueRefs)
          expect(ev.targetAssetId, where).toBe(open.targetAssetId)
          expect(after.conditions, where).toEqual(ridden.conditions)
          expect(after.streak, `${where}: a halve breaks the streak as the whole hit does`).toBe(ridden.streak)
          expect(after.bestStreak, where).toBe(ridden.bestStreak)
          // Half the meter damage: the product halved and then rounded
          // once, with the difficulty, not half of the rounded whole.
          const whole = METER_DAMAGE_PER_SEVERITY * exposed
          for (const m of METERS) {
            const spared = def.effect.meters.includes(m) ? scaled(whole, difficulty) - scaled(whole * RESPONSE_DAMAGE_SHARE.halve, difficulty) : 0
            expect(after.meters[m] - ridden.meters[m], `${where}: ${m}`).toBe(spared)
          }
          // Half the asset damage, on the tile the whole hit struck.
          if (open.integrityAfter !== undefined && open.integrityBefore! >= ASSET_DAMAGE_PER_SEVERITY * exposed) {
            onATile += 1
            expect(ev.integrityBefore, where).toBe(open.integrityBefore)
            expect(ev.integrityBefore! - ev.integrityAfter!, where).toBe(scaled(ASSET_DAMAGE_PER_SEVERITY * exposed * 0.5, difficulty))
            expect(open.integrityBefore! - open.integrityAfter, where).toBe(scaled(ASSET_DAMAGE_PER_SEVERITY * exposed, difficulty))
          } else if (open.integrityAfter === undefined) {
            expect(ev.integrityAfter, where).toBeUndefined()
          }
          // Half the repair bill: the whole bill at the difficulty, halved
          // and rounded.
          expect(ev.repairCost, where).toBe(Math.round(open.repairCost * 0.5))
          if (open.repairCost > 0) billed += 1
          expect(record.ledger.repairs, where).toBe(lastOf(ridden).ledger.repairs - open.repairCost + ev.repairCost)
          expect(record.ledger.responses, where).toBe(cost)
          expect(record.ledger.afterNight, where).toBe(lastOf(ridden).ledger.afterNight - cost)
          // And so it costs the score less than the whole hit, and more
          // than nothing.
          expect(ev.scoreBefore, where).toBe(open.scoreBefore)
          expect(ev.scoreAfter, where).toBeGreaterThan(open.scoreAfter)
          expect(ev.scoreAfter, where).toBeLessThan(ev.scoreBefore)
        }
      }
    }
    expect(halved, 'too few moves offered a halve to mean anything').toBeGreaterThan(200)
    expect(onATile, 'no halved move struck a tile').toBeGreaterThan(20)
    expect(billed, 'no halved move had a bill to halve').toBeGreaterThan(20)
    expect([...strengths].sort(), 'the halved moves were not of every strength').toEqual([1, 2, 3])
  })

  it('rounds a half the way the engine rounds everything: once, at the difficulty', () => {
    // The figures a player can meet, written out, so a change to where the
    // rounding happens costs an edit here. STANDARD: 9 a point halves to
    // 4.5, 9 and 13.5, which round to 5, 9 and 14; a tile takes 6, 12 and
    // 18. EASY takes three quarters of the half before rounding.
    expect([1, 2, 3].map((n) => scaled(METER_DAMAGE_PER_SEVERITY * n * RESPONSE_DAMAGE_SHARE.halve, 'standard'))).toEqual([5, 9, 14])
    expect([1, 2, 3].map((n) => scaled(ASSET_DAMAGE_PER_SEVERITY * n * RESPONSE_DAMAGE_SHARE.halve, 'standard'))).toEqual([6, 12, 18])
    expect([1, 2, 3].map((n) => scaled(METER_DAMAGE_PER_SEVERITY * n * RESPONSE_DAMAGE_SHARE.halve, 'easy'))).toEqual([3, 7, 10])
    expect([1, 2, 3].map((n) => scaled(ASSET_DAMAGE_PER_SEVERITY * n * RESPONSE_DAMAGE_SHARE.halve, 'easy'))).toEqual([5, 9, 14])
    expect(RESPONSE_DAMAGE_SHARE.block).toBe(0)
    expect(RESPONSE_COST_PER_POINT).toEqual({ block: 8, halve: 4 })
  })

  it('prices a response on what the defenses leave exposed, not on the move\'s whole strength', () => {
    // The rogue ground station with its second defense owned: strength 3,
    // 1 off, 2 exposed, so a block is 16 and not 24. Ground segmentation on
    // turn 2 and the insider program on turn 4 make it COLDVEIL's move on
    // a later turn (the reading diet's reducing line).
    const rogue = event('rogue-ground-station')
    const orders: Record<number, TurnActions> = { 2: { ...NO_OP, buyCounters: ['groundZeroTrust'] }, 4: { ...NO_OP, buyCounters: ['insiderProgram'] } }
    let seen = 0
    for (let seed = 1; seed <= 40; seed += 1) {
      let s = newGame(DEFAULT_SCENARIO, seed)
      while (s.status === 'playing') {
        const ridden = step(s, orders[s.turn] ?? NO_OP)
        const i = lastOf(ridden).events.findIndex((e) => e.eventId === rogue.id && e.room !== undefined)
        if (i >= 0 && lastOf(ridden).events[i].mitigation > 0) {
          const open = lastOf(ridden).events[i]
          expect(open.mitigation).toBe(1)
          const exposed = exposedOf(open)
          expect(exposed).toBe(rogue.baseSeverity - 1)
          const options = responseOptions(rogue, open, s.difficulty)
          expect(options.map((o) => o.cost)).toEqual(rogue.responses!.map((r) => RESPONSE_COST_PER_POINT[r.effect] * exposed))
          const block = options.find((o) => o.effect === 'block' && o.fits)
          if (block) {
            const ev = lastOf(step(s, orders[s.turn] ?? NO_OP, answered([], i, block.id))).events[i]
            expect(ev.response?.cost).toBe(8 * exposed)
            // A defense took a point and the response the rest: held.
            expect(ev.outcome).toBe('held')
            expect(ev.mitigation).toBe(1)
            seen += 1
          }
        }
        s = ridden
      }
    }
    expect(seen, 'no seed drew the rogue station against one of its defenses').toBeGreaterThan(0)
  })
})

describe('ONE response a night', () => {
  // A night with two moves that would both land, each with an answer the
  // budget can meet alone: found by riding nights out with nothing ordered.
  function twoOpen(seed: number, difficulty: Difficulty) {
    let s = newGame(DEFAULT_SCENARIO, seed, difficulty)
    while (s.status === 'playing') {
      const ridden = step(s)
      const events = lastOf(ridden).events
      const open = events.map((e, i) => [e, i] as const).filter(([e]) => e.room !== undefined)
      if (open.length >= 2) {
        const [[first, i], [second, k]] = open
        const a = responseOptions(event(first.eventId), first, difficulty).find((o) => o.fits)
        const b = responseOptions(event(second.eventId), second, difficulty).find((o) => o.fits)
        if (a && b) return { s, ridden, i, k, a, b }
      }
      s = ridden
    }
    return null
  }

  it('is the rule', () => {
    expect(RESPONSES_PER_NIGHT).toBe(1)
  })

  it('rides the second response out, and records on the second move that tonight\'s was used', () => {
    let nights = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const found = twoOpen(seed, difficulty)
        if (!found) continue
        nights += 1
        const { s, ridden, i, k, a, b } = found
        const where = `seed ${seed} on ${difficulty}, turn ${s.turn}`
        const both = step(s, NO_OP, answered(answered([], i, a.id), k, b.id))
        const one = step(s, NO_OP, answered(answered([], i, a.id), k, null))
        // The second answer changed nothing: the same night as riding it.
        expect(both, where).toEqual(one)
        const [first, second] = [lastOf(both).events[i], lastOf(both).events[k]]
        expect(first.response?.id, where).toBe(a.id)
        expect(first.answered, `${where}: nothing had been answered when the first came`).toBeUndefined()
        expect(second.response, `${where}: a second response was taken`).toBeUndefined()
        expect(second.answered, where).toBe(1)
        // It was still a move that would land, with room recorded.
        expect(second.room, where).toBeDefined()
        expect(second.effectiveSeverity, where).toBe(exposedOf(second))
        expect(lastOf(both).ledger.responses, where).toBe(a.cost)
        // What the card shows for it: every answer off, and why.
        const options = responseOptions(event(second.eventId), second, difficulty)
        expect(options.length, where).toBeGreaterThan(0)
        for (const o of options) expect(o, where).toMatchObject({ fits: false, why: 'used' })
        // The first ridden out, the second is free to take: it is one a
        // night, not the first move only.
        const later = lastOf(step(s, NO_OP, answered(answered([], i, null), k, b.id))).events
        expect(later[i].response, where).toBeUndefined()
        expect(later[k].response?.id, where).toBe(b.id)
        expect(later[k].answered, where).toBeUndefined()
        // And the ridden-out night records no answer on either.
        expect(lastOf(ridden).events[k].answered, where).toBeUndefined()
      }
    }
    expect(nights, 'no night in the sweep had two moves to answer').toBeGreaterThan(10)
  })

  it('never takes more than one in a night of real play, whatever the responder asks for', () => {
    let nights = 0
    let asked = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        let s = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (s.status === 'playing') {
          let wanted = 0
          const after = playNight(s, NO_OP, (offer) => {
            wanted += 1
            return grabby(offer)
          })
          const taken = lastOf(after).events.filter((e) => e.response).length
          expect(taken, `seed ${seed} on ${difficulty}, turn ${s.turn}`).toBeLessThanOrEqual(RESPONSES_PER_NIGHT)
          if (wanted > 1) asked += 1
          nights += 1
          s = after
        }
      }
    }
    expect(nights).toBeGreaterThan(400)
    expect(asked, 'no night asked for a second response').toBeGreaterThan(50)
  })
})

// THE SWEEP the next four blocks read: every policy of the sweep gate with
// three responders (the first that fits; the first that fits two times in
// three; the first on the card, fitting or not), on both difficulties.
// Each offer is checked against the engine as it is made, and what the
// sweep found is kept for the tests below to assert on, so the games are
// played once.
interface Found {
  games: number
  turns: number
  offers: number
  taken: number
  refused: number
  safeTurns: number
  unsafe: string[]
  misfit: string[]
  disagree: string[]
  held: string[]
  later: number[]
  offering: string[]
  lastTurns: number
}
let found: Found | null = null
function sweep(): Found {
  if (found) return found
  const out: Found = { games: 0, turns: 0, offers: 0, taken: 0, refused: 0, safeTurns: 0, unsafe: [], misfit: [], disagree: [], held: [], later: [], offering: [], lastTurns: 0 }
  const responders: [string, Responder][] = [
    ['sensible', sensible],
    ['careless', careless],
    ['grabby', grabby],
  ]
  for (const difficulty of DIFFS) {
    for (const { name, policy } of POLICIES) {
      for (const [how, respond] of responders) {
        for (let seed = 1; seed <= 40; seed += 1) {
          out.games += 1
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const where = `${name}, ${how}, ${difficulty}, seed ${seed}, turn ${state.turn}`
            const actions = policy(state)
            const read = worstCase(state, actions)
            // heldForLater and the worst case's sum.
            const later = heldForLater(state, countersAfter(state, actions))
            out.later.push(later)
            if (later < 0) out.held.push(`${where}: held ${later}`)
            if (read.later !== later) out.held.push(`${where}: WORST CASE holds ${read.later}, heldForLater says ${later}`)
            if (read.value !== read.remaining - read.repairs - read.upkeep - read.later) out.held.push(`${where}: WORST CASE does not sum`)
            if (state.turn === DEFAULT_SCENARIO.totalTurns) {
              out.lastTurns += 1
              if (later !== 0) out.held.push(`${where}: ${later} held on the last turn`)
            }
            // The night, each offer checked as it is made.
            const before = state
            let answers: (string | null)[] = []
            const after = playNight(before, actions, (offer: Offer) => {
              out.offers += 1
              const base = [...answers]
              for (const o of offer.options) {
                // What the card says of this answer, against what the
                // engine does when it is given.
                const tried = lastOf(step(before, actions, answered(base, offer.index, o.id))).events[offer.index]
                if (!!tried.response !== o.fits) out.disagree.push(`${where}, ${offer.ev.eventId}/${o.id}: the card says fits ${o.fits}, the engine ${tried.response ? 'took' : 'refused'} it`)
                if (tried.response && (tried.response.cost !== o.cost || tried.response.effect !== o.effect || tried.response.id !== o.id)) {
                  out.disagree.push(`${where}, ${offer.ev.eventId}/${o.id}: the card says ${o.effect} for ${o.cost}, the engine ${tried.response.effect} for ${tried.response.cost}`)
                }
                if (o.fits !== (o.why === undefined)) out.disagree.push(`${where}, ${offer.ev.eventId}/${o.id}: fits ${o.fits} with why ${o.why}`)
              }
              const choice = respond(offer)
              answers = answered(base, offer.index, choice)
              const chosen = offer.options.find((o) => o.id === choice)
              if (chosen && !chosen.fits) out.refused += 1
              return choice
            })
            const record = lastOf(after)
            // THE ROOM. A turn that read 0 or more cannot close insolvent.
            if (read.value >= 0) {
              out.safeTurns += 1
              if (record.ledger.insolvent) out.unsafe.push(`${where}: WORST CASE read ${read.value}, closed at ${record.ledger.after}`)
            }
            record.events.forEach((ev, i) => {
              const def = event(ev.eventId)
              const exposed = exposedOf(ev)
              const attack = (def.kind ?? 'threat') === 'threat' && def.effect.special !== 'debrisStrike'
              // What offers a response: an attack with strength left over.
              if ((ev.room !== undefined) !== (attack && exposed > 0)) out.offering.push(`${where}, ${ev.eventId}: room ${ev.room}, exposed ${exposed}`)
              if (ev.room === undefined && (ev.response || ev.answered !== undefined)) out.offering.push(`${where}, ${ev.eventId}: answered with no offer`)
              if (!ev.response) return
              out.taken += 1
              // A response taken fitted: its cost and what is left of the
              // move's own bill were within the room, it was tonight's
              // first, and it is one the move offers, at the rules' price.
              const offered = def.responses?.find((r) => r.id === ev.response!.id)
              if (!offered || offered.effect !== ev.response.effect) out.misfit.push(`${where}, ${ev.eventId}: took ${ev.response.id}, which it does not offer`)
              if (ev.response.cost !== responseCost(ev.response.effect, exposed)) out.misfit.push(`${where}, ${ev.eventId}: paid ${ev.response.cost}`)
              if (ev.response.cost + ev.repairCost > ev.room!) out.misfit.push(`${where}, ${ev.eventId}: ${ev.response.cost} and a bill of ${ev.repairCost} from a room of ${ev.room}`)
              if (ev.answered !== undefined) out.misfit.push(`${where}, ${ev.eventId}: taken after tonight's response`)
              if (answers[i] !== ev.response.id) out.misfit.push(`${where}, ${ev.eventId}: took ${ev.response.id}, asked ${answers[i]}`)
            })
            out.turns += 1
            state = after
          }
        }
      }
    }
  }
  found = out
  return out
}

describe('THE ROOM: a response cannot spend what the night and the nights ahead need', () => {
  it('closes no turn insolvent that read WORST CASE 0 or more at EXECUTE, whatever was answered', () => {
    const s = sweep()
    expect(s.games).toBe(DIFFS.length * POLICIES.length * 3 * 40)
    expect(s.safeTurns, 'too few turns read safe to mean anything').toBeGreaterThan(5000)
    expect(s.unsafe.slice(0, 5).join('\n')).toBe('')
  }, 120_000)

  it('never takes a response that did not fit, and refuses the ones that do not without stopping the night', () => {
    const s = sweep()
    expect(s.taken, 'the sweep took too few responses to mean anything').toBeGreaterThan(2000)
    expect(s.misfit.slice(0, 5).join('\n')).toBe('')
    // The positive control: the grabby responder did ask for answers that
    // did not fit, and the nights went on (every game above finished).
    expect(s.refused, 'no responder asked for a response that did not fit').toBeGreaterThan(100)
  }, 120_000)

  it('rides out an id the move does not offer, without throwing', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const s = newGame(DEFAULT_SCENARIO, seed, difficulty)
        const ridden = step(s)
        const open = lastOf(ridden).events[0]
        // No such response; another move's response; the effect's name.
        const stranger = DEFAULT_SCENARIO.events.find((e) => e.responses && e.id !== open.eventId && !event(open.eventId).responses!.some((r) => r.id === e.responses![0].id))!.responses![0].id
        for (const id of ['no-such-response', stranger, 'block', '']) {
          let after: GameState | undefined
          expect(() => {
            after = step(s, NO_OP, [id])
          }, `seed ${seed}: "${id}"`).not.toThrow()
          expect(after, `seed ${seed}: "${id}" changed the night`).toEqual(ridden)
        }
        // More answers than moves is no error either.
        expect(step(s, NO_OP, [null, 'no-such-response', 'another', null])).toEqual(ridden)
      }
    }
  })

  it('rides out a response the budget cannot meet, without throwing, and the card says why', () => {
    let cases = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        // A first night on almost nothing: no answer can be paid for.
        const s: GameState = { ...newGame(DEFAULT_SCENARIO, seed, difficulty), credits: 3 }
        const ridden = step(s)
        const open = lastOf(ridden).events[0]
        const def = event(open.eventId)
        const options = responseOptions(def, open, difficulty)
        expect(options.map((o) => o.id)).toEqual(def.responses!.map((r) => r.id))
        for (const o of options) {
          expect(o, `seed ${seed}: ${o.id}`).toMatchObject({ fits: false, why: 'budget', cost: responseCost(o.effect, exposedOf(open)) })
          expect(o.cost, `seed ${seed}: ${o.id}`).toBeGreaterThan(s.credits)
          let after: GameState | undefined
          expect(() => {
            after = step(s, NO_OP, [o.id])
          }, `seed ${seed}: ${o.id}`).not.toThrow()
          expect(after, `seed ${seed}: ${o.id} was taken on a budget of ${s.credits}`).toEqual(ridden)
          cases += 1
        }
      }
    }
    expect(cases).toBeGreaterThan(40)
  })

  it('counts the response\'s own cost with what is left of the move\'s bill, to the credit', () => {
    // The edge of the room, found by the budget: for a first move ridden
    // out, the smallest budget at which each answer fits is the one where
    // its cost and its share of the bill are exactly the room, and one
    // credit less is refused.
    let edges = 0
    for (let seed = 1; seed <= 12; seed += 1) {
      const base = newGame(DEFAULT_SCENARIO, seed)
      const def = event(lastOf(step(base)).events[0].eventId)
      for (const r of def.responses!) {
        let least = -1
        for (let credits = 0; credits <= 200 && least < 0; credits += 1) {
          const s: GameState = { ...base, credits }
          const open = lastOf(step(s)).events[0]
          if (responseOptions(def, open, s.difficulty).find((o) => o.id === r.id)!.fits) least = credits
        }
        expect(least, `seed ${seed}: ${def.id}/${r.id} never fits`).toBeGreaterThan(0)
        const at = (credits: number) => {
          const s: GameState = { ...base, credits }
          return { open: lastOf(step(s)).events[0], taken: lastOf(step(s, NO_OP, [r.id])).events[0] }
        }
        const fits = at(least)
        expect(fits.taken.response?.id, `seed ${seed}: ${def.id}/${r.id} at ${least}`).toBe(r.id)
        expect(fits.taken.response!.cost + fits.taken.repairCost, `seed ${seed}: ${def.id}/${r.id} at ${least}`).toBe(fits.open.room)
        expect(at(least - 1).taken.response, `seed ${seed}: ${def.id}/${r.id} at ${least - 1}`).toBeUndefined()
        // The room moves credit for credit with the budget.
        expect(at(least - 1).open.room, `seed ${seed}`).toBe(fits.open.room! - 1)
        edges += 1
      }
    }
    expect(edges).toBeGreaterThan(12)
  })
})

describe('responseOptions says what resolveTurn then does', () => {
  it('agrees on every answer of every offer of the sweep: whether it fits, what it does and what it costs', () => {
    const s = sweep()
    expect(s.offers, 'the sweep made too few offers to mean anything').toBeGreaterThan(5000)
    expect(s.disagree.slice(0, 5).join('\n')).toBe('')
  }, 120_000)

  it('lists the move\'s own responses in the deck\'s order, each at the rules\' price', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const open = lastOf(step(newGame(DEFAULT_SCENARIO, seed, difficulty))).events[0]
        const def = event(open.eventId)
        const options = responseOptions(def, open, difficulty)
        expect(options.map((o) => [o.id, o.effect])).toEqual(def.responses!.map((r) => [r.id, r.effect]))
        for (const o of options) expect(o.cost).toBe(RESPONSE_COST_PER_POINT[o.effect] * exposedOf(open))
      }
    }
    // A move with no room offers answers that do not fit; one with no
    // responses offers none.
    const debris = event('debris-conjunction')
    expect(responseOptions(debris, { baseSeverity: debris.baseSeverity, chainBonus: 0, mitigation: 0 } as ResolvedEvent, 'standard')).toEqual([])
  })
})

describe('what is held for the nights ahead', () => {
  it('is never negative, is 0 on the last turn, and is the figure WORST CASE subtracts', () => {
    const s = sweep()
    expect(s.later.length).toBe(s.turns)
    expect(s.lastTurns, 'the sweep reached no last turn').toBeGreaterThan(500)
    expect(s.held.slice(0, 5).join('\n')).toBe('')
    // Not vacuous: on some turns something is held, and on some nothing.
    expect(s.later.filter((n) => n > 0).length, 'nothing was ever held').toBeGreaterThan(100)
    expect(s.later.filter((n) => n === 0).length).toBeGreaterThan(100)
  }, 120_000)

  it('sums to WORST CASE: remaining less repairs, upkeep and what is held', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          for (const actions of [NO_OP, WIN_SCRIPT[state.turn] ?? NO_OP]) {
            const w = worstCase(state, actions)
            expect(w.value).toBe(w.remaining - w.repairs - w.upkeep - w.later)
            expect(w.later).toBe(heldForLater(state, countersAfter(state, actions)))
            expect(w.later).toBeGreaterThanOrEqual(0)
            if (state.turn === DEFAULT_SCENARIO.totalTurns) expect(w.later).toBe(0)
          }
          state = step(state)
        }
      }
    }
  })

  it('is what the room holds back: a response fits less the more the nights ahead could cost', () => {
    // The same first move, with the last turn's nothing ahead of it and
    // with five nights ahead: the room differs by exactly what is held.
    for (let seed = 1; seed <= 12; seed += 1) {
      const s = newGame(DEFAULT_SCENARIO, seed)
      const held = heldForLater(s, s.counters)
      const open = lastOf(step(s)).events[0]
      // Nothing queued before a night's first move, so its room is the
      // budget less the worst of the moves after it, the upkeep (none
      // owned) and what is held.
      const rest = lastOf(step(s)).events.length
      if (rest === 1) expect(open.room, `seed ${seed}`).toBe(s.credits - held)
      expect(open.room!, `seed ${seed}`).toBeLessThanOrEqual(s.credits - held)
    }
  })
})

describe('what never offers a response', () => {
  it('offers one exactly when an attack has strength left over, across the sweep', () => {
    const s = sweep()
    expect(s.turns).toBeGreaterThan(5000)
    expect(s.offering.slice(0, 5).join('\n')).toBe('')
  }, 120_000)

  it('gives the debris call and an opportunity no room, and takes no response for either', () => {
    let calls = 0
    let windfalls = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 60; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const ridden = step(state)
          const events = lastOf(ridden).events
          const plain = events.map((ev, i) => [ev, i] as const).filter(([ev]) => ev.debris || (event(ev.eventId).kind ?? 'threat') === 'opportunity')
          for (const [ev, i] of plain) {
            if (ev.debris) calls += 1
            else windfalls += 1
            expect(ev.room, `seed ${seed}, ${ev.eventId}`).toBeUndefined()
            expect(ev.response, `seed ${seed}, ${ev.eventId}`).toBeUndefined()
            expect(event(ev.eventId).responses, ev.eventId).toBeUndefined()
            // An answer aimed at its place in the night changes nothing,
            // even a real one from another move.
            expect(step(state, NO_OP, answered([], i, 'backup-link')), `seed ${seed}, ${ev.eventId}`).toEqual(ridden)
          }
          // And neither is a choice the night waits on.
          expect(openChoice(events, events.map((ev) => (ev.room !== undefined ? null : undefined)))).toBe(-1)
          state = ridden
        }
      }
    }
    expect(calls, 'the sweep met no debris call').toBeGreaterThan(60)
    expect(windfalls, 'the sweep met no opportunity').toBeGreaterThan(10)
  })

  it('gives a move a defense fully stops no room, and takes no response for it', () => {
    // Both of a seed's first moves answered by their primary defense, one
    // held from a hand-built start (one new defense a night).
    let held = 0
    for (let seed = 1; seed <= 30; seed += 1) {
      const s: GameState = { ...newGame(DEFAULT_SCENARIO, seed), counters: ['pntAuth'] }
      const orders: TurnActions = { ...NO_OP, buyCounters: ['antiJam'] }
      const ridden = step(s, orders)
      const ev = lastOf(ridden).events[0]
      const def = event(ev.eventId)
      if (exposedOf(ev) > 0) continue
      held += 1
      expect(ev.outcome, `seed ${seed}`).toBe('held')
      expect(ev.room, `seed ${seed}: a held move offered a response`).toBeUndefined()
      expect(openChoice(lastOf(ridden).events, [])).not.toBe(0)
      // Its own response, asked for anyway: nothing is taken or charged.
      const asked = step(s, orders, [def.responses![0].id])
      expect(asked, `seed ${seed}`).toEqual(ridden)
      expect(lastOf(asked).ledger.responses).toBeUndefined()
      // What the card would show for it, were it asked: nothing to pay.
      for (const o of responseOptions(def, ev, s.difficulty)) expect(o.cost).toBe(0)
    }
    expect(held, 'no first move was held by the defenses').toBeGreaterThan(10)
  })
})

describe('openChoice, answered and playNight', () => {
  const events = (...rooms: (number | undefined)[]) => rooms.map((room) => ({ room })) as unknown as ResolvedEvent[]

  it('openChoice finds the first move that offered a response and has no answer yet', () => {
    const night = events(undefined, 12, undefined, 30)
    expect(openChoice(night, [])).toBe(1)
    // Null is an answer (ridden out); only undefined is still open.
    expect(openChoice(night, [null, null])).toBe(3)
    expect(openChoice(night, [null, 'backup-link'])).toBe(3)
    expect(openChoice(night, [null, undefined, null, 'x'])).toBe(1)
    expect(openChoice(night, [null, 'backup-link', null, null])).toBe(-1)
    // A move that offered nothing is never open, answered or not.
    expect(openChoice(events(undefined, undefined), [])).toBe(-1)
    expect(openChoice([], [])).toBe(-1)
    // A room of 0 is still an offer (the card shows answers that do not fit).
    expect(openChoice(events(0), [])).toBe(0)
  })

  it('answered adds one answer, with null for every move before it that had none', () => {
    expect(answered([], 0, 'a')).toEqual(['a'])
    expect(answered([], 2, 'a')).toEqual([null, null, 'a'])
    expect(answered(['a'], 1, null)).toEqual(['a', null])
    expect(answered(['a', undefined, null], 3, 'b')).toEqual(['a', null, null, 'b'])
    // It keeps the answers before the move and drops any from it on.
    expect(answered(['a', 'b', 'c'], 1, 'z')).toEqual(['a', 'z'])
    // A new list: the answers so far are not written to.
    const so = ['a'] as (string | null)[]
    expect(answered(so, 1, 'b')).not.toBe(so)
    expect(so).toEqual(['a'])
  })

  it('playNight with nothing answered is the turn resolved once, and does not write to its state', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const orders = WIN_SCRIPT[state.turn] ?? NO_OP
          const before = JSON.stringify(playOf(state))
          const after = playNight(state, orders, ride)
          expect(after, `seed ${seed} on ${difficulty}, turn ${state.turn}`).toEqual(resolveTurn(state, orders, turnRng(state.seed, state.turn)))
          expect(JSON.stringify(playOf(state)), 'playNight wrote to the state it was given').toBe(before)
          state = after
        }
      }
    }
  })

  it('playNight asks once for each move that would land, in order, with the move as it stands ridden out', () => {
    let asked = 0
    let afterOne = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 30; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const where = `seed ${seed} on ${difficulty}, turn ${state.turn}`
          const offers: Offer[] = []
          const from = state
          const after = playNight(from, NO_OP, (offer) => {
            offers.push(offer)
            return sensible(offer)
          })
          const record = lastOf(after)
          // One offer for each move with room, in the night's order.
          expect(offers.map((o) => o.index), where).toEqual(record.events.map((e, i) => (e.room !== undefined ? i : -1)).filter((i) => i >= 0))
          let taken = 0
          for (const offer of offers) {
            asked += 1
            expect(offer.state, where).toBe(from)
            expect(offer.def, where).toBe(event(offer.ev.eventId))
            expect(offer.ev.eventId, where).toBe(record.events[offer.index].eventId)
            // The move as offered is not yet answered, and the options are
            // the engine's for it.
            expect(offer.ev.response, where).toBeUndefined()
            expect(offer.ev.room, where).toBe(record.events[offer.index].room)
            expect(offer.options, where).toEqual(responseOptions(offer.def, offer.ev, difficulty))
            // What had been answered when it came is the count of the
            // responses taken before it.
            expect(offer.ev.answered ?? 0, where).toBe(taken)
            if (taken > 0) {
              afterOne += 1
              for (const o of offer.options) expect(o.why, where).toBe('used')
            }
            if (record.events[offer.index].response) taken += 1
          }
          state = after
        }
      }
    }
    expect(asked).toBeGreaterThan(400)
    expect(afterOne, 'no offer came after a response was taken').toBeGreaterThan(50)
  })

  it('playNight with a responder is the turn resolved with the answers it gave', () => {
    // The prepared line on the snapshot's seed: the night-by-night play of
    // the first response that fits is the fixed list, turn for turn.
    let played = newGame(DEFAULT_SCENARIO, WIN_RESPONSES_SEED)
    let fixed = played
    while (played.status === 'playing') {
      const orders = WIN_SCRIPT[played.turn] ?? NO_OP
      fixed = step(fixed, orders, WIN_RESPONSES[fixed.turn] ?? [])
      played = playNight(played, orders, sensible)
      expect(played, `turn ${fixed.turn - 1}`).toEqual(fixed)
    }
    expect(played.status).toBe('won')
    // And for any responder: the answers it gave, replayed, are its night.
    for (const respond of [sensible, careless, grabby]) {
      let state = newGame(DEFAULT_SCENARIO, 11, 'easy')
      while (state.status === 'playing') {
        const { after, responses } = nightWith(state, NO_OP, respond)
        expect(playNight(state, NO_OP, respond)).toEqual(after)
        expect(step(state, NO_OP, responses)).toEqual(after)
        state = after
      }
    }
  })

  it('refuses a finished game, as resolveTurn does', () => {
    const over = playFixed(4041, LOSS_SCRIPT)
    expect(over.status).toBe('lost')
    expect(() => playNight(over, NO_OP, sensible)).toThrow()
  })
})
