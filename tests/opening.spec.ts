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
// WHY THIS FILE IS NOT THE GUARD OF RECORD. It walks derived beats, and
// five section 6 rows carry no beat kind at all: they fire from
// procurement tiles, the hold control and the meter readout. So this file
// is BREADTH across seeds, difficulties and lines of play, and it says so
// in its own describe name. What a player actually met on screen is
// asserted in tests/game.dom.spec.tsx, which drives three real turns.
//
// TWO JOINS THIS FILE REFUSES, both measured wrong before it was written:
//
//   - NEVER `beat.kind`. `Section6Row.kinds` carries two different
//     relations in one field: on the turn-start row ['turn-start'] it is
//     OR, and on the BLACKOUT CHAIN row ['chain-armed', 'threat'] it is
//     AND. A membership join therefore scores BLACKOUT CHAIN as met by the
//     first ordinary threat of a first campaign, and in scoping the two
//     readings inverted the comparison between design options. The
//     ambiguity is recorded in brief v2.3 Appendix E and is not this
//     round's to fix; this file works around it by joining on the row's
//     own (visual, sound) pair, which is the structure that owns what the
//     player sees and hears.
//   - NEVER the rendered CSS class. `card-hostile`, `card-friendly` and
//     `outcome-sweep` all collapse onto `dc-card-in`, and two treatments
//     carry no class at all.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  CONDITION_CUES,
  SECTION_6_ROWS,
  METER_KEYS,
  deriveBeats,
  soundFor,
  visualFor,
  type Section6Row,
  type SoundCue,
  type VisualCue,
} from '../src/director'
import { DIFFICULTIES, briefFree, candidatesTonight, newGame, orderCost, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { planFor } from '../src/engine/rules'
import { METER_CAP, coverage, maiScore } from '../src/engine/scoring'
import { LAYERS, type AssetKind, type Difficulty, type GameState, type TurnActions } from '../src/engine/types'
import { briefCopy, firstInputWords } from '../src/ui/brief'
import { coverageFigure } from '../src/ui/labels'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, a } from './scripts'

// The window the round is about. Three turns is the point at which a
// player has decided whether the game is any different from the one they
// played before.
export const OPENING_TURNS = 3

// A turn must deliver at least one cue pair that is not the transmission
// bar it opened with. Set at 2 rather than 1 deliberately: 1 is what the
// build produced before this round, on every seed and every difficulty,
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

interface Collected {
  // One entry per turn, in order.
  perTurn: { turn: number; pairs: Set<CuePair>; rows: Set<string> }[]
  rows: Set<string>
  // Pairs a real beat presented that match no row at all. REPORTED, never
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
  let state: GameState = newGame(DEFAULT_SCENARIO, seed, difficulty)
  for (let t = 0; t < turns && state.status === 'playing'; t += 1) {
    const before = state
    const after = resolveTurn(before, script[before.turn] ?? NO_OP, turnRng(before.seed, before.turn))
    const pairs = new Set<CuePair>()
    const rows = new Set<string>()
    for (const beat of deriveBeats(before, after)) {
      if (!beat.visible) continue
      const visual = visualFor(beat.cueKey, beat.kind)
      const sound = soundFor(beat.cueKey, beat.kind, beat.lost ?? false)
      if (!visual || !sound) continue
      const pair = pairOf(visual, sound)
      pairs.add(pair)
      const claimed = index.get(pair)
      if (!claimed) {
        out.unmatched.add(`${pair} (beat kind ${beat.kind})`)
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
// through), which the quiet beat and the defense streak both need: in
// v1.2 the quiet beat came free on turn 1, which scripted no move at all,
// and in v1.3 it has to be earned (brief 6.2, M2: "a hit lands on turn 1
// unless the player blocks both").
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
    // THE ROUND'S HEADLINE ASSERTION. Before this round it was red on
    // every run measured, because turn 1's two visible beats resolved to
    // the same pair. It cannot be satisfied by padding a later turn: more
    // threat beats on turn 2 do nothing for turn 1.
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

  it('reports every cue pair a real beat presents that no section 6 row claims', () => {
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
    // rows the engine cannot produce in three turns and the rows no beat
    // carries at all, so a row added later is REQUIRED by default rather
    // than quietly omitted.
    const beatRows = SECTION_6_ROWS.filter((r) => r.kinds?.length && !r.deferred)
    const required = beatRows.filter((r) => !NOT_IN_OPENING.has(r.beat)).map((r) => r.beat)
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
// that withdraws a lying excuse (below) found it met: the six-turn plan
// makes PNT jamming a turn-2 candidate, and GNSS denial live entering
// turn 3 plays the chain-armed beat, whose pair (blackout, blackout-chain)
// is the row's own. The chain EVENT is still scripted past the opening;
// what the player sees and hears is not.
const NOT_IN_OPENING = new Set<string>([
  'MAI crosses below the win line',
  'Campaign won',
  'Campaign lost',
])

describe('the opening: the excuses are computed, not granted (Round 7b)', () => {
  it('excuses the chain row only while nothing in the opening can arm it or fire it', () => {
    // Computed both ways from the deck, so the excuse follows the plan
    // rather than a memory of it. The chain EVENT fires the row, and so
    // does the chain-armed beat (the same pair), which plays on any turn
    // GNSS denial is live: a jam landing on turn t with a clock of 2 or
    // more is still live on turn t + 1.
    const idsOf = (p: (typeof DEFAULT_SCENARIO.campaign)[number]) => p.slots.flatMap((s) => (s.fixed ? [s.fixed] : (s.drawFrom ?? [])))
    const turnsWith = (pred: (id: string) => boolean) => DEFAULT_SCENARIO.campaign.filter((p) => idsOf(p).some(pred)).map((p) => p.turn)
    const chainTurns = turnsWith((id) => id === 'blackout-chain')
    const armingTurns = turnsWith((id) => {
      const ev = DEFAULT_SCENARIO.events.find((e) => e.id === id)
      return ev?.effect.special === 'jamsGnss' && (ev.condition?.turns ?? 0) >= 2
    })
    expect(chainTurns.length, 'the deck no longer scripts a BLACKOUT CHAIN at all').toBeGreaterThan(0)
    expect(armingTurns.length, 'the deck no longer scripts anything that denies GNSS').toBeGreaterThan(0)
    const reachable = Math.min(...chainTurns) <= OPENING_TURNS || Math.min(...armingTurns) < OPENING_TURNS
    expect(
      NOT_IN_OPENING.has('BLACKOUT CHAIN fires'),
      reachable
        ? `the chain row is reachable in the opening (chain on turns ${chainTurns.join(', ')}, GNSS denial from turns ${armingTurns.join(', ')}) and is still excused`
        : 'the chain row is out of the opening\'s reach and is required anyway',
    ).toBe(!reachable)
  })

  it('excuses the MAI row only while MAI cannot reach the win line in three turns', () => {
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
      `MAI reached ${floor} against a win line of ${DEFAULT_SCENARIO.winThreshold} inside the opening; the row is no longer excused`,
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
    // The whole reason the join is on the pair rather than on `beat.kind`
    // is that the kind is ambiguous. A pair that two rows claim would be
    // ambiguous in the same way, and a mutation that gave every row the
    // threat pair slept through every other test in this file: the
    // cumulative set was satisfied the moment any threat landed.
    //
    // Note the near miss this protects: `resolve-chime` belongs to BOTH
    // "Condition cleared" and "Opportunity lands". Their VISUALS differ, so
    // the pairs differ, which is precisely why the pair is the join and the
    // sound alone is not.
    const shared: string[] = []
    for (const [pair, rows] of rowIndex()) {
      if (rows.length > 1) shared.push(`${pair} is claimed by ${rows.join(' and ')}`)
    }
    expect(shared.join('\n')).toBe('')
  })

  it('reports an orphan when one exists, which is the collector-s positive control', () => {
    // Run the same opening against an EMPTY index: every pair the beats
    // present is then an orphan, so a collector that reports nothing here
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

// The beats of a turn whose patches raise a meter: the recovery, wherever
// the director puts it.
const healingBeats = (beats: ReturnType<typeof deriveBeats>) =>
  beats.filter((b) => METER_KEYS.some((k) => (b.patch.meters?.[k] ?? 0) > 0))

describe('the opening: the turn-1 card tells the truth (Round 7b)', () => {
  it('claims no recovery on the turn card, on turns that healed and turns that did not', () => {
    // Principle 16's product form, found inside the beat this round is
    // about: the turn-start title interpolated `recovery +N` on every
    // turn, and on turn 1 every meter sits at the cap, so the first card a
    // new player ever saw asserted a change that did not happen and that
    // no cue accompanied.
    //
    // RE-READ FOR v1.3 Round 0. Recovery left the turn start for the close
    // (brief 5.5 item 6 and 6.1), where it rides the invisible end-of-turn
    // ticks and the meter readouts count it. The turn card says only
    // "Turn n: COLDVEIL is moving" and the watch officer's line, so the
    // truth it must keep is to claim no recovery at all and to move no
    // meter, on a turn the close healed as much as on one it did not. The
    // v1.2 title's three arms (the uniform figure, the uneven total and
    // "Link, Data and Sensor at cap") went with it.
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
            const beats = deriveBeats(before, after)
            const start = beats.find((b) => b.kind === 'turn-start')!
            const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}`
            const said = [start.title, ...start.lines].join(' ')
            expect(start.patch.meters, `${at}: the turn card moves a meter`).toBeUndefined()
            expect(said, `${at}: the turn card says "${said}"`).not.toMatch(/recover/i)
            // The POSITIVE half. Without it the card could be restored to
            // anything that avoids the word, including the ", meters at
            // full" that contradicted the HUD's Posture grid, and nothing
            // failed.
            expect(start.title, `${at}: the card says "${start.title}"`).toBe(`Turn ${before.turn}: COLDVEIL is moving`)
            expect(start.lines[0], `${at}: the card does not open on the watch officer's line`).toBe(
              planFor(DEFAULT_SCENARIO, before.turn)?.intro,
            )
            // Where the recovery went: the close, which no card presents.
            const healing = healingBeats(beats)
            for (const b of healing) {
              expect(b.kind, `${at}: a ${b.kind} beat heals a meter`).toBe('end-of-turn-tick')
              expect(b.visible, `${at}: the close's recovery reached a card as "${b.title}"`).toBe(false)
            }
            if (healing.length > 0) sawHealed = true
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
    // RE-READ FOR v1.3 Round 0: the clamp is applied at the close, and
    // the patch it builds is what the meter readouts count up by, so the
    // patch is the report. Turn 1's two moves are held, so nothing lands
    // on a meter before the close.
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
    const beats = deriveBeats(nearCap, after)
    const deltas = METER_KEYS.map((k) => healingBeats(beats).reduce((n, b) => n + (b.patch.meters?.[k] ?? 0), 0))
    expect(deltas, 'the three meters did not heal by the same clipped amount').toEqual([1, 1, 1])
    expect(after.meters, 'the clamp let a meter past the cap').toEqual({ linkAvailability: METER_CAP, dataIntegrity: METER_CAP, sensorIntegrity: METER_CAP })
    for (const b of beats.filter((x) => x.visible)) {
      expect([b.title, ...b.lines].join(' '), `the ${b.kind} card claims a recovery`).not.toMatch(/recovery \+/)
    }
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
    const beats = deriveBeats(uneven, after)
    const deltas = METER_KEYS.map((k) => healingBeats(beats).reduce((n, b) => n + (b.patch.meters?.[k] ?? 0), 0))
    expect(deltas.filter((d) => d > 0).length, 'the hand-built state did not heal two meters').toBeGreaterThan(1)
    expect(new Set(deltas.filter((d) => d > 0)).size, 'the hand-built state healed them by the same amount').toBeGreaterThan(1)
    expect(deltas, 'a meter did not heal by its own clamped amount').toEqual(
      METER_KEYS.map((k) => Math.min(METER_CAP - uneven.meters[k], DEFAULT_SCENARIO.recovery.base)),
    )
    for (const b of beats.filter((x) => x.visible)) {
      expect([b.title, ...b.lines].join(' '), `the ${b.kind} card claims a recovery`).not.toMatch(/recovery \+/)
    }
  })

  it('tells a player below the coverage minimum that the SLA exists', () => {
    // A new player starts at 58 against a minimum of 60 (44 before v1.3)
    // and loses the bonus every turn until they notice. The title
    // interpolated the SLA only when it was EARNED, so the miss was
    // silent. Since v1.3 Round 0 the bonus is paid at the close, after
    // tonight's arrivals, and the turn card says nothing when the fleet
    // stands at the minimum; the miss line is the one it owes.
    const { slaBonus } = DEFAULT_SCENARIO
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
          const start = deriveBeats(before, after).find((b) => b.kind === 'turn-start')!
          const said = [start.title, ...start.lines].join(' ')
          const cov = coverage(before.assets)
          const at = `turn ${before.turn}, ${difficulty}, seed ${seed}`
          if (cov >= slaBonus.coverageMin) {
            sawPaid = true
            expect(said, `${at}: at the minimum and told it is under`).not.toContain('is under the')
          } else {
            sawMiss = true
            // THE WHOLE SENTENCE, built from the same three constants the
            // product builds it from. Asserting the digits "60" alone was
            // satisfied by any copy containing that substring, including
            // copy telling the player the opposite of the truth.
            //
            // THE FIGURE, exactly as the product prints it: coverageFigure,
            // one decimal rounded DOWN (src/ui/labels.ts), the one figure
            // every coverage readout prints. The first pass accepted any
            // figure within a rounding tolerance of the raw coverage, which
            // also accepted 59.96 printed as "60" beside "is under the 60".
            const figure = coverageFigure(cov)
            const line = start.lines.find((l) => l.startsWith('Coverage '))
            expect(line, `${at}: below the SLA minimum and never told`).toBeDefined()
            expect(line, `${at}: coverage ${cov} misreported`).toBe(
              `Coverage ${figure} is under the ${slaBonus.coverageMin} the SLA pays ${slaBonus.credits} at.`,
            )
            // What a player reads, checked without the helper, so a change
            // to coverageFigure itself cannot carry the line with it: a
            // readout (whole, or one decimal), never above the coverage
            // (a figure rounded up can read 60 on a fleet under 60), less
            // than a tenth below it, and so under the minimum the sentence
            // says it is under.
            const shown = line!.split(' ')[1]
            expect(shown, `${at}: coverage ${cov} printed as "${shown}"`).toMatch(/^\d+(\.\d)?$/)
            expect(Number(shown), `${at}: coverage ${cov} printed above itself as "${shown}"`).toBeLessThanOrEqual(cov)
            expect(cov - Number(shown), `${at}: coverage ${cov} printed as "${shown}"`).toBeLessThan(0.1)
            expect(Number(shown), `${at}: "${line}" prints a figure at the minimum it says it is under`).toBeLessThan(
              slaBonus.coverageMin,
            )
            if (!Number.isInteger(cov)) sawFractional = true
            if (Math.round(cov * 10) / 10 !== figure) sawRoundedDown = true
          }
          state = after
        }
      }
    }
    expect(sawMiss, 'no opening turn sat below the coverage minimum').toBe(true)
    // The exact join is only measured on a coverage the printing changes:
    // a fractional one, and one where rounding to the nearest tenth would
    // print a different figure from rounding down (56.96 on turn 2 of a
    // passive opening: "57" against "56.9").
    expect(sawFractional, 'no opening miss had a fractional coverage, so the printed figure was never measured').toBe(true)
    expect(sawRoundedDown, 'no opening miss told rounding down from rounding to nearest').toBe(true)
    // The real claim behind the fix, rather than the tautology that stood
    // here first and that oxlint was right to flag: a player who does
    // nothing NEVER earns the SLA inside the opening. That is why the miss
    // has to be legible. If the starting fleet is ever retuned above the
    // minimum, this fails and the copy stops being needed.
    expect(
      sawPaid,
      'a passive player now clears the coverage SLA in the opening, so the miss line has nothing to report',
    ).toBe(false)
  })

  it('never prints 60 on a fleet a hair under the coverage minimum, and prints 60 at it', () => {
    // Built by hand, because no swept opening lands in the band the
    // rounding decides: [59.95, 60), where a figure rounded to the nearest
    // tenth reads "60" (Math.round(59.95 * 10) / 10 is 60) beside "is
    // under the 60". The branch is taken on the exact coverage and the
    // figure is rounded down, so both surfaces that print coverage at the
    // SLA line (the turn-start card and the brief's posture panel) say
    // 59.9 and the under branch there, and 60 and the clear branch at 60.
    // The starter fleet covers 58 (5800 hundredths: sats 13, RPO sat 8,
    // drones 9, ground station 6, times integrity); each case adds to it.
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

      const after = resolveTurn(state, NO_OP, turnRng(state.seed, state.turn))
      const start = deriveBeats(state, after).find((b) => b.kind === 'turn-start')!
      const said = [start.title, ...start.lines].join(' ')
      const posture = briefCopy(state).full.join(' ')
      if (clear) {
        expect(said, `${at}: the turn-start card calls a fleet at the minimum under it`).not.toContain('is under the')
        expect(start.lines.some((l) => l.startsWith('Coverage ')), `${at}: the turn-start card prints a coverage line`).toBe(
          false,
        )
        expect(posture, `${at}: the posture panel says "${posture}"`).toContain(
          `Coverage ${printed}, clear of the ${coverageMin} the SLA pays at.`,
        )
        expect(posture, `${at}: the posture panel takes the under branch`).not.toContain(`The SLA pays ${credits} a turn from`)
      } else {
        expect(start.lines, `${at}: the turn-start card says "${said}"`).toContain(
          `Coverage ${printed} is under the ${coverageMin} the SLA pays ${credits} at.`,
        )
        expect(posture, `${at}: the posture panel says "${posture}"`).toContain(
          `Coverage ${printed}. The SLA pays ${credits} a turn from ${coverageMin}.`,
        )
        expect(posture, `${at}: the posture panel calls a fleet under the minimum clear of it`).not.toContain('clear of the')
        for (const text of [said, posture]) {
          expect(text, `${at}: a surface prints the minimum as the fleet's coverage: "${text}"`).not.toContain(
            `Coverage ${coverageMin}`,
          )
        }
      }
    }
  })

  it('gives a quiet turn a beat that says what held, not just that nothing came', () => {
    // v1.3 Round 0: turn 1 scripts a move, so it is quiet only when it is
    // held outright (the quiet beat is "nothing reached you", not "nothing
    // came"). Turn 1 under the prepared script's orders is that turn.
    const before = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const quiet = (() => {
      const after = resolveTurn(before, HOLDS_TURN_1, turnRng(before.seed, before.turn))
      const record = after.history[after.history.length - 1]
      expect(record.events.length, 'turn 1 scripted no move, so nothing was held').toBeGreaterThan(0)
      expect(record.events.map((e) => e.outcome), 'turn 1 was not held outright').toEqual(record.events.map(() => 'held'))
      return deriveBeats(before, after).find((b) => b.kind === 'quiet')
    })()
    expect(quiet, 'a turn held outright produced no quiet beat').toBeDefined()
    // The layers are what DirectorView pulses, so this is the assertion
    // that the layer-badge vocabulary reaches turn 1 at all.
    expect(quiet!.layers?.length, 'the quiet beat carries no layers, so no badge pulses').toBeGreaterThan(0)
    // WHAT THE TITLE REPORTS, joined to the state that owns it. The first
    // version asserted inequality with one retired string, so the round's
    // central beat could be reduced to "Quiet." and still pass. The count
    // in the sentence and the count of badges that pulse have to agree,
    // and both have to agree with the fleet.
    expect(quiet!.title, `the quiet beat says "${quiet!.title}"`).toContain(
      `${quiet!.layers!.length} of ${LAYERS.length} layers holding`,
    )
    expect(quiet!.layers, 'the badges that pulse are not the layers the title counts').toEqual(
      LAYERS.filter((l) => before.assets.some((a) => a.layer === l && a.integrity > 0)),
    )
  })

  it('counts only the layers that are actually holding, on a fleet with a layer wiped out', () => {
    // The denominator was a literal 3 and the numerator never varied in
    // any campaign the suite reaches, so the sentence was joined to
    // nothing. This builds the state that makes the two halves disagree.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const wiped: GameState = {
      ...base,
      assets: base.assets.map((a) => (a.layer === 'GROUND' ? { ...a, integrity: 0 } : a)),
    }
    // Held outright, so the night is quiet (v1.3 Round 0; see above).
    const after = resolveTurn(wiped, HOLDS_TURN_1, turnRng(wiped.seed, wiped.turn))
    const quiet = deriveBeats(wiped, after).find((b) => b.kind === 'quiet')
    expect(quiet, 'the wiped fleet produced no quiet beat').toBeDefined()
    expect(quiet!.title, `with GROUND down the beat says "${quiet!.title}"`).toContain(
      `2 of ${LAYERS.length} layers holding`,
    )
    expect(quiet!.layers, 'a dead layer still pulses').not.toContain('GROUND')
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
    // constant 24 words to every state in the sweep, so a word floor is
    // satisfied by the HUD alone while the brief says nothing. The floors
    // that can fail for the reason they name are in
    // tests/reading-diet.spec.ts, which bounds what the disclosure ADDS.
    let shortest = Infinity
    let at = ''
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          const words = firstInputWords(state, DIFFICULTIES[difficulty].label)
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
    expect(shortest, `shortest opening screen: ${shortest} words at ${at}`).toBe(37)
  })
})
