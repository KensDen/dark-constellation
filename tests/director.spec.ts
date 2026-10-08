// Director battery (game-feel brief section 8, Round 2). Proves the
// presentation adapter reproduces the engine exactly (zero-residual ledger
// over real play), that tapping through and skipping both land on the
// engine's own output, that nothing advances without the player (v1.3
// Round 0, brief 5.5), and that known fixtures produce the expected
// beats. Nothing here touches resolveTurn; the engine is the oracle.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  BEAT_KINDS,
  Director,
  chosenCreditsOf,
  ID_KEYED_KINDS,
  MODELED_FIELDS,
  applyPatch,
  deriveBeats,
  resolveCue,
  type Beat,
  type BeatKind,
} from '../src/director'
import { CHAIN_BONUS, DEPLOY_TURNS, gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { ActiveCondition, Difficulty, GameState, TurnActions } from '../src/engine/types'
import { randomLegal } from './policies'
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

const modeled = (s: GameState) => Object.fromEntries(MODELED_FIELDS.map((k) => [k, s[k]]))
// The mutation guard's projection is wider than the ledger's: deriveBeats
// reads history and the defense streak too, and an in-place edit of either
// would corrupt live state with the sweep still green. (The forecast it
// also read left with the intel levels in v1.3 Round 0; the streak's
// learning state and the free-brief clock are the engine-owned fields
// beside it now.)
const readable = (s: GameState) => ({
  ...modeled(s),
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

const replay = (before: GameState, beats: Beat[]) => beats.reduce((s, b) => applyPatch(s, b.patch), before)

const turnAt = (seed: number, line: Line, turn: number): Turn => {
  for (const t of playTurns(seed, line)) if (t.before.turn === turn) return t
  throw new Error(`turn ${turn} not reached`)
}

// The broadest correctness guard on the branch: it is the only thing
// proving the presentation ledger reconciles with the engine across every
// line, difficulty and seed. It ran at about 4,000ms against vitest's
// 5,000ms default, which made it least trustworthy exactly when
// multi-agent verification loaded the machine: 7,560ms and a failing
// suite under eight concurrent workers. The ceiling is raised to seven
// times the idle duration, far enough that only a hang reaches it, and
// the duration itself is reported by the battery rather than gated,
// because a gated number would flake under load for the same reason the
// timeout did (brief v0.9 section 7).
const LEDGER_SWEEP_TIMEOUT_MS = 30_000

describe('presentation adapter: zero-residual ledger against the engine', () => {
  it(
    'reproduces the after-state of every turn of every line, seed and difficulty with no settle beat',
    () => {
      const seen = new Set<BeatKind>()
      const namespaces = new Set<string>()
      let turns = 0
      // Closes the engine ruled insolvent (funding frozen, no healing). The
      // random line is in LINES to reach this grain, and it is not a beat
      // kind, so the every-kind check below cannot see it.
      let insolventCloses = 0
      for (const [name, line] of LINES) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            for (const { before, after } of playTurns(seed, line, difficulty)) {
              turns += 1
              if (after.history[after.history.length - 1].ledger.insolvent) insolventCloses += 1
              const where = `${name} line, ${difficulty}, seed ${seed}, turn ${before.turn}`
              // Derivation reads both states and must mutate neither. The
              // after-state matters most: an adapter that wrote to it would
              // move the target the residual is measured against, so the
              // sweep would come back empty while the ledger was wrong.
              const beforeUntouched = JSON.stringify(readable(before))
              const afterUntouched = JSON.stringify(readable(after))
              const beats = deriveBeats(before, after)
              expect(JSON.stringify(readable(before)), `${where}: before mutated`).toBe(beforeUntouched)
              expect(JSON.stringify(readable(after)), `${where}: after mutated`).toBe(afterUntouched)
              for (const b of beats) {
                seen.add(b.kind)
                // Deck-keyed beats must resolve through the deck's own ids, not
                // fall back to the generic kind cue.
                namespaces.add(b.cueKey.slice(0, b.cueKey.indexOf(':')))
                if (ID_KEYED_KINDS.includes(b.kind)) {
                  expect(b.cueKey, `${where}: ${b.id}`).toMatch(/^(event|condition|counter):/)
                  expect(b.cueKey.slice(b.cueKey.indexOf(':') + 1), `${where}: ${b.id}`).toBe(b.subjectId)
                }
              }
              // The hit's asset (v1.2 R3): each threat beat names the asset
              // its event's engine record names, in order, and moves that
              // asset's integrity and no other's. The board lands the hit on
              // whatever the beat names, so this is the link between the
              // engine's record and the tile. Since v1.3 Round 0 the record
              // names the AIMED tile even when a defense held the hit (so
              // the strike can lock on and flash a shield, brief 5.5), and
              // the tile was HIT only when the record's integrity fell; the
              // beat names the tile only then.
              const events = after.history[after.history.length - 1].events.filter((e) => after.scenario.events.find((d) => d.id === e.eventId)?.kind !== 'opportunity')
              const threatBeats = beats.filter((b) => b.kind === 'threat')
              expect(threatBeats.map((b) => b.subjectId), `${where}: threat beats out of step with the record`).toEqual(events.map((e) => e.eventId))
              threatBeats.forEach((b, i) => {
                const e = events[i]
                const hit = e.integrityBefore !== undefined && e.integrityAfter !== undefined && e.integrityAfter < e.integrityBefore
                expect(b.targetAssetId, `${where}: ${b.id}`).toBe(hit ? e.targetAssetId : undefined)
                expect(Object.keys(b.patch.assetIntegrity ?? {}), `${where}: ${b.id}`).toEqual(b.targetAssetId ? [b.targetAssetId] : [])
              })
              const settle = beats.find((b) => b.kind === 'settle')
              expect(settle, `${where}: residual ${JSON.stringify(settle?.patch)}`).toBeUndefined()
              expect(modeled(replay(before, beats)), where).toEqual(modeled(after))
            }
          }
        }
      }
      expect(turns).toBeGreaterThan(SEEDS * DIFFICULTIES.length * LINES.length * 4)
      // An absolute floor as well as a relative one. The bound above is a
      // formula over the fixture sizes, so cutting SEEDS or LINES cuts the
      // work and the bound together and the sweep still passes, quietly
      // covering a fraction of what it used to. The duration the battery
      // prints would drop with it, and that number is reported rather than
      // gated by policy (brief v0.9 section 7), so this is where a
      // collapse in coverage has to fail.
      expect(turns, 'the ledger sweep now covers far fewer turns than it did').toBeGreaterThanOrEqual(1500)
      // Every kind of beat the adapter can emit actually occurred in real
      // play, except the reconciliation beat, which must never be needed.
      const expected = BEAT_KINDS.filter((k) => k !== 'settle')
      for (const kind of expected) expect(seen.has(kind), `beat kind ${kind} never observed in the sweep`).toBe(true)
      expect(seen.has('settle')).toBe(false)
      // The insolvent close is a grain of the ledger the sweep exists to
      // cover (the fifth line was chosen for it), so a sweep that never
      // reaches one has quietly lost it. Measured today: 66 of the random
      // line's 80 campaigns end insolvent; no scripted line reaches it.
      expect(insolventCloses, 'the sweep never reached an insolvent close').toBeGreaterThan(0)
      // Every cue namespace the adapter emits is exercised by real play,
      // not by one fixture. The counter namespace is no longer one of them:
      // it only ever appeared when a sensor fusion retrofit landed a turn
      // after purchase, and v1.3 Round 0 retired the retrofit delay (a
      // defense is active the night it is ordered, brief 6.1), so beats.ts
      // emits no `counter:` key at all.
      for (const ns of ['beat', 'event', 'condition']) {
        expect(namespaces.has(ns), `cue namespace ${ns} never observed in the sweep`).toBe(true)
      }
    },
    LEDGER_SWEEP_TIMEOUT_MS,
  )

  it('models every dynamic field of the engine state, so a new engine field cannot slip past the ledger', () => {
    // Fields the engine owns outright and the director never patches: the
    // static scenario, the seed, the turn counter, status and loss reason,
    // difficulty, and the history the record lives in. Since v1.3 Round 0
    // also the learning state (the defense streak, its best, points saved,
    // what the player can now say) and the free-brief clock, which the
    // engine shows after the turn rather than beat by beat (src/director/
    // patch.ts, MODELED_FIELDS). The forecast left with the intel levels.
    const engineOwned = new Set([
      'scenario',
      'seed',
      'turn',
      'status',
      'lossReason',
      'difficulty',
      'history',
      'briefFreeThrough',
      'streak',
      'bestStreak',
      'saved',
      'learned',
    ])
    // A fresh game does not carry every key: optional fields such as
    // lossReason only appear once the engine sets them. Union the keys
    // across a new game, several mid-campaign states and both endings, so
    // a field the engine adds lazily still has to be modeled or excluded.
    const keys = new Set<string>()
    const collect = (s: GameState) => Object.keys(s).forEach((k) => keys.add(k))
    collect(newGame(DEFAULT_SCENARIO, 1))
    for (const [, line] of LINES) {
      for (const difficulty of DIFFICULTIES) {
        for (const seed of [1, 2, 3]) {
          for (const { before, after } of playTurns(seed, line, difficulty)) {
            collect(before)
            collect(after)
          }
        }
      }
    }
    // Drive the third loss branch too: a line that spends to the edge of
    // its budget every turn takes repair costs it cannot cover. Collected
    // for its keys either way, so an economy retune that moves the ending
    // does not fail this test for an unrelated reason.
    const spendToTheEdge: Line = (state) => ({
      ...NO_OP,
      buyAssets: state.credits > state.scenario.prices.rpoSat ? [{ kind: 'rpoSat' }] : [],
    })
    const endings = new Set<string>()
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const { before, after } of playTurns(seed, spendToTheEdge)) {
        collect(before)
        collect(after)
        if (after.status !== 'playing') endings.add(after.lossReason ?? after.status)
      }
    }
    // Report what the sweep reached rather than demanding one ending.
    expect(endings.size, 'the spendthrift line never ended a campaign').toBeGreaterThan(0)
    const dynamic = [...keys].filter((k) => !engineOwned.has(k))
    expect(new Set(dynamic)).toEqual(new Set(MODELED_FIELDS))
    // And the exclusions are real fields, not a typo that hides a gap.
    const everyKey = new Set([...keys])
    for (const owned of engineOwned) {
      expect(everyKey.has(owned), `engine-owned field ${owned} is not a GameState key`).toBe(true)
    }
  })

  // RETIRED in v1.3 Round 0: the pin on a one-turn expedite. The adapter
  // recovered a slipped, rolled ETA as the after-state ETA plus the
  // expedite, exact only while the expedite was one turn. Arrivals are
  // fixed with no slip now (brief 6.1): the adapter takes the ordered ETA
  // from DEPLOY_TURNS and applies the expedite with the engine's own
  // formula, so no expedite length is assumed anywhere to pin.

  it('anchors the two determinism seeds', () => {
    for (const [seed, line] of [
      [WIN_SEED, scripted(WIN_SCRIPT)],
      [LOSS_SEED, scripted(LOSS_SCRIPT)],
    ] as const) {
      for (const { before, after } of playTurns(seed, line)) {
        const beats = deriveBeats(before, after)
        expect(beats.some((b) => b.kind === 'settle')).toBe(false)
        expect(modeled(replay(before, beats))).toEqual(modeled(after))
      }
    }
  })

  it('gives every beat a unique id, a resolvable cue key, and a title', () => {
    // Every line on the anchor seed: this walked the surge line, which was
    // the prepared script plus SURGE, until SURGE left in v1.3 Round 0.
    for (const [name, line] of LINES) {
      for (const { before, after } of playTurns(WIN_SEED, line)) {
        const beats = deriveBeats(before, after)
        const ids = new Set(beats.map((b) => b.id))
        expect(ids.size, `${name} line, turn ${before.turn}`).toBe(beats.length)
        for (const b of beats) {
          expect(resolveCue(b.cueKey), `${b.id} cue ${b.cueKey}`).toBeTruthy()
          expect(b.title.length).toBeGreaterThan(0)
          expect(b.title).not.toContain('\u{2014}')
        }
      }
    }
  })

  it('refuses a mismatched before and after', () => {
    const t1 = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const t2 = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 2)
    expect(() => deriveBeats(t1.before, t2.after)).toThrow()
  })
})

describe('beat grain fixtures', () => {
  it('turn 1 of the prepared line: quiet deck, procurement with the exact spend', () => {
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const beats = deriveBeats(before, after)
    expect(beats.map((b) => b.kind)).toContain('quiet')
    const buy = beats.find((b) => b.kind === 'procurement')!
    expect(buy).toBeTruthy()
    // v1.3 Round 0 (brief 5.5): the orders land at EXECUTE, before
    // anything else happens tonight, so the procurement beat comes first.
    expect(beats[0], 'the orders must land before the night opens').toBe(buy)
    // The prepared script's turn 1 (tests/scripts.ts): a drone and both
    // turn-1 primaries. The intel brief is free on turn 1 (D2 a) and the
    // script does not order it, so it costs nothing; the v1.2 intel level
    // this used to buy left with the intel levels.
    const s = DEFAULT_SCENARIO
    const expected =
      s.countermeasures.find((c) => c.id === 'antiJam')!.cost +
      s.countermeasures.find((c) => c.id === 'pntAuth')!.cost +
      s.prices.drone
    expect(buy.patch.credits).toBe(-expected)
    expect(buy.patch.credits).toBe(-after.history[0].ledger.ordered)
    // Both defenses are active the night they are ordered (brief 6.1): no
    // retrofit, so nothing is pending.
    expect(buy.patch.countersAdd).toEqual(['antiJam', 'pntAuth'])
    expect(buy.patch.pipelineAdd).toEqual([{ id: 't1-drone-1', kind: 'drone', etaTurns: DEPLOY_TURNS.drone }])
    expect(buy.lines).toEqual(after.history[0].purchases)
    // Silent by decision (brief v0.5 section 6): the buy already fired its
    // cue in the procurement phase.
    expect(buy.visible, 'the procurement beat must render nothing').toBe(false)
  })

  it('pins exactly which beats are silent bookkeeping', () => {
    // The ledger needs these patches, and the player must not see them.
    // Pinned as a set so adding a beat forces a decision either way.
    const silent = new Set<string>()
    for (const [, line] of LINES) {
      for (let seed = 1; seed <= 10; seed += 1) {
        for (const { before, after } of playTurns(seed, line)) {
          for (const b of deriveBeats(before, after)) if (!b.visible) silent.add(b.kind)
        }
      }
    }
    expect([...silent].sort()).toEqual(['end-of-turn-tick', 'procurement'])
  })

  it('a defense is active the night it is ordered: the orders add it ahead of the move it answers, and no arrival follows', () => {
    // This was the sensor fusion retrofit arriving as a countermeasure
    // beat the turn after purchase. v1.3 Round 0 retired the retrofit delay
    // (brief 6.1: defenses are active from the turn they are ordered), so
    // the grain to pin is the opposite one: the defense lands with the
    // orders, the adversary reads it tonight, and nothing announces it
    // later. The prepared script buys sensor fusion and firmware attestation
    // on turn 4 (tests/scripts.ts).
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 4)
    const beats = deriveBeats(before, after)
    const bought = WIN_SCRIPT[4].buyCounters
    expect(bought).toContain('sensorFusion')
    const buy = beats.find((b) => b.kind === 'procurement')!
    expect(buy).toBeTruthy()
    expect(buy.patch.countersAdd).toEqual(bought)
    // Ahead of every move tonight, and a move one of them answers is met by
    // it already.
    const threats = beats.filter((b) => b.kind === 'threat')
    expect(threats.length).toBeGreaterThan(0)
    for (const t of threats) expect(beats.indexOf(buy), `${t.id} resolved before the orders landed`).toBeLessThan(beats.indexOf(t))
    const answered = threats.filter((t) => DEFAULT_SCENARIO.events.find((e) => e.id === t.subjectId)!.counters.some((c) => bought.includes(c)))
    expect(answered.length, 'no move tonight is one the new defenses answer').toBeGreaterThan(0)
    for (const t of answered) expect(t.severity?.mitigation, `${t.id} was not met by tonight's defense`).toBeGreaterThan(0)
    // No arrival beat announces a defense, tonight or on the next turn.
    const next = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 5)
    for (const b of [...beats, ...deriveBeats(next.before, next.after)]) {
      if (b.kind !== 'deploy-arrived') continue
      expect(bought as string[], `${b.id} announces a defense as an arrival`).not.toContain(b.subjectId)
      expect(b.cueKey).not.toMatch(/^counter:/)
    }
    // No engine id or raw enum value reaches a beat title.
    for (const { before, after } of playTurns(WIN_SEED, scripted(WIN_SCRIPT))) {
      for (const b of deriveBeats(before, after)) {
        expect(b.title, `${b.id}: engine id in title`).not.toMatch(/\b(?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+\b/)
        expect(b.title, `${b.id}: raw enum in title`).not.toMatch(/\b(?:rpoSat|groundStation|supplyChain)\b/)
      }
    }
  })

  // The passive line's first campaign in which the jam lands, found rather
  // than pinned: under the six-turn plan the jam is a drawn candidate on
  // turns 2 and 3 only (src/content/scenarios/firstLight.ts), so which
  // seed draws it moves with the deck stream.
  const jamTurn = (): { seed: number; turn: Turn; next: Turn } => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const turns = [...playTurns(seed, scripted(LOSS_SCRIPT))]
      const i = turns.findIndex((t) => deriveBeats(t.before, t.after).some((b) => b.kind === 'condition-applied' && b.subjectId === 'pnt-jamming'))
      if (i >= 0 && i + 1 < turns.length) return { seed, turn: turns[i], next: turns[i + 1] }
    }
    throw new Error('the passive line never lands the jam in fifty seeds')
  }

  it('the passive line: the jam lands, becomes a condition, and arms the chain', () => {
    // Turn 6 of the passive line in the twelve-turn game. The chain was
    // armed by a lidarFallback flag the condition patch set; v1.3 Round 0
    // removed the flag (brief 6.5): the chain is armed while a GNSS-jamming
    // condition is live, which the presented state itself now says.
    const { before, after } = jamTurn().turn
    const beats = deriveBeats(before, after)
    const jam = beats.find((b) => b.kind === 'threat' && b.subjectId === 'pnt-jamming')!
    expect(jam).toBeTruthy()
    expect(jam.severity?.effective).toBeGreaterThan(0)
    expect(jam.techniques?.[0]?.tag).toMatch(/^SPARTA /)
    expect(jam.patch.meters?.linkAvailability).toBeLessThan(0)
    const applied = beats.find((b) => b.kind === 'condition-applied' && b.subjectId === 'pnt-jamming')!
    expect(applied).toBeTruthy()
    expect(applied.cueKey).toBe('condition:pnt-jamming')
    expect(applied.patch.conditionsAdd?.[0].eventId).toBe('pnt-jamming')
    // A fixed clock, shown exactly (brief 6.5).
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === 'pnt-jamming')!
    expect(applied.patch.conditionsAdd?.[0].remainingTurns).toBe(def.condition!.turns)
    // Armed by this beat and not before it.
    const at = beats.indexOf(applied)
    expect(gnssDenied(replay(before, beats.slice(0, at)).conditions, before.scenario), 'GNSS was denied before the jam landed').toBe(false)
    expect(gnssDenied(replay(before, beats.slice(0, at + 1)).conditions, before.scenario), 'the jam did not arm the chain').toBe(true)
    expect(beats.indexOf(jam)).toBeLessThan(at)
  })

  it('the turn after the jam: the chain is armed entering resolution, and the exploit carries the bonus', () => {
    // Turn 7 of the passive line in the twelve-turn game, where the chain
    // was armed and BLACKOUT CHAIN struck in the same night. The arming is
    // still real play: the jam's condition is live entering the next turn.
    const { next } = jamTurn()
    const armedBeats = deriveBeats(next.before, next.after)
    expect(armedBeats.some((b) => b.kind === 'chain-armed')).toBe(true)
    expect(armedBeats.some((b) => b.kind === 'condition-pressure' && b.subjectId === 'pnt-jamming')).toBe(true)

    // The bonus is not real play any more. The jam is drawn on turns 2 and
    // 3, its condition lasts two turns, and the chain exploits come on
    // turns 5 and 6, so no campaign has GNSS denied when one strikes. The
    // state is built by hand: the passive line on the eve of the final
    // turn, with the jam's condition placed as if it had landed on turn 5.
    const { before: eve } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 6)
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === 'pnt-jamming')!
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
    const beats = deriveBeats(before, after)
    const armed = beats.find((b) => b.kind === 'chain-armed')!
    expect(armed).toBeTruthy()
    expect(beats.some((b) => b.kind === 'condition-pressure' && b.subjectId === 'pnt-jamming')).toBe(true)
    const chain = beats.find((b) => b.kind === 'threat' && b.subjectId === 'blackout-chain')!
    expect(chain).toBeTruthy()
    expect(beats.indexOf(armed)).toBeLessThan(beats.indexOf(chain))
    expect(chain.severity?.chain).toBe(CHAIN_BONUS)
    expect(chain.patch.meters?.sensorIntegrity).toBeLessThan(0)
    // And the ledger still reproduces the engine on the built state.
    expect(beats.some((b) => b.kind === 'settle')).toBe(false)
    expect(modeled(replay(before, beats))).toEqual(modeled(after))
  })

  // RETIRED in v1.3 Round 0: "a surge spend yields a surge-spent beat that
  // removes the condition and a token". SURGE left with D2 (a): there are
  // no surge tokens, no surge action and no surge-spent beat kind.

  it('a condition expiring yields a condition-cleared beat', () => {
    // The clock is fixed and shown since v1.3 Round 0 (brief 6.5): a
    // condition that is not renewed lifts at the close of the turn its
    // clock reaches zero, exactly its turns after it landed. The passive
    // line used to be walked to turn 6 first, past the twelve-turn game's
    // quiet opening; six turns in, the first condition lands on turn 1.
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    let cleared: Beat | undefined
    let beats: Beat[] = []
    let entering: GameState | undefined
    const renewed = new Set<string>()
    while (state.status === 'playing' && !cleared) {
      const next = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      beats = deriveBeats(state, next)
      for (const b of beats) if (b.kind === 'condition-renewed' && b.subjectId) renewed.add(b.subjectId)
      cleared = beats.find((b) => b.kind === 'condition-cleared')
      entering = state
      state = next
    }
    expect(cleared, 'the passive line never cleared a condition').toBeTruthy()
    expect(cleared!.patch.conditionsRemove?.length).toBe(1)
    expect(cleared!.cueKey).toMatch(/^condition:/)
    const instance = entering!.conditions.find((c) => c.instanceId === cleared!.patch.conditionsRemove![0])!
    expect(instance, 'the cleared condition was not live entering the turn').toBeTruthy()
    // The countdown beat takes it to zero before the clear removes it.
    const tick = beats.find((b) => b.kind === 'end-of-turn-tick' && b.patch.conditionsRemaining)
    expect(tick?.patch.conditionsRemaining?.[instance.instanceId]).toBe(0)
    expect(beats.indexOf(tick!), 'the clear came before the clock ran out').toBeLessThan(beats.indexOf(cleared!))
    // Exactly its turns after it landed, when nothing renewed it.
    expect(renewed.has(instance.eventId), 'the fixture renewed the condition, so its exact lift turn proves nothing').toBe(false)
    const def = DEFAULT_SCENARIO.events.find((e) => e.id === instance.eventId)!
    expect(entering!.turn).toBe(instance.startedTurn + def.condition!.turns - 1)
  })

  it('a same-turn purchase expedited by a rideshare enters at its fixed ETA and lands the same night', () => {
    // The rideshare opportunity, resolved later the same turn, can expedite
    // the very entry the orders put in transit; the adapter reads which one
    // from the engine's note. In v1.2 the ETA was rolled at purchase, with
    // a possible slip, and the adapter recovered the rolled value from the
    // after-state; arrivals are fixed with no slip since v1.3 Round 0
    // (brief 6.1), so the entry goes in at the kind's fixed ETA and the
    // slip half of this test has no subject. A satellite takes two turns,
    // so an expedite the night it is ordered brings it in at this close.
    // Search the seed space for the case rather than pin a seed by hand.
    const buySat: Record<number, TurnActions> = { ...LOSS_SCRIPT, 3: { ...NO_OP, buyAssets: [{ kind: 'sat' }] } }
    const rideshare = DEFAULT_SCENARIO.events.find((e) => e.id === 'rideshare-slot')!
    const expedite = rideshare.benefit!.expediteTurns!
    let expedited = 0
    for (let seed = 1; seed <= 600 && expedited < 3; seed += 1) {
      const { before, after } = turnAt(seed, scripted(buySat), 3)
      const record = after.history[after.history.length - 1].events.find((e) => e.eventId === 'rideshare-slot')
      if (!record || !record.notes.some((n) => n.includes('t3-sat-1 manifested on the rideshare'))) continue
      expedited += 1
      const beats = deriveBeats(before, after)
      const buy = beats.find((b) => b.kind === 'procurement')!
      const entry = (buy.patch.pipelineAdd ?? []).find((p) => p.id === 't3-sat-1')
      expect(entry).toBeTruthy()
      if (!entry) continue
      // In transit at the kind's fixed ETA, and the opportunity beat
      // brings it forward by the expedite, as the engine does.
      expect(entry.etaTurns).toBe(DEPLOY_TURNS.sat)
      const opp = beats.find((b) => b.kind === 'opportunity' && b.subjectId === 'rideshare-slot')!
      expect(opp.patch.pipelineEta).toEqual({ 't3-sat-1': Math.max(1, DEPLOY_TURNS.sat - expedite) })
      expect(beats.indexOf(buy)).toBeLessThan(beats.indexOf(opp))
      // Due at this close: it arrives tonight, after the opportunity.
      const arrival = beats.find((b) => b.kind === 'deploy-arrived' && b.subjectId === 't3-sat-1')
      expect(arrival, `seed ${seed}: the expedited satellite did not arrive tonight`).toBeTruthy()
      expect(beats.indexOf(opp)).toBeLessThan(beats.indexOf(arrival!))
      expect(after.pipeline.some((p) => p.id === 't3-sat-1')).toBe(false)
      expect(after.assets.some((a) => a.id === 't3-sat-1')).toBe(true)
      expect(beats.some((b) => b.kind === 'settle')).toBe(false)
      expect(modeled(replay(before, beats))).toEqual(modeled(after))
    }
    expect(expedited, 'no seed exercised a same-turn expedite').toBeGreaterThan(0)
  })

  it('the deciding turn ends on an outcome beat', () => {
    let last: Turn | undefined
    for (const t of playTurns(WIN_SEED, scripted(WIN_SCRIPT))) last = t
    expect(last!.after.status).toBe('won')
    const beats = deriveBeats(last!.before, last!.after)
    expect(beats[beats.length - 1].kind).toBe('outcome')
    expect(beats[beats.length - 1].title).toBe('MISSION ASSURED')
  })
})

describe('director playback', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("tap-through completion: every turn of a campaign plays its whole sequence and lands on the engine's output", () => {
    // Battery addition, brief section 8. This was the reduced-motion
    // completion check, back when reduced motion fed the director a cue
    // length of zero and the sequence ran on timers. Since v1.3 Round 0
    // (brief 5.5) nothing advances on its own and reduced motion no longer
    // reaches the director at all (it only takes the static form of each
    // cue in the view), so the way through a turn short of SKIP is the
    // player tapping, and completion has to be proven by tapping every
    // turn of a campaign to its end rather than by skipping it.
    let played = 0
    for (const { before, after } of playTurns(WIN_SEED, scripted(WIN_SCRIPT))) {
      const beats = deriveBeats(before, after)
      const d = new Director(before, after, beats)
      // It must NOT be done before the sequence has run, or this proves
      // nothing beyond what the skip tests already prove.
      const opening = d.snapshot()
      if (beats.some((b) => b.visible)) {
        expect(opening.status, 'playback skipped the sequence instead of playing it').toBe('playing')
        played += 1
      }
      let guard = 0
      while (d.snapshot().status === 'playing' && guard < 500) {
        guard += 1
        d.advance()
      }
      const snap = d.snapshot()
      expect(snap.status, 'playback never finished').toBe('done')
      expect(modeled(snap.presented), 'tapped-through playback did not land on the engine output').toEqual(
        modeled(after),
      )
      expect(snap.presented, 'playback ended on a copy rather than the engine output itself').toBe(after)
      d.dispose()
    }
    expect(played, 'no turn of the campaign had a sequence to play').toBeGreaterThan(0)
  })

  it('waits for the player: arms no timer, and each tap presents the next visible beat once until the engine output', () => {
    // This was auto-advance at 1x and 2x, with the production timer path
    // beside it. Both retired in v1.3 Round 0 (brief 5.5): a beat stays on
    // screen until the player moves on, so a director that arms any timer,
    // or moves while time passes, is the auto-advance coming back.
    vi.useFakeTimers()
    // Turn 4 of the passive line, the busiest night of that six-turn
    // campaign (two conditions pressing, two moves, two clears); turn 7 of
    // the twelve-turn game it used to be no longer exists.
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 4)
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible).length
    expect(visible, 'the fixture has too few beats to walk').toBeGreaterThanOrEqual(5)
    const d = new Director(before, after, beats)
    let shown = 0
    const seenIds = new Set<string>()
    d.subscribe(() => {
      const s = d.snapshot()
      if (s.beat && !seenIds.has(s.beat.id)) {
        seenIds.add(s.beat.id)
        shown += 1
      }
    })
    const first = d.snapshot()
    expect(first.status).toBe('playing')
    expect(first.beat?.visible).toBe(true)
    expect(first.visiblePosition).toBe(1)
    expect(first.visibleTotal).toBe(visible)
    expect(vi.getTimerCount(), 'playback armed a timer').toBe(0)
    // A minute on the first beat moves nothing.
    vi.advanceTimersByTime(60_000)
    expect(d.snapshot().status).toBe('playing')
    expect(d.snapshot().index, 'the beat moved on without a tap').toBe(first.index)
    expect(shown, 'a beat was presented without a tap').toBe(0)
    let taps = 0
    while (d.snapshot().status === 'playing') {
      d.advance()
      taps += 1
      expect(vi.getTimerCount(), 'a tap armed a timer').toBe(0)
    }
    expect(taps).toBe(visible)
    const done = d.snapshot()
    expect(done.status).toBe('done')
    expect(done.presented).toBe(after)
    // Beats seen by subscription plus the first, which was applied before
    // subscribing, cover every visible beat exactly once.
    expect(shown + 1).toBe(visible)
    d.dispose()
  })

  it('declares the spend the player chose, so a buy never reads as damage', () => {
    // The procurement recap is silent by decision, so its credits patch
    // arrives folded into the next visible beat. Without the declaration
    // the HUD sees one negative delta on a beat titled for something else
    // and paints the player's own purchase with the hostile damage cue.
    //
    // Since v1.3 Round 0 the procurement beat is the first beat of the
    // turn, so the purchase folds into the first visible one. The close
    // also costs real credits now (repairs and upkeep, brief 6.1), folded
    // into a later visible beat: those are not the player's chosen spend
    // and must still read as a loss, so this walks every emit, the final
    // jump to the engine's output included, and holds both halves.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const beats = deriveBeats(before, after)
    const procurement = beats.find((b) => b.kind === 'procurement')
    expect(procurement, 'turn 1 of the prepared line buys nothing').toBeDefined()
    expect(beats[0], 'the orders no longer land first').toBe(procurement)
    const spend = -(procurement!.patch.credits ?? 0)
    expect(spend).toBeGreaterThan(0)
    const ledger = after.history[after.history.length - 1].ledger
    const realCosts = ledger.repairs + ledger.upkeep + ledger.fuel
    expect(realCosts, 'the fixture pays nothing at the close, so the hostile half proves nothing').toBeGreaterThan(0)

    const d = new Director(before, after, beats)
    let declared = 0
    // From the before-state, not from the first emit: the purchase lands
    // on the first emit, and measuring from it would skip the one change
    // this test exists to read.
    let shown = before.credits
    let purchaseEmits = 0
    let unchosenLosses = 0
    for (;;) {
      const snap = d.snapshot()
      const delta = snap.presented.credits - shown
      const unchosen = delta + snap.chosenCredits
      if (snap.chosenCredits > 0) {
        purchaseEmits += 1
        // The beat the purchase folds into carries nothing hostile on this
        // turn, so its unchosen change is nothing. A negative here is the
        // purchase leaking back into the tone.
        expect(unchosen, 'a visible beat reads as a credit loss the player did not choose').toBe(0)
      }
      if (unchosen < 0) unchosenLosses += unchosen
      declared += snap.chosenCredits
      shown = snap.presented.credits
      if (snap.status === 'done') break
      d.advance()
    }
    expect(purchaseEmits, 'no emit declared the purchase').toBe(1)
    expect(declared, 'the declared spend does not add up to the purchase').toBe(spend)
    // Repairs, upkeep and fuel are real costs: none of them is declared,
    // so they read as losses, and nothing else does.
    expect(unchosenLosses, 'the real costs at the close were excused as chosen spend').toBe(-realCosts)
    d.dispose()
  })

  it('declares a spend only where a purchase was folded in, and never for damage', () => {
    // Two mutants this kills that the aggregate check did not: dropping the
    // procurement kind test, which declares every credit fall as chosen and
    // paints real damage neutral; and dropping the per-advance reset, which
    // leaves a stale declaration on later beats and paints damage friendly.
    let emits = 0
    let purchaseFolds = 0
    let realLosses = 0
    for (const seed of [WIN_SEED, LOSS_SEED]) {
      for (const { before, after } of playTurns(seed, scripted(WIN_SCRIPT))) {
        const beats = deriveBeats(before, after)
        const d = new Director(before, after, beats)
        let shown = before.credits
        let cursor = -1
        while (d.snapshot().status === 'playing') {
          const snap = d.snapshot()
          // The beats folded into this emit are the ones since the last.
          const folded = beats.slice(cursor + 1, snap.index + 1)
          cursor = snap.index
          const chosen = folded.reduce((n, b) => n + chosenCreditsOf(b), 0)
          expect(snap.chosenCredits, `turn ${before.turn}: declaration does not match the beats folded in`).toBe(chosen)
          if (chosen === 0) {
            expect(snap.chosenCredits, `turn ${before.turn}: a beat with no purchase declared a spend`).toBe(0)
          } else {
            purchaseFolds += 1
          }
          const unchosen = snap.presented.credits - shown + snap.chosenCredits
          if (unchosen < 0) realLosses += 1
          shown = snap.presented.credits
          emits += 1
          d.advance()
        }
        d.dispose()
      }
    }
    expect(emits, 'no emits were walked').toBeGreaterThan(40)
    expect(purchaseFolds, 'no emit ever folded a purchase').toBeGreaterThan(0)
    // The hostile path has to be exercised too, or a change that paints
    // everything neutral would pass this test.
    expect(realLosses, 'no emit in the sweep is a real credit loss').toBeGreaterThan(0)
  })

  it('keys the declaration on the beat kind, not on the sign of the patch', () => {
    const spend = { kind: 'procurement', patch: { credits: -30 } } as unknown as Beat
    const damage = { kind: 'threat', patch: { credits: -30 } } as unknown as Beat
    const income = { kind: 'procurement', patch: { credits: 12 } } as unknown as Beat
    const nothing = { kind: 'procurement', patch: {} } as unknown as Beat
    expect(chosenCreditsOf(spend)).toBe(30)
    expect(chosenCreditsOf(damage), 'damage must never read as a purchase').toBe(0)
    expect(chosenCreditsOf(income)).toBe(0)
    expect(chosenCreditsOf(nothing)).toBe(0)
  })

  it('declares only what a skip still has to apply, from any point in the turn', () => {
    // finish() resets the declaration before summing the beats it is about
    // to apply, and deleting that reset left the suite green: a skip taken
    // after the purchase had already been applied still declared it, so a
    // repair bill in the same jump landed neutral instead of hostile. The
    // old skip test only ever skipped from the first beat, which is the
    // one position where the two behaviours agree.
    //
    // Turn 3 of the random legal policy (tests/policies.ts) on the anchor
    // seed: fourteen beats, ten of them visible, a purchase, two arrivals,
    // and the insolvent close that ends the campaign. None of the four
    // scripts reaches eight visible beats on a turn it also buys (measured
    // over 200 seeds: the prepared and mixed scripts peak at six, the lazy
    // one at seven), and the twelve-turn game's turn 8 of the prepared
    // line no longer exists.
    const { before, after } = turnAt(WIN_SEED, randomLegal, 3)
    const real = deriveBeats(before, after)
    expect(real.length, 'the fixture is too small for this test to mean anything').toBeGreaterThanOrEqual(8)
    // Since v1.3 Round 0 the purchase is the first beat and invisible, so
    // the first emit has already applied it and no real skip point still
    // owes it: the one way left to declare the purchase wrongly on a skip
    // is the stale declaration the reset exists to clear. The other side
    // of the distinction, a skip that does still owe a purchase, is the
    // director's contract for any beat list, and is driven on a copy built
    // by hand with the purchase behind the turn start, where the v1.2
    // adapter put it.
    expect(real.findIndex((b) => b.kind === 'procurement'), 'the fixture has no purchase, or not first').toBe(0)
    const turnStart = real.findIndex((b) => b.kind === 'turn-start')
    const reordered = [real[turnStart], real[0], ...real.filter((_, i) => i !== 0 && i !== turnStart)]
    let sawNothingLeft = false
    let sawSomethingLeft = false
    let stopsChecked = 0
    for (const beats of [real, reordered]) {
      for (let stop = 0; stop <= beats.length; stop += 1) {
        const d = new Director(before, after, beats)
        for (let step = 0; step < stop && d.snapshot().status === 'playing'; step += 1) d.advance()
        if (d.snapshot().status === 'done') {
          d.dispose()
          continue
        }
        const applied = d.snapshot().index
        d.skip()
        const owed = beats.slice(applied + 1).reduce((n, b) => n + chosenCreditsOf(b), 0)
        expect(d.snapshot().chosenCredits, `skipping after beat ${applied} declares the wrong spend`).toBe(owed)
        if (owed === 0) sawNothingLeft = true
        else sawSomethingLeft = true
        if (beats === real) stopsChecked += 1
        d.dispose()
      }
    }
    // Both sides of the distinction have to occur, or the test proves
    // nothing: a skip before the purchase owes it, a skip after does not.
    expect(sawSomethingLeft, 'no skip point still owed the purchase').toBe(true)
    expect(sawNothingLeft, 'no skip point had the purchase already applied').toBe(true)
    expect(stopsChecked, 'too few skip points to call this any point in the turn').toBeGreaterThanOrEqual(8)
  })

  it('declares the spend on the first beat it shows, so a skip from there owes nothing more', () => {
    // This was "declares the spend on a skip from the first beat, where
    // every patch lands at once": the purchase sat behind the turn start,
    // so a skip from the first beat still owed all of it. Since v1.3 Round
    // 0 the purchase is the first beat and invisible, folded into the first
    // visible one, so the first emit declares it and the skip declares
    // nothing more. Between them, the purchase is declared exactly once.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const beats = deriveBeats(before, after)
    const spend = -(beats.find((b) => b.kind === 'procurement')!.patch.credits ?? 0)
    expect(spend).toBeGreaterThan(0)
    const d = new Director(before, after, beats)
    const first = d.snapshot()
    expect(first.status).toBe('playing')
    expect(first.chosenCredits, 'the first beat shown does not declare the purchase folded into it').toBe(spend)
    expect(first.presented.credits).toBe(before.credits - spend)
    d.skip()
    expect(d.snapshot().status).toBe('done')
    // Skip from the first beat: everything after it lands in one jump, and
    // none of the purchase is left in that jump.
    expect(d.snapshot().chosenCredits, 'the skip declared the purchase a second time').toBe(0)
    expect(d.snapshot().presented).toBe(after)
    d.dispose()
  })

  it('tap-to-advance walks every visible beat and the presented state tracks the ledger', () => {
    // Turn 7 of the surge line until SURGE and the twelve-turn game left in
    // v1.3 Round 0. The random legal policy's turn 3 on the anchor seed is
    // a busy turn with a purchase in it: silent beats at the start, in the
    // middle and at the end, two arrivals and the insolvent outcome.
    const { before, after } = turnAt(WIN_SEED, randomLegal, 3)
    const beats = deriveBeats(before, after)
    const d = new Director(before, after, beats)
    let taps = 0
    while (d.snapshot().status === 'playing') {
      const s = d.snapshot()
      // Presented state equals the ledger replayed up to the shown beat.
      expect(modeled(s.presented)).toEqual(modeled(replay(before, beats.slice(0, s.index + 1))))
      d.advance()
      taps += 1
    }
    expect(taps).toBe(beats.filter((b) => b.visible).length)
    expect(d.snapshot().presented).toBe(after)
    d.dispose()
  })

  it('skip at any point ends on the engine output', () => {
    // Every stop skips now. Half of them used to switch to INSTANT
    // instead, which retired with the speed control in v1.3 Round 0
    // (brief 5.5); SKIP is the one way left to end a turn early.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 6)
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible).length
    for (let stop = 0; stop < visible; stop += 1) {
      const d = new Director(before, after, beats)
      for (let i = 0; i < stop; i += 1) d.advance()
      expect(d.snapshot().status, `stop ${stop}: playback ended before the skip`).toBe('playing')
      d.skip()
      const s = d.snapshot()
      expect(s.status).toBe('done')
      expect(s.presented).toBe(after)
      d.dispose()
    }
  })
})
