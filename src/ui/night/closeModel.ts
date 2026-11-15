// The close's score lines, the debris call's terms and what an opportunity
// did (v1.3 brief 5.5 items 4 to 6), read off the engine's record and
// rules, for the 3D game's cards (src/ui/three/cards3d.tsx). The pixel
// board's END OF TURN ledger left with it in v2.0 R3.

import { DEBRIS_LOSS_CHANCE, RIDESHARE_RESELL_CREDITS } from '../../engine/reducer'
import { burnFuel, lossReviewBill } from '../../engine/rules'
import { coverage, maiScore } from '../../engine/scoring'
import type { GameState, ResolvedEvent } from '../../engine/types'
import { callSigns } from '../board/board'
import * as copy from './nightCopy'
import type { Night, NightStep } from './nightModel'

// What the call states, read off the state before it and the engine's
// rules: the odds, the fuel, the satellite, the bonus a burn risks, and the
// loss review a hold risks.
export function callTerms(state: GameState, ev: ResolvedEvent) {
  const ssa = state.counters.includes('ssaManeuver')
  const def = state.scenario.events.find((e) => e.id === ev.eventId)!
  // What a burn risks at the close: the coverage bonus, but only when the
  // satellite is what keeps the fleet at the bonus line tonight.
  const { coverageMin, credits } = state.scenario.slaBonus
  const off = ev.debris?.assetId ? new Set([ev.debris.assetId]) : undefined
  const atRisk = coverage(state.assets) >= coverageMin && coverage(state.assets, off) < coverageMin
  return {
    ssa,
    chance: DEBRIS_LOSS_CHANCE,
    fuel: burnFuel(ssa),
    sat: (ev.debris?.assetId && callSigns(state).get(ev.debris.assetId)) || 'The satellite',
    bonus: atRisk ? credits : null,
    review: lossReviewBill(def, state.difficulty),
  }
}

// THE SCORE'S LINES at the close (fresh-eyes review; section 4 rule 5):
// from the score the turn opened on, what the live conditions took as the
// night opened, what tonight's moves took (and what the defenses saved),
// and the overnight recovery, to the score the turn closed on. Read off
// the night's model, so only for a night played here, not a reload.
export interface ScoreRow {
  key: 'from' | 'conditions' | 'hold' | 'moves' | 'recovery' | 'to'
  label: string
  value: number
  note?: string
}
const tenth = (n: number) => Math.round(n * 10) / 10
export function scoreRows(night: Night): ScoreRow[] {
  const from = maiScore(night.before)
  const opened = maiScore(night.opening)
  // The policy engine's hold (v2.0 R2) comes before the moves, with a row
  // of its own when a wrong call cost something.
  const held = night.hold ? maiScore(night.hold.after) : opened
  const lastNight = night.steps.length ? night.steps[night.steps.length - 1].scoreAfter : held
  const to = night.record.maiScore
  const saved = tenth(night.record.events.reduce((n, e) => n + e.saved, 0))
  const rows: ScoreRow[] = [{ key: 'from', label: copy.SCORE_FROM, value: from }]
  if (tenth(opened - from) !== 0)
    rows.push({ key: 'conditions', label: copy.SCORE_CONDITIONS, value: tenth(opened - from), note: night.record.conditionsActive.join(', ') || undefined })
  if (tenth(held - opened) !== 0) rows.push({ key: 'hold', label: copy.SCORE_HOLD, value: tenth(held - opened) })
  rows.push({ key: 'moves', label: copy.SCORE_MOVES, value: tenth(lastNight - held), note: saved > 0 ? copy.savedNote(saved) : undefined })
  const overnight = night.record.ledger.arrivals.length ? copy.SCORE_RECOVERY_ARRIVALS : copy.SCORE_RECOVERY
  if (tenth(to - lastNight) !== 0) rows.push({ key: 'recovery', label: overnight, value: tenth(to - lastNight) })
  rows.push({ key: 'to', label: copy.SCORE_TO, value: to })
  return rows
}

// What an opportunity did, in the game's words, from the engine's record
// (the deck's benefit and the night's windfall) rather than its log line,
// which named the rideshare's seat "the slot".
const EXPEDITED = /\b((?:start|t\d+)-(?:sat|rpoSat|drone|groundStation)-\d+) manifested on the rideshare/
export function opportunityLines(step: NightStep, signs: Map<string, string>): string[] {
  const b = step.def.benefit ?? {}
  const out: string[] = []
  if (b.credits) out.push(copy.windfallLine(b.credits))
  if (b.briefTurns) out.push(copy.briefFreeLine(b.briefTurns))
  if (b.expediteTurns) {
    const id = step.ev.notes.map((n) => EXPEDITED.exec(n)?.[1]).find(Boolean)
    out.push(id ? copy.expeditedLine(signs.get(id) ?? id) : copy.resoldLine(RIDESHARE_RESELL_CREDITS))
  }
  return out
}
