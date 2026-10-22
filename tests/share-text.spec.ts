// The share text (v1.2 R5, brief 7.2).
//
// GUARD R5 (d): for a fixed seed, date and script, the Daily Op's share
// text is a pinned string. Pinned rather than rebuilt from the functions
// that make it, because a rebuild would agree with any change to them;
// the string is what a player pastes into a chat, and changing it should
// cost an edit here. The date is 27 September 2026, Daily Op #1, whose
// seed daily.spec.ts pins (289227389); the script is WIN_SCRIPT, which on
// that seed wins at turn 6.
//
// Regenerated for v1.3 Round 0 (the share text's own format did not
// change; the games it describes did): six turns, so six squares and T6;
// WIN_SCRIPT now wins this seed (v1.2: a D, lost at turn 12 under the
// line); LOSS_SCRIPT now survives all six turns under the line, a D (v1.2:
// an F, collapsed at turn 8), since no six-turn game collapses; the grade
// reads the final score plus the defense bonus; and the free-play
// technique lists follow the six-turn plan and the reacting adversary.
//
// With six turns, the WIN_SCRIPT and LOSS_SCRIPT pins both end on the
// last turn, so their T6 cannot tell "the turn the campaign ended on"
// (src/ui/reportCard.ts) from the scenario's length. So an early ending is
// pinned too: a run of the same daily seed that goes insolvent before
// turn 6 (randomPolicy(1) of tests/scripts.ts: lost at turn 4, four
// squares). A gradeLine that printed totalTurns, or a strip padded to
// it, fails that pin and the square check below.
//
// Re-pinned for v1.3 Round 3, which retired MAI from player screens (v1.3
// section 4): the grade line ends "score n" and free play's second line
// starts "Final score n". Only those words changed; the numbers, squares,
// lines and their order are the same pins as before (the share's shape is
// R4's to change).
//
// v1.3 Round 4 (M37; QC G-056 and G-057): free play takes the Daily Op's
// four lines. Its longer text said "survived 6 of 6 turns" on a loss, put
// one technique in both its lists and seven beside eight hits; the four
// lines say only what the debrief says. The Daily Op's pins above are
// unchanged. The free-play pins below are new, and GUARD R4 (d) holds
// every free-play text to exactly four lines with no "survived" in it,
// over real games that lose as well as win.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { gradeOf, turnStrip } from '../src/engine/grade'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { startDailyOp } from '../src/ui/dailyOp'
import { SHARE_SQUARE, SHARE_URL, shareText } from '../src/ui/reportCard'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT, randomPolicy } from './scripts'

type Line = Record<number, TurnActions> | ((state: GameState) => TurnActions)

// Plays a script (orders by turn) or a policy (orders from the state).
function play(from: GameState, line: Line): GameState {
  const orders = typeof line === 'function' ? line : (s: GameState) => line[s.turn] ?? NO_OP
  let state = from
  while (state.status === 'playing') state = resolveTurn(state, orders(state), turnRng(state.seed, state.turn))
  return state
}

// The early ending: a random line that goes insolvent on this seed.
const EARLY_END = randomPolicy(1)

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
        'Grade S · won T6 · score 86.2',
        '\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E8}\u{1F7E8}\u{1F7E8}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('says practice on its first line, and nowhere else, for a run that is not the official one', () => {
    const end = play(startDailyOp(DAY).state, LOSS_SCRIPT)
    expect(shareText(end, { n: 1, official: false })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1 (practice)',
        'Grade D · lost T6 · score 49.6',
        '\u{1F7E8}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('names the turn the campaign ended on, not the scenario\'s length, for a run that ended early', () => {
    const end = play(startDailyOp(DAY).state, EARLY_END)
    // The run really did end early, and to insolvency (an F), so T4 below
    // is the turn it ended on and four squares are four turns played.
    expect(end.lossReason).toBe('insolvency')
    expect(end.history.length, 'the run did not end early').toBeLessThan(end.scenario.totalTurns)
    expect(shareText(end, { n: 1, official: true })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1',
        'Grade F · lost T4 · score 78.0',
        '\u{1F7E9}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('draws one square a turn, in the strip\'s colours, and keeps the URL line', () => {
    // The pins above are strings; this joins their squares to the strip,
    // the grade and the turn the run ended on, so a pin that drifted from
    // the screen would show. One line ends early, so a count of the
    // scenario's turns would not pass for a count of the turns played.
    let endedEarly = 0
    for (const line of [WIN_SCRIPT, LOSS_SCRIPT, EARLY_END]) {
      const end = play(startDailyOp(DAY).state, line)
      const lines = shareText(end, { n: 1, official: true }).split('\n')
      expect(lines[1].startsWith(`Grade ${gradeOf(end)} `)).toBe(true)
      expect(lines[1].split(' · ')[1], 'T is not the turn the run ended on').toBe(`${end.status === 'won' ? 'won' : 'lost'} T${end.history.length}`)
      expect(lines[2]).toBe(turnStrip(end).map((c) => SHARE_SQUARE[c]).join(''))
      expect([...lines[2]].length, 'not one square a turn').toBe(end.history.length)
      expect(lines[3]).toBe(SHARE_URL)
      if (end.history.length < end.scenario.totalTurns) endedEarly += 1
    }
    expect(endedEarly, 'no line ended before the last turn').toBeGreaterThan(0)
  })
})

describe('free play takes the four-line shape (v1.3 R4, M37)', () => {
  it('is exactly this for a won campaign', () => {
    const end = play(newGame(DEFAULT_SCENARIO, 20260712, 'standard'), WIN_SCRIPT)
    expect(end.status).toBe('won')
    expect(shareText(end)).toBe(
      [
        'DARK CONSTELLATION · Practice · Standard',
        'Grade S · won T6 · score 85.2',
        '\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E8}\u{1F7E8}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('is exactly this for a lost one on EASY, which says lost and never survived', () => {
    const end = play(newGame(DEFAULT_SCENARIO, 20260712, 'easy'), LOSS_SCRIPT)
    expect(end.status).toBe('lost')
    expect(shareText(end)).toBe(
      [
        'DARK CONSTELLATION · Practice · Easy',
        'Grade D · lost T6 · score 58.6',
        '\u{1F7E8}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('GUARD R4 (d): has exactly the four lines, and never says survived, on every line of play', () => {
    // Wins and losses, early and late, on both difficulties: the shape is
    // the same for all of them, and "survived" was the contradiction on a
    // loss (G-056).
    let lost = 0
    let won = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        for (const line of [WIN_SCRIPT, LOSS_SCRIPT, randomPolicy(seed)] as Line[]) {
          const end = play(newGame(DEFAULT_SCENARIO, seed, difficulty), line)
          const text = shareText(end)
          const lines = text.split('\n')
          expect(lines, `${difficulty} seed ${seed}: not four lines`).toHaveLength(4)
          expect(lines[0]).toBe(`DARK CONSTELLATION · Practice · ${difficulty === 'easy' ? 'Easy' : 'Standard'}`)
          expect(lines[1]).toBe(`Grade ${gradeOf(end)} · ${end.status === 'won' ? 'won' : 'lost'} T${end.history.length} · score ${end.history[end.history.length - 1].maiScore.toFixed(1)}`)
          expect(lines[2]).toBe(turnStrip(end).map((c) => SHARE_SQUARE[c]).join(''))
          expect(lines[3]).toBe(SHARE_URL)
          expect(text, `${difficulty} seed ${seed}: says survived`).not.toMatch(/surviv/i)
          if (end.status === 'lost') lost += 1
          else won += 1
        }
      }
    }
    // The positive controls: the walk met both endings.
    expect(lost, 'no line lost, so the loss case is untested').toBeGreaterThan(0)
    expect(won, 'no line won').toBeGreaterThan(0)
  })
})
