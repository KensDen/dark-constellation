// Director battery (game-feel brief section 8, Round 2). Proves the
// presentation adapter reproduces the engine exactly (zero-residual ledger
// over real play), that reduced motion selects instant and instant
// completes on the engine's own output, that skip, tap and auto-advance
// all land on the same end state, and that known fixtures produce the
// expected beats. Nothing here touches resolveTurn; the engine is the
// oracle.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  BEAT_DWELL_MS,
  BEAT_KINDS,
  Director,
  VISUAL_MS,
  beatCueMs,
  chosenCreditsOf,
  ID_KEYED_KINDS,
  MODELED_FIELDS,
  applyPatch,
  defaultSpeed,
  deriveBeats,
  resolveCue,
  type Beat,
  type BeatKind,
  type Scheduler,
} from '../src/director'
import { CHAIN_BONUS, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions } from '../src/engine/types'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const WIN_SEED = 20260712
const LOSS_SEED = 4041
const SEEDS = 40
const DIFFICULTIES: Difficulty[] = ['easy', 'standard', 'expert']

type Line = (state: GameState) => TurnActions
const scripted =
  (script: Record<number, TurnActions>): Line =>
  (state) =>
    script[state.turn] ?? NO_OP

// A prepared line that also spends surge authority whenever it can, so the
// surge-clear grain is exercised alongside everything else.
const surgeLine: Line = (state) => {
  const base = WIN_SCRIPT[state.turn] ?? NO_OP
  if (state.surgeTokens > 0 && state.conditions.length > 0) {
    return { ...base, spendSurgeOn: state.conditions[0].instanceId }
  }
  return base
}

const LINES: [string, Line][] = [
  ['prepared', scripted(WIN_SCRIPT)],
  ['mixed', scripted(MIXED_SCRIPT)],
  ['lazy', scripted(LAZY_SCRIPT)],
  ['passive', scripted(LOSS_SCRIPT)],
  ['surge', surgeLine],
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
// reads history and forecast too, and an in-place edit of either would
// corrupt live state with the sweep still green.
const readable = (s: GameState) => ({
  ...modeled(s),
  history: s.history,
  forecast: s.forecast,
  // The scenario is a shared module singleton, so a write there would
  // outlive the call and poison every later game in the process.
  scenario: s.scenario,
})

const replay = (before: GameState, beats: Beat[]) => beats.reduce((s, b) => applyPatch(s, b.patch), before)

const turnAt = (seed: number, line: Line, turn: number): Turn => {
  for (const t of playTurns(seed, line)) if (t.before.turn === turn) return t
  throw new Error(`turn ${turn} not reached`)
}

// A scheduler that records callbacks so a test can fire them by hand.
function fakeScheduler() {
  const pending: { fn: () => void; ms: number }[] = []
  const schedule: Scheduler = (fn, ms) => {
    const entry = { fn, ms }
    pending.push(entry)
    return () => {
      const i = pending.indexOf(entry)
      if (i >= 0) pending.splice(i, 1)
    }
  }
  const fire = () => {
    const next = pending.shift()
    if (!next) return false
    next.fn()
    return true
  }
  return { schedule, fire, pending }
}

const never: Scheduler = () => {
  throw new Error('instant playback must never schedule a timer')
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
      for (const [name, line] of LINES) {
        for (const difficulty of DIFFICULTIES) {
          for (let seed = 1; seed <= SEEDS; seed += 1) {
            for (const { before, after } of playTurns(seed, line, difficulty)) {
              turns += 1
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
      // Every cue namespace is exercised by real play, not by one fixture:
      // the counter namespace in particular only appears when a retrofit
      // lands, which the prepared line reaches part way through a campaign.
      for (const ns of ['beat', 'event', 'condition', 'counter']) {
        expect(namespaces.has(ns), `cue namespace ${ns} never observed in the sweep`).toBe(true)
      }
    },
    LEDGER_SWEEP_TIMEOUT_MS,
  )

  it('models every dynamic field of the engine state, so a new engine field cannot slip past the ledger', () => {
    // Fields the engine owns outright and the director never patches: the
    // static scenario, the seed, the turn counter, status and loss reason,
    // difficulty, the forecast, and the history the record lives in.
    const engineOwned = new Set(['scenario', 'seed', 'turn', 'status', 'lossReason', 'difficulty', 'forecast', 'history'])
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
      buyAssets: state.credits > 35 ? [{ kind: 'rpoSat', tier: 'A' }] : [],
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

  it('pins the content assumption the expedite reconstruction relies on', () => {
    // The rolled ETA of an expedited same-turn purchase is recovered as the
    // after-state ETA plus the expedite; that is exact only while the
    // expedite is one turn (see beats.ts). A retune fails here, not silently.
    for (const ev of DEFAULT_SCENARIO.events) {
      const n = ev.benefit?.expediteTurns
      expect(n === undefined || n === 1, `${ev.id} expediteTurns ${n}`).toBe(true)
    }
  })

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
    for (const { before, after } of playTurns(WIN_SEED, surgeLine)) {
      const beats = deriveBeats(before, after)
      const ids = new Set(beats.map((b) => b.id))
      expect(ids.size).toBe(beats.length)
      for (const b of beats) {
        expect(resolveCue(b.cueKey), `${b.id} cue ${b.cueKey}`).toBeTruthy()
        expect(b.title.length).toBeGreaterThan(0)
        expect(b.title).not.toContain('\u{2014}')
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
    const s = DEFAULT_SCENARIO
    const expected =
      s.countermeasures.find((c) => c.id === 'sensorFusion')!.cost +
      s.countermeasures.find((c) => c.id === 'antiJam')!.cost +
      s.prices.sat +
      s.prices.intelLevels[0]
    expect(buy.patch.credits).toBe(-expected)
    expect(buy.patch.intelLevel).toBe(1)
    expect(buy.patch.countersAdd).toEqual(['antiJam'])
    expect(buy.patch.pendingCountersAdd?.map((p) => p.id)).toEqual(['sensorFusion'])
    expect(buy.patch.pipelineAdd?.map((p) => p.kind)).toEqual(['sat'])
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

  it('the fusion retrofit arrives as a countermeasure beat the turn after purchase', () => {
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 2)
    const beats = deriveBeats(before, after)
    const arrival = beats.find((b) => b.kind === 'deploy-arrived' && b.subjectId === 'sensorFusion')!
    expect(arrival).toBeTruthy()
    expect(arrival.cueKey).toBe('counter:sensorFusion')
    // No engine id or raw enum value reaches a beat title.
    for (const { before, after } of playTurns(WIN_SEED, scripted(WIN_SCRIPT))) {
      for (const b of deriveBeats(before, after)) {
        expect(b.title, `${b.id}: engine id in title`).not.toMatch(/\b(?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+\b/)
        expect(b.title, `${b.id}: raw enum in title`).not.toMatch(/\b(?:rpoSat|groundStation|supplyChain)\b/)
      }
    }
    expect(arrival.patch.countersAdd).toEqual(['sensorFusion'])
  })

  it('turn 6 of the passive line: the jam lands, becomes a condition, and arms the chain', () => {
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 6)
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
    expect(applied.patch.flags?.lidarFallback).toBe(true)
    expect(beats.indexOf(jam)).toBeLessThan(beats.indexOf(applied))
  })

  it('turn 7 of the passive line: the chain is armed entering resolution and the exploit carries the bonus', () => {
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 7)
    const beats = deriveBeats(before, after)
    expect(beats.some((b) => b.kind === 'chain-armed')).toBe(true)
    expect(beats.some((b) => b.kind === 'condition-pressure' && b.subjectId === 'pnt-jamming')).toBe(true)
    const chain = beats.find((b) => b.kind === 'threat' && b.subjectId === 'blackout-chain')!
    expect(chain.severity?.chain).toBe(CHAIN_BONUS)
    expect(chain.patch.meters?.sensorIntegrity).toBeLessThan(0)
  })

  it('a surge spend yields a surge-spent beat that removes the condition and a token', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    const target = state.conditions[0]
    expect(target).toBeTruthy()
    const after = resolveTurn(state, { ...NO_OP, spendSurgeOn: target.instanceId }, turnRng(state.seed, state.turn))
    const beats = deriveBeats(state, after)
    const surge = beats.find((b) => b.kind === 'surge-spent')!
    expect(surge).toBeTruthy()
    expect(surge.subjectId).toBe(target.eventId)
    expect(surge.patch.conditionsRemove).toEqual([target.instanceId])
    expect(surge.patch.surgeTokens).toBe(-1)
    // It did not press this turn, so no pressure beat names it.
    expect(beats.some((b) => b.kind === 'condition-pressure' && b.subjectId === target.eventId)).toBe(false)
    expect(beats.some((b) => b.kind === 'settle')).toBe(false)
  })

  it('a condition expiring yields a condition-cleared beat', () => {
    let state = newGame(DEFAULT_SCENARIO, LOSS_SEED)
    while (state.status === 'playing' && state.turn <= 6) {
      state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
    }
    let cleared: Beat | undefined
    for (let i = 0; i < 4 && state.status === 'playing' && !cleared; i += 1) {
      const next = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      cleared = deriveBeats(state, next).find((b) => b.kind === 'condition-cleared')
      state = next
    }
    expect(cleared).toBeTruthy()
    expect(cleared!.patch.conditionsRemove?.length).toBe(1)
    expect(cleared!.cueKey).toMatch(/^condition:/)
  })

  it('a same-turn purchase expedited by a rideshare keeps its rolled ETA and still reports a certain slip', () => {
    // The engine rolls the ETA at purchase (with a possible slip) and the
    // rideshare opportunity, resolved later the same turn, can expedite that
    // very entry; the after-state then shows the post-expedite ETA. The
    // adapter must recover the rolled value from the engine's note. Search
    // the seed space for the case rather than pin a seed by hand.
    const buySat: Record<number, TurnActions> = { ...LOSS_SCRIPT, 3: { ...NO_OP, buyAssets: [{ kind: 'sat', tier: 'B' }] } }
    let expedited = 0
    let slipped = 0
    for (let seed = 1; seed <= 600 && (expedited < 3 || slipped === 0); seed += 1) {
      const { before, after } = turnAt(seed, scripted(buySat), 3)
      const rideshare = after.history[after.history.length - 1].events.find((e) => e.eventId === 'rideshare-slot')
      if (!rideshare || !rideshare.notes.some((n) => n.includes('t3-sat-1 manifested on the rideshare'))) continue
      expedited += 1
      const beats = deriveBeats(before, after)
      const buy = beats.find((b) => b.kind === 'procurement')!
      const entry = (buy.patch.pipelineAdd ?? []).find((p) => p.id === 't3-sat-1')
      expect(entry).toBeTruthy()
      if (!entry) continue
      const finalEta = after.pipeline.find((p) => p.id === 't3-sat-1')!.etaTurns
      // Rolled ETA is the after-state ETA plus the expedite, and the
      // opportunity beat brings it back down to the engine's value.
      expect(entry.etaTurns).toBe(finalEta + 1)
      const opp = beats.find((b) => b.kind === 'opportunity' && b.subjectId === 'rideshare-slot')!
      expect(opp.patch.pipelineEta).toEqual({ 't3-sat-1': finalEta })
      expect(beats.some((b) => b.kind === 'settle')).toBe(false)
      expect(modeled(replay(before, beats))).toEqual(modeled(after))
      // A rolled ETA above the kind's published maximum means the engine
      // slipped this purchase. There is no beat for it (the roll is folded
      // into the ETA at purchase), but the reconstruction must still
      // recover the pre-expedite value.
      if (entry.etaTurns > 3) slipped += 1
    }
    expect(expedited, 'no seed exercised a same-turn expedite').toBeGreaterThan(0)
    expect(slipped, 'no seed exercised a slipped and expedited purchase').toBeGreaterThan(0)
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

  it('reduced motion selects instant by default, and a stored preference overrides it', () => {
    expect(defaultSpeed(true)).toBe('instant')
    expect(defaultSpeed(false)).toBe('1x')
    expect(defaultSpeed(true, '2x')).toBe('2x')
    expect(defaultSpeed(true, 'garbage')).toBe('instant')
    expect(defaultSpeed(false, null)).toBe('1x')
  })

  it("reduced-motion completion at the director level: instant (the reduced-motion default) completes every turn of a scripted campaign synchronously on the engine's own output", () => {
    for (const { before, after } of playTurns(WIN_SEED, scripted(WIN_SCRIPT))) {
      const beats = deriveBeats(before, after)
      const d = new Director(before, after, beats, { speed: defaultSpeed(true), schedule: never })
      const snap = d.snapshot()
      expect(snap.status).toBe('done')
      expect(snap.presented).toBe(after)
      expect(modeled(snap.presented)).toEqual(modeled(after))
      d.dispose()
    }
  })

  it('the production timer path (default setTimeout scheduler) dwells, cancels on tap, and cleans up on dispose', () => {
    vi.useFakeTimers()
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 7)
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible).length
    const d = new Director(before, after, beats, { speed: '1x' })
    expect(vi.getTimerCount()).toBe(1)
    const first = d.snapshot().index
    vi.advanceTimersByTime(BEAT_DWELL_MS - 1)
    expect(d.snapshot().index).toBe(first)
    vi.advanceTimersByTime(1)
    expect(d.snapshot().index).toBeGreaterThan(first)
    // A tap cancels the armed timer and re-arms: one dwell later, exactly
    // one more beat, not two.
    const beforeTap = d.snapshot().visiblePosition
    d.advance()
    expect(d.snapshot().visiblePosition).toBe(beforeTap + 1)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(BEAT_DWELL_MS)
    expect(d.snapshot().visiblePosition).toBe(beforeTap + 2)
    // Left alone, the timers run the turn to completion on the engine output.
    vi.advanceTimersByTime(BEAT_DWELL_MS * visible)
    expect(d.snapshot().status).toBe('done')
    expect(d.snapshot().presented).toBe(after)
    expect(vi.getTimerCount()).toBe(0)
    // Dispose mid-run leaves nothing armed.
    const d2 = new Director(before, after, beats, { speed: '2x' })
    expect(vi.getTimerCount()).toBe(1)
    d2.dispose()
    expect(vi.getTimerCount()).toBe(0)
    d.dispose()
  })

  it('auto-advance at 1x and 2x dwells per visible beat and ends on the engine output', () => {
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 7)
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible).length
    for (const [speed, dwell] of [
      ['1x', BEAT_DWELL_MS],
      ['2x', BEAT_DWELL_MS / 2],
    ] as const) {
      const clock = fakeScheduler()
      const d = new Director(before, after, beats, { speed, schedule: clock.schedule })
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
      expect(clock.pending[0]?.ms).toBe(dwell)
      let fired = 0
      while (clock.fire()) fired += 1
      expect(fired).toBe(visible)
      const done = d.snapshot()
      expect(done.status).toBe('done')
      expect(done.presented).toBe(after)
      // Beats seen by subscription plus the first, which was applied before
      // subscribing, cover every visible beat exactly once.
      expect(shown + 1).toBe(visible)
      expect(clock.pending.length).toBe(0)
      d.dispose()
    }
  })

  it('never advances a beat before its own cue has played', () => {
    // Speed halves the reading time, not the animation. At 2x the dwell is
    // 600ms while the BLACKOUT CHAIN and the arrival light declare 900ms,
    // so the two signature treatments of Round 3 were being replaced a
    // third of the way from the end. The dwell is a floor now.
    const longest = Math.max(...Object.values(VISUAL_MS))
    expect(longest, 'no treatment is long enough to exercise the floor').toBeGreaterThan(BEAT_DWELL_MS / 2)
    let exercised = 0
    let checked = 0
    for (const seed of [LOSS_SEED, WIN_SEED]) {
      for (const { before, after } of playTurns(seed, scripted(LOSS_SCRIPT))) {
        const beats = deriveBeats(before, after)
        const clock = fakeScheduler()
        const d = new Director(before, after, beats, { speed: '2x', schedule: clock.schedule })
        while (d.snapshot().status === 'playing') {
          const beat = d.snapshot().beat
          if (!beat) break
          const want = Math.max(BEAT_DWELL_MS / 2, beatCueMs(beat))
          checked += 1
          if (beatCueMs(beat) > BEAT_DWELL_MS / 2) exercised += 1
          expect(clock.pending[0]?.ms, `${beat.kind} ${beat.cueKey}`).toBe(want)
          clock.fire()
        }
        d.dispose()
      }
    }
    expect(checked, 'no beats were timed').toBeGreaterThan(20)
    // The floor has to actually bind somewhere, or this proves nothing.
    expect(exercised, 'no beat in the sweep runs a cue longer than the dwell').toBeGreaterThan(0)
  })

  it('declares the spend the player chose, so a buy never reads as damage', () => {
    // The procurement recap is silent by decision, so its credits patch
    // arrives folded into the next visible beat. Without the declaration
    // the HUD sees one negative delta on a beat titled for something else
    // and paints the player's own purchase with the hostile damage cue.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const beats = deriveBeats(before, after)
    const procurement = beats.find((b) => b.kind === 'procurement')
    expect(procurement, 'turn 1 of the prepared line buys nothing').toBeDefined()
    const spend = -(procurement!.patch.credits ?? 0)
    expect(spend).toBeGreaterThan(0)

    const clock = fakeScheduler()
    const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
    let declared = 0
    let shown = d.snapshot().presented.credits
    let worstUnchosen = 0
    while (d.snapshot().status === 'playing') {
      const snap = d.snapshot()
      const delta = snap.presented.credits - shown
      const unchosen = delta + snap.chosenCredits
      // No visible beat of this turn carries real credit damage, so every
      // beat's unchosen change is a gain or nothing. A negative here is
      // the purchase leaking back into the tone.
      worstUnchosen = Math.min(worstUnchosen, unchosen)
      declared += snap.chosenCredits
      shown = snap.presented.credits
      d.advance()
    }
    declared += d.snapshot().chosenCredits
    expect(worstUnchosen, 'a visible beat reads as a credit loss the player did not choose').toBe(0)
    expect(declared, 'the declared spend does not add up to the purchase').toBe(spend)
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
        const clock = fakeScheduler()
        const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
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

  it('drops the dwell floor when the caller says motion is off', () => {
    // The view injects this under reduced motion: with no animation to
    // protect, a floor would only hold the turn open longer.
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 7)
    const beats = deriveBeats(before, after)
    const clock = fakeScheduler()
    const d = new Director(before, after, beats, { speed: '2x', schedule: clock.schedule, cueMs: () => 0 })
    while (d.snapshot().status === 'playing') {
      expect(clock.pending[0]?.ms).toBe(BEAT_DWELL_MS / 2)
      clock.fire()
    }
    d.dispose()
  })

  it('declares only what a skip still has to apply, from any point in the turn', () => {
    // finish() resets the declaration before summing the beats it is about
    // to apply, and deleting that reset left the suite green: a skip taken
    // after the purchase had already been applied still declared it, so a
    // repair bill in the same jump landed neutral instead of hostile. The
    // old skip test only ever skipped from the first beat, which is the
    // one position where the two behaviours agree.
    // Turn 8 of the prepared line, not turn 1: thirteen beats, eleven of
    // them visible, with the purchase third. Turn 1 has three beats, so
    // "from any point in the turn" would have meant two points, both of
    // them before the purchase.
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 8)
    const beats = deriveBeats(before, after)
    expect(beats.length, 'the fixture is too small for this test to mean anything').toBeGreaterThanOrEqual(8)
    expect(beats.findIndex((b) => b.kind === 'procurement'), 'the fixture has no purchase to declare').toBeGreaterThan(0)
    let sawNothingLeft = false
    let sawSomethingLeft = false
    let stopsChecked = 0
    for (let stop = 0; stop <= beats.length; stop += 1) {
      const clock = fakeScheduler()
      const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
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
      stopsChecked += 1
      d.dispose()
    }
    // Both sides of the distinction have to occur, or the test proves
    // nothing: a skip before the purchase owes it, a skip after does not.
    expect(sawSomethingLeft, 'no skip point still owed the purchase').toBe(true)
    expect(sawNothingLeft, 'no skip point had the purchase already applied').toBe(true)
    expect(stopsChecked, 'too few skip points to call this any point in the turn').toBeGreaterThanOrEqual(8)
  })

  it('declares the spend on a skip from the first beat, where every patch lands at once', () => {
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 1)
    const beats = deriveBeats(before, after)
    const spend = -(beats.find((b) => b.kind === 'procurement')!.patch.credits ?? 0)
    const clock = fakeScheduler()
    const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
    d.skip()
    expect(d.snapshot().status).toBe('done')
    // Skip from the first beat: everything after it lands in one jump, and
    // all of the purchase is still in that jump.
    expect(d.snapshot().chosenCredits).toBe(spend)
    d.dispose()
  })

  it('tap-to-advance walks every visible beat and the presented state tracks the ledger', () => {
    const { before, after } = turnAt(WIN_SEED, surgeLine, 7)
    const beats = deriveBeats(before, after)
    const clock = fakeScheduler()
    const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
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
    expect(clock.pending.length).toBe(0)
    d.dispose()
  })

  it('skip at any point ends on the engine output, and switching to instant mid-way does too', () => {
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 6)
    const beats = deriveBeats(before, after)
    const visible = beats.filter((b) => b.visible).length
    for (let stop = 0; stop < visible; stop += 1) {
      const clock = fakeScheduler()
      const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
      for (let i = 0; i < stop; i += 1) d.advance()
      if (stop % 2 === 0) d.skip()
      else d.setSpeed('instant')
      const s = d.snapshot()
      expect(s.status).toBe('done')
      expect(s.presented).toBe(after)
      expect(clock.pending.length).toBe(0)
      d.dispose()
    }
  })

  it('changing speed re-arms the dwell without losing position', () => {
    const { before, after } = turnAt(LOSS_SEED, scripted(LOSS_SCRIPT), 6)
    const beats = deriveBeats(before, after)
    const clock = fakeScheduler()
    const d = new Director(before, after, beats, { speed: '1x', schedule: clock.schedule })
    d.advance()
    const index = d.snapshot().index
    d.setSpeed('2x')
    expect(d.snapshot().index).toBe(index)
    expect(d.snapshot().speed).toBe('2x')
    expect(clock.pending.length).toBe(1)
    expect(clock.pending[0].ms).toBe(BEAT_DWELL_MS / 2)
    d.dispose()
    expect(clock.pending.length).toBe(0)
  })
})
