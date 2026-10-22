// The night's model over real play (v1.3 R3, brief 5.5). This was the
// director battery (game-feel brief section 8, Round 2): it proved the v1.1
// director's beats reproduced the engine exactly, that tapping through
// and skipping both landed on the engine's own output, and that known
// fixtures produced the expected beats. v1.3 R3 retired the director with
// its beats, its patches and its playback. Its central guard, that the
// presentation lands on the engine's after-state, is now
// tests/night-model.spec.ts (the board the night ends on, closed by the
// engine's ledger, is the engine's next state on every turn of 600
// games); that nothing advances without the player is GUARD R3 (a) in
// tests/night-r3.dom.spec.tsx; the declared spend is in
// tests/game.dom.spec.tsx and tests/director-view.dom.spec.tsx.
//
// What stays here are the grains the old sweep and its fixtures were built
// to reach, re-pointed at the night's model (src/ui/night/nightModel.ts):
// that deriving a night touches neither state, that each step is the
// record's event and its strike is on the tile the record names, that the
// orders land before the first move, and the jam, the chain and the
// rideshare as the night shows them. Nothing here touches resolveTurn's
// output; the engine is the oracle.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { CHAIN_BONUS, DEPLOY_TURNS, gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { ActiveCondition, Difficulty, GameState, TurnActions } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { strikeOf } from '../src/ui/board/strike'
import { HitCard } from '../src/ui/night/cards'
import { DebrisResult, OpportunityCard } from '../src/ui/night/closeCards'
import { defensesFor, nightOf, resultOf } from '../src/ui/night/nightModel'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT, randomPolicy } from './scripts'

const WIN_SEED = 20260712
const LOSS_SEED = 4041
const SEEDS = 40
// Expert retired with the v1.2 economy in v1.3 Round 0 (brief 5.1): the
// title offers EASY or STANDARD, and the engine has no profile for a third.
const DIFFICULTIES: Difficulty[] = ['easy', 'standard']

type Line = (state: GameState) => TurnActions
const scripted =
  (script: Record<number, TurnActions>): Line =>
  (state) =>
    script[state.turn] ?? NO_OP

// The fifth line was a prepared line that also spent surge authority, so
// the surge-clear grain was exercised alongside everything else. SURGE
// left in v1.3 Round 0 (D2 a), and the grain v1.3 added in its place is
// the insolvent close: repairs and upkeep the budget cannot cover, funding
// frozen and healing withheld. None of the four scripts reaches it, so the
// fifth line is the seeded random line (tests/scripts.ts), which orders
// heavily, lands several deployments a night and goes insolvent in most of
// its campaigns. Seeded by the game, so the sweep replays.
const randomLine: Line = (state) => randomPolicy(state.seed)(state)

const LINES: [string, Line][] = [
  ['prepared', scripted(WIN_SCRIPT)],
  ['mixed', scripted(MIXED_SCRIPT)],
  ['lazy', scripted(LAZY_SCRIPT)],
  ['passive', scripted(LOSS_SCRIPT)],
  ['random', randomLine],
]

interface Turn {
  before: GameState
  after: GameState
}

function* playTurns(seed: number, line: Line, difficulty: Difficulty = 'standard'): Generator<Turn> {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  while (state.status === 'playing') {
    const next = resolveTurn(state, line(state), turnRng(state.seed, state.turn))
    yield { before: state, after: next }
    state = next
  }
}

// What the night reads off both states. An in-place edit of any of it would
// corrupt live state with every other guard still green: the after-state
// is what END OF TURN shows and what the night model is measured against.
const readable = (s: GameState) => ({
  credits: s.credits,
  assets: s.assets,
  meters: s.meters,
  conditions: s.conditions,
  pipeline: s.pipeline,
  counters: s.counters,
  history: s.history,
  streak: s.streak,
  bestStreak: s.bestStreak,
  saved: s.saved,
  learned: s.learned,
  briefFreeThrough: s.briefFreeThrough,
  // The scenario is a shared module singleton, so a write there would
  // outlive the call and poison every later game in the process.
  scenario: s.scenario,
})

const turnAt = (seed: number, line: Line, turn: number): Turn => {
  for (const t of playTurns(seed, line)) if (t.before.turn === turn) return t
  throw new Error(`turn ${turn} not reached`)
}

const integrities = (s: GameState) => new Map(s.assets.map((a) => [a.id, a.integrity]))

// The sweep ran at about 4,000ms against vitest's 5,000ms default when it
// replayed the director's beats, which made it least trustworthy exactly
// when multi-agent verification loaded the machine. The ceiling stays at
// seven times that, far enough that only a hang reaches it, and the
// duration is reported by the battery rather than gated (brief v0.9
// section 7).
const SWEEP_TIMEOUT_MS = 30_000

describe('the night model over every line, seed and difficulty', () => {
  it(
    'derives every night without touching either state, one step per event of the record, each strike on the tile the record names',
    () => {
      let turns = 0
      let strikes = 0
      let held = 0
      // Closes the engine ruled insolvent (funding frozen, no healing). The
      // random line is in LINES to reach this grain.
      let insolventCloses = 0
      for (const [name, line] of LINES) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            for (const { before, after } of playTurns(seed, line, difficulty)) {
              turns += 1
              const record = after.history[after.history.length - 1]
              if (record.ledger.insolvent) insolventCloses += 1
              const where = `${name} line, ${difficulty}, seed ${seed}, turn ${before.turn}`
              // Derivation reads both states and must mutate neither. The
              // after-state matters most: a model that wrote to it would
              // move the target tests/night-model.spec.ts measures against,
              // so that sweep would come back green while the night was
              // wrong.
              const beforeUntouched = JSON.stringify(readable(before))
              const afterUntouched = JSON.stringify(readable(after))
              const night = nightOf(before, after)
              expect(JSON.stringify(readable(before)), `${where}: before mutated`).toBe(beforeUntouched)
              expect(JSON.stringify(readable(after)), `${where}: after mutated`).toBe(afterUntouched)
              expect(night.closing, `${where}: END OF TURN would show a copy rather than the engine's state`).toBe(after)
              // One step per event the engine recorded, in its order: the
              // cards are the record, not a reading of it.
              expect(night.steps.map((s) => s.ev), `${where}: steps out of step with the record`).toEqual(record.events)
              night.steps.forEach((step, i) => {
                const { ev } = step
                // The hit's asset (v1.2 R3, now the night's strike): the
                // board lands the strike on whatever strikeOf names, so this
                // is the link between the engine's record and the tile.
                // The record names the AIMED tile even when a defense held
                // (v1.3 Round 0), so a block flashes its shield there.
                if (step.kind === 'threat' && ev.targetAssetId !== undefined) {
                  const strike = strikeOf(`t${night.turn}-${i}`, ev, step.def.layers, step.before, true)
                  expect(strike, `${where}: ${ev.eventId} has no strike`).not.toBeNull()
                  expect(strike!.kind, `${where}: ${ev.eventId}`).toBe(ev.effectiveSeverity > 0 ? 'hit' : 'held')
                  expect('assetId' in strike! ? strike.assetId : undefined, `${where}: ${ev.eventId} strikes another tile`).toBe(ev.targetAssetId)
                  if (strike!.kind === 'hit') strikes += 1
                  else held += 1
                }
                // And the step moves that asset's integrity to the record's
                // figure, and no other asset's.
                const was = integrities(step.before)
                const moved = [...integrities(step.after)].filter(([id, n]) => was.get(id) !== n).map(([id]) => id)
                const damaged = ev.integrityAfter !== undefined && ev.integrityAfter !== ev.integrityBefore
                expect(moved, `${where}: ${ev.eventId} moved the wrong tiles`).toEqual(damaged ? [ev.targetAssetId] : [])
                if (damaged) expect(integrities(step.after).get(ev.targetAssetId!), `${where}: ${ev.eventId}`).toBe(ev.integrityAfter)
              })
            }
          }
        }
      }
      expect(turns).toBeGreaterThan(SEEDS * DIFFICULTIES.length * LINES.length * 4)
      // An absolute floor as well as a relative one. The bound above is a
      // formula over the fixture sizes, so cutting SEEDS or LINES cuts the
      // work and the bound together and the sweep still passes, quietly
      // covering a fraction of what it used to.
      expect(turns, 'the sweep now covers far fewer turns than it did').toBeGreaterThanOrEqual(1500)
      // Both kinds of strike occurred in real play.
      expect(strikes, 'no strike landed on a tile in the sweep').toBeGreaterThan(0)
      expect(held, 'no block flashed on a tile in the sweep').toBeGreaterThan(0)
      // The insolvent close is a grain the sweep exists to cover (the fifth
      // line was chosen for it), so a sweep that never reaches one has
      // quietly lost it.
      expect(insolventCloses, 'the sweep never reached an insolvent close').toBeGreaterThan(0)
    },
    SWEEP_TIMEOUT_MS,
  )

  it('refuses a mismatched before and after', () => {
    const t1 = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const t2 = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 2)
    expect(() => nightOf(t1.before, t2.after)).toThrow()
  })

  it('puts no engine id or raw enum on any card the night shows', () => {
    // This was a check on the beats' titles. The night's cards are built
    // from the record and its notes (an opportunity's note names the asset
    // it expedited), so every card of every step is rendered here, with the
    // call signs the night gives them, on the prepared and random lines.
    const read = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replaceAll('&amp;', '&').replace(/\s+/g, ' ')
    let cards = 0
    for (const line of [scripted(WIN_SCRIPT), randomLine]) {
      for (const seed of [WIN_SEED, 1, 2]) {
        for (const { before, after } of playTurns(seed, line)) {
          const night = nightOf(before, after)
          const signs = new Map([...callSigns(before), ...callSigns(after)])
          for (const step of night.steps) {
            const props = {
              step,
              turn: night.turn,
              lastTurn: false,
              signs,
              known: new Set<string>(),
              first: false,
              reduced: true,
              play: () => {},
              onContinue: () => {},
            }
            const card = step.kind === 'opportunity' ? OpportunityCard : step.kind === 'debris' ? DebrisResult : HitCard
            const text = read(renderToStaticMarkup(createElement(card, props)))
            const where = `seed ${seed}, turn ${night.turn}, ${step.def.id}`
            expect(text, `${where}: engine id on the card`).not.toMatch(/\b(?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+\b/)
            expect(text, `${where}: raw enum on the card`).not.toMatch(/\b(?:rpoSat|groundStation|supplyChain)\b/)
            cards += 1
          }
        }
      }
    }
    expect(cards, 'no card was rendered').toBeGreaterThan(20)
  })
})

describe('the night at known turns', () => {
  it('turn 1 of the prepared line: the orders land as the night opens, at the exact spend', () => {
    // v1.3 Round 0 (brief 5.5): the orders land at EXECUTE, before
    // anything else happens tonight, so the board the first move meets
    // already carries them.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const night = nightOf(before, after)
    // The prepared script's turn 1 (tests/scripts.ts): a drone and both
    // turn-1 primaries. The intel brief is free on turn 1 (D2 a) and the
    // script does not order it, so it costs nothing.
    const s = DEFAULT_SCENARIO
    const expected =
      s.countermeasures.find((c) => c.id === 'antiJam')!.cost + s.countermeasures.find((c) => c.id === 'pntAuth')!.cost + s.prices.drone
    expect(before.credits - night.opening.credits).toBe(expected)
    expect(expected).toBe(after.history[0].ledger.ordered)
    // Both defenses are active the night they are ordered (brief 6.1), and
    // the drone is in transit at its fixed ETA.
    expect(night.opening.counters).toEqual(expect.arrayContaining(['antiJam', 'pntAuth']))
    expect(night.opening.pipeline).toContainEqual({ id: 't1-drone-1', kind: 'drone', etaTurns: DEPLOY_TURNS.drone })
    expect(night.steps.length, 'turn 1 has no move to meet the orders').toBeGreaterThan(0)
    expect(night.steps[0].before.credits, 'the first move met the board before the orders landed').toBe(night.opening.credits)
    expect(night.steps[0].before.counters).toEqual(night.opening.counters)
  })

  it('a defense is active the night it is ordered: on the board ahead of the move it answers, and named on its card', () => {
    // This was the sensor fusion retrofit arriving as a countermeasure
    // beat the turn after purchase. v1.3 Round 0 retired the retrofit delay
    // (brief 6.1: defenses are active from the turn they are ordered), so
    // the grain to pin is the opposite one: the defense lands with the
    // orders, the adversary reads it tonight, and the outcome block names
    // it. The prepared script buys sensor fusion and firmware attestation
    // on turn 4 (tests/scripts.ts).
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 4)
    const night = nightOf(before, after)
    const bought = WIN_SCRIPT[4].buyCounters
    expect(bought).toContain('sensorFusion')
    for (const id of bought) expect(before.counters, `the fixture owned ${id} already`).not.toContain(id)
    const threats = night.steps.filter((s) => s.kind === 'threat')
    expect(threats.length).toBeGreaterThan(0)
    for (const t of threats) for (const id of bought) expect(t.before.counters, `${t.def.id} met the board before ${id} landed`).toContain(id)
    // A move one of them answers is met by it already, and its card's
    // outcome block (HELD or REDUCED) names one of tonight's orders.
    const answered = threats.filter((t) => t.def.counters.some((c) => bought.includes(c)))
    expect(answered.length, 'no move tonight is one the new defenses answer').toBeGreaterThan(0)
    for (const t of answered) expect(t.ev.mitigation, `${t.def.id} was not met by tonight's defense`).toBeGreaterThan(0)
    const named = answered.map((t) => defensesFor(t.def, t.after.counters, DEFAULT_SCENARIO).held?.id)
    expect(named.some((id) => id !== undefined && (bought as string[]).includes(id)), 'no card names a defense ordered tonight').toBe(true)
  })

  // The passive line's first campaign in which the jam lands, found rather
  // than pinned: under the six-turn plan the jam is a drawn candidate on
  // turns 2 and 3 only (src/content/scenarios/firstLight.ts), so which
  // seed draws it moves with the deck stream.
  const jamTurn = (): { seed: number; turn: Turn; next: Turn } => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const turns = [...playTurns(seed, scripted(LOSS_SCRIPT))]
      const i = turns.findIndex(
        (t) =>
          !t.before.conditions.some((c) => c.eventId === 'pnt-jamming') &&
          t.after.history.at(-1)!.events.some((e) => e.eventId === 'pnt-jamming' && e.condition !== undefined),
      )
      if (i >= 0 && i + 1 < turns.length) return { seed, turn: turns[i], next: turns[i + 1] }
    }
    throw new Error('the passive line never lands the jam in fifty seeds')
  }

  it('the passive line: the jam lands, becomes a condition, and arms the chain', () => {
    // The chain was armed by a lidarFallback flag the condition patch set;
    // v1.3 Round 0 removed the flag (brief 6.5): the chain is armed while a
    // GNSS-jamming condition is live, which the board the night shows after
    // the jam now says.
    const { before, after } = jamTurn().turn
    const night = nightOf(before, after)
    const at = night.steps.findIndex((s) => s.kind === 'threat' && s.def.id === 'pnt-jamming')
    expect(at, 'the night has no jam').toBeGreaterThanOrEqual(0)
    const jam = night.steps[at]
    expect(jam.ev.effectiveSeverity).toBeGreaterThan(0)
    expect(jam.after.meters.linkAvailability).toBeLessThan(jam.before.meters.linkAvailability)
    // The card's new-condition tag reads the record's condition, at a fixed
    // clock, shown exactly (brief 6.5).
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === 'pnt-jamming')!
    expect(jam.ev.condition).toEqual(def.condition)
    const placed = jam.after.conditions.find((c) => c.eventId === 'pnt-jamming')
    expect(placed, 'the jam left no condition on the board').toBeDefined()
    expect(placed!.remainingTurns).toBe(def.condition!.turns)
    // Armed by this event and not before it.
    expect(gnssDenied(jam.before.conditions, before.scenario), 'GNSS was denied before the jam landed').toBe(false)
    expect(gnssDenied(jam.after.conditions, before.scenario), 'the jam did not arm the chain').toBe(true)
  })

  it('the turn after the jam: the chain is armed as the night opens, and the exploit carries the bonus', () => {
    // The arming is still real play: the jam's condition is live entering
    // the next turn, and it presses as the night opens.
    const { next } = jamTurn()
    const opening = nightOf(next.before, next.after).opening
    expect(gnssDenied(opening.conditions, opening.scenario), 'the night after the jam opened with GNSS fixed').toBe(true)
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === 'pnt-jamming')!
    for (const m of def.effect.meters) {
      if (next.before.meters[m] > 0) expect(opening.meters[m], `the jam did not press ${m} as the night opened`).toBeLessThan(next.before.meters[m])
    }

    // The bonus is not real play any more. The jam is drawn on turns 2 and
    // 3, its condition lasts two turns, and the chain exploits come on
    // turns 5 and 6, so no campaign has GNSS denied when one strikes. The
    // state is built by hand: the passive line on the eve of the final
    // turn, with the jam's condition placed as if it had landed on turn 5.
    const { before: eve } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 6)
    const denial: ActiveCondition = {
      instanceId: 'pnt-jamming-t5',
      eventId: def.id,
      name: def.condition!.name,
      startedTurn: 5,
      remainingTurns: def.condition!.turns,
      baseSeverity: def.baseSeverity,
    }
    const before: GameState = { ...eve, conditions: [...eve.conditions, denial] }
    expect(gnssDenied(eve.conditions, eve.scenario), 'the real eve already has GNSS denied, so this built nothing').toBe(false)
    const after = resolveTurn(before, NO_OP, turnRng(before.seed, before.turn))
    const night = nightOf(before, after)
    expect(gnssDenied(night.opening.conditions, night.opening.scenario)).toBe(true)
    const chain = night.steps.find((s) => s.kind === 'threat' && s.def.id === 'blackout-chain')
    expect(chain, 'the built night has no BLACKOUT CHAIN').toBeDefined()
    expect(chain!.ev.chainBonus).toBe(CHAIN_BONUS)
    // The card's result panel says the chain added a point, and the step
    // takes sensor integrity down.
    expect(resultOf(chain!.ev).chained).toBe(true)
    expect(resultOf(chain!.ev).strength).toBe(chain!.def.baseSeverity + CHAIN_BONUS)
    expect(chain!.after.meters.sensorIntegrity).toBeLessThan(chain!.before.meters.sensorIntegrity)
    // And the night still lands on the engine's budget on the built state.
    expect((night.steps.at(-1)?.after ?? night.opening).credits).toBe(after.history.at(-1)!.ledger.afterNight)
  })

  // RETIRED in v1.3 R3: "a condition expiring yields a condition-cleared
  // beat". The night has no card for a clear: a condition lifts at the
  // close, which tests/engine.spec.ts pins ("leaves a condition with a
  // fixed clock that presses the next night and lifts on time"), and
  // tests/night-model.spec.ts holds the conditions the night closes on to
  // the engine's on every turn of 600 games.

  it('a same-turn purchase expedited by a rideshare enters at its fixed ETA and lands at this close', () => {
    // The rideshare opportunity, resolved later the same turn, can expedite
    // the very entry the orders put in transit. Arrivals are fixed with no
    // slip since v1.3 Round 0 (brief 6.1), so the night opens with the
    // entry at the kind's fixed ETA. A satellite takes two turns, so an
    // expedite the night it is ordered brings it in at this close, which
    // END OF TURN shows from the engine's own state. Search the seed space
    // for the case rather than pin a seed by hand.
    const buySat: Record<number, TurnActions> = { ...LOSS_SCRIPT, 3: { ...NO_OP, buyAssets: [{ kind: 'sat' }] } }
    let expedited = 0
    for (let seed = 1; seed <= 600 && expedited < 3; seed += 1) {
      const { before, after } = turnAt(seed, scripted(buySat), 3)
      const record = after.history[after.history.length - 1].events.find((e) => e.eventId === 'rideshare-slot')
      if (!record || !record.notes.some((n) => n.includes('t3-sat-1 manifested on the rideshare'))) continue
      expedited += 1
      const night = nightOf(before, after)
      expect(night.opening.pipeline.find((p) => p.id === 't3-sat-1')?.etaTurns, `seed ${seed}`).toBe(DEPLOY_TURNS.sat)
      const opp = night.steps.find((s) => s.kind === 'opportunity' && s.def.id === 'rideshare-slot')
      expect(opp, `seed ${seed}: the rideshare has no card`).toBeDefined()
      // Due at this close: END OF TURN shows it on station.
      expect(night.closing).toBe(after)
      expect(after.pipeline.some((p) => p.id === 't3-sat-1')).toBe(false)
      expect(after.assets.some((a) => a.id === 't3-sat-1')).toBe(true)
    }
    expect(expedited, 'no seed exercised a same-turn expedite').toBeGreaterThan(0)
  })

  // MOVED in v1.3 R3: "the deciding turn ends on an outcome beat". The
  // night ends on END OF TURN, whose ending block is rendered over real
  // play in tests/director-view.dom.spec.tsx.
})

// RETIRED in v1.3 R3 with the director (src/director): the residual
// ledger's every-dynamic-field check (MODELED_FIELDS), the determinism
// seed replay of the beats, the beats' ids, cue keys and titles, the silent
// bookkeeping beats, and the whole playback block (tap-through completion,
// waiting for the player, SKIP from any point, and the spend declared per
// beat by chosenCreditsOf). The night has no patches to replay and no SKIP;
// tests/night-model.spec.ts proves it lands on the engine, GUARD R3 (a) in
// tests/night-r3.dom.spec.tsx that it waits for a tap, and the declared
// spend is driven through the night in tests/game.dom.spec.tsx and
// tests/director-view.dom.spec.tsx.
