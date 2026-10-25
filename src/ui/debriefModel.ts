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
import { NEW_DEFENSES_PER_NIGHT, kindLabel, newGame, resolveTurn } from '../engine/reducer'
import { turnRng } from '../engine/rng'
import { maiScore } from '../engine/scoring'
import type { CountermeasureId, GameState, LearnedHow, TurnActions } from '../engine/types'
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
    // Its own drop beside the turn's net (R6b's fresh eyes, item 7: the
    // header's -7.5 sat under a move whose card said -7.7).
    const own = worst.scoreBefore !== undefined && worst.scoreAfter !== undefined ? one(worst.scoreBefore - worst.scoreAfter) : null
    // Said as its share of the net (the R1 re-review: "(-7.7)" under
    // "-9.8 NET" did not say how the two relate).
    const cost = own !== null && own > 0 ? `: -${own.toFixed(1)} of it` : ''
    line = sign ? `${threatName(state, worst.eventId)} hit the ${kind} ${sign}${cost}.` : `${threatName(state, worst.eventId)} got through${cost}.`
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
// stopped it, or helped block it where the defense credited does not
// block it alone (a joint block, R6b fresh eyes); a partial block partly
// blocked it; a defense not owned would have stopped it only where it
// blocks the move alone, and would have blunted it otherwise. The debris
// call is answered, never stopped.
export function sayVerb(how: LearnedHow, verb: StopVerb): string {
  if (how === 'held') return verb === 'answers' ? 'answered' : verb === 'stops' ? 'stopped' : 'helped block'
  // "blunted" since v1.5 R1, the word "would have blunted" uses (R6b's
  // fresh eyes, item 7); the board's pill stays PARTLY BLOCKED (section 4).
  if (how === 'reduced') return 'blunted'
  return verb === 'stops' ? 'would have stopped' : verb === 'blunts' ? 'would have blunted' : 'would have answered'
}
const verbOf = (state: GameState, counter: CountermeasureId, threat: string): StopVerb => {
  const ev = state.scenario.events.find((e) => e.id === threat)
  return ev ? stopVerb(counter, ev) : 'stops'
}

// One line a defense and a verb, its threats together (v1.3 R5, Ken's
// ruling on R4's question 6): "Sensor fusion cross-checks would have
// stopped LiDAR blinding and BLACKOUT CHAIN", not the defense three times.
// Since v1.5 R1 a defense not owned is one line whatever its verbs, the
// second verb after the first ("would have stopped X and blunted Y"; v1.4's
// fresh eyes, finding 13: the same defense twice read as two orders).
export interface Saying {
  defense: string
  threats: string[]
  how: LearnedHow
  verb: string
  // A missed defense's further verbs, each with its threats, said after
  // the first without its "would have".
  more?: { verb: string; threats: string[] }[]
  // The turn a missed defense was ordered, too late for these (the R1
  // re-review: an X beside a defense the player did order read as never).
  orderedOn?: number
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
    const missedLine = l.how === 'missed' ? out.find((s) => s.defense === defense && s.how === 'missed') : undefined
    if (line) {
      if (!line.threats.includes(threat)) line.threats.push(threat)
    } else if (missedLine) {
      const more = (missedLine.more ??= [])
      const part = more.find((m) => m.verb === verb.replace(/^would have /, ''))
      if (part) {
        if (!part.threats.includes(threat)) part.threats.push(threat)
      } else more.push({ verb: verb.replace(/^would have /, ''), threats: [threat] })
    } else {
      const orderedOn = l.how === 'missed' ? state.history.find((r) => r.purchases.some((p) => p.startsWith(`${defense} (`)))?.turn : undefined
      out.push({ defense, threats: [threat], how: l.how, verb, ...(orderedOn !== undefined ? { orderedOn } : {}) })
    }
  }
  return out.sort((a, b) => SAY_ORDER[a.how] - SAY_ORDER[b.how])
}

// Said above the defenses not owned (v1.4's fresh eyes, finding 13: the
// list read as everything there was to order).
export const missedLead = (state: GameState) =>
  `What got through, and what would have answered it. At ${NEW_DEFENSES_PER_NIGHT} new defense a turn, ${state.scenario.totalTurns} is the most a run can order.`

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
    return { buyAssets, buyCounters, intelBrief: r.purchases.some((p) => p.startsWith('Intel brief (')), ...(debris ? { debris } : {}) }
  })
}

// The same game played again from its seed with these orders, or null
// where the engine refuses one (a budget the change no longer covers).
export function replay(state: GameState, orders: TurnActions[]): GameState | null {
  let s = newGame(state.scenario, state.seed, state.difficulty)
  try {
    for (let t = 0; s.status === 'playing'; t += 1) s = resolveTurn(s, orders[t] ?? { buyAssets: [], buyCounters: [], intelBrief: false }, turnRng(s.seed, s.turn))
  } catch {
    return null
  }
  return s
}

export function nextTime(state: GameState): NextTime | null {
  const missed = [...new Set(state.learned.filter((l) => l.how === 'missed').map((l) => l.counter))]
  if (missed.length === 0 || state.history.length === 0) return null
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
      if (!played) continue
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
    { grade: 'D', takes: `all ${t} turns, below ${state.scenario.winThreshold}` },
    { grade: 'F', takes: `out early: budget below zero or score under ${state.scenario.collapseThreshold}` },
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
      return `${more(GRADE_THRESHOLDS.S)} more on the grade score for S.`
    case 'B':
      return `${more(GRADE_THRESHOLDS.A)} more on the grade score for A.`
    case 'C':
      return `${more(GRADE_THRESHOLDS.B)} more on the grade score for B.`
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
