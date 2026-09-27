// The damage report's one verdict line (brief v0.5 section 5: "the
// playback is the report; one verdict line after it; the full ledger stays
// available behind DETAILS"). Derived from the turn record, so it cannot
// describe a turn that did not happen.

import type { GameState, Scenario, TurnRecord } from '../engine/types'

// A guardrail of our own, not a number from the brief: the brief asks for
// one verdict line, and this keeps that honest as the deck's event names
// vary in length. The longest name in the deck runs seven words, so the
// templates have to stay short around it.
export const VERDICT_WORD_MAX = 20

const METER_LABEL: Record<string, string> = {
  linkAvailability: 'Link availability',
  dataIntegrity: 'Data integrity',
  sensorIntegrity: 'Sensor integrity',
}

const shortName = (name: string) => name.split(' (')[0]

export function verdictFor(record: TurnRecord, scenario: Scenario): string {
  const threats = record.events.filter((ev) => {
    const def = scenario.events.find((e) => e.id === ev.eventId)
    return (def?.kind ?? 'threat') === 'threat'
  })

  if (threats.length === 0) {
    const opportunity = record.events.length > 0
    return opportunity ? 'No adversary activity; the turn broke your way.' : 'No adversary activity this turn.'
  }

  const landed = threats.filter((ev) => ev.effectiveSeverity > 0)
  const heldAll = landed.length === 0
  const resilience = record.commendations.some((c) => c.startsWith('Resilience commendation'))

  if (heldAll) {
    const countered = threats.filter((ev) => ev.mitigation > 0).length
    return countered > 0
      ? 'Posture held; every attempt was mitigated below threshold.'
      : 'Nothing landed this turn.'
  }

  // The heaviest hit names the verdict; ties go to the earlier event, which
  // is the one the playback showed first.
  const worst = landed.reduce((a, b) => (b.effectiveSeverity > a.effectiveSeverity ? b : a))
  const def = scenario.events.find((e) => e.id === worst.eventId)
  const meter = def?.effect.meters[0]
  const where = meter ? METER_LABEL[meter] ?? 'The mission' : 'The fleet'
  const name = shortName(worst.name)

  // The count belongs in every branch: a turn where three events landed
  // and a commendation was earned still had three events land.
  const also = landed.length > 1 ? ` and ${landed.length - 1} more` : ''
  if (resilience) {
    return `${name}${also} landed; you held the line under pressure.`
  }
  if (also) {
    return `${name}${also} landed; ${where.toLowerCase()} took the worst.`
  }
  return `${name} landed; ${where.toLowerCase()} took the hit.`
}

export function verdictForState(state: GameState): string | null {
  const record = state.history[state.history.length - 1]
  return record ? verdictFor(record, state.scenario) : null
}
