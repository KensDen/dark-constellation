// The opening (brief v2.3 Round 7b, principle 16's level above the code).
//
// THE CLAIM THIS FILE ASSERTS: by the end of a new player's third turn the
// game has shown them what it does, and no turn has gone by where nothing
// happened.
//
// Every guard in this pass measured the machinery and none measured the
// experience. The clearest case was the reading diet, which went to the
// trouble of adding a whole line of play to reach the LONGEST copy the
// game can produce and never looked at the shortest. The measured opening
// is what that cost: turn 1 played ONE distinct visual and ONE distinct
// sound in 120 of 120 runs, and both of them were the transmission bar,
// because `turn-start` and `quiet` resolved to the same cue. The whole
// adversary phase of a new player's first turn was the blip the turn had
// opened with, 1,200ms earlier.
//
// RE-POINTED FOR v1.3 Round 3, which retired the v1.1 director and its
// beats (brief 5.5): what a turn presents is now THE NIGHT (src/ui/night),
// the overlay, a strike and a card per event, the intel card on a first
// meeting and END OF TURN. The collector below reads the night's model
// (src/ui/night/nightModel.ts) and the cue registry (src/cues.ts) the way
// the night plays them, and the truth guards further down render the
// night's own cards.
//
// WHY THIS FILE IS NOT THE GUARD OF RECORD. It walks the night's model,
// not a rendered night, and five section 6 rows carry no moment of the
// night at all: they fire from procurement tiles, the meter readout and
// the strip's chips. So this file is BREADTH across seeds, difficulties
// and lines of play, and it says so in its own describe name. What a
// player actually meets on screen is asserted in
// tests/night-r3.dom.spec.tsx, which plays the night in a DOM, and in
// tests/game.dom.spec.tsx.
//
// TWO JOINS THIS FILE REFUSES, both measured wrong before it was written:
//
//   - NEVER the moment alone. `Section6Row.moments` names one moment on
//     two rows: 'strike-hit' carries both "Adversary event lands" and
//     "BLACKOUT CHAIN fires", and 'outcome' both "Campaign won" and
//     "Campaign lost". A membership join therefore scores BLACKOUT CHAIN
//     as met by the first ordinary hit of a first campaign (the v1.1 kinds
//     had the same fault, recorded in brief v2.3 Appendix E, and in
//     scoping the two readings inverted the comparison between design
//     options). This file joins on the row's own (visual, sound) pair,
//     which is the structure that owns what the player sees and hears.
//   - NEVER the rendered CSS class. Every card of the night rises with
//     `dc-card-rise`, so the opportunity, the debris call, its result and
//     the last END OF TURN collapse onto it with every hit card, and three
//     treatments carry no class at all.

import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  CONDITION_CUES,
  MOMENT_CUES,
  SECTION_6_ROWS,
  outcomeSound,
  strikeSound,
  type Moment,
  type Section6Row,
  type SoundCue,
  type VisualCue,
} from '../src/cues'
import { briefFree, candidatesTonight, newGame, orderCost, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { METER_CAP, coverage, maiScore } from '../src/engine/scoring'
import type { AssetKind, Difficulty, GameState, TurnActions } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { shortName } from '../src/ui/board/boardModel'
import { briefCopy, firstInputWords } from '../src/ui/brief'
import { coverageFigure } from '../src/ui/labels'
import { HitCard } from '../src/ui/night/cards'
import { ledgerRows } from '../src/ui/night/closeModel'
import { DebrisCall, DebrisResult, EndOfTurn, OpportunityCard } from '../src/ui/night/closeCards'
import * as nightCopy from '../src/ui/night/nightCopy'
import { defensesFor, nightOf, resultOf, type Night } from '../src/ui/night/nightModel'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, a } from './scripts'

// The window the round is about. Three turns is the point at which a
// player has decided whether the game is any different from the one they
// played before.
export const OPENING_TURNS = 3

// A turn must deliver at least one cue pair that is not the transmission
// bar it opened with. Set at 2 rather than 1 deliberately: 1 is what the
// build produced before Round 7b, on every seed and every difficulty,
// which is a floor that could never fire.
const MIN_CUE_PAIRS_PER_TURN = 2

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

// One thing the night presents: what it is, and its (visual, sound) pair.
interface Presented {
  what: Moment | 'debris-result'
  visual: VisualCue
  sound: SoundCue
}

// What one turn's night presents, in order, with motion on: read off the
// night's model and the cue registry exactly as src/ui/night/Night.tsx,
// cards.tsx and closeCards.tsx play them. `filed` is the device's Dossier
// as the night reads it: a threat met for the first time offers COLLECT
// INTEL CARD, its intel card FILE IT, and once filed it stays filed.
function presentedBy(before: GameState, after: GameState, filed: Set<string>): Presented[] {
  const out: Presented[] = []
  const at = (what: Presented['what'], visual: VisualCue, sound: SoundCue) => out.push({ what, visual, sound })
  const moment = (m: Moment, sound: SoundCue = MOMENT_CUES[m].sound) => at(m, MOMENT_CUES[m].visual, sound)
  // BEGIN TURN n, pressed on the night before, plays the turn-start voice
  // as the TONIGHT card's intro arrives as a transmission. Turn 1 opens
  // from the title, with no BEGIN TURN.
  if (before.turn > 1) moment('turn-start')
  // EXECUTE: the press plays its sweep (src/ui/Game.tsx) as the overlay
  // opens; the overlay's own registry entry is silent for that reason.
  moment('moving', 'execute-sweep')
  for (const step of nightOf(before, after).steps) {
    const { ev } = step
    if (step.kind === 'threat') {
      // The strike lands with the move's own voice, or a block's.
      const landed = ev.effectiveSeverity > 0
      moment(landed ? 'strike-hit' : 'strike-block', strikeSound(ev.eventId, landed))
      // The hit card: a tick per tile, the new condition's own alarm, and
      // a streak's fanfare from the second block in a row.
      const r = resultOf(ev)
      for (let k = 0; k < r.strength; k += 1) moment('result-tiles', k < r.blocked ? 'tick-up' : 'tick-down')
      if (ev.condition) moment('condition', CONDITION_CUES[ev.eventId]?.sound ?? MOMENT_CUES.condition.sound)
      if (r.through === 0 && step.streak >= 2) moment('streak')
    } else if (step.kind === 'debris') {
      // The call arrives quietly; its result rises with a lost
      // satellite's stab or a block's all-clear.
      moment('debris-call')
      at('debris-result', MOMENT_CUES['debris-call'].visual, ev.debris?.lost ? 'hit-stab' : MOMENT_CUES['strike-block'].sound)
    } else moment('opportunity')
    if (step.kind !== 'opportunity' && !filed.has(ev.eventId)) {
      moment('collect')
      moment('file')
      filed.add(ev.eventId)
    }
  }
  if (after.status === 'playing') moment('end-of-turn')
  else moment('outcome', outcomeSound(after.status === 'won'))
  return out
}

interface Collected {
  // One entry per turn, in order.
  perTurn: { turn: number; pairs: Set<CuePair>; rows: Set<string> }[]
  rows: Set<string>
  // Pairs the night presented that match no row at all. REPORTED, never
  // dropped. The `opportunity` beat was exactly this for four brief
  // versions: a visible cue resolving to card-friendly and resolve-chime
  // and belonging to no row, firing in 18 of 120 passive openings. A
  // collector that silently drops the one that exists will drop the next.
  unmatched: Set<string>
}

// Walk the opening of one campaign and record what it presented.
export function collectOpening(
  seed: number,
  difficulty: Difficulty,
  script: Record<number, TurnActions> = {},
  turns = OPENING_TURNS,
  // Injected so the reporting path has a positive control. Deleting the
  // `unmatched.add` below left the orphan report passing on an empty set,
  // which is the vacuous form principle 16 names: the check could not fail.
  index = rowIndex(),
): Collected {
  const out: Collected = { perTurn: [], rows: new Set(), unmatched: new Set() }
  // A new player: nothing filed yet.
  const filed = new Set<string>()
  let state: GameState = newGame(DEFAULT_SCENARIO, seed, difficulty)
  for (let t = 0; t < turns && state.status === 'playing'; t += 1) {
    const before = state
    const after = resolveTurn(before, script[before.turn] ?? NO_OP, turnRng(before.seed, before.turn))
    const pairs = new Set<CuePair>()
    const rows = new Set<string>()
    for (const { what, visual, sound } of presentedBy(before, after, filed)) {
      const pair = pairOf(visual, sound)
      pairs.add(pair)
      const claimed = index.get(pair)
      if (!claimed) {
        out.unmatched.add(`${pair} (${what})`)
        continue
      }
      for (const beatName of claimed) {
        rows.add(beatName)
        out.rows.add(beatName)
      }
    }
    out.perTurn.push({ turn: before.turn, pairs, rows })
    state = after
  }
  return out
}

// EASY and STANDARD since v1.3 Round 0, which retired Expert (brief 5.1).
const DIFFS: Difficulty[] = ['easy', 'standard']
const SEEDS = 24

// A careful new player: order the intel brief on every night it is not
// free, and the primary defense of every move it names, while the budget
// allows. It is how a v1.3 night is held outright (a move with nothing
// through), which the block and the defense streak both need: in v1.2 the
// quiet beat came free on turn 1, which scripted no move at all, and in
// v1.3 it has to be earned (brief 6.2, M2: "a hit lands on turn 1 unless
// the player blocks both").
function defendsEveryNamedMove(s: GameState): TurnActions {
  let actions: TurnActions = { ...NO_OP }
  if (!briefFree(s) && orderCost(s, { ...actions, intelBrief: true }) <= s.credits) actions = { ...actions, intelBrief: true }
  for (const id of candidatesTonight(s)) {
    const primary = s.scenario.events.find((e) => e.id === id)?.counters[0]
    if (!primary || s.counters.includes(primary) || actions.buyCounters.includes(primary)) continue
    const next = { ...actions, buyCounters: [...actions.buyCounters, primary] }
    if (orderCost(s, next) <= s.credits) actions = next
  }
  return actions
}

// Four lines a new player might plausibly take through their first turns.
// The point is that the claim is about a NEW PLAYER, not about a fixture:
// if the opening only works for someone who buys the right thing, it does
// not work.
//
// v1.3 Round 0: the intel levels and SURGE left. "Buys intel first" became
// ordering the intel brief (free on turn 1, 8 CR after), and the surge
// line, whose subject is gone, became the careful player above, the one
// line that can hold a night outright.
const LINES: [string, (s: GameState) => TurnActions][] = [
  ['does nothing', () => NO_OP],
  ['buys a drone first', (s) => (s.turn === 1 ? { ...NO_OP, buyAssets: [{ kind: 'drone' }] } : NO_OP)],
  ['orders the intel brief', () => ({ ...NO_OP, intelBrief: true })],
  ['defends every named move', defendsEveryNamedMove],
]

function scriptFor(line: (s: GameState) => TurnActions, seed: number, difficulty: Difficulty) {
  const script: Record<number, TurnActions> = {}
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
    script[state.turn] = line(state)
    state = resolveTurn(state, script[state.turn], turnRng(state.seed, state.turn))
  }
  return script
}

describe('the opening: breadth across seeds (Round 7b)', () => {
  it('gives every one of the first three turns a cue the turn did not open with', () => {
    // THE ROUND'S HEADLINE ASSERTION. Before Round 7b it was red on every
    // run measured, because turn 1's two visible beats resolved to the
    // same pair. It cannot be satisfied by padding a later turn: more
    // strikes on turn 2 do nothing for turn 1.
    const thin: string[] = []
    for (const [name, line] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const script = scriptFor(line, seed, difficulty)
          for (const turn of collectOpening(seed, difficulty, script).perTurn) {
            if (turn.pairs.size < MIN_CUE_PAIRS_PER_TURN) {
              thin.push(`${name}, turn ${turn.turn}, ${difficulty}, seed ${seed}: ${turn.pairs.size} distinct cue pairs`)
            }
          }
        }
      }
    }
    expect([...new Set(thin)].sort().join('\n')).toBe('')
  })

  it('proves the sweep actually walked the opening, so the floor above is not vacuous', () => {
    // A sweep that stopped producing turns would satisfy every assertion
    // in this file. The positive control is that it walked what it claims
    // to have walked.
    let turns = 0
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        turns += collectOpening(seed, difficulty).perTurn.length
      }
    }
    expect(turns).toBe(OPENING_TURNS * DIFFS.length * SEEDS)
  })

  it('reports every cue pair the night presents that no section 6 row claims', () => {
    // Not "expect none and move on". The failure message has to NAME the
    // orphan, because the last one went unnoticed through four versions of
    // the brief while a coverage test that admits it stayed green.
    const orphans = new Set<string>()
    for (const [, line] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const script = scriptFor(line, seed, difficulty)
          for (const o of collectOpening(seed, difficulty, script).unmatched) orphans.add(o)
        }
      }
    }
    expect([...orphans].sort().join('\n')).toBe('')
  })

  it('meets every cue row the opening is not excused from, by the end of the third turn', () => {
    // The vocabulary claim proper. Derived from SECTION_6_ROWS minus the
    // rows the engine cannot produce in three turns and the rows no moment
    // of the night carries at all, so a row added later is REQUIRED by
    // default rather than quietly omitted.
    const nightRows = SECTION_6_ROWS.filter((r) => r.moments?.length && !r.deferred)
    const required = nightRows.filter((r) => !NOT_IN_OPENING.has(r.beat)).map((r) => r.beat)
    const met = new Set<string>()
    for (const [, line] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const script = scriptFor(line, seed, difficulty)
          for (const row of collectOpening(seed, difficulty, script).rows) met.add(row)
        }
      }
    }
    expect(required.filter((r) => !met.has(r)).sort().join('\n')).toBe('')
  })
})

// The rows the engine itself cannot produce inside three turns. Written
// down here ONLY so that the test below can prove each one against the
// engine: an excuse that stops being true fails the suite rather than
// quietly widening. A hand-written excuse list with nothing checking it
// would be principle 17 for the fourth time in this pass.
//
// 'BLACKOUT CHAIN fires' left this list in v1.3 Round 0, because the test
// that withdraws a lying excuse (below) found it met: GNSS denial live
// entering turn 3 played the director's chain-armed beat, whose pair was
// the row's own. It came back in v1.3 Round 3: the chain-armed beat
// retired with the director, and the row is now the chain's own strike,
// which the deck scripts past the opening (the computed excuse below).
//
// 'The debris call and its result' joined in v1.3 Round 3 with its row:
// the conjunction is turn 4's fixed move (brief 6.2), past the opening.
const NOT_IN_OPENING = new Set<string>([
  'Mission assurance crosses below the win line',
  'BLACKOUT CHAIN fires',
  'Campaign won',
  'Campaign lost',
  'The debris call and its result',
])

describe('the opening: the excuses are computed, not granted (Round 7b)', () => {
  it('excuses the chain row only while nothing in the opening can fire it', () => {
    // Computed from the deck and the registry, so the excuse follows the
    // plan rather than a memory of it. Since v1.3 Round 3 the row plays
    // when a move lands with the row's own voice (strikeSound), which only
    // the chain itself does; GNSS denial shows as the TONIGHT card's chain
    // banner and as the point a hit card says the chain added, and neither
    // is a cue. So the row is reachable in the opening exactly when the
    // deck can draw a move that strikes with that voice inside it.
    const row = SECTION_6_ROWS.find((r) => r.beat === 'BLACKOUT CHAIN fires')!
    const idsOf = (p: (typeof DEFAULT_SCENARIO.campaign)[number]) => p.slots.flatMap((s) => (s.fixed ? [s.fixed] : (s.drawFrom ?? [])))
    const turnsWith = (pred: (id: string) => boolean) => DEFAULT_SCENARIO.campaign.filter((p) => idsOf(p).some(pred)).map((p) => p.turn)
    const chainTurns = turnsWith((id) => strikeSound(id, true) === row.sound)
    expect(chainTurns.length, 'the deck no longer scripts a move that strikes with the chain\'s voice').toBeGreaterThan(0)
    expect(turnsWith((id) => id === 'blackout-chain'), 'the chain\'s voice is no longer the chain\'s').toEqual(chainTurns)
    const reachable = Math.min(...chainTurns) <= OPENING_TURNS
    expect(
      NOT_IN_OPENING.has(row.beat),
      reachable
        ? `the chain row is reachable in the opening (chain on turns ${chainTurns.join(', ')}) and is still excused`
        : 'the chain row is out of the opening\'s reach and is required anyway',
    ).toBe(!reachable)
  })

  it('excuses the mission assurance row only while the score cannot reach the win line in three turns', () => {
    let floor = Infinity
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
          floor = Math.min(floor, maiScore(state))
        }
      }
    }
    expect(
      floor > DEFAULT_SCENARIO.winThreshold,
      `the score reached ${floor} against a win line of ${DEFAULT_SCENARIO.winThreshold} inside the opening; the row is no longer excused`,
    ).toBe(true)
  })

  it('excuses the two outcome rows only while no campaign can end in three turns', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
        }
        expect(state.status, `seed ${seed} on ${difficulty} ended inside the opening`).toBe('playing')
      }
    }
    expect(DEFAULT_SCENARIO.totalTurns).toBeGreaterThan(OPENING_TURNS)
  })

  it('withdraws an excuse the moment the opening produces the row anyway', () => {
    // The direction that was missing, and a mutation found it: adding
    // 'Adversary event lands' to the excuse list made the required set
    // smaller and NOTHING failed. The three tests above prove four named
    // excuses against the engine, but they are hand-written per row, so an
    // excuse added later was granted for free. This one is derived: if the
    // sweep ever meets a row the list excuses, the excuse is a lie.
    const met = new Set<string>()
    for (const [, line] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const script = scriptFor(line, seed, difficulty)
          for (const row of collectOpening(seed, difficulty, script).rows) met.add(row)
        }
      }
    }
    const wrong = [...NOT_IN_OPENING].filter((r) => met.has(r))
    expect(
      wrong.join('\n'),
      'the opening excuses rows it actually produces, so the required set is quietly smaller',
    ).toBe('')
  })

  it('names no excuse for a row that does not exist', () => {
    // The other direction: an excuse for a row nobody renders any more
    // makes the required set quietly smaller.
    const names = new Set(SECTION_6_ROWS.map((r) => r.beat))
    for (const excused of NOT_IN_OPENING) {
      expect(names.has(excused), `the opening excuses "${excused}", which is not a section 6 row`).toBe(true)
    }
  })
})

describe('the opening: the join itself (Round 7b)', () => {
  it('lets every (visual, sound) pair identify exactly one row', () => {
    // The whole reason the join is on the pair rather than on the moment
    // is that the moment is ambiguous. A pair that two rows claim would be
    // ambiguous in the same way, and a mutation that gave every row the
    // threat pair slept through every other test in this file: the
    // cumulative set was satisfied the moment any threat landed.
    //
    // Note the near misses this protects: `resolve-chime` belongs to BOTH
    // "Opportunity lands" and "End of turn", and `data-burst` to both
    // "Turn start, intel incoming" and "COLLECT INTEL CARD". Their VISUALS
    // differ, so the pairs differ, which is precisely why the pair is the
    // join and the sound alone is not.
    const shared: string[] = []
    for (const [pair, rows] of rowIndex()) {
      if (rows.length > 1) shared.push(`${pair} is claimed by ${rows.join(' and ')}`)
    }
    expect(shared.join('\n')).toBe('')
  })

  it('reports an orphan when one exists, which is the collector-s positive control', () => {
    // Run the same opening against an EMPTY index: every pair the night
    // presents is then an orphan, so a collector that reports nothing here
    // cannot report anything anywhere.
    const blind = collectOpening(1, 'standard', {}, OPENING_TURNS, new Map())
    expect(
      blind.unmatched.size,
      'the collector reported no orphan even when no row claimed anything',
    ).toBeGreaterThan(0)
    expect(blind.rows.size, 'the collector credited rows from an empty index').toBe(0)
  })
})

// The orders that hold turn 1 outright: both of its candidates' primary
// defenses (brief 6.2, M2), as the prepared script places them. Read off
// the script rather than spelled, and checked where it is used.
const HOLDS_TURN_1: TurnActions = a({ buyCounters: WIN_SCRIPT[1].buyCounters })

type MeterKey = keyof GameState['meters']
const meterKeys = (s: GameState) => Object.keys(s.meters) as MeterKey[]

// The board the night ends on before the close: the last event's, or the
// opening's on a night with none.
const beforeClose = (night: Night) => night.steps.at(-1)?.after ?? night.opening

// What the player reads on the night's cards, each rendered as the night
// renders it (react-dom/server, since this suite has no DOM) and stripped
// to its words: the hit card for each move, the debris call and its
// result, an opportunity, and END OF TURN. The intel card and the
// dossier's details are the deck's reference text, not the night's, and
// are left out (a hit card is rendered as a first meeting, so its dossier
// row is not drawn). A new player's device: every threat met or named so
// far is known.
const decode = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const pick = (html: string, re: RegExp) => {
  const m = re.exec(html)
  return m ? decode(m[1]) : undefined
}
const noop = () => {}
const signsOf = (before: GameState, after: GameState) => new Map([...callSigns(before), ...callSigns(after)])
function renderNight(before: GameState, after: GameState) {
  const night = nightOf(before, after)
  const record = night.record
  const signs = new Map([...callSigns(before), ...callSigns(after)])
  const known = new Set(after.history.flatMap((r) => [...r.events.map((e) => e.eventId), ...r.named]))
  const lastTurn = record.turn >= after.scenario.totalTurns || after.status !== 'playing'
  const render = (el: ReactElement) => renderToStaticMarkup(el)
  const cards: { kind: string; html: string; eventId?: string }[] = []
  for (const step of night.steps) {
    const props = { step, turn: night.turn, lastTurn, signs, known, first: true, reduced: true, play: noop, onContinue: noop }
    const eventId = step.ev.eventId
    if (step.kind === 'threat') cards.push({ kind: 'hit', eventId, html: render(createElement(HitCard, props)) })
    else if (step.kind === 'debris') {
      cards.push({ kind: 'call', eventId, html: render(createElement(DebrisCall, { step, turn: night.turn, filed: false, reduced: true, onCall: noop })) })
      cards.push({ kind: 'debris', eventId, html: render(createElement(DebrisResult, props)) })
    } else cards.push({ kind: 'opportunity', eventId, html: render(createElement(OpportunityCard, props)) })
  }
  cards.push({ kind: 'end', html: render(createElement(EndOfTurn, { record, state: after, night, reduced: true, play: noop, onNext: noop })) })
  // What the overlay and the move cards say; END OF TURN is checked on its
  // own, since its score lines name the overnight recovery the close made.
  return { night, cards, said: [nightCopy.MOVING, ...cards.filter((c) => c.kind !== 'end').map((c) => decode(c.html))].join(' ') }
}

describe('the opening: the night tells the truth (Round 7b)', () => {
  it('claims no recovery on any card of the night, on turns that healed and turns that did not', () => {
    // Principle 16's product form, found inside the beat Round 7b was
    // about: the turn-start title interpolated `recovery +N` on every
    // turn, and on turn 1 every meter sits at the cap, so the first card a
    // new player ever saw asserted a change that did not happen and that
    // no cue accompanied.
    //
    // RE-READ FOR v1.3 Round 0: recovery left the turn start for the close
    // (brief 5.5 item 6 and 6.1), where the meter readouts count it.
    // RE-POINTED FOR v1.3 Round 3: the turn card retired with the
    // director, and what a turn shows is the night. So the truth it must
    // keep is that nothing in the night raises a meter before the close,
    // that no card claims a recovery, and that the close is where the
    // healing is, on a turn the close healed as much as on one it did not.
    expect(nightCopy.MOVING, 'the overlay EXECUTE opens on').toBe('COLDVEIL IS MOVING')
    let sawFull = false
    let sawHealed = false
    const lines: [string, Record<number, TurnActions>][] = [
      ['passive', LOSS_SCRIPT],
      // The passive line never leaves every meter at the cap: each of its
      // nights lands a move on a meter. The prepared script holds turn 1
      // outright, so its close has nothing to heal.
      ['prepared', WIN_SCRIPT],
    ]
    for (const [name, script] of lines) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const before = state
            const after = resolveTurn(before, script[before.turn] ?? NO_OP, turnRng(before.seed, before.turn))
            const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}`
            const { night, cards, said } = renderNight(before, after)
            // The overlay's board is the opening: tonight's orders landed
            // and the live conditions pressed, which can only lower a meter.
            for (const k of meterKeys(before)) {
              expect(night.opening.meters[k], `${at}: the overlay raises ${k}`).toBeLessThanOrEqual(before.meters[k])
              for (const step of night.steps) {
                expect(step.after.meters[k], `${at}: the ${step.def.id} card raises ${k}`).toBeLessThanOrEqual(step.before.meters[k])
              }
            }
            expect(said, `${at}: a card claims a recovery`).not.toMatch(/recover/i)
            // END OF TURN names the overnight recovery exactly when the
            // close raised the score (fresh-eyes review, v1.3 R3: its score
            // lines make the change checkable), and never otherwise.
            const end = cards.find((c) => c.kind === 'end')!
            const lastScore = night.steps.at(-1)?.scoreAfter ?? maiScore(night.opening)
            const rose = Math.round((night.record.maiScore - lastScore) * 10) / 10 > 0
            expect(end.html.includes('data-score-row="recovery"'), `${at}: END OF TURN's recovery line`).toBe(rose)
            // The POSITIVE half. Without it a card could be restored to
            // anything that avoids the word, including the ", meters at
            // full" that contradicted the HUD's Posture grid in v1.2, and
            // nothing failed. Each move's card opens on its header and
            // carries its watch officer's line; END OF TURN names its turn.
            for (const card of cards) {
              const head = pick(card.html, /<h2 data-card-head="true"[^>]*>([\s\S]*?)<\/h2>/)
              if (card.kind === 'hit') {
                expect(head, `${at}: the card says "${head}"`).toBe(`COLDVEIL MOVES · TURN ${before.turn}`)
                // The officer reports the move, or on a block what held it,
                // naming the tile the move was aimed at (v1.3 R3 fresh-eyes
                // review).
                const step = night.steps.find((x) => x.ev.eventId === card.eventId)!
                const blocked = step.ev.effectiveSeverity === 0 && !!nightCopy.HELD[step.ev.eventId]
                const officer = pick(card.html, /<p data-officer="(?:hit|held)"[^>]*>([\s\S]*?)<\/p>/)
                expect(nightCopy.OFFICER[card.eventId!], `${at}: ${card.eventId} has no watch officer's line`).toBeTruthy()
                const sign = step.ev.targetAssetId ? signsOf(before, after).get(step.ev.targetAssetId) : undefined
                expect(officer, `${at}: the ${card.eventId} card does not carry its watch officer's line`).toBe(
                  `${nightCopy.WATCH_OFFICER}${nightCopy.aimedAt((blocked ? nightCopy.HELD : nightCopy.OFFICER)[card.eventId!], card.eventId!, sign)}`,
                )
              }
              if (card.kind === 'end') expect(head, `${at}: END OF TURN says "${head}"`).toBe(`END OF TURN ${before.turn}`)
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
    expect(sawFull, 'no turn in the sweep left every meter at the cap').toBe(true)
    expect(sawHealed, 'no turn in the sweep healed a meter').toBe(true)
  })

  it('heals by what the clamp allowed, not what the scenario offered, and no card claims either', () => {
    // The discriminating case, and the one the sweep almost never reaches:
    // every meter ONE below the cap while the scenario offers two. A
    // ledger interpolating `recovery` instead of the applied amount fails
    // here and nowhere else.
    //
    // RE-READ FOR v1.3 Round 3: the night's board before the close against
    // the engine's state after it is what the meter readouts count up by,
    // so the difference is the report. Turn 1's two moves are held, so
    // nothing lands on a meter before the close.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const offered = DEFAULT_SCENARIO.recovery.base
    expect(offered, 'the scenario now offers 1, so the clamp cannot be observed this way').toBeGreaterThan(1)
    const nearCap: GameState = {
      ...base,
      meters: { linkAvailability: 99, dataIntegrity: 99, sensorIntegrity: 99 },
    }
    const after = resolveTurn(nearCap, HOLDS_TURN_1, turnRng(nearCap.seed, nearCap.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.map((e) => e.outcome), 'turn 1 was not held outright').toEqual(record.events.map(() => 'held'))
    const { night, said } = renderNight(nearCap, after)
    expect(beforeClose(night).meters, 'the night moved a meter before the close').toEqual(nearCap.meters)
    const deltas = meterKeys(nearCap).map((k) => after.meters[k] - beforeClose(night).meters[k])
    expect(deltas, 'the three meters did not heal by the same clipped amount').toEqual([1, 1, 1])
    expect(after.meters, 'the clamp let a meter past the cap').toEqual({ linkAvailability: METER_CAP, dataIntegrity: METER_CAP, sensorIntegrity: METER_CAP })
    expect(said, 'a card of the night claims a recovery').not.toMatch(/recover/i)
  })

  it('heals two meters by different amounts at the close, each by its own clamp', () => {
    // One meter one below the cap and one meter ten below, so a single
    // recovery constant clamps differently on each. Without this the
    // uneven case is a branch of the clamp that reads as covered.
    //
    // RE-READ FOR v1.3 Round 0: the v1.2 card reported the total "across n
    // meters"; v1.3 reports recovery on no card (see above), so what is
    // held is that each meter moves by its own clamped amount. Unlike
    // v1.2, real play now reaches it, mostly under the IR retainer's 6 (the
    // top-intel line's turn 6 on Standard, seed 1, heals 2, 6 and 6); this
    // is the case at the base recovery, built by hand.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const uneven: GameState = {
      ...base,
      meters: { linkAvailability: 99, dataIntegrity: 90, sensorIntegrity: 100 },
    }
    const after = resolveTurn(uneven, HOLDS_TURN_1, turnRng(uneven.seed, uneven.turn))
    const { night, said } = renderNight(uneven, after)
    const deltas = meterKeys(uneven).map((k) => after.meters[k] - beforeClose(night).meters[k])
    expect(deltas.filter((d) => d > 0).length, 'the hand-built state did not heal two meters').toBeGreaterThan(1)
    expect(new Set(deltas.filter((d) => d > 0)).size, 'the hand-built state healed them by the same amount').toBeGreaterThan(1)
    expect(deltas, 'a meter did not heal by its own clamped amount').toEqual(
      meterKeys(uneven).map((k) => Math.min(METER_CAP - uneven.meters[k], DEFAULT_SCENARIO.recovery.base)),
    )
    expect(said, 'a card of the night claims a recovery').not.toMatch(/recover/i)
  })

  it('tells a player below the coverage minimum that the coverage bonus exists', () => {
    // A new player starts at 58 against a minimum of 60 (44 before v1.3)
    // and loses the bonus every turn until they notice. The title
    // interpolated the bonus (the SLA until v1.3 R2) only when it was
    // EARNED, so the miss was silent. Since v1.3 Round 0 the bonus is paid
    // at the close, after tonight's arrivals; since v1.3 Round 3 the close
    // is END OF TURN, whose Coverage bonus row says what the fleet covered
    // and what the bonus needs, and says missed.
    const { coverageMin, credits } = DEFAULT_SCENARIO.slaBonus
    let sawMiss = false
    let sawPaid = false
    let sawFractional = false
    let sawRoundedDown = false
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          const before = state
          const after = resolveTurn(before, NO_OP, turnRng(before.seed, before.turn))
          const record = after.history[after.history.length - 1]
          const at = `turn ${before.turn}, ${difficulty}, seed ${seed}`
          const bonus = ledgerRows(record, after).find((r) => r.key === 'bonus')
          expect(bonus, `${at}: END OF TURN has no coverage bonus row`).toBeDefined()
          const cov = record.ledger.bonusCoverage
          if (cov >= coverageMin) {
            sawPaid = true
            expect(bonus!.value, `${at}: at the minimum and not paid`).toBe(credits)
            expect(bonus!.word, `${at}: at the minimum and told it missed`).toBeUndefined()
          } else {
            sawMiss = true
            // THE WHOLE LINE, built from the same constants the product
            // builds it from. Asserting the digits "60" alone was satisfied
            // by any copy containing that substring, including copy telling
            // the player the opposite of the truth.
            //
            // THE FIGURE, exactly as the product prints it: coverageFigure,
            // one decimal rounded DOWN (src/ui/labels.ts), the one figure
            // every coverage readout prints. The first pass accepted any
            // figure within a rounding tolerance of the raw coverage, which
            // also accepted 59.96 printed as "60" beside "is under the 60".
            const figure = coverageFigure(cov)
            expect(bonus!.word, `${at}: below the coverage minimum and never told`).toBe(nightCopy.MISSED)
            expect(bonus!.value, `${at}: below the coverage minimum and paid`).toBe(0)
            expect(bonus!.detail, `${at}: coverage ${cov} misreported`).toMatch(
              new RegExp(`^coverage ${String(figure).replace('.', '\\.')}, needs ${coverageMin}\\. (An? [a-z ]+|More than one asset) gets you there\\.$`),
            )
            // On the card as the player reads it.
            const card = renderNight(before, after).cards.find((c) => c.kind === 'end')!
            const row = pick(card.html, /<div data-ledger-row="bonus"[^>]*>([\s\S]*?)<\/div>/)
            expect(row, `${at}: END OF TURN reads "${row}"`).toBe(`${nightCopy.COVERAGE_BONUS} (${bonus!.detail})${nightCopy.MISSED}`)
            // What a player reads, checked without the helper, so a change
            // to coverageFigure itself cannot carry the line with it: a
            // readout (whole, or one decimal), never above the coverage
            // (a figure rounded up can read 60 on a fleet under 60), less
            // than a tenth below it, and so under the minimum the row says
            // it needs.
            const shown = bonus!.detail!.split(/[ ,]/)[1]
            expect(shown, `${at}: coverage ${cov} printed as "${shown}"`).toMatch(/^\d+(\.\d)?$/)
            expect(Number(shown), `${at}: coverage ${cov} printed above itself as "${shown}"`).toBeLessThanOrEqual(cov)
            expect(cov - Number(shown), `${at}: coverage ${cov} printed as "${shown}"`).toBeLessThan(0.1)
            expect(Number(shown), `${at}: "${bonus!.detail}" prints a figure at the minimum it says it needs`).toBeLessThan(coverageMin)
            if (!Number.isInteger(cov)) sawFractional = true
            if (Math.round(cov * 10) / 10 !== figure) sawRoundedDown = true
          }
          state = after
        }
      }
    }
    expect(sawMiss, 'no opening turn closed below the coverage minimum').toBe(true)
    // The exact join is only measured on a coverage the printing changes:
    // a fractional one, and one where rounding to the nearest tenth would
    // print a different figure from rounding down.
    expect(sawFractional, 'no opening miss had a fractional coverage, so the printed figure was never measured').toBe(true)
    expect(sawRoundedDown, 'no opening miss told rounding down from rounding to nearest').toBe(true)
    // The real claim behind the fix, rather than the tautology that stood
    // here first and that oxlint was right to flag: a player who does
    // nothing NEVER earns the coverage bonus inside the opening. That is why the miss
    // has to be legible. If the starting fleet is ever retuned above the
    // minimum, this fails and the copy stops being needed.
    expect(
      sawPaid,
      'a passive player now earns the coverage bonus in the opening, so the miss line has nothing to report',
    ).toBe(false)
  })

  it('never prints 60 on a fleet a hair under the coverage minimum, and prints 60 at it', () => {
    // Built by hand, because no swept opening lands in the band the
    // rounding decides: [59.95, 60), where a figure rounded to the nearest
    // tenth reads "60" (Math.round(59.95 * 10) / 10 is 60) beside "needs
    // 60". The branch is taken on the exact coverage and the figure is
    // rounded down, so both surfaces that print coverage at the bonus line
    // (END OF TURN's coverage bonus row, the turn-start card's successor
    // since v1.3 Round 3, and the brief's posture panel) say 59.9 and the
    // under branch there, and 60 and the clear branch at 60. Turn 1 is
    // held outright and orders no asset, so the close counts exactly the
    // hand-built fleet. The starter fleet covers 58 (5800 hundredths: sats
    // 13, RPO sat 8, drones 9, ground station 6, times integrity); each
    // case adds to it.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const { coverageMin, credits } = DEFAULT_SCENARIO.slaBonus
    const layerOf = (kind: AssetKind) => base.assets.find((x) => x.kind === kind)!.layer
    const rpo = base.assets.find((x) => x.kind === 'rpoSat')!.id
    const fleet = (extra: [AssetKind, number][], rpoIntegrity = 100): GameState => ({
      ...base,
      assets: [
        ...base.assets.map((x) => (x.id === rpo ? { ...x, integrity: rpoIntegrity } : x)),
        // start-<kind>-<n> past the starter six, so procurement does not
        // read them as tonight's orders.
        ...extra.map(([kind, integrity], i) => ({
          id: `start-${kind}-${base.assets.length + i + 1}`,
          kind,
          layer: layerOf(kind),
          integrity,
        })),
      ],
    })
    const cases: { hundredths: number; state: GameState; printed: string; clear: boolean }[] = [
      // 5800 + drone 9 x 15 + ground station 6 x 10
      { hundredths: 5995, state: fleet([['drone', 15], ['groundStation', 10]]), printed: '59.9', clear: false },
      // 5800 - RPO sat 8 x 7 + drone 9 x 28
      { hundredths: 5996, state: fleet([['drone', 28]], 93), printed: '59.9', clear: false },
      // 5800 - RPO sat 8 x 10 + drone 9 x 31
      { hundredths: 5999, state: fleet([['drone', 31]], 90), printed: '59.9', clear: false },
      // 5800 + RPO sat 8 x 25
      { hundredths: 6000, state: fleet([['rpoSat', 25]]), printed: '60', clear: true },
    ]
    for (const { hundredths, state, printed, clear } of cases) {
      const cov = coverage(state.assets)
      const at = `coverage ${hundredths / 100}`
      // The construction, exactly: no float noise either side of the line.
      expect(cov, `${at}: the hand-built fleet covers ${cov}`).toBe(hundredths / 100)
      expect(cov >= coverageMin, `${at}: the case sits on the wrong side of the minimum`).toBe(clear)
      expect(String(coverageFigure(cov)), `${at}: coverageFigure prints ${coverageFigure(cov)}`).toBe(printed)

      const after = resolveTurn(state, HOLDS_TURN_1, turnRng(state.seed, state.turn))
      const record = after.history[after.history.length - 1]
      expect(record.events.map((e) => e.outcome), `${at}: turn 1 was not held outright`).toEqual(record.events.map(() => 'held'))
      expect(record.ledger.bonusCoverage, `${at}: the close did not count the hand-built fleet`).toBe(cov)
      const bonus = ledgerRows(record, after).find((r) => r.key === 'bonus')!
      const card = renderNight(state, after).cards.find((c) => c.kind === 'end')!
      const row = pick(card.html, /<div data-ledger-row="bonus"[^>]*>([\s\S]*?)<\/div>/)
      const posture = briefCopy(state).full.join(' ')
      if (clear) {
        expect(row, `${at}: END OF TURN reads "${row}"`).toBe(`${nightCopy.COVERAGE_BONUS} (coverage ${printed}, needs ${coverageMin})+${credits}`)
        expect(posture, `${at}: the posture panel says "${posture}"`).toContain(
          `Coverage ${printed}, clear of the ${coverageMin} the coverage bonus pays at.`,
        )
        expect(posture, `${at}: the posture panel takes the under branch`).not.toContain(`The coverage bonus pays ${credits} a turn from`)
      } else {
        expect(bonus.word, `${at}: END OF TURN pays a fleet under the minimum`).toBe(nightCopy.MISSED)
        expect(row, `${at}: END OF TURN reads "${row}"`).toMatch(
          new RegExp(`^${nightCopy.COVERAGE_BONUS} \\(coverage ${printed.replace('.', '\\.')}, needs ${coverageMin}\\. .+ gets you there\\.\\)${nightCopy.MISSED}$`),
        )
        expect(posture, `${at}: the posture panel says "${posture}"`).toContain(
          `Coverage ${printed}. The coverage bonus pays ${credits} a turn from ${coverageMin}.`,
        )
        expect(posture, `${at}: the posture panel calls a fleet under the minimum clear of it`).not.toContain('clear of the')
        for (const [surface, text] of [
          ['END OF TURN', row!],
          ['the posture panel', posture],
        ]) {
          expect(text.toLowerCase(), `${at}: ${surface} prints the minimum as the fleet's coverage: "${text}"`).not.toContain(
            `coverage ${coverageMin}`,
          )
        }
      }
    }
  })

  it('gives a turn held outright a card for each move that says what held it, not just that nothing came', () => {
    // v1.3 Round 0: turn 1 scripts a move, so it is quiet only when it is
    // held outright ("nothing reached you", not "nothing came"). Turn 1
    // under the prepared script's orders is that turn.
    //
    // RE-POINTED FOR v1.3 Round 3. The quiet beat, its "n of 3 layers
    // holding" and the layer badges it pulsed retired with the director;
    // the night gives every move its own card instead. WHAT THE CARD
    // REPORTS, joined to the state that owns it: BLOCKED with every point
    // blocked, and a HELD block naming the defense that held the move,
    // which has to be one the player owns tonight, one the move's own
    // counters list, and the one the orders bought for it.
    const before = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const after = resolveTurn(before, HOLDS_TURN_1, turnRng(before.seed, before.turn))
    const record = after.history[after.history.length - 1]
    expect(record.events.length, 'turn 1 scripted no move, so nothing was held').toBeGreaterThan(0)
    expect(record.events.map((e) => e.outcome), 'turn 1 was not held outright').toEqual(record.events.map(() => 'held'))
    const { night, cards } = renderNight(before, after)
    const hits = cards.filter((c) => c.kind === 'hit')
    expect(hits.length, 'a move held outright got no card').toBe(record.events.length)
    for (const step of night.steps) {
      const card = hits.find((c) => c.eventId === step.ev.eventId)!
      const r = resultOf(step.ev)
      expect(pick(card.html, /<b data-verdict="true"[^>]*>([\s\S]*?)<\/b>/), `${step.def.id}: the verdict`).toBe('BLOCKED')
      expect(pick(card.html, /<span data-blocked-of="true"[^>]*>([\s\S]*?)<\/span>/), `${step.def.id}: the tiles`).toBe(
        `${r.strength} of ${r.strength} blocked`,
      )
      const { held } = defensesFor(step.def, step.after.counters, step.after.scenario)
      expect(held, `${step.def.id}: the card names no defense that held it`).toBeDefined()
      expect(after.counters, `${step.def.id}: the card names a defense the player does not own`).toContain(held!.id)
      expect(step.def.counters, `${step.def.id}: the card names a defense that does not answer it`).toContain(held!.id)
      expect(HOLDS_TURN_1.buyCounters, `${step.def.id}: the card names a defense the orders did not buy`).toContain(held!.id)
      // The held block names the defense and what the player can now say;
      // the held line itself is the watch officer's report on a block
      // (v1.3 R3 fresh-eyes review), naming the tile it was aimed at.
      const block = pick(card.html, /<div data-outcome="held"[^>]*>([\s\S]*?)<\/div>/)
      expect(block, `${step.def.id}: the held block says "${block}"`).toBe(`BLOCKED · ${held!.name.toUpperCase()}You can now say it: ${held!.name} blocked ${shortName(step.def)} tonight.`)
      expect(nightCopy.HELD[step.ev.eventId], `${step.def.id}: the block has no held line of its own`).toBeTruthy()
      const sign = step.ev.targetAssetId ? signsOf(night.before, after).get(step.ev.targetAssetId) : undefined
      expect(pick(card.html, /<p data-officer="held"[^>]*>([\s\S]*?)<\/p>/), `${step.def.id}: the officer's report on a block`).toBe(
        `${nightCopy.WATCH_OFFICER}${nightCopy.aimedAt(nightCopy.HELD[step.ev.eventId], step.ev.eventId, sign)}`,
      )
    }
  })
})

describe('the opening: the reading diet has a floor as well as a ceiling (Round 7b)', () => {
  it('measures the shortest screen the game can produce, not only the longest', () => {
    // Recorded as a measurement rather than a bound. Round 3.5 added a
    // whole line of play to reach the LONGEST copy and nobody looked at
    // the shortest, which is how a brief reading "Forecast dark at intel
    // level zero" scored perfectly against a sixty-word budget. The number
    // is here so a change that moves it has to say so.
    //
    // NOT a word floor, and that is the point: the HUD contributes a
    // constant 21 words to every state in the sweep (24 before v1.3 R2;
    // 23 with the streak chip), so a word floor is
    // satisfied by the HUD alone while the brief says nothing. The floors
    // that can fail for the reason they name are in
    // tests/reading-diet.spec.ts, which bounds what the disclosure ADDS.
    let shortest = Infinity
    let at = ''
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          const words = firstInputWords(state)
          if (words < shortest) {
            shortest = words
            at = `turn ${state.turn}, ${difficulty}, seed ${seed}`
          }
          state = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
        }
      }
    }
    // 35 in v1.2, on a turn 1 that scripted no move ("No adversary
    // activity forecast"). 37 since v1.3 Round 0, still on turn 1: the
    // night now has a move, and the free intel brief states its shape
    // ("One of 2 on ORBIT, AIR" over "2 candidates on ORBIT, AIR; RF
    // signature."), 13 words above the HUD's 24. The dark turns after it
    // run longer, because their vector line also says what the brief
    // would add.
    //
    // 100 since v1.3 R2, on turn 3 (Easy, seed 2), a dark night: the new
    // board names every move's vector and layer even unnamed, so the
    // shortest screen is the one with no orders card (turns 1 and 2 carry
    // one) and the brief not bought: the HUD's 21, the intro, two
    // drawn slots of five Unidentified cards with the hidden-names line
    // under each, and the intel row. Turn 1 is no longer the shortest
    // because FIRST ORDERS sits under it.
    expect(shortest, `shortest opening screen: ${shortest} words at ${at}`).toBe(100)
  })
})
