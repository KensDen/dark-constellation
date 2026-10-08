// The learning state's rules (v1.3 brief 6.8 and 6.9). Pure: the device's
// `met` set and its dossier live in src/persistence, and this module says
// what goes into them and what they unlock.

import type { Countermeasure, Scenario, TurnRecord } from './types'

// What a turn adds to the device's `met` set (brief 6.9): every threat the
// player faced tonight, landed or held, and every threat the intel brief
// named. Opportunities are not threats and never enter it.
export function metOnTurn(record: Pick<TurnRecord, 'events' | 'named'>, scenario: Scenario): string[] {
  const isThreat = (id: string) => (scenario.events.find((e) => e.id === id)?.kind ?? 'threat') === 'threat'
  const out: string[] = []
  for (const id of [...record.events.map((e) => e.eventId), ...record.named]) {
    if (isThreat(id) && !out.includes(id)) out.push(id)
  }
  return out
}

// THE EARNED ANSWER KEY (ruling R1, 4 October 2026; brief 5.4). A defense
// names a threat it stops once the player has met that threat, or once
// tonight's intel brief has named it; every other threat it stops is only
// counted ("+2 you have not met"). `known` keeps the defense's own order,
// and marks the ones named tonight. tests/answer-key.spec.ts sweeps real
// play and fails if a name ever leaks past this rule (GUARD (b), rewritten
// to R1).
export interface AnswerKey {
  known: { id: string; tonight: boolean }[]
  unmet: number
}

export function answerKey(cm: Pick<Countermeasure, 'counters'>, met: ReadonlySet<string>, named: ReadonlySet<string>): AnswerKey {
  const known = cm.counters.filter((id) => met.has(id) || named.has(id)).map((id) => ({ id, tonight: named.has(id) }))
  return { known, unmet: cm.counters.length - known.length }
}

// THE DEFENSE BONUS (brief 6.8): half a point a step of the best streak up
// to six, and a tenth of a point per point saved up to twenty, to one
// decimal. It moves the grade only; win and loss read the score alone.
export const BONUS_STREAK_CAP = 6
export const BONUS_PER_STREAK = 0.5
export const BONUS_SAVED_CAP = 20
export const BONUS_PER_SAVED = 0.1

export function defenseBonus(bestStreak: number, saved: number): number {
  return Math.round((Math.min(bestStreak, BONUS_STREAK_CAP) * BONUS_PER_STREAK + Math.min(saved, BONUS_SAVED_CAP) * BONUS_PER_SAVED) * 10) / 10
}
