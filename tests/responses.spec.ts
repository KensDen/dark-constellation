// THE RESPONSE, AS THE ENGINE RULES IT (v1.7 R1; a pool since v2.0 R2).
// The night asks the player what to do about a move that would land: block
// it, halve it, or ride it out. The answers are part of the orders
// (TurnActions.responses), so the turn resolver takes them with everything
// else and a seed with the player's choices replays exactly. This file
// holds the rules as pure tests, with no card and no DOM:
//
//   - REPLAY: a seed, its orders and its responses give one game.
//   - What each answer does: a block lets nothing through and extends the
//     streak; a halve does half of everything the move does; riding out
//     changes nothing. An answer costs no credits: it takes one from the
//     operation's pool (Scenario.answers; tests/watch.spec.ts holds the
//     pool itself).
//   - An answer that the move does not offer, or one asked for with the
//     pool empty, is ridden out without a throw.
//   - responseOptions (what the card shows) and resolveTurn (what happens)
//     agree on every offer.
//   - worstCase: a turn that read WORST CASE 0 or more does not close
//     insolvent, whatever was answered; and its figures hang together
//     (the dawn and the morning, the odds and the mark: v2.0 R5).
//   - What never offers a response: the debris call, an opportunity, a
//     move the defenses stop.
//   - openChoice, answered and playNight, as src/engine/responses.ts
//     documents them.
//
// Through v2.0 R2 the pixel board bought its answers: a price a point, one
// a night, and a room the budget had to leave. Those rules left the engine
// in v2.0 R3 (Ken's ruling of 15 November 2026) and their tests with them.
//
// The sweep's own gate (tests/sweep.spec.ts) holds the balance these rules
// produce.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { ASSET_DAMAGE_PER_SEVERITY, DIFFICULTIES, RESPONSE_DAMAGE_SHARE, answersLeft, exposedOf, meterDamageOf, newGame, resolveTurn, scaled } from '../src/engine/reducer'
import { answered, openChoice, playNight, responseOptions, type Offer, type Responder } from '../src/engine/responses'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, ResolvedEvent, ThreatEvent, TurnActions } from '../src/engine/types'
import { RISK_BAR, worstCase, type WorstCase } from '../src/engine/worstCase'
import { POLICIES, careless, ride, sensible } from './policies'
import { NO_OP, WIN_SCRIPT, affordable, scripted } from './scripts'
import { WIN_GAME, WIN_GAME_SEED, playWritten } from './written-games'

const DIFFS: Difficulty[] = ['standard', 'easy']
const METERS = ['linkAvailability', 'dataIntegrity', 'sensorIntegrity'] as const
// The answers an operation has, and what a point through does to a meter.
const POOL = DEFAULT_SCENARIO.answers
const METER_DAMAGE = meterDamageOf({ scenario: DEFAULT_SCENARIO })

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

// The written won game (tests/written-games.ts), and the same nights with
// other answers.
const written = (nights: readonly TurnActions[] = WIN_GAME) => playWritten(newGame(DEFAULT_SCENARIO, WIN_GAME_SEED), nights)
// Nothing ordered, each night answered from a list by turn.
function playLists(seed: number, lists: Record<number, (string | null)[]>, difficulty: Difficulty): GameState {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  while (state.status === 'playing') state = step(state, NO_OP, lists[state.turn] ?? [])
  return state
}

describe('REPLAY: a seed, its orders and its responses are one game', () => {
  it('plays a fixed list of orders and responses to deeply equal states, twice from newGame', () => {
    const once = written()
    const again = written()
    expect(again).toEqual(once)
    // Equal, and not the same objects: neither game leaned on the other.
    expect(again.history).not.toBe(once.history)
    expect(once.status).toBe('won')
    expect(once.history.flatMap((r) => r.events).filter((e) => e.response).length, 'the list took no response').toBeGreaterThan(2)
  })

  it('plays a different list of responses to a different game', () => {
    const fixed = written()
    // Every move ridden out.
    const ridden = written(WIN_GAME.map((night) => ({ ...night, responses: [] })))
    expect(playOf(ridden)).not.toEqual(playOf(fixed))
    expect(lastOf(ridden).maiScore, 'riding every move out ended no lower').toBeLessThan(lastOf(fixed).maiScore)
    // One answer changed: the first night's block for the same move's halve.
    const first = lastOf(step(newGame(DEFAULT_SCENARIO, WIN_GAME_SEED), WIN_GAME[0])).events[0]
    const [block, halve] = event(first.eventId).responses!
    expect(WIN_GAME[0].responses).toEqual([block.id])
    expect(halve.effect).toBe('halve')
    const other = written([{ ...WIN_GAME[0], responses: [halve.id] }, ...WIN_GAME.slice(1)])
    expect(other.history[0]).not.toEqual(fixed.history[0])
    expect(other.history[0].events[0].response).toEqual({ id: halve.id, effect: 'halve' })
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
            const { after, responses } = nightWith(state, NO_OP, respond)
            lists[state.turn] = responses
            state = after
          }
          expect(playLists(seed, lists, difficulty), `seed ${seed} on ${difficulty}`).toEqual(state)
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
    responses = answered(responses, i, respond({ state, index: i, ev: events[i], def, options: responseOptions(def, events[i]) }))
  }
}

describe('what each answer does', () => {
  // A first night with nothing ordered, from meters worn to 80 so that no
  // loss hides under the cap when the close recovers them. The move is
  // whatever the seed draws; the three answers are resolved side by side.
  // No hold falls on a first night (src/engine/holds.ts), so the meters
  // move for the move alone.
  const opening = (seed: number, difficulty: Difficulty): GameState => ({
    ...newGame(DEFAULT_SCENARIO, seed, difficulty),
    meters: { linkAvailability: 80, dataIntegrity: 80, sensorIntegrity: 80 },
  })
  const meterLoss = (before: GameState, after: GameState, m: (typeof METERS)[number]) => before.meters[m] - (after.meters[m] - lastOf(after).ledger.recovery)

  it('changes nothing to ride out, and the move lands whole', () => {
    let landed = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const s = opening(seed, difficulty)
        const after = step(s)
        expect(lastOf(after).hold, `seed ${seed}: a first night opened on a hold`).toBeUndefined()
        const ev = lastOf(after).events[0]
        const def = event(ev.eventId)
        const where = `seed ${seed} on ${difficulty}, ${ev.eventId}`
        // An open move offers its answers, with the whole pool to take from.
        expect(ev.left, `${where}: an open move offered nothing`).toBe(POOL)
        expect(ev.response, where).toBeUndefined()
        expect(ev.effectiveSeverity, where).toBe(def.baseSeverity)
        expect(ev.outcome, where).toBe('open')
        expect(after.answersUsed ?? 0, `${where}: riding it out spent an answer`).toBe(0)
        expect(lastOf(after).ledger.afterNight, where).toBe(s.credits)
        // Null, absent and an empty list are all riding it out.
        expect(step(s, NO_OP, [null]), where).toEqual(after)
        expect(resolveTurn(s, NO_OP, turnRng(s.seed, s.turn)), where).toEqual(after)
        for (const m of METERS) {
          expect(meterLoss(s, after, m), `${where}: ${m}`).toBe(def.effect.meters.includes(m) ? scaled(METER_DAMAGE * ev.effectiveSeverity, difficulty) : 0)
        }
        landed += 1
      }
    }
    expect(landed).toBe(80)
  })

  it('lets nothing through on a block, extends the streak, and takes one answer and no credits', () => {
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
        expect(ev.response, where).toEqual({ id: block.id, effect: 'block' })
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
        // One answer from the pool, which the move records as it found it,
        // and no credits: the night's budget is the ridden-out night's.
        expect(ev.left, where).toBe(POOL)
        expect(after.answersUsed, where).toBe(1)
        expect(answersLeft(after), where).toBe(POOL - 1)
        expect(record.ledger.afterNight, where).toBe(s.credits)
        expect(record.ledger.repairs, where).toBe(0)
        expect(after.credits, where).toBe(s.credits + record.ledger.funding + record.ledger.coverageBonus)
      }
    }
    expect(blocked, 'too few first moves offer a block to mean anything').toBeGreaterThan(30)
  })

  it('does half the meter damage, half the asset damage and half the repair bill on a halve, rounding as the engine does, for one answer and no credits', () => {
    // Every night of a ridden-out campaign, not the first alone, so the
    // moves halved are of every strength: the night's first move that
    // offers a halve, resolved ridden out and halved from the same state
    // (meters worn to 80 again each night, so nothing hides under the
    // cap). Only that move differs between the two resolutions, so the
    // meters differ by the half it did not do, wherever no meter ran to 0.
    let halved = 0
    let onATile = 0
    let billed = 0
    let metered = 0
    const strengths = new Set<number>()
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const s: GameState = { ...state, meters: { linkAvailability: 80, dataIntegrity: 80, sensorIntegrity: 80 } }
          const ridden = step(s)
          state = ridden
          const i = lastOf(ridden).events.findIndex((e) => e.left !== undefined && responseOptions(event(e.eventId), e).some((o) => o.effect === 'halve' && o.fits))
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
          expect(ev.response, where).toEqual({ id: halve.id, effect: 'halve' })
          expect(after.answersUsed, where).toBe((s.answersUsed ?? 0) + 1)
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
          // once, with the difficulty, not half of the rounded whole. Read
          // where the ridden-out night left every meter above 0, so no
          // floor hides a part of either night's loss.
          const whole = METER_DAMAGE * exposed
          if (METERS.every((m) => lastOf(ridden).meters[m] - lastOf(ridden).ledger.recovery > 0)) {
            metered += 1
            for (const m of METERS) {
              const spared = def.effect.meters.includes(m) ? scaled(whole, difficulty) - scaled(whole * RESPONSE_DAMAGE_SHARE.halve, difficulty) : 0
              expect(after.meters[m] - ridden.meters[m], `${where}: ${m}`).toBe(spared)
            }
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
          // No credits in the night: the answer is free.
          expect(record.ledger.afterNight, where).toBe(lastOf(ridden).ledger.afterNight)
          // And so it costs the score less than the whole hit, and more
          // than nothing.
          expect(ev.scoreBefore, where).toBe(open.scoreBefore)
          expect(ev.scoreAfter, where).toBeGreaterThan(open.scoreAfter)
          expect(ev.scoreAfter, where).toBeLessThan(ev.scoreBefore)
        }
      }
    }
    expect(halved, 'too few moves offered a halve to mean anything').toBeGreaterThan(200)
    expect(metered, 'too few halved moves left every meter above 0').toBeGreaterThan(100)
    expect(onATile, 'no halved move struck a tile').toBeGreaterThan(20)
    expect(billed, 'no halved move had a bill to halve').toBeGreaterThan(20)
    expect([...strengths].sort(), 'the halved moves were not of every strength').toEqual([1, 2, 3])
  })

  it('rounds a half the way the engine rounds everything: once, at the difficulty', () => {
    // A halved move's damage is the whole product, halved and scaled, and
    // rounded once at the end: never half of a rounded whole, and never a
    // rounded half scaled again. The meter figures follow the scenario's
    // damage a point; a tile's are written out (12 a point: 6, 12 and 18 on
    // STANDARD; three quarters of the half before rounding on EASY), so a
    // change to where the rounding happens costs an edit here.
    const easy = DIFFICULTIES.easy.damage
    const half = RESPONSE_DAMAGE_SHARE.halve
    expect(half).toBe(0.5)
    for (const n of [1, 2, 3]) {
      expect(scaled(METER_DAMAGE * n * half, 'standard'), `${n} on STANDARD`).toBe(Math.round(METER_DAMAGE * n * half))
      expect(scaled(METER_DAMAGE * n * half, 'easy'), `${n} on EASY`).toBe(Math.round(METER_DAMAGE * n * half * easy))
    }
    // A whole number at every strength, and never above half the whole
    // hit rounded up.
    for (const difficulty of DIFFS) {
      for (const n of [1, 2, 3]) {
        const halved = scaled(METER_DAMAGE * n * half, difficulty)
        expect(Number.isInteger(halved), `${n} on ${difficulty}`).toBe(true)
        expect(halved, `${n} on ${difficulty}`).toBeLessThanOrEqual(Math.ceil(scaled(METER_DAMAGE * n, difficulty) / 2))
      }
    }
    expect([1, 2, 3].map((n) => scaled(ASSET_DAMAGE_PER_SEVERITY * n * half, 'standard'))).toEqual([6, 12, 18])
    expect([1, 2, 3].map((n) => scaled(ASSET_DAMAGE_PER_SEVERITY * n * half, 'easy'))).toEqual([5, 9, 14])
    expect(RESPONSE_DAMAGE_SHARE.block).toBe(0)
  })

  it('answers what the defenses leave exposed: a defense takes its point and a block the rest', () => {
    // The rogue ground station with its second defense owned: strength 3,
    // 1 off, 2 exposed. Ground segmentation on turn 2 and the insider
    // program on turn 4 make it COLDVEIL's move on a later turn, each
    // ordered where the budget meets it (tests/scripts.ts, affordable).
    const rogue = event('rogue-ground-station')
    const orders: Record<number, TurnActions> = { 2: { ...NO_OP, buyCounters: ['groundZeroTrust'] }, 4: { ...NO_OP, buyCounters: ['insiderProgram'] } }
    let seen = 0
    for (let seed = 1; seed <= 40; seed += 1) {
      let s = newGame(DEFAULT_SCENARIO, seed)
      while (s.status === 'playing') {
        const tonight = affordable(s, orders[s.turn] ?? NO_OP)
        const ridden = step(s, tonight)
        const i = lastOf(ridden).events.findIndex((e) => e.eventId === rogue.id && e.left !== undefined)
        if (i >= 0 && lastOf(ridden).events[i].mitigation > 0) {
          const open = lastOf(ridden).events[i]
          expect(open.mitigation).toBe(1)
          const exposed = exposedOf(open)
          expect(exposed).toBe(rogue.baseSeverity - 1 - (open.hardened ?? 0))
          expect(open.effectiveSeverity).toBe(exposed)
          const options = responseOptions(rogue, open)
          expect(options.map((o) => o.id)).toEqual(rogue.responses!.map((r) => r.id))
          const block = options.find((o) => o.effect === 'block' && o.fits)
          if (block) {
            const ev = lastOf(step(s, tonight, answered([], i, block.id))).events[i]
            expect(ev.response).toEqual({ id: block.id, effect: 'block' })
            // A defense took a point and the response the rest: held.
            expect(ev.outcome).toBe('held')
            expect(ev.mitigation).toBe(1)
            expect(ev.effectiveSeverity).toBe(0)
            seen += 1
          }
        }
        s = ridden
      }
    }
    expect(seen, 'no seed drew the rogue station against one of its defenses').toBeGreaterThan(0)
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
// WORST CASE's figures hang together (v2.0 R5): the dawn is the budget
// less the orders, the worst repairs and the upkeep; the morning is the
// dawn with the funding in, and the coverage bonus or not, or the dawn
// itself when that is under 0; tonight's odds are within the odds by
// tomorrow night; the mark is up exactly when those pass the bar; the one
// figure a line reads is the dawn, and under 0 whenever the mark is up;
// and nothing is read for a tomorrow the last night does not have.
function figures(state: GameState, w: WorstCase): string[] {
  const out: string[] = []
  const { incomePerTurn: funding, slaBonus } = state.scenario
  if (w.dawn !== w.remaining - w.repairs - w.upkeep) out.push('the dawn does not sum')
  if (w.dawn < 0 ? w.morning !== w.dawn : ![funding, funding + slaBonus.credits].includes(w.morning - w.dawn)) out.push(`the morning reads ${w.morning} on a dawn of ${w.dawn}`)
  if (!(w.tonight >= 0 && w.tonight <= w.odds + 1e-9 && w.odds <= 1 + 1e-9)) out.push(`odds ${w.tonight} tonight and ${w.odds} by tomorrow`)
  if (w.dawn >= 0 && w.tonight !== 0) out.push(`tonight cannot break a dawn of ${w.dawn}, and its odds read ${w.tonight}`)
  if (w.risky !== w.odds > RISK_BAR) out.push('the mark is not the odds')
  if (w.value !== (w.risky ? Math.min(-1, w.dawn) : w.dawn)) out.push(`the figure a line reads is ${w.value}`)
  if (w.later < 0) out.push(`tomorrow needs ${w.later}`)
  if (state.turn === state.scenario.totalTurns && (w.later !== 0 || w.odds !== w.tonight)) out.push('a tomorrow read on the last night')
  return out
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
          let takenThisGame = 0
          while (state.status === 'playing') {
            const where = `${name}, ${how}, ${difficulty}, seed ${seed}, turn ${state.turn}`
            const actions = policy(state)
            const read = worstCase(state, actions)
            // The worst case's figures, each against the others.
            out.later.push(read.later)
            for (const wrong of figures(state, read)) out.held.push(`${where}: ${wrong}`)
            if (state.turn === DEFAULT_SCENARIO.totalTurns) out.lastTurns += 1
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
                if (tried.response && (tried.response.effect !== o.effect || tried.response.id !== o.id)) {
                  out.disagree.push(`${where}, ${offer.ev.eventId}/${o.id}: the card says ${o.effect}, the engine ${tried.response.effect}`)
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
            // WORST CASE. A turn that read 0 or more cannot close insolvent.
            if (read.value >= 0) {
              out.safeTurns += 1
              if (record.ledger.insolvent) out.unsafe.push(`${where}: WORST CASE read ${read.value}, closed at ${record.ledger.after}`)
            }
            // No answer is paid for: the night takes from the budget only
            // the burn's fuel, and gives it only a windfall.
            if (record.ledger.afterNight !== before.credits - record.ledger.ordered - record.ledger.fuel + record.ledger.windfall) out.misfit.push(`${where}: the night's budget moved by more than the orders, the fuel and a windfall`)
            record.events.forEach((ev, i) => {
              const def = event(ev.eventId)
              const exposed = exposedOf(ev)
              const attack = (def.kind ?? 'threat') === 'threat' && def.effect.special !== 'debrisStrike'
              // What offers a response: an attack with strength left over.
              if ((ev.left !== undefined) !== (attack && exposed > 0)) out.offering.push(`${where}, ${ev.eventId}: left ${ev.left}, exposed ${exposed}`)
              if (ev.left === undefined && ev.response) out.offering.push(`${where}, ${ev.eventId}: answered with no offer`)
              if (!ev.response) return
              out.taken += 1
              takenThisGame += 1
              // A response taken fitted: the pool had one for it, it is
              // one the move offers, and it is the one that was asked for.
              const offered = def.responses?.find((r) => r.id === ev.response!.id)
              if (!offered || offered.effect !== ev.response.effect) out.misfit.push(`${where}, ${ev.eventId}: took ${ev.response.id}, which it does not offer`)
              if (!(ev.left! > 0)) out.misfit.push(`${where}, ${ev.eventId}: taken with ${ev.left} left in the pool`)
              if (answers[i] !== ev.response.id) out.misfit.push(`${where}, ${ev.eventId}: took ${ev.response.id}, asked ${answers[i]}`)
            })
            if ((after.answersUsed ?? 0) !== takenThisGame) out.misfit.push(`${where}: ${after.answersUsed} answers spent, ${takenThisGame} taken`)
            if (takenThisGame > POOL) out.misfit.push(`${where}: ${takenThisGame} answers from a pool of ${POOL}`)
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

describe('WORST CASE holds whatever is answered, and an answer that does not fit is ridden out', () => {
  it('closes no turn insolvent that read WORST CASE 0 or more as the night began, whatever was answered', () => {
    const s = sweep()
    expect(s.games).toBe(DIFFS.length * POLICIES.length * 3 * 40)
    // Not vacuous: most turns of the sweep read safe.
    expect(s.turns).toBeGreaterThan(5000)
    expect(s.safeTurns, 'too few turns read safe to mean anything').toBeGreaterThan(s.turns / 2)
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

  it('rides out an answer asked for with the pool empty, without throwing, and the card says why', () => {
    let cases = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        // A first night with every answer already spent.
        const s: GameState = { ...newGame(DEFAULT_SCENARIO, seed, difficulty), answersUsed: POOL }
        const ridden = step(s)
        const open = lastOf(ridden).events[0]
        const def = event(open.eventId)
        // Still an offer: the card shows the answers, none to take.
        expect(open.left, `seed ${seed}`).toBe(0)
        const options = responseOptions(def, open)
        expect(options.map((o) => o.id)).toEqual(def.responses!.map((r) => r.id))
        for (const o of options) {
          expect(o, `seed ${seed}: ${o.id}`).toMatchObject({ fits: false, why: 'used' })
          let after: GameState | undefined
          expect(() => {
            after = step(s, NO_OP, [o.id])
          }, `seed ${seed}: ${o.id}`).not.toThrow()
          expect(after, `seed ${seed}: ${o.id} was taken from an empty pool`).toEqual(ridden)
          cases += 1
        }
        // The control: one answer short of empty, the same answer is taken.
        const one: GameState = { ...s, answersUsed: POOL - 1 }
        expect(lastOf(step(one, NO_OP, [options[0].id])).events[0].response?.id, `seed ${seed}`).toBe(options[0].id)
      }
    }
    expect(cases).toBeGreaterThan(40)
  })
})

describe('responseOptions says what resolveTurn then does', () => {
  it('agrees on every answer of every offer of the sweep: whether it fits and what it does', () => {
    const s = sweep()
    expect(s.offers, 'the sweep made too few offers to mean anything').toBeGreaterThan(5000)
    expect(s.disagree.slice(0, 5).join('\n')).toBe('')
  }, 120_000)

  it('lists the move\'s own responses in the deck\'s order, each there to take while the pool has one', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const open = lastOf(step(newGame(DEFAULT_SCENARIO, seed, difficulty))).events[0]
        const def = event(open.eventId)
        const options = responseOptions(def, open)
        expect(options.map((o) => [o.id, o.effect])).toEqual(def.responses!.map((r) => [r.id, r.effect]))
        for (const o of options) expect(o.fits).toBe(true)
      }
    }
    // A move with no responses offers none.
    const debris = event('debris-conjunction')
    expect(responseOptions(debris, { baseSeverity: debris.baseSeverity, chainBonus: 0, mitigation: 0 } as ResolvedEvent)).toEqual([])
  })
})

describe("WORST CASE's figures", () => {
  it('hang together on every night of the sweep: the dawn, the morning, the odds and the mark', () => {
    const s = sweep()
    expect(s.later.length).toBe(s.turns)
    expect(s.lastTurns, 'the sweep reached no last turn').toBeGreaterThan(500)
    expect(s.held.slice(0, 5).join('\n')).toBe('')
    // Not vacuous: tomorrow needs something on most nights, and nothing on the last.
    expect(s.later.filter((n) => n > 0).length, 'tomorrow never needed anything').toBeGreaterThan(100)
    expect(s.later.filter((n) => n === 0).length).toBeGreaterThan(100)
  }, 120_000)

  it('hang together under a written order too', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          for (const actions of [NO_OP, WIN_SCRIPT[state.turn] ?? NO_OP]) expect(figures(state, worstCase(state, actions)), `${difficulty} seed ${seed} night ${state.turn}`).toEqual([])
          state = step(state)
        }
      }
    }
  })
})

describe('what never offers a response', () => {
  it('offers one exactly when an attack has strength left over, across the sweep', () => {
    const s = sweep()
    expect(s.turns).toBeGreaterThan(5000)
    expect(s.offering.slice(0, 5).join('\n')).toBe('')
  }, 120_000)

  it('gives the debris call and an opportunity no offer, and takes no response for either', () => {
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
            expect(ev.left, `seed ${seed}, ${ev.eventId}`).toBeUndefined()
            expect(ev.response, `seed ${seed}, ${ev.eventId}`).toBeUndefined()
            expect(event(ev.eventId).responses, ev.eventId).toBeUndefined()
            // An answer aimed at its place in the night changes nothing,
            // even a real one from another move.
            expect(step(state, NO_OP, answered([], i, 'backup-link')), `seed ${seed}, ${ev.eventId}`).toEqual(ridden)
          }
          // And neither is a choice the night waits on.
          expect(openChoice(events, events.map((ev) => (ev.left !== undefined ? null : undefined)))).toBe(-1)
          state = ridden
        }
      }
    }
    expect(calls, 'the sweep met no debris call').toBeGreaterThan(60)
    expect(windfalls, 'the sweep met no opportunity').toBeGreaterThan(10)
  })

  it('gives a move a defense fully stops no offer, and takes no response for it', () => {
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
      expect(ev.left, `seed ${seed}: a held move offered a response`).toBeUndefined()
      expect(openChoice(lastOf(ridden).events, [])).not.toBe(0)
      // Its own response, asked for anyway: nothing is taken or spent.
      const asked = step(s, orders, [def.responses![0].id])
      expect(asked, `seed ${seed}`).toEqual(ridden)
      expect(asked.answersUsed ?? 0, `seed ${seed}`).toBe(0)
      // What the card would show for it, were it asked: nothing to take.
      for (const o of responseOptions(def, ev)) expect(o.fits).toBe(false)
    }
    expect(held, 'no first move was held by the defenses').toBeGreaterThan(10)
  })
})

describe('openChoice, answered and playNight', () => {
  const events = (...pools: (number | undefined)[]) => pools.map((left) => ({ left })) as unknown as ResolvedEvent[]

  it('openChoice finds the first move that offered a response and has no answer yet', () => {
    const night = events(undefined, 3, undefined, 2)
    expect(openChoice(night, [])).toBe(1)
    // Null is an answer (ridden out); only undefined is still open.
    expect(openChoice(night, [null, null])).toBe(3)
    expect(openChoice(night, [null, 'backup-link'])).toBe(3)
    expect(openChoice(night, [null, undefined, null, 'x'])).toBe(1)
    expect(openChoice(night, [null, 'backup-link', null, null])).toBe(-1)
    // A move that offered nothing is never open, answered or not.
    expect(openChoice(events(undefined, undefined), [])).toBe(-1)
    expect(openChoice([], [])).toBe(-1)
    // An empty pool is still an offer (the card shows answers that do not fit).
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
    const line = scripted(WIN_SCRIPT)
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const orders = line(state)
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
    let afterEmpty = 0
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
          // One offer for each move with answers to show, in the night's order.
          expect(offers.map((o) => o.index), where).toEqual(record.events.map((e, i) => (e.left !== undefined ? i : -1)).filter((i) => i >= 0))
          let taken = 0
          for (const offer of offers) {
            asked += 1
            expect(offer.state, where).toBe(from)
            expect(offer.def, where).toBe(event(offer.ev.eventId))
            expect(offer.ev.eventId, where).toBe(record.events[offer.index].eventId)
            // The move as offered is not yet answered, and the options are
            // the engine's for it.
            expect(offer.ev.response, where).toBeUndefined()
            expect(offer.options, where).toEqual(responseOptions(offer.def, offer.ev))
            // What is left in the pool when it comes is what the night
            // began with, less the answers taken before it.
            expect(offer.ev.left, where).toBe(answersLeft(from) - taken)
            expect(offer.ev.left, where).toBe(record.events[offer.index].left)
            if (offer.ev.left === 0) {
              afterEmpty += 1
              for (const o of offer.options) expect(o.why, where).toBe('used')
            }
            if (record.events[offer.index].response) taken += 1
          }
          state = after
        }
      }
    }
    expect(asked).toBeGreaterThan(400)
    expect(afterEmpty, 'no offer came after the pool was empty').toBeGreaterThan(50)
  })

  it('playNight with a responder is the turn resolved with the answers it gave', () => {
    // The written won game: played night by night with a responder that
    // gives the written answer for each move as it comes, it is the list
    // resolved at once, turn for turn.
    let played = newGame(DEFAULT_SCENARIO, WIN_GAME_SEED)
    let fixed = played
    for (const night of WIN_GAME) {
      const { responses, ...orders } = night
      fixed = step(fixed, orders, responses ?? [])
      played = playNight(played, orders, ({ index }) => responses?.[index] ?? null)
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
    const over = playLists(4041, {}, 'standard')
    expect(over.status).toBe('lost')
    expect(() => playNight(over, NO_OP, sensible)).toThrow()
  })
})
