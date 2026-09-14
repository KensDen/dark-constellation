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

describe('presentation adapter: zero-residual ledger against the engine', () => {
  it('reproduces the after-state of every turn of every line, seed and difficulty with no settle beat', () => {
    const seen = new Set<BeatKind>()
    let turns = 0
    for (const [name, line] of LINES) {
      for (const difficulty of DIFFICULTIES) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before, after } of playTurns(seed, line, difficulty)) {
            turns += 1
            const where = `${name} line, ${difficulty}, seed ${seed}, turn ${before.turn}`
            const untouched = JSON.stringify(modeled(before))
            const beats = deriveBeats(before, after)
            // Derivation never mutates the before-state it reads.
            expect(JSON.stringify(modeled(before)), where).toBe(untouched)
            for (const b of beats) {
              seen.add(b.kind)
              // Deck-keyed beats must resolve through the deck's own ids, not
              // fall back to the generic kind cue.
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
    // Every kind of beat the adapter can emit actually occurred in real
    // play, except the reconciliation beat, which must never be needed.
    const expected = BEAT_KINDS.filter((k) => k !== 'settle')
    for (const kind of expected) expect(seen.has(kind), `beat kind ${kind} never observed in the sweep`).toBe(true)
    expect(seen.has('settle')).toBe(false)
  })

  it('models every dynamic field of the engine state, so a new engine field cannot slip past the ledger', () => {
    // Fields the engine owns outright and the director never patches: the
    // static scenario, the seed, the turn counter, status and loss reason,
    // difficulty, the forecast, and the history the record lives in.
    const engineOwned = new Set(['scenario', 'seed', 'turn', 'status', 'lossReason', 'difficulty', 'forecast', 'history'])
    const dynamic = Object.keys(newGame(DEFAULT_SCENARIO, 1)).filter((k) => !engineOwned.has(k))
    expect(new Set(dynamic)).toEqual(new Set(MODELED_FIELDS))
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
  })

  it('the fusion retrofit arrives as a countermeasure beat the turn after purchase', () => {
    const { before, after } = turnAt(WIN_SEED, scripted(WIN_SCRIPT), 2)
    const beats = deriveBeats(before, after)
    const arrival = beats.find((b) => b.kind === 'deploy-arrived' && b.subjectId === 'sensorFusion')!
    expect(arrival).toBeTruthy()
    expect(arrival.cueKey).toBe('counter:sensorFusion')
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
      if (entry.etaTurns > 3) {
        slipped += 1
        expect(beats.some((b) => b.kind === 'deploy-slipped' && b.subjectId === 't3-sat-1')).toBe(true)
      }
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
