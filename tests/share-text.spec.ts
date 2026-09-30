// The share text (v1.2 R5, brief 7.2).
//
// GUARD R5 (d): for a fixed seed, date and script, the Daily Op's share
// text is a pinned string. Pinned rather than rebuilt from the functions
// that make it, because a rebuild would agree with any change to them;
// the string is what a player pastes into a chat, and changing it should
// cost an edit here. The date is 27 September 2026, Daily Op #1, whose
// seed daily.spec.ts pins (289227389); the script is WIN_SCRIPT, which on
// that seed ends below the win line at turn 12.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, turnStrip } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { startDailyOp } from '../src/ui/dailyOp'
import { SHARE_SQUARE, SHARE_URL, shareText } from '../src/ui/reportCard'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

function play(from: GameState, script: Record<number, TurnActions>): GameState {
  let state = from
  while (state.status === 'playing') state = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
  return state
}

// 09:00 local on the date, so the date is the 27th in any time zone.
const DAY = new Date(2026, 8, 27, 9, 0)

describe('GUARD R5 (d): the Daily Op share text for a fixed seed, date and script', () => {
  it('is exactly this', () => {
    const op = startDailyOp(DAY)
    expect(op.daily).toEqual({ dateKey: '20260927', n: 1 })
    expect(op.state.seed).toBe(289227389)
    const end = play(op.state, WIN_SCRIPT)
    expect(shareText(end, { n: op.daily!.n, official: true })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1',
        'Grade D · lost T12 · MAI 66.0',
        '\u{1F7E9}\u{1F7E8}\u{1F7E8}\u{1F7E5}\u{1F7E9}\u{1F7E8}\u{1F7E5}\u{1F7E8}\u{1F7E9}\u{1F7E8}\u{1F7E5}\u{1F7E8}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('says practice on its first line, and nowhere else, for a run that is not the official one', () => {
    const end = play(startDailyOp(DAY).state, LOSS_SCRIPT)
    expect(shareText(end, { n: 1, official: false })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1 (practice)',
        'Grade F · lost T8 · MAI 29.0',
        '\u{1F7E9}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('draws one square a turn, in the strip\'s colours, and keeps the URL line', () => {
    // The pins above are strings; this joins their squares to the strip
    // and the grade, so a pin that drifted from the screen would show.
    for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
      const end = play(startDailyOp(DAY).state, script)
      const lines = shareText(end, { n: 1, official: true }).split('\n')
      expect(lines[1].startsWith(`Grade ${gradeOf(end)} `)).toBe(true)
      expect(lines[2]).toBe(turnStrip(end).map((c) => SHARE_SQUARE[c]).join(''))
      expect([...lines[2]].length, 'not one square a turn').toBe(end.history.length)
      expect(lines[3]).toBe(SHARE_URL)
    }
  })
})

describe("free play keeps today's longer text, with the grade line added", () => {
  it('is exactly this for a won campaign', () => {
    const end = play(newGame(DEFAULT_SCENARIO, 20260712, 'standard'), WIN_SCRIPT)
    expect(shareText(end)).toBe(
      [
        'DARK CONSTELLATION: MISSION ASSURED',
        'Grade S · won T12 · MAI 86.3',
        'Final MAI 86.3 | survived 12 of 12 turns | STANDARD | seed 20260712',
        '',
        'Resilient to (1): ATT&CK T1566',
        'Compromised by (13): SPARTA EX-0016.01, SPARTA EX-0001, SPARTA PER-0002.02, ATT&CK T1195, SPARTA EX-0016.03, ATLAS AML.T0043, SPARTA EXF-0003.02, NSA U/OO/106122-22, ATT&CK T1486, SPARTA IA-0008.01, SPARTA EXF-0003, SPARTA DE-0009.01, SPARTA EX-0014.03',
        '',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })
})
