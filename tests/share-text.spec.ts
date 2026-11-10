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
// turn 6 (randomPolicy(1) of tests/scripts.ts: lost at turn 3, three
// squares, since v2.0 R1; turn 5 from v1.4, turn 4 before). A gradeLine
// that printed totalTurns, or a strip padded to it, fails that pin and
// the square check below.
//
// Re-pinned for v1.3 Round 3, which retired MAI from player screens (v1.3
// section 4): the grade line ends "score n" and free play's second line
// starts "Final score n". Only those words changed; the numbers, squares,
// lines and their order are the same pins as before (the share's shape is
// R4's to change).
//
// v1.3 Round 5 (Ken's ruling on R4's question 2): every grade line ends
// with the win line it is read against, "score 55.5 / 70", Daily Op and
// free play alike; the pins below moved by that and nothing else.
//
// v1.3 Round 7 (R5's question 4): the win line is named, "score 55.5, win
// line 70", since "/ 70" read as "out of 70" beside the HUD's "/ 100"; the
// pins below moved by that and nothing else.
//
// v1.5 R1 (R6 ledger G6-105): an insolvent run's grade line says "budget
// below zero", and the turn that went insolvent is a red square, so an F
// never shares a score above the win line on a green square without why.
// The early ending's score is 76.8 (78.2 before): the random line can
// order the IR retainer, whose recovery is 4 since this round.
//
// v1.4 (one new defense a night): the share text's form did not change;
// the games did. WIN_SCRIPT orders one defense a night, and wins this
// Daily seed at C (an S before) and 20260712 in free play at B (an S);
// randomPolicy(1) orders at most one, and goes insolvent at turn 5 (turn 4
// before), five squares. LOSS_SCRIPT orders nothing, so its pins stay.
//
// v1.6 R1 (Ken's ruling of 26 October 2026: each seed plays its own order
// of COLDVEIL's campaign): the share text's form did not change; the games
// did. The Daily seed and 20260712 both play the other order, the opening
// on the other layers and turns 4 and 5 traded: WIN_SCRIPT wins the Daily
// seed at S (a C before) and 20260712 at B; LOSS_SCRIPT loses both under
// the line; randomPolicy(1) still goes insolvent at turn 5, at 79.1.
//
// v1.7 R1 (the response): the share text's form did not change; the games
// did. A hit costs 9 a point on the meters (5 before) and the night asks
// what to do about a move that would land, so a line that rides every move
// out no longer wins on STANDARD. The winning pins are WIN_SCRIPT's orders
// with the night answered: by the `sensible` responder (the first response
// that fits, tests/policies.ts) on the Daily seed, a B at 77.5, and by
// the fixed WIN_RESPONSES (tests/scripts.ts) on 20260712, a B at 75.1 (the
// grade thresholds rose with the scores a response makes reachable).
// LOSS_SCRIPT and randomPolicy(1) still ride every move out, and lose
// lower. LOSS_SCRIPT ends the Daily seed at 32.9, under the collapse line
// on the last turn, so its D is an F (the pin below checks the reason),
// and ends 20260712 on EASY at 45.6, a D; randomPolicy(1) still goes
// insolvent at turn 5, at 65.7.
//
// v2.0 R1 (mission funding 20 to 14): the share text's form did not
// change; one game did. randomPolicy(1) runs out of budget two turns
// sooner on the Daily seed: insolvent at turn 3, at 74.2 (above the win
// line, so the line says why), three squares, green, red, red. The other
// pins hold as they were: the scripts' games close on less budget but
// meet the same moves with the same answers.
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
import { newGame } from '../src/engine/reducer'
import { playNight, type Responder } from '../src/engine/responses'
import type { GameState, TurnActions } from '../src/engine/types'
import { startDailyOp } from '../src/ui/dailyOp'
import { SHARE_SQUARE, SHARE_URL, shareText } from '../src/ui/reportCard'
import { ride, sensible } from './policies'
import { LOSS_SCRIPT, NO_OP, WIN_RESPONSES, WIN_RESPONSES_SEED, WIN_SCRIPT, playFixed, randomPolicy } from './scripts'

type Line = Record<number, TurnActions> | ((state: GameState) => TurnActions)

// Plays a script (orders by turn) or a policy (orders from the state),
// with a responder making the night's choices (v1.7 R1): every move is
// ridden out unless the test names another.
function play(from: GameState, line: Line, respond: Responder = ride): GameState {
  const orders = typeof line === 'function' ? line : (s: GameState) => line[s.turn] ?? NO_OP
  let state = from
  while (state.status === 'playing') state = playNight(state, orders(state), respond)
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
    const end = play(op.state, WIN_SCRIPT, sensible)
    expect(shareText(end, { n: op.daily!.n, official: true })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1',
        'Grade B · won T6 · score 77.5, win line 70',
        '\u{1F7E9}\u{1F7E8}\u{1F7E9}\u{1F7E5}\u{1F7E5}\u{1F7E8}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('says practice on its first line, and nowhere else, for a run that is not the official one', () => {
    const end = play(startDailyOp(DAY).state, LOSS_SCRIPT)
    // An F on the last turn (v1.7 R1): the score fell under the collapse
    // line as turn 6 closed, which ends a run as surely as an early turn.
    expect(end.lossReason).toBe('maiCollapse')
    expect(end.history).toHaveLength(end.scenario.totalTurns)
    expect(shareText(end, { n: 1, official: false })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1 (practice)',
        'Grade F · lost T6 · score 32.9, win line 70',
        '\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
        'https://kensden.github.io/dark-constellation',
      ].join('\n'),
    )
  })

  it('names the turn the campaign ended on, not the scenario\'s length, for a run that ended early', () => {
    const end = play(startDailyOp(DAY).state, EARLY_END)
    // The run really did end early, and to insolvency (an F), so T3 below
    // is the turn it ended on and three squares are three turns played
    // (T5 and five squares through v1.7; v2.0 R1's funding, 14 for 20,
    // empties the budget two turns sooner).
    expect(end.lossReason).toBe('insolvency')
    expect(end.history.length, 'the run did not end early').toBeLessThan(end.scenario.totalTurns)
    expect(shareText(end, { n: 1, official: true })).toBe(
      [
        'DARK CONSTELLATION · Daily Op #1',
        'Grade F · lost T3 · budget below zero · score 74.2, win line 70',
        '\u{1F7E9}\u{1F7E5}\u{1F7E5}',
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
    let won = 0
    for (const [line, respond] of [
      [WIN_SCRIPT, sensible],
      [LOSS_SCRIPT, ride],
      [EARLY_END, ride],
    ] as [Line, Responder][]) {
      const end = play(startDailyOp(DAY).state, line, respond)
      if (end.status === 'won') won += 1
      const lines = shareText(end, { n: 1, official: true }).split('\n')
      expect(lines[1].startsWith(`Grade ${gradeOf(end)} `)).toBe(true)
      expect(lines[1].split(' · ')[1], 'T is not the turn the run ended on').toBe(`${end.status === 'won' ? 'won' : 'lost'} T${end.history.length}`)
      expect(lines[2]).toBe(turnStrip(end).map((c) => SHARE_SQUARE[c]).join(''))
      expect([...lines[2]].length, 'not one square a turn').toBe(end.history.length)
      expect(lines[3]).toBe(SHARE_URL)
      if (end.history.length < end.scenario.totalTurns) endedEarly += 1
    }
    expect(endedEarly, 'no line ended before the last turn').toBeGreaterThan(0)
    expect(won, 'no line won, so "won T6" went unchecked').toBeGreaterThan(0)
  })
})

describe('an insolvent F says why (v1.5 R1, R6 ledger G6-105)', () => {
  it('ends on a red square and says the budget went below zero, on every insolvent run of a sweep', () => {
    let insolvent = 0
    let aboveTheLine = 0
    for (let seed = 1; seed <= 60; seed += 1) {
      const end = play(newGame(DEFAULT_SCENARIO, seed, 'standard'), randomPolicy(seed))
      if (end.lossReason !== 'insolvency') continue
      insolvent += 1
      const lines = shareText(end).split('\n')
      if (end.history.at(-1)!.maiScore >= end.scenario.winThreshold) aboveTheLine += 1
      expect(lines[1], `seed ${seed}`).toContain('budget below zero')
      expect([...lines[2]].at(-1), `seed ${seed}: the run's last square`).toBe(SHARE_SQUARE.magenta)
    }
    // Not vacuous: insolvent runs whose score sat above the win line.
    expect(insolvent).toBeGreaterThan(0)
    expect(aboveTheLine, 'no insolvent run ended above the win line, so the green square went untested').toBeGreaterThan(0)
  })
})

describe('free play takes the four-line shape (v1.3 R4, M37)', () => {
  it('is exactly this for a won campaign', () => {
    // The prepared line with its fixed answers (v1.7 R1, WIN_RESPONSES).
    expect(WIN_RESPONSES_SEED).toBe(20260712)
    const end = playFixed(WIN_RESPONSES_SEED, WIN_SCRIPT, WIN_RESPONSES)
    expect(end.status).toBe('won')
    expect(shareText(end)).toBe(
      [
        'DARK CONSTELLATION · Practice · Standard',
        'Grade B · won T6 · score 75.1, win line 70',
        '\u{1F7E9}\u{1F7E8}\u{1F7E9}\u{1F7E5}\u{1F7E5}\u{1F7E8}',
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
        'Grade D · lost T6 · score 45.6, win line 70',
        '\u{1F7E5}\u{1F7E8}\u{1F7E5}\u{1F7E5}\u{1F7E5}\u{1F7E5}',
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
    let wonOnStandard = 0
    for (const difficulty of ['standard', 'easy'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        // The prepared line twice since v1.7 R1: ridden out, as before, and
        // with the night answered, which is how a STANDARD run wins now.
        for (const [line, respond] of [
          [WIN_SCRIPT, ride],
          [WIN_SCRIPT, sensible],
          [LOSS_SCRIPT, ride],
          [randomPolicy(seed), ride],
        ] as [Line, Responder][]) {
          const end = play(newGame(DEFAULT_SCENARIO, seed, difficulty), line, respond)
          const text = shareText(end)
          const lines = text.split('\n')
          expect(lines, `${difficulty} seed ${seed}: not four lines`).toHaveLength(4)
          expect(lines[0]).toBe(`DARK CONSTELLATION · Practice · ${difficulty === 'easy' ? 'Easy' : 'Standard'}`)
          const why = end.lossReason === 'insolvency' ? ' · budget below zero' : ''
          expect(lines[1]).toBe(`Grade ${gradeOf(end)} · ${end.status === 'won' ? 'won' : 'lost'} T${end.history.length}${why} · score ${end.history[end.history.length - 1].maiScore.toFixed(1)}, win line 70`)
          expect(lines[2]).toBe(turnStrip(end).map((c) => SHARE_SQUARE[c]).join(''))
          expect(lines[3]).toBe(SHARE_URL)
          expect(text, `${difficulty} seed ${seed}: says survived`).not.toMatch(/surviv/i)
          if (end.status === 'lost') lost += 1
          else won += 1
          if (end.status === 'won' && difficulty === 'standard') wonOnStandard += 1
        }
      }
    }
    // The positive controls: the walk met both endings.
    expect(lost, 'no line lost, so the loss case is untested').toBeGreaterThan(0)
    expect(won, 'no line won').toBeGreaterThan(0)
    expect(wonOnStandard, 'no line won on STANDARD').toBeGreaterThan(0)
  })
})
