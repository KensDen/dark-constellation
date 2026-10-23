// THE DEBRIEF'S READING of a finished game (v1.3 R4, brief 5.6), as pure
// rules over the engine's record: the six stats, why it ended, the turn a
// loss turned on, FILED THIS GAME, what the player can now say, NEXT TIME,
// one line of decisions a turn, and the grade ladder. The grade, the hits
// and the strip are src/engine/grade.ts's own; nothing here restates them
// (principle 17), and tests/debrief.spec.ts holds every number to the
// engine's record of real games.
//
// Section 4 applies to every string: no retired word (MAI, credits, buy,
// severity), numerals, no em or en dashes, and no minus sign: a drop is
// written with the hyphen the dash gate allows.

import { GRADE_THRESHOLDS, bonusOf, gradeOf, gradedScore, hitsTaken, type Grade } from '../engine/grade'
import { newGame } from '../engine/reducer'
import { maiScore } from '../engine/scoring'
import type { CountermeasureId, GameState, LearnedHow } from '../engine/types'
import { callSigns } from './board/board'
import { shortName, stopVerb, type StopVerb } from './board/boardModel'
import { kindLabels } from './labels'

const one = (n: number) => Math.round(n * 10) / 10

const threatName = (state: GameState, id: string) => {
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
        : `Turn ${n} ended under the win line.`
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

// Each turn's fall, to one decimal: the score before the turn less the
// score after it. The first turn's before is the opening score, rebuilt
// from the seed and difficulty as the turn strip rebuilds it.
export function turnDrops(state: GameState): number[] {
  let before = maiScore(newGame(state.scenario, state.seed, state.difficulty))
  return state.history.map((rec) => {
    const drop = one(before - rec.maiScore)
    before = rec.maiScore
    return drop
  })
}

// A LOSS LEADS WITH the turn of the largest drop and what caused it (M14):
// the move that cost the most that turn, on the tile it hit, or the
// conditions that pressed when no move got through.
export interface LossLead {
  turn: number
  drop: number
  line: string
}

export function lossLead(state: GameState): LossLead | null {
  if (state.status !== 'lost') return null
  const drops = turnDrops(state)
  let at = -1
  drops.forEach((d, i) => {
    if (d > 0 && (at < 0 || d > drops[at])) at = i
  })
  if (at < 0) return null
  const rec = state.history[at]
  const landed = rec.events.filter((ev) => ev.effectiveSeverity > 0)
  const worst = landed.reduce<(typeof landed)[number] | null>((w, ev) => (!w || ev.effectiveSeverity > w.effectiveSeverity ? ev : w), null)
  let line: string
  if (worst) {
    // The tile it hit, said with what that tile is (fresh-eyes review: a
    // call sign alone does not say a drone was hit).
    const asset = worst.targetAssetId && worst.integrityAfter !== undefined ? [...state.assets, ...state.pipeline].find((a) => a.id === worst.targetAssetId) : undefined
    const sign = asset ? callSigns(state).get(asset.id) : undefined
    const kind = asset ? kindLabels[asset.kind].replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b) : ''
    line = sign ? `${threatName(state, worst.eventId)} hit the ${kind} ${sign}.` : `${threatName(state, worst.eventId)} got through.`
  } else {
    line = rec.conditionsActive.length ? `Ongoing conditions: ${rec.conditionsActive.join(', ')}.` : 'Damage from earlier turns kept pulling the score down.'
  }
  return { turn: rec.turn, drop: drops[at], line }
}

// The cards the first screen lists before "and n more", so a first game
// that files many still fits 375x667 beside a loss's lead
// (scripts/phone-layout.mjs holds it there).
export const FILED_SHOWN = 3

// FILED THIS GAME: the threats this game met whose card is in the Dossier
// now and was not at turn 1, in the order the game met them. Null when the
// Dossier at turn 1 is not known (a run that arrived as a code).
export function filedThisGame(state: GameState, before: ReadonlySet<string> | null, now: ReadonlySet<string>): string[] | null {
  if (!before) return null
  const out: string[] = []
  for (const rec of state.history) {
    for (const ev of rec.events) {
      const id = ev.eventId
      if (isThreat(state, id) && now.has(id) && !before.has(id) && !out.includes(id)) out.push(id)
    }
  }
  return out
}

// WHAT YOU CAN NOW SAY (brief 5.6 and 6.9): the engine's learned list,
// each verb true by the game's own rule (R6 questions 2 and 7): a block
// stopped it; a partial block partly blocked it; a defense not owned
// would have stopped it only where it blocks the move alone, and would
// have blunted it otherwise. The debris call is answered, never stopped.
export function sayVerb(how: LearnedHow, verb: StopVerb): string {
  if (how === 'held') return verb === 'answers' ? 'answered' : 'stopped'
  if (how === 'reduced') return 'partly blocked'
  return verb === 'stops' ? 'would have stopped' : verb === 'blunts' ? 'would have blunted' : 'would have answered'
}
const verbOf = (state: GameState, counter: CountermeasureId, threat: string): StopVerb => {
  const ev = state.scenario.events.find((e) => e.id === threat)
  return ev ? stopVerb(counter, ev) : 'stops'
}

// One line a defense and a verb, its threats together (v1.3 R5, Ken's
// ruling on R4's question 6): "Sensor fusion cross-checks would have
// stopped LiDAR blinding and BLACKOUT CHAIN", not the defense three times.
export interface Saying {
  defense: string
  threats: string[]
  how: LearnedHow
  verb: string
}

// What held first, then what blunted, then what would have stopped: the
// engine's order within each (fresh-eyes review: a list that opened on a
// run of misses read as a list of failures).
const SAY_ORDER: Record<LearnedHow, number> = { held: 0, reduced: 1, missed: 2 }
export function canSay(state: GameState): Saying[] {
  const out: Saying[] = []
  for (const l of state.learned) {
    const defense = defenseOf(state, l.counter)?.name ?? l.counter
    const threat = threatName(state, l.threat)
    const verb = sayVerb(l.how, verbOf(state, l.counter, l.threat))
    const line = out.find((s) => s.defense === defense && s.verb === verb)
    if (line) {
      if (!line.threats.includes(threat)) line.threats.push(threat)
    } else out.push({ defense, threats: [threat], how: l.how, verb })
  }
  return out.sort((a, b) => SAY_ORDER[a.how] - SAY_ORDER[b.how])
}

// NEXT TIME (M14): the first defense this game missed, and the turn to
// have it by, which is the turn its threat first got through.
export interface NextTime {
  defense: string
  price: number
  threat: string
  turn: number
  // The turn the defense was procured, when it was, too late for the move.
  procured: number | null
  // Whether it stops the move alone, blunts it, or answers the debris call.
  verb: StopVerb
}

export function nextTime(state: GameState): NextTime | null {
  const miss = state.learned.find((l) => l.how === 'missed')
  if (!miss) return null
  const rec = state.history.find((r) => r.events.some((ev) => ev.eventId === miss.threat && ev.effectiveSeverity > 0))
  const cm = defenseOf(state, miss.counter)
  const name = cm?.name ?? miss.counter
  return {
    defense: name,
    price: cm?.cost ?? 0,
    threat: threatName(state, miss.threat),
    turn: rec?.turn ?? 1,
    procured: state.history.find((r) => r.purchases.some((p) => p.startsWith(`${name} (`)))?.turn ?? null,
    verb: verbOf(state, miss.counter, miss.threat),
  }
}

// DECISIONS: one line a turn, what was ordered (each order's price and
// note dropped: the engine writes "Anti-jam (-10)"), what it took from the
// budget, and the debris call when there was one.
export interface Decision {
  turn: number
  orders: string[]
  spent: number
  call: 'BURN' | 'HOLD' | null
}

export const decisions = (state: GameState): Decision[] =>
  state.history.map((rec) => {
    const debris = rec.events.find((ev) => ev.debris)?.debris
    return {
      turn: rec.turn,
      orders: rec.purchases.map((p) => p.replace(/\s*\(-[^)]*\)$/, '')),
      spent: rec.ledger.ordered,
      call: debris ? (debris.choice === 'burn' ? 'BURN' : 'HOLD') : null,
    }
  })

// THE GRADE LADDER (M33): every grade with what it takes, and how far
// this game was from the next one up.
export interface Rung {
  grade: Grade
  takes: string
}

export const ladder = (state: GameState): Rung[] => {
  const t = state.scenario.totalTurns
  return [
    { grade: 'S', takes: `${GRADE_THRESHOLDS.S}+` },
    { grade: 'A', takes: `${GRADE_THRESHOLDS.A}+` },
    { grade: 'B', takes: `${GRADE_THRESHOLDS.B}+` },
    { grade: 'C', takes: `a win, ${state.scenario.winThreshold}+` },
    { grade: 'D', takes: `all ${t} turns, under ${state.scenario.winThreshold}` },
    { grade: 'F', takes: `out before turn ${t}` },
  ]
}

export function toNextGrade(state: GameState): string {
  const block = gradeBlock(state)
  const graded = gradedScore(block.final, bonusOf(state))
  const more = (target: number) => one(target - graded).toFixed(1)
  switch (block.grade) {
    case 'S':
      return 'The top grade.'
    case 'A':
      return `${more(GRADE_THRESHOLDS.S)} more graded points for S.`
    case 'B':
      return `${more(GRADE_THRESHOLDS.A)} more graded points for A.`
    case 'C':
      return `${more(GRADE_THRESHOLDS.B)} more graded points for B.`
    case 'D':
      return `${one(block.needed - block.final).toFixed(1)} more mission assurance at the end for C.`
    case 'F':
      return `Reach the end of turn ${state.scenario.totalTurns} for D.`
  }
}

// Time on the clock as m:ss.
export const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
