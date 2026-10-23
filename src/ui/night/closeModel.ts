// END OF TURN's ledger and the debris call's terms (v1.3 brief 5.5 items
// 5 and 6), read off the engine's record and rules, for ./closeCards.

import { DEBRIS_LOSS_CHANCE, RIDESHARE_RESELL_CREDITS } from '../../engine/reducer'
import { burnFuel, lossReviewBill } from '../../engine/rules'
import { COVERAGE_PER_KIND, coverage, maiScore } from '../../engine/scoring'
import type { GameState, ResolvedEvent, TurnRecord } from '../../engine/types'
import { callSigns } from '../board/board'
import { PROCURE_KINDS, shortName } from '../board/boardModel'
import { coverageFigure, kindLabels } from '../labels'
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

// END OF TURN's ledger (brief 5.5 item 6, section 4 rule 5): every line
// that made the budget, in the order the close takes them. The rows above
// the total add up to it; tests/night-r3.dom.spec.tsx holds the card to
// that and to the engine's next budget.
export interface LedgerRow {
  key: 'left' | 'fuel' | 'windfall' | 'repairs' | 'keeping' | 'funding' | 'bonus' | 'total'
  label: string
  detail?: string
  // Signed CR, or null where the row says a word instead (frozen, missed).
  value: number
  word?: string
}

export function ledgerRows(record: TurnRecord, state: GameState): LedgerRow[] {
  const l = record.ledger
  const signs = callSigns(state)
  const named = (id: string) => signs.get(id) ?? state.scenario.events.find((e) => e.id === id)?.name ?? id
  // What each bill was for: the tile a hit damaged, or the cleanup after a
  // hit to the data (fresh-eyes review: a tile the card called not
  // damaged was listed under Repairs).
  const bills = record.events
    .filter((e) => e.repairCost > 0)
    .map((e) => (e.integrityAfter !== undefined && e.targetAssetId ? named(e.targetAssetId) : copy.cleanupOf(shortOf(state, e.eventId))))
  // What tonight's orders left, then the night's own lines (R6 question
  // 12): the burn's fuel and an opportunity's windfall each a row, so the
  // first row is the orders alone and every line that made the budget shows.
  const rows: LedgerRow[] = [{ key: 'left', label: copy.LEFT_AFTER, value: l.start - l.ordered }]
  if (l.fuel > 0) rows.push({ key: 'fuel', label: copy.BURN_FUEL, value: -l.fuel })
  if (l.windfall !== 0) rows.push({ key: 'windfall', label: windfallOf(record, state), value: l.windfall })
  rows.push(
    { key: 'repairs', label: copy.REPAIRS, detail: bills.length ? bills.join('; ') : undefined, value: -l.repairs },
    { key: 'keeping', label: copy.KEEPING, detail: copy.keepingDetail(l.defensesKept, state.scenario.upkeepPerDefense), value: -l.upkeep },
  )
  if (l.insolvent) {
    rows.push({ key: 'funding', label: copy.FUNDING, value: 0, word: copy.FROZEN })
  } else {
    const { coverageMin } = state.scenario.slaBonus
    rows.push({ key: 'funding', label: copy.FUNDING, value: l.funding })
    rows.push({
      key: 'bonus',
      label: copy.COVERAGE_BONUS,
      // What would reach the line, unless there is no next turn to reach it.
      detail: copy.coverageDetail(
        l.arrivals.map(named),
        coverageFigure(l.bonusCoverage),
        coverageMin,
        l.coverageBonus > 0 || state.status !== 'playing' ? null : reach(state, coverageMin - l.bonusCoverage),
      ),
      value: l.coverageBonus,
      word: l.coverageBonus > 0 ? undefined : copy.MISSED,
    })
  }
  rows.push({ key: 'total', label: copy.budgetFor(record.turn, state.status !== 'playing'), value: l.after })
  return rows
}

// Whose windfall it was: the opportunity that paid it, by name, or the
// rideshare seat resold when nothing in transit could ride it.
function windfallOf(record: TurnRecord, state: GameState): string {
  const ev = record.events.map((e) => state.scenario.events.find((d) => d.id === e.eventId)).find((d) => d?.kind === 'opportunity')
  if (!ev) return copy.RESOLD
  return ev.benefit?.credits ? shortName(ev) : copy.RESOLD
}

// The cheapest asset PROCURE offers whose coverage alone closes the gap to
// the bonus line, said as "A drone".
function reach(state: GameState, gap: number): string {
  const fits = PROCURE_KINDS.filter((k) => COVERAGE_PER_KIND[k] >= gap).sort((x, y) => state.scenario.prices[x] - state.scenario.prices[y])
  return copy.reachWith(fits.length ? `A${/^[AEIOU]/i.test(kindLabels[fits[0]]) ? 'n' : ''} ${kindLabels[fits[0]].toLowerCase()}` : null)
}

const shortOf = (state: GameState, id: string) => {
  const ev = state.scenario.events.find((e) => e.id === id)
  return ev ? shortName(ev) : id
}

// THE SCORE'S LINES on END OF TURN (fresh-eyes review; section 4 rule 5):
// from the score the turn opened on, what the live conditions took as the
// night opened, what tonight's moves took (and what the defenses saved),
// and the overnight recovery, to the score the turn closed on. Read off
// the night's model, so only for a night played here, not a reload.
export interface ScoreRow {
  key: 'from' | 'conditions' | 'moves' | 'recovery' | 'to'
  label: string
  value: number
  note?: string
}
const tenth = (n: number) => Math.round(n * 10) / 10
export function scoreRows(night: Night): ScoreRow[] {
  const from = maiScore(night.before)
  const opened = maiScore(night.opening)
  const lastNight = night.steps.length ? night.steps[night.steps.length - 1].scoreAfter : opened
  const to = night.record.maiScore
  const saved = tenth(night.record.events.reduce((n, e) => n + e.saved, 0))
  const rows: ScoreRow[] = [{ key: 'from', label: copy.SCORE_FROM, value: from }]
  if (tenth(opened - from) !== 0)
    rows.push({ key: 'conditions', label: copy.SCORE_CONDITIONS, value: tenth(opened - from), note: night.record.conditionsActive.join(', ') || undefined })
  rows.push({ key: 'moves', label: copy.SCORE_MOVES, value: tenth(lastNight - opened), note: saved > 0 ? copy.savedNote(saved) : undefined })
  const overnight = night.record.ledger.arrivals.length ? copy.SCORE_RECOVERY_ARRIVALS : copy.SCORE_RECOVERY
  if (tenth(to - lastNight) !== 0) rows.push({ key: 'recovery', label: overnight, value: tenth(to - lastNight) })
  rows.push({ key: 'to', label: copy.SCORE_TO, value: to })
  return rows
}

// Whether anything is still damaged after the close: the recovery note
// shows only then.
export const damaged = (state: GameState) =>
  state.assets.some((a) => a.integrity > 0 && a.integrity < 100) || Object.values(state.meters).some((m) => m < 100)

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
