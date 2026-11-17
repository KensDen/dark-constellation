// THE DEBRIEF'S READING of a finished game (v1.3 R4, brief 5.6), as pure
// rules over the engine's record: the six stats, why it ended and NEXT
// TIME. The grade, the hits and the strip are src/engine/grade.ts's own;
// nothing here restates them (principle 17), and tests/debrief.spec.ts
// holds every number to the engine's record of real games. The 3D game's
// debrief reads it (src/ui/three/rooms3d.tsx); what only the pixel debrief
// showed (the turn a loss turned on, FILED THIS GAME, what the player can
// now say, the decisions and the grade ladder) left with it in v2.0 R3.
//
// Section 4 applies to every string: no retired word (MAI, credits, buy,
// severity), numerals, no em or en dashes, and no minus sign: a drop is
// written with the hyphen the dash gate allows.

import { bonusOf, gradeOf, gradedScore, hitsTaken, type Grade } from '../engine/grade'
import { kindLabel, newGame, resolveTurn } from '../engine/reducer'
import { turnRng } from '../engine/rng'
import type { CountermeasureId, GameState, TurnActions } from '../engine/types'
import { worstCase } from '../engine/worstCase'
import { shortName } from './board/boardModel'

const one = (n: number) => Math.round(n * 10) / 10

export const threatName = (state: GameState, id: string) => {
  const def = state.scenario.events.find((e) => e.id === id)
  return def ? shortName(def) : id
}
const defenseOf = (state: GameState, id: string) => state.scenario.countermeasures.find((c) => c.id === id)
const isThreat = (state: GameState, id: string) => (state.scenario.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat'

// THE SIX STATS (brief 5.6), in the brief's order.
export interface DebriefStat {
  label: string
  value: number
  decimals: number
  // The unit beside the number, when it has one.
  unit?: string
}

// MOVES BLOCKED: threats the engine recorded as held, nothing through.
// COLDVEIL's moves only (R6 question 7): a debris conjunction that missed
// is luck, not a block, and an opportunity is not a move.
const isMove = (state: GameState, id: string) => isThreat(state, id) && state.scenario.events.find((e) => e.id === id)?.effect.special !== 'debrisStrike'
export const movesBlocked = (state: GameState): number =>
  state.history.reduce((n, rec) => n + rec.events.filter((ev) => ev.outcome === 'held' && isMove(state, ev.eventId)).length, 0)

export function debriefStats(state: GameState): DebriefStat[] {
  const last = state.history[state.history.length - 1]
  return [
    { label: 'HITS TAKEN', value: hitsTaken(state), decimals: 0 },
    { label: 'MOVES BLOCKED', value: movesBlocked(state), decimals: 0 },
    // BEST STREAK, not BEST DEFENSE STREAK (R6 question 13 asked for it if
    // it fit): the longer label wraps its tile and pushes the first screen
    // past 375x667.
    { label: 'BEST STREAK', value: state.bestStreak, decimals: 0 },
    { label: 'BUDGET LEFT', value: last?.creditsAfter ?? state.credits, decimals: 0, unit: 'CR' },
    // Owned at the end, the incident response retainer among them.
    { label: 'DEFENSES KEPT', value: state.counters.length, decimals: 0 },
    { label: 'POINTS SAVED', value: one(state.saved), decimals: 1 },
  ]
}

// THE GRADE BLOCK: the letter, MISSION HELD or LOST, why it ended, the
// final score against the win line, the bonus a win is graded with.
export interface GradeBlock {
  grade: Grade
  won: boolean
  head: 'MISSION HELD' | 'MISSION LOST'
  reason: string
  final: number
  needed: number
  // On a win with a bonus: the bonus and the score it was graded on.
  bonus: { bonus: number; graded: number } | null
}

export function gradeBlock(state: GameState): GradeBlock {
  const last = state.history[state.history.length - 1]
  const n = state.history.length
  const won = state.status === 'won'
  const final = last?.maiScore ?? 0
  const bonus = bonusOf(state)
  const reason = won
    ? `The architecture held through turn ${n}.`
    : state.lossReason === 'insolvency'
      ? `The budget ran out on turn ${n}.`
      : state.lossReason === 'maiCollapse'
        ? `Mission assurance collapsed below ${state.scenario.collapseThreshold} on turn ${n}.`
        : `Turn ${n} ended below the win line.`
  return {
    grade: gradeOf(state),
    won,
    head: won ? 'MISSION HELD' : 'MISSION LOST',
    reason,
    final,
    needed: state.scenario.winThreshold,
    bonus: won && bonus > 0 ? { bonus, graded: gradedScore(final, bonus) } : null,
  }
}

// NEXT TIME (M14): one defense this game missed, ordered earlier, and what
// that does to this game, measured rather than claimed. Since v1.4 an
// order of purchases (one new defense a turn): it goes on a turn up to the
// first it was needed on, and the defense ordered then moves to the next
// turn with none (or drops out).
//
// v1.5 R1 (R6b's fresh eyes, item 2, and the round's re-review): a block
// is not a pure gain, since COLDVEIL takes the move left open, so the game
// is played again from its seed with that one change and every other
// order as the record has them, and the line says the score it ends on.
// Of the defenses missed, the one whose move ends the game highest; none
// that ends it higher is said too.
export type NextTime =
  | {
      kind: 'earlier'
      defense: string
      price: number
      // The turn it was ordered on, too late, when it was.
      procured: number | null
      orderOn: number
      // The defense ordered on that turn, and where it moves (null: out).
      ahead: string | null
      aheadTo: number | null
      // The record's final score, and the replay's.
      was: number
      final: number
      won: boolean
    }
  // A RESPONSE (v1.7 R1): one move this game let through, answered in the
  // night instead, every order the same; said when it ends the game
  // higher than any defense ordered earlier would.
  | {
      kind: 'answer'
      turn: number
      // The move's event id and the response's, for their words.
      move: string
      response: string
      was: number
      final: number
      won: boolean
    }
  | { kind: 'none' }

// Each turn's orders as the record has them, as the engine takes them.
export function ordersOf(state: GameState): TurnActions[] {
  const kinds = Object.keys(kindLabel) as (keyof typeof kindLabel)[]
  return state.history.map((r) => {
    const buyCounters = state.scenario.countermeasures.filter((c) => r.purchases.some((p) => p.startsWith(`${c.name} (`))).map((c) => c.id)
    const buyAssets = r.purchases.flatMap((p) => {
      const kind = kinds.find((k) => p.startsWith(`${kindLabel[k]} (`))
      return kind ? [{ kind }] : []
    })
    const debris = r.events.find((e) => e.debris)?.debris?.choice
    // The responses too (v1.7 R1): each move's answer, or null for one
    // ridden out, so the record replays to itself.
    const responses = r.events.map((e) => e.response?.id ?? null)
    // And the 3D game's inputs (v2.0 R1): what the scan identified and each
    // move's timed tap, so a record with either replays to itself too.
    const timing = r.events.map((e) => e.timing ?? 0)
    return {
      buyAssets,
      buyCounters,
      ...(debris ? { debris } : {}),
      responses,
      ...(r.scanned ? { scans: r.scanned } : {}),
      ...(r.sighted ? { sighted: r.sighted } : {}),
      ...(timing.some((t) => t > 0) ? { timing } : {}),
      // And where each defense was set down and the call on that night's
      // hold (v2.0 R2). Every night carries the whole map: the engine reads
      // it only for a defense new that night, so a defense a replay moves
      // to another night lands on the same asset.
      placeOn: { ...state.placed },
      tiebreak: r.hold && r.hold.call !== 'none' ? r.hold.call : null,
    }
  })
}

// The same game played again from its seed with these orders, or null
// where the engine refuses one (a budget the change no longer covers).
export function replay(state: GameState, orders: TurnActions[]): GameState | null {
  let s = newGame(state.scenario, state.seed, state.difficulty, state.posture)
  try {
    for (let t = 0; s.status === 'playing'; t += 1) s = resolveTurn(s, orders[t] ?? { buyAssets: [], buyCounters: [] }, turnRng(s.seed, s.turn))
  } catch {
    return null
  }
  return s
}

// A CHANGE WORTH SAYING (v2.0 R4): the game played again with one change
// is only advice if the player could have taken it and been glad. It must
// not end with the budget under 0 (the round's phone reviewer was told to
// place a piece on night 6 "for 93.3, not 88.6, still under the win line
// of 70": the replay had gone insolvent on a score above the line), must
// not turn a game that was won into one that was lost, and the changed
// night's orders must read 0 or more on WORST CASE, as the game itself
// would have marked them risky otherwise (both of the round's reviewers
// were warned off the very piece the debrief then named).
function worthSaying(state: GameState, played: GameState, orders: TurnActions[], changedTurn?: number): boolean {
  if (played.lossReason === 'insolvency') return false
  if (state.status === 'won' && played.status !== 'won') return false
  if (changedTurn === undefined) return true
  let s = newGame(state.scenario, state.seed, state.difficulty, state.posture)
  try {
    for (let t = 0; s.status === 'playing' && s.turn < changedTurn; t += 1) s = resolveTurn(s, orders[t] ?? { buyAssets: [], buyCounters: [] }, turnRng(s.seed, s.turn))
  } catch {
    return false
  }
  return s.status !== 'playing' || s.turn !== changedTurn || worstCase(s, orders[changedTurn - 1]).value >= 0
}

// The best single answer the night offered and this game did not take:
// each move that got through and had a response, played again with that
// response, every order and every other answer the same.
function bestAnswer(state: GameState, orders: TurnActions[], was: number): Extract<NextTime, { kind: 'answer' }> | null {
  let best: Extract<NextTime, { kind: 'answer' }> | null = null
  state.history.forEach((rec, t) => {
    rec.events.forEach((ev, i) => {
      if (ev.left === undefined || ev.effectiveSeverity === 0) return
      const def = state.scenario.events.find((e) => e.id === ev.eventId)
      for (const r of def?.responses ?? []) {
        if (r.id === ev.response?.id) continue
        // The night's other answers stand, and one the pool no longer
        // reaches falls away in the replay by itself.
        const changed = orders.map((o, k) => (k === t ? { ...o, responses: rec.events.map((e, j) => (j === i ? r.id : (e.response?.id ?? null))) } : o))
        const played = replay(state, changed)
        const taken = played?.history[t]?.events[i]?.response
        // An answer the pool could not meet is ridden out by the engine.
        if (!played || taken?.id !== r.id) continue
        if (!worthSaying(state, played, changed)) continue
        const final = played.history[played.history.length - 1].maiScore
        if (final <= was || (best && final <= best.final)) continue
        best = { kind: 'answer', turn: rec.turn, move: ev.eventId, response: r.id, was, final, won: played.status === 'won' }
      }
    })
  })
  return best
}

export function nextTime(state: GameState): NextTime | null {
  const missed = [...new Set(state.learned.filter((l) => l.how === 'missed').map((l) => l.counter))]
  if (state.history.length === 0) return null
  const answer = bestAnswer(state, ordersOf(state), state.history[state.history.length - 1].maiScore)
  if (missed.length === 0) return answer
  const earlier = defenseEarlier(state, missed)
  if (answer && (!earlier || earlier.kind === 'none' || answer.final > earlier.final)) return answer
  return earlier
}

function defenseEarlier(state: GameState, missed: CountermeasureId[]): NextTime | null {
  const orders = ordersOf(state)
  const was = state.history[state.history.length - 1].maiScore
  // The record replays to itself, or nothing here can be measured.
  if (replay(state, orders)?.history.at(-1)?.maiScore !== was) return null
  const nameOf = (id: CountermeasureId) => defenseOf(state, id)?.name ?? id
  const boughtOn = (id: CountermeasureId) => orders.findIndex((o) => o.buyCounters.includes(id)) + 1 || null
  let best: Extract<NextTime, { kind: 'earlier' }> | null = null
  for (const id of missed) {
    const cm = defenseOf(state, id)
    const price = cm?.cost ?? 0
    const procured = boughtOn(id)
    // The first turn a move it answers got through before it was owned.
    const needed = state.history.find((r) =>
      r.events.some((ev) => ev.effectiveSeverity > 0 && (procured === null || procured > r.turn) && state.scenario.events.find((e) => e.id === ev.eventId)?.counters.includes(id)),
    )?.turn
    if (needed === undefined) continue
    // Every turn up to the first it was needed on, each played again: the
    // defense on that turn, the one ordered then moved to the next turn
    // with none (or out); the turn whose game ends highest is the one said
    // (the R1 re-review: the latest free turn read as arbitrary).
    for (let turn = 1; turn <= needed; turn += 1) {
      const displaced = orders[turn - 1].buyCounters.find((c) => c !== id) ?? null
      const changed = orders.map((o) => ({ ...o, buyCounters: o.buyCounters.filter((c) => c !== id) }))
      changed[turn - 1] = { ...changed[turn - 1], buyCounters: [id] }
      let aheadTo: number | null = null
      if (displaced) {
        const free = changed.findIndex((o, i) => i >= turn && o.buyCounters.length === 0)
        if (free >= 0) {
          changed[free] = { ...changed[free], buyCounters: [displaced] }
          aheadTo = free + 1
        }
      }
      const played = replay(state, changed)
      if (!played || !worthSaying(state, played, changed, turn)) continue
      const final = played.history[played.history.length - 1].maiScore
      if (final <= was || (best && final <= best.final)) continue
      best = {
        kind: 'earlier',
        defense: nameOf(id),
        price,
        procured,
        orderOn: turn,
        ahead: displaced ? nameOf(displaced) : null,
        aheadTo,
        was,
        final,
        won: played.status === 'won',
      }
    }
  }
  return best ?? { kind: 'none' }
}

// Time on the clock as m:ss.
export const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
