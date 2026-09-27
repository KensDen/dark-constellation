// End-of-run report data and shareable text (R4). One place computes which
// techniques were resilient vs compromised, so the on-screen report card
// and the copy-to-clipboard summary can never disagree. The share text is
// plain text with no image generation and no external calls.
//
// Since v1.2 R5 only the score screen reads this module, so it rides in
// the score screen's chunk rather than the first download.

import { GAME_TITLE } from '../config'
import { gradeOf, turnStrip, type StripColour } from '../engine/grade'
import { DIFFICULTIES } from '../engine/reducer'
import type { Difficulty, GameState } from '../engine/types'
import { techniqueLabel } from './labels'

export interface ReportData {
  outcome: 'won' | 'lost'
  mai: number
  turnsSurvived: number
  totalTurns: number
  seed: number
  difficulty: Difficulty
  burned: { id: string; name: string }[]
  resisted: { id: string; name: string }[]
}

export function reportData(state: GameState): ReportData {
  const scenario = state.scenario
  const burned = new Map<string, string>()
  const resisted = new Map<string, string>()
  for (const rec of state.history) {
    for (const ev of rec.events) {
      const def = scenario.events.find((e) => e.id === ev.eventId)
      for (const ref of ev.firedTechniqueRefs) burned.set(techniqueLabel(ref), ref.name)
      if (ev.effectiveSeverity === 0) {
        for (const ref of def?.techniqueRefs ?? []) resisted.set(techniqueLabel(ref), ref.name)
      }
    }
  }
  const lastMai = state.history[state.history.length - 1]?.maiScore ?? 0
  const toList = (m: Map<string, string>) => [...m.entries()].map(([id, name]) => ({ id, name }))
  return {
    outcome: state.status === 'won' ? 'won' : 'lost',
    mai: lastMai,
    turnsSurvived: state.history.length,
    totalTurns: scenario.totalTurns,
    seed: state.seed,
    difficulty: state.difficulty,
    burned: toList(burned),
    resisted: toList(resisted),
  }
}

export const SHARE_URL = 'https://kensden.github.io/dark-constellation'

// One square a turn, as the strip on the score screen colours it.
export const SHARE_SQUARE: Record<StripColour, string> = {
  green: '\u{1F7E9}', // green square
  amber: '\u{1F7E8}', // yellow square
  magenta: '\u{1F7E5}', // red square
}

// The grade line (brief 7.2): "Grade A · won T12 · MAI 81.4". T is the
// turn the campaign ended on, and the MAI keeps its one decimal place.
export function gradeLine(state: GameState): string {
  const mai = state.history[state.history.length - 1]?.maiScore ?? 0
  return `Grade ${gradeOf(state)} · ${state.status === 'won' ? 'won' : 'lost'} T${state.history.length} · MAI ${mai.toFixed(1)}`
}

// The Daily Op a share is for: its number, and whether this run is the
// date's official one. Anything else is practice and says so.
export interface ShareDaily {
  n: number
  official: boolean
}

export function shareText(state: GameState, daily?: ShareDaily): string {
  // A DAILY OP (brief 7.2): four lines, the same shape for every player,
  // so a day's results read side by side.
  if (daily) {
    return [
      `${GAME_TITLE} · Daily Op #${daily.n}${daily.official ? '' : ' (practice)'}`,
      gradeLine(state),
      turnStrip(state)
        .map((c) => SHARE_SQUARE[c])
        .join(''),
      SHARE_URL,
    ].join('\n')
  }
  // FREE PLAY keeps the longer text, with the grade line added.
  const r = reportData(state)
  const lines: string[] = []
  lines.push(`${GAME_TITLE}: ${r.outcome === 'won' ? 'MISSION ASSURED' : 'MISSION FAILED'}`)
  lines.push(gradeLine(state))
  lines.push(
    `Final MAI ${r.mai} | survived ${r.turnsSurvived} of ${r.totalTurns} turns | ${DIFFICULTIES[r.difficulty].label} | seed ${r.seed}`,
  )
  lines.push('')
  lines.push(`Resilient to (${r.resisted.length}): ${r.resisted.map((t) => t.id).join(', ') || 'none'}`)
  lines.push(`Compromised by (${r.burned.length}): ${r.burned.map((t) => t.id).join(', ') || 'none'}`)
  lines.push('')
  lines.push(SHARE_URL)
  return lines.join('\n')
}
