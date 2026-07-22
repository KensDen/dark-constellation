// End-of-run report data and shareable text (R4). One place computes which
// techniques were resilient vs compromised, so the on-screen report card
// and the copy-to-clipboard summary can never disagree. The share text is
// plain text with no image generation and no external calls.

import { GAME_TITLE } from '../config'
import type { GameState, Vector } from '../engine/types'

export interface ReportData {
  outcome: 'won' | 'lost'
  mai: number
  turnsSurvived: number
  totalTurns: number
  seed: number
  burned: { id: string; name: string; vector?: Vector }[]
  resisted: { id: string; name: string; vector?: Vector }[]
}

export function reportData(state: GameState): ReportData {
  const scenario = state.scenario
  const refVector = new Map<string, Vector>()
  for (const evDef of scenario.events) {
    for (const ref of evDef.techniqueRefs) {
      const key = `${ref.framework} ${ref.id}`
      if (!refVector.has(key)) refVector.set(key, evDef.vector)
    }
  }
  const burned = new Map<string, string>()
  const resisted = new Map<string, string>()
  for (const rec of state.history) {
    for (const ev of rec.events) {
      const def = scenario.events.find((e) => e.id === ev.eventId)
      for (const ref of ev.firedTechniqueRefs) burned.set(`${ref.framework} ${ref.id}`, ref.name)
      if (ev.effectiveSeverity === 0) {
        for (const ref of def?.techniqueRefs ?? []) resisted.set(`${ref.framework} ${ref.id}`, ref.name)
      }
    }
  }
  const lastMai = state.history[state.history.length - 1]?.maiScore ?? 0
  const toList = (m: Map<string, string>) =>
    [...m.entries()].map(([id, name]) => ({ id, name, vector: refVector.get(id) }))
  return {
    outcome: state.status === 'won' ? 'won' : 'lost',
    mai: lastMai,
    turnsSurvived: state.history.length,
    totalTurns: scenario.totalTurns,
    seed: state.seed,
    burned: toList(burned),
    resisted: toList(resisted),
  }
}

export function shareText(state: GameState): string {
  const r = reportData(state)
  const lines: string[] = []
  lines.push(`${GAME_TITLE}: ${r.outcome === 'won' ? 'MISSION ASSURED' : 'MISSION FAILED'}`)
  lines.push(`Final MAI ${r.mai} | survived ${r.turnsSurvived} of ${r.totalTurns} turns | seed ${r.seed}`)
  lines.push('')
  lines.push(`Resilient to (${r.resisted.length}): ${r.resisted.map((t) => t.id).join(', ') || 'none'}`)
  lines.push(`Compromised by (${r.burned.length}): ${r.burned.map((t) => t.id).join(', ') || 'none'}`)
  lines.push('')
  lines.push('https://kensden.github.io/dark-constellation')
  return lines.join('\n')
}
