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
import { DIFFICULTIES, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { coverage, maiScore } from '../src/engine/scoring'
import { LAYERS, type Difficulty, type GameState, type TurnActions } from '../src/engine/types'
import { firstInputWords } from '../src/ui/brief'
import { NO_OP } from './scripts'

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

const DIFFS: Difficulty[] = ['easy', 'standard', 'expert']
const SEEDS = 24

// Four lines a new player might plausibly take through their first turns.
// The point is that the claim is about a NEW PLAYER, not about a fixture:
// if the opening only works for someone who buys the right thing, it does
// not work.
const LINES: [string, (s: GameState) => TurnActions][] = [
  ['does nothing', () => NO_OP],
  ['buys a drone first', (s) => (s.turn === 1 ? { ...NO_OP, buyAssets: [{ kind: 'drone', tier: 'B' }] } : NO_OP)],
  ['buys intel first', (s) => (s.turn === 1 ? { ...NO_OP, buyIntelLevel: true } : NO_OP)],
  [
    'spends surge when it can',
    (s) => (s.surgeTokens > 0 && s.conditions.length > 0 ? { ...NO_OP, spendSurgeOn: s.conditions[0].instanceId } : NO_OP),
  ],
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
const NOT_IN_OPENING = new Set<string>([
  'BLACKOUT CHAIN fires',
  'MAI crosses below the win line',
  'Campaign won',
  'Campaign lost',
])

describe('the opening: the excuses are computed, not granted (Round 7b)', () => {
  it('excuses the chain rows only while the deck scripts them past the opening', () => {
    const chainTurns = DEFAULT_SCENARIO.campaign
      .filter((p) => p.slots.some((s) => s.fixed === 'blackout-chain' || (s.drawFrom ?? []).includes('blackout-chain')))
      .map((p) => p.turn)
    expect(chainTurns.length, 'the deck no longer scripts a BLACKOUT CHAIN at all').toBeGreaterThan(0)
    expect(
      Math.min(...chainTurns) > OPENING_TURNS,
      `BLACKOUT CHAIN is now reachable in the opening (turns ${chainTurns.join(', ')}); it is no longer excused`,
    ).toBe(true)
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

describe('the opening: the turn-1 card tells the truth (Round 7b)', () => {
  it('claims a recovery only on a turn where a meter actually moved', () => {
    // Principle 16's product form, found inside the beat this round is
    // about: the turn-start title interpolated `recovery +N` on every
    // turn, and on turn 1 every meter sits at the cap, so the first card a
    // new player ever saw asserted a change that did not happen and that
    // no cue accompanied.
    let sawFull = false
    let sawHealed = false
    let sawUneven = false
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < 6 && state.status === 'playing'; t += 1) {
          const before = state
          const after = resolveTurn(before, NO_OP, turnRng(before.seed, before.turn))
          const start = deriveBeats(before, after).find((b) => b.kind === 'turn-start')!
          const healed = Object.values(start.patch.meters ?? {}).reduce((n, d) => n + d, 0)
          if (healed > 0) {
            sawHealed = true
            // THE NUMBER, not the label. The first version asserted only
            // `toContain('recovery +')` while holding the true figure in
            // its own hand, so the card could claim any recovery at all as
            // long as some meter moved, and a mutation printing the
            // scenario constant instead of the applied amount slept.
            const deltas = METER_KEYS.map((k) => start.patch.meters?.[k] ?? 0).filter((d) => d > 0)
            const uniform = deltas.every((d) => d === deltas[0])
            const expected = uniform
              ? `recovery +${deltas[0]}`
              : `recovery +${healed} across ${deltas.length} meters`
            expect(
              start.title,
              `turn ${before.turn}: meters moved ${JSON.stringify(deltas)} and the card says "${start.title}"`,
            ).toContain(expected)
            if (!uniform) sawUneven = true
          } else {
            sawFull = true
            expect(start.title, `turn ${before.turn}: nothing healed but the card claims recovery`).not.toContain(
              'recovery +',
            )
            // The POSITIVE half. Without it the clause could be restored to
            // anything, including the ", meters at full" that contradicted
            // the HUD's Posture grid or the ", no damage to recover" that
            // was false whenever an asset was damaged, and nothing failed.
            expect(start.title, `turn ${before.turn}: the card says "${start.title}"`).toContain(
              'Link, Data and Sensor at cap',
            )
          }
          state = after
        }
      }
    }
    // Both branches, asserted separately. As one alternation a branch that
    // never fires reads as covered because the other one did.
    expect(sawFull, 'no turn in the sweep left every meter at the cap').toBe(true)
    expect(sawHealed, 'no turn in the sweep healed a meter').toBe(true)
    // The uneven branch is not reached on the PASSIVE line in 72
    // campaigns, which is why this test alone could not cover it. It is
    // reached in real play on the prepared line, which
    // tests/reading-diet.spec.ts's title sweep found once that sweep was
    // widened past NO_OP, and it is also covered directly below. Recorded
    // as false here so that if the passive line ever reaches it, this says
    // so rather than quietly becoming redundant.
    expect(sawUneven, 'the passive sweep now reaches the uneven branch; fold it into this test').toBe(false)
  })

  it('reports what the clamp allowed, not what the scenario offered', () => {
    // The discriminating case, and the one the sweep almost never reaches:
    // every meter ONE below the cap while the scenario offers two. The
    // uniform branch then prints a number that is not the constant, so a
    // card interpolating `recovery` instead of the applied amount fails
    // here and nowhere else. Without this the guard reads as verified
    // because deltas[0] and recovery agree on almost every real turn.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const offered = DEFAULT_SCENARIO.recovery.base
    expect(offered, 'the scenario now offers 1, so the clamp cannot be observed this way').toBeGreaterThan(1)
    const nearCap: GameState = {
      ...base,
      meters: { linkAvailability: 99, dataIntegrity: 99, sensorIntegrity: 99 },
    }
    const after = resolveTurn(nearCap, NO_OP, turnRng(nearCap.seed, nearCap.turn))
    const start = deriveBeats(nearCap, after).find((b) => b.kind === 'turn-start')!
    const deltas = METER_KEYS.map((k) => start.patch.meters?.[k] ?? 0).filter((d) => d > 0)
    expect(new Set(deltas), 'the three meters did not heal by the same clipped amount').toEqual(new Set([1]))
    expect(start.title, `the card says "${start.title}" while each meter moved 1`).toContain('recovery +1')
    expect(start.title, 'the card reports the amount the scenario offered rather than the amount applied').not.toContain(
      `recovery +${offered}`,
    )
  })

  it('reports a total when two meters heal by different amounts, which real play does not reach', () => {
    // One meter two below the cap and one meter ten below, so a single
    // recovery constant clamps differently on each. Without this the
    // uneven arm of the title is dead code that reads as covered.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const uneven: GameState = {
      ...base,
      meters: { linkAvailability: 99, dataIntegrity: 90, sensorIntegrity: 100 },
    }
    const after = resolveTurn(uneven, NO_OP, turnRng(uneven.seed, uneven.turn))
    const start = deriveBeats(uneven, after).find((b) => b.kind === 'turn-start')!
    const deltas = METER_KEYS.map((k) => start.patch.meters?.[k] ?? 0).filter((d) => d > 0)
    expect(deltas.length, 'the hand-built state did not heal two meters').toBeGreaterThan(1)
    expect(new Set(deltas).size, 'the hand-built state healed them by the same amount').toBeGreaterThan(1)
    const healed = deltas.reduce((n, d) => n + d, 0)
    expect(start.title, `the card says "${start.title}"`).toContain(
      `recovery +${healed} across ${deltas.length} meters`,
    )
  })

  it('tells a player below the coverage minimum that the SLA exists', () => {
    // A new player starts at 44 against a minimum of 60 and loses the
    // bonus every turn until they notice. The title interpolated the SLA
    // only when it was EARNED, so the miss was silent.
    const { slaBonus } = DEFAULT_SCENARIO
    let sawMiss = false
    let sawPaid = false
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        for (let t = 0; t < OPENING_TURNS && state.status === 'playing'; t += 1) {
          const before = state
          const after = resolveTurn(before, NO_OP, turnRng(before.seed, before.turn))
          const start = deriveBeats(before, after).find((b) => b.kind === 'turn-start')!
          const said = [start.title, ...start.lines].join(' ')
          if (coverage(before.assets) >= slaBonus.coverageMin) {
            sawPaid = true
            expect(said, `turn ${before.turn}: SLA earned and not named`).toContain(`SLA +${slaBonus.credits}`)
          } else {
            sawMiss = true
            // THE WHOLE SENTENCE, built from the same three constants the
            // product builds it from. Asserting the digits "60" alone was
            // satisfied by any copy containing that substring, including
            // copy telling the player the opposite of the truth.
            expect(said, `turn ${before.turn}: below the SLA minimum and never told`).toContain(
              `Coverage ${coverage(before.assets)} misses the ${slaBonus.coverageMin} the SLA pays ${slaBonus.credits} at.`,
            )
          }
          state = after
        }
      }
    }
    expect(sawMiss, 'no opening turn sat below the coverage minimum').toBe(true)
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

  it('gives a quiet turn a beat that says what held, not just that nothing came', () => {
    const quiet = (() => {
      const before = newGame(DEFAULT_SCENARIO, 1, 'standard')
      const after = resolveTurn(before, NO_OP, turnRng(before.seed, before.turn))
      return deriveBeats(before, after).find((b) => b.kind === 'quiet')
    })()
    expect(quiet, 'turn 1 no longer produces a quiet beat').toBeDefined()
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
      LAYERS.filter((l) => newGame(DEFAULT_SCENARIO, 1, 'standard').assets.some((a) => a.layer === l && a.integrity > 0)),
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
    const after = resolveTurn(wiped, NO_OP, turnRng(wiped.seed, wiped.turn))
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
    expect(shortest, `shortest opening screen: ${shortest} words at ${at}`).toBe(35)
  })
})
