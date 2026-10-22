// THE SHARE TEXT (v1.2 R5, brief 7.2; v1.3 R4, M37). Plain text with no
// image generation and no external calls, read by the debrief alone, so it
// rides in the debrief's chunk rather than the first download.
//
// Every run shares the Daily Op's four lines: the title line, the grade
// line, one square a turn, and the URL. Free play kept a longer text until
// v1.3 R4, and it contradicted itself (QC G-056, G-057): "survived 6 of 6
// turns" on a loss, one technique in both its lists, seven beside eight
// hits. The four lines say only what the debrief says.

import { GAME_TITLE } from '../config'
import { gradeOf, turnStrip, type StripColour } from '../engine/grade'
import { DIFFICULTIES } from '../engine/reducer'
import type { GameState } from '../engine/types'

export const SHARE_URL = 'https://kensden.github.io/dark-constellation'

// One square a turn, as the strip on the debrief colours it.
export const SHARE_SQUARE: Record<StripColour, string> = {
  green: '\u{1F7E9}', // green square
  amber: '\u{1F7E8}', // yellow square
  magenta: '\u{1F7E5}', // red square
}

// The grade line (brief 7.2): "Grade A · won T6 · score 81.4". T is the
// turn the campaign ended on, and the score keeps its one decimal place
// (v1.3 section 4: MAI is retired from every player screen).
export function gradeLine(state: GameState): string {
  const mai = state.history[state.history.length - 1]?.maiScore ?? 0
  return `Grade ${gradeOf(state)} · ${state.status === 'won' ? 'won' : 'lost'} T${state.history.length} · score ${mai.toFixed(1)}`
}

// The Daily Op a share is for: its number, and whether this run is the
// date's official one. Anything else is practice and says so.
export interface ShareDaily {
  n: number
  official: boolean
}

// The title line: the Daily Op and its number, or a practice run and the
// difficulty it was played on, since a grade on EASY is not one on
// STANDARD.
export function shareTitle(state: GameState, daily?: ShareDaily): string {
  if (daily) return `${GAME_TITLE} · Daily Op #${daily.n}${daily.official ? '' : ' (practice)'}`
  const label = DIFFICULTIES[state.difficulty].label
  return `${GAME_TITLE} · Practice · ${label.charAt(0)}${label.slice(1).toLowerCase()}`
}

export function shareText(state: GameState, daily?: ShareDaily): string {
  return [
    shareTitle(state, daily),
    gradeLine(state),
    turnStrip(state)
      .map((c) => SHARE_SQUARE[c])
      .join(''),
    SHARE_URL,
  ].join('\n')
}
