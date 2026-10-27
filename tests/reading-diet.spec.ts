// Reading diet battery (brief v0.5 section 5, Round 3). The copy budget is
// a design constraint with a number on it, so it is measured rather than
// trusted: the headline stays inside eight words, the deciding board stays
// inside its reading budget before the player's first input (150 words
// since v1.3 R2, which re-baselined it for the TONIGHT and orders cards),
// and the verdict line stays one line. Every string is derived from the
// deck, so a content change that would blow the budget fails here.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { briefFree, gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { planFor } from '../src/engine/campaign'
import { briefActive, countersAfter, eventById } from '../src/engine/rules'
import { coverage, maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { AssetKind, Difficulty, GameState, TurnActions } from '../src/engine/types'
import {
  chainLine,
  CHROME_WORD_BUDGET,
  DISCLOSURE_WORD_BUDGETS,
  coverageLine,
  fullBriefCopy,
  helpCopy,
  FIRST_INPUT_WORD_BUDGET,
  HEADLINE_WORD_MAX,
  briefCopy,
  chromeCopy,
  chromeWords,
  countWords,
  firstInputCopy,
  firstInputWords,
  SYSTEM_GEAR_LABEL,
} from '../src/ui/brief'
import { ACTIONS } from '../src/ui/board/actions'
import {
  BRIEF_LABEL,
  BUDGET_LABEL,
  COLDVEIL_LABEL,
  FIRST_ORDERS_SET,
  HELP_LABEL,
  INTEL_ROW,
  REMAINING,
  SCORE_LABEL,
  SECOND_ORDER,
  hiddenOrder,
  tonightSlots,
  STATUS,
  UNIDENTIFIED,
  WORST_CASE,
  briefButton,
  briefLockedRow,
  firstOrders,
  moveStatus,
  shortName,
  showsStrength,
  strengthLine,
  vectorTo,
  winLineLabel,
} from '../src/ui/board/boardModel'
import { callSigns } from '../src/ui/board/board'
import { coverageFigure } from '../src/ui/labels'
import { howToLines } from '../src/ui/systemControls'
import { HitCard } from '../src/ui/night/cards'
import { stopsKnown } from '../src/ui/night/nightModel'
import { DebrisCall, DebrisResult, EndOfTurn, OpportunityCard } from '../src/ui/night/closeCards'
import * as nightCopy from '../src/ui/night/nightCopy'
import { defensesFor, nightOf, type NightStep } from '../src/ui/night/nightModel'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

// How many words the expansion must carry that the summary does not.
// Deliberately set where today's build FAILS it on three of four intel
// levels: a floor placed just under the current minimum is a floor that
// can never fire, which is the thing this round exists to stop shipping.
// Six is chosen against the measured shape rather than picked: the old
// intel-0 expansion carried exactly six, and every one of them was a
// function word, so six is the number that proves the bar is about
// content and not about length.
const DISCLOSURE_NOVEL_MIN = 6

// The night card's headline (v1.3 Round 3: the header line and the
// heading under it, which took the place of the v1.1 playback card's
// title), bounded here for the same reason. Set from the measured worst
// plus room when it bounded the title, and kept at 14 when the night
// replaced the card; the message prints the new worst so re-baselining
// forces a sentence about why.
const CARD_HEADLINE_WORD_BUDGET = 14
// The measured worst, pinned: a hit card's header over the longest move
// name, "COLDVEIL MOVES · TURN 4" over "Docking LiDAR dazzle on the RPO
// sat" (the top-intel line on Easy, seed 2).
const WORST_CARD_HEADLINE = 12

// The hit card's M3 line (critique row M3, FIX batch 1, October 2026),
// measured over the EXTREME_SEEDS sweep the way Round 7b measured the
// title, and the card's headline and line together. Pinned, so a change
// that moves either comes here and says so.
//
// 14 and 20 through v1.3 Round 0: the line at its structural maximum (two
// long defense names), and the rogue ground station's card (6 words of
// title over the 14-word line, the passive line on turn 5 on Easy, seed 2).
//
// 35 and 45 since v1.3 Round 3, which moved the line into the hit card's
// outcome block (src/ui/night/cards.tsx) and retired
// src/ui/wouldHaveHelped.ts. The UNDEFENDED line now also says what else
// the defense stops among the threats the player has met or named (this
// move and one more by name, the rest counted as "n more threats you have
// met": listing them all ran the line to 42 words, and a bare "1 more"
// read as cryptic to the fresh-eyes review), then "It is in PROCURE next
// turn." before the last turn (Ken cut the brief's "...with that written
// on it", 22 October 2026: 40 and 50 before). Since R6 (question 2) the
// line says "stops" only of what the defense blocks alone and "blunts" of
// the rest; past two names it keeps this move and counts the rest as
// answered (the two verbs with every name ran it to 41). After the engine
// round (Decisions Q1: fewer pairings, so fewer threats a defense answers)
// the worst line is ground segment ransomware's on the passive line, turn 5
// on Easy, seed 16, at 30 words, and the worst card the rogue ground
// station's on the same line, seed 2, at 40 with its headline (33 and 44
// before it, 35 and 45 before R6). 29 since v1.6 R1, when each seed plays
// its own order: the same line, turn 5 on Easy, seed 8, prepared.
const WORST_HELPED_LINE = 29
const WORST_HIT_CARD_HEADLINE_AND_LINE = 40

// The deciding board's reading at its longest over the swept lines of play
// (v1.3 R2), pinned so a change that moves it comes here and says so;
// src/ui/brief.ts quotes it as the reason FIRST_INPUT_WORD_BUDGET is 150.
// 150 since R6 (Decisions Q11): the rule line's true words take 4 more on
// each of turn 5's two slots; at the bound, with no word to spare. 139 once
// the engine round's longer defense streaks put a STREAK chip on that board
// (151) and the rule is said once a night, not on every drawn slot. 138
// since v1.4: one new defense a night ends the prepared line's long
// streaks, so its turn 5 lost the STREAK chip, and the worst board is the
// lazy line's turn 5 on Easy, seed 1, with no orders and the moves named.
// 144 after the v1.4 fresh-eyes review: FIRST ORDERS says the rule where
// turn 1 asks for the order ("You get 1 new defense a night.", 6 words),
// so turn 1 is the worst board again (prepared, Easy, seed 1, no orders).
// 148 since v1.5 R1: the line says the other door instead ("1 new defense
// a turn, so COLDVEIL takes the other door.", 10 words; R6b's fresh eyes,
// item 2), and 149 once the drone "arrives next turn", not "tomorrow"
// (the game counts in turns; v1.4's fresh eyes, finding 11). 145 after
// the round's phone check: that line ran the turn-1 board 3px past
// 375x667, so it is shorter ("Tap a red move above to block it. 1 new
// defense a turn, so they hit the other one."). 144 since v1.6 R1, on
// turn 4 (top intel, Easy, seed 1, the line's orders, the moves named):
// turn 1's watch officer says one sentence where it said two, and the
// other opening's PNT jamming against a time spoof runs two words longer
// than uplink jamming against GNSS spoofing. 111 since v1.6 R3 (Ken's
// playtest item 1), on the same board: the rule and the keys stand behind
// TONIGHT's "?", the margin's words left the HUD for its bar, the move
// cards carry their dots without STRENGTH, and the coach shows one step;
// 109 once the slot header reads WILL HIT 1 OF N under COLDVEIL's chip;
// 108 once the intel row is its button alone (the round's fresh eyes, H15).
const WORST_BOARD = 108
// The thinnest full brief sheet and the longest (v1.6 R3), measured.
// 8 novel tokens on a dark night (prepared, turn 2, Easy, seed 2), where
// the sheet has the coverage line and asks for the brief; 48 words on the
// night with the most named moves.
const WORST_NOVEL = 8
const WORST_SHEET = 48

const tokensOf = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])

// The words behind the full brief's icon that the board does not already
// say (v1.6 R3: the sheet keeps only what the board does not show). Derived
// from the copy the sheet renders and the board's own lists, not from a
// second copy of the strings.
function novelTokens(state: GameState, briefed: boolean): string[] {
  const board = tokensOf(firstInputCopy(state).join(' '))
  const sheet = fullBriefCopy(state, briefed)
  return [...tokensOf([sheet.coverage, ...sheet.moves.map((m) => m.tag ?? ''), sheet.dark ?? ''].join(' '))].filter((w) => !board.has(w))
}
const SEEDS = 12
// The tests that pin a MEASURED EXTREME (the thinnest disclosure, the
// longest beat title, now the night card's headline and the hit card's M3
// line) sweep wider. A pin is only as good as the sweep
// that reaches the extreme, and when the deck stream of v1.2 R5a moved
// every campaign's draws, both extremes left the first 12 seeds (they come
// up at seeds 15 and 24): a 12-seed sweep re-pinned to what it could see
// would have let the real extreme outgrow its budget unseen.
const EXTREME_SEEDS = 40
// EASY and STANDARD since v1.3 Round 0, which retired Expert (brief 5.1).
const DIFFS: Difficulty[] = ['easy', 'standard']
// Five lines of play, so the copy is measured against the deck as a lazy
// player meets it as well as a prepared one. The top-intel line is the one
// that mattered most to the budget and was missing until Round 3.5: the
// other four never reached effective intel 3, so the longest brief the game
// could produce was never measured at all. Since v1.3 Round 0 it orders the
// intel brief every night (D2 a), the only intel there is.
const LINES: [string, Record<number, TurnActions>][] = [
  ['prepared', WIN_SCRIPT],
  ['top intel', TOP_INTEL_SCRIPT],
  ['mixed', MIXED_SCRIPT],
  ['lazy', LAZY_SCRIPT],
  ['passive', LOSS_SCRIPT],
]

function* playTurns(seed: number, script: Record<number, TurnActions>, difficulty: Difficulty = 'standard') {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  while (state.status === 'playing') {
    const next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    yield { before: state, after: next }
    state = next
  }
}

type Campaign = {
  name: string
  difficulty: Difficulty
  seed: number
  turns: { before: GameState; after: GameState }[]
}

// Every line of play on every difficulty over EXTREME_SEEDS: 600 campaigns,
// played once for both tests that sweep that wide. Each used to replay all
// of them for itself, and the replay is nearly all of either test's time
// (the copy it measures is cheap by comparison), so the slower of the two
// crossed vitest's five-second default on a GitHub runner (5,013 and 5,884
// ms, v1.2 R5b) while taking 1.8 s locally.
function playExtremes(): Campaign[] {
  const out: Campaign[] = []
  for (const [name, script] of LINES) {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= EXTREME_SEEDS; seed += 1) {
        out.push({ name, difficulty, seed, turns: [...playTurns(seed, script, difficulty)] })
      }
    }
  }
  return out
}

// Every fidelity the brief can show on a turn, so it is measured at the one
// that produces the longest copy, not just the default. The intel levels 0
// to 3 left in v1.3 Round 0 (D2 a): the brief now NAMES tonight's moves or
// leaves them DARK. It names them on a night it is free (turn 1, and the
// turns an allied data share covers) and on any night it is ordered, which
// the board shows at once (the TONIGHT card's `brief` since v1.3 R2), so
// a turn that is not free can show either and a free one only the named
// copy.
const fidelities = (state: GameState): boolean[] => (briefFree(state) ? [true] : [false, true])
const fidelityLabel = (briefed: boolean) => (briefed ? 'brief named' : 'brief dark')

// The same turn with the brief free on it, as an allied data share makes a
// later turn (benefit.briefTurns): the first screen then carries the named
// copy before any input, which is the only way the named copy reaches
// firstInputCopy after turn 1.
const freeTonight = (state: GameState): GameState => ({ ...state, briefFreeThrough: Math.max(state.briefFreeThrough, state.turn) })

// The board reads tonight's queued orders as well as the state (v1.3 R2:
// a status turns BLOCKED, an order ticks, the intel row says ORDERED), so a
// turn is measured as it opens and with the line's own orders queued.
const ordersOf = (script: Record<number, TurnActions>, state: GameState): [string, TurnActions][] => [
  ['no orders', NO_OP],
  ["the line's orders", script[state.turn] ?? NO_OP],
]

// THE NIGHT'S CARDS (v1.3 Round 3, brief 5.5), which replaced the v1.1
// director's playback card and its titles. What each card puts above its
// body, read off the night's model and copy the way src/ui/night/cards.tsx
// and closeCards.tsx print it: the header line, and the heading under it
// (a hit card's move, the call's event, the call's result, an
// opportunity; on the last END OF TURN, the ending's head). The tests that
// measure it render cards of every kind and check they say the same, so
// this cannot drift from what the cards print.
interface NightCard {
  kind: string
  head: string
  heading: string
  step?: NightStep
}
function nightCards(before: GameState, after: GameState): NightCard[] {
  const night = nightOf(before, after)
  const out: NightCard[] = []
  for (const step of night.steps) {
    if (step.kind === 'threat') out.push({ kind: 'hit', head: nightCopy.hitHeader(night.turn), heading: shortName(step.def), step })
    else if (step.kind === 'debris') {
      const d = step.ev.debris!
      out.push({ kind: 'call', head: nightCopy.callHeader(night.turn), heading: shortName(step.def), step })
      out.push({ kind: 'debris', head: nightCopy.conjunctionHeader(night.turn), heading: nightCopy.debrisTitle(d.lost, d.choice), step })
    } else out.push({ kind: 'opportunity', head: nightCopy.opportunityHeader(night.turn), heading: step.def.name, step })
  }
  const ending = night.record.ledger.insolvent
    ? nightCopy.INSOLVENT
    : after.status === 'playing'
      ? ''
      : nightCopy.ENDING[after.status === 'won' ? 'won' : (after.lossReason ?? 'belowThreshold')].head
  out.push({ kind: 'end', head: nightCopy.endHeader(night.turn), heading: ending })
  return out
}

// A new player's device as the night reads it: every threat met or named
// so far in the campaign, tonight's included. And whether tonight is the
// last turn, which drops the hit card's PROCURE sentence.
const knownBy = (after: GameState) => new Set(after.history.flatMap((r) => [...r.events.map((e) => e.eventId), ...r.named]))
const lastTurnOf = (after: GameState) => after.history[after.history.length - 1].turn >= after.scenario.totalTurns || after.status !== 'playing'

// The hit card's M3 line (critique row M3), in its outcome block since
// v1.3 Round 3 (src/ui/night/cards.tsx, Outcome). On an UNDEFENDED block:
// "What would have helped: <defense>, n CR. It stops <the move, and the
// threats the defense answers that the player has met or named>." and,
// before the last turn, "It is in PROCURE next turn with that written on
// it." On a REDUCED block: "Would have finished it: <defense>, n CR." None
// on a HELD block, or where the move lists no defense the player lacks.
function helpedLine(step: NightStep, known: ReadonlySet<string>, lastTurn: boolean): string | null {
  const { ev, def } = step
  const scenario = step.after.scenario
  const { held, missing } = defensesFor(def, step.after.counters, scenario)
  if (!missing || (ev.outcome === 'held' && held)) return null
  if (ev.outcome === 'reduced' && held) return nightCopy.finishedIt(missing.name, missing.cost).join('')
  return `${nightCopy.wouldHaveHelped(missing.name, missing.cost).join('')} ${nightCopy.itStops(stopsKnown(missing, def, scenario, known))}${lastTurn ? '' : ` ${nightCopy.IN_PROCURE}`}`
}

// A card as the night renders it, as markup (react-dom/server, since this
// suite has no DOM), and a piece of it read back as the words it prints.
const noop = () => {}
function renderCard(card: NightCard, before: GameState, after: GameState): string {
  const record = after.history[after.history.length - 1]
  if (card.kind === 'end') {
    return renderToStaticMarkup(createElement(EndOfTurn, { record, state: after, scoreFrom: maiScore(before), reduced: true, play: noop, onNext: noop }))
  }
  const step = card.step!
  if (card.kind === 'call') return renderToStaticMarkup(createElement(DebrisCall, { step, turn: record.turn, filed: false, reduced: true, onCall: noop }))
  const props = {
    step,
    turn: record.turn,
    lastTurn: lastTurnOf(after),
    signs: new Map([...callSigns(before), ...callSigns(after)]),
    known: knownBy(after),
    first: true,
    reduced: true,
    play: noop,
    onContinue: noop,
  }
  return renderToStaticMarkup(createElement(card.kind === 'hit' ? HitCard : card.kind === 'debris' ? DebrisResult : OpportunityCard, props))
}
const decode = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const pick = (html: string, re: RegExp) => {
  const m = re.exec(html)
  return m ? decode(m[1]) : undefined
}

describe('reading diet: the intel brief', () => {
  // Played in a hook rather than by the first test that needs them, so the
  // shared cost is timed as setup and not charged to whichever test runs
  // first (see playExtremes).
  let extremes: Campaign[] = []
  beforeAll(() => {
    extremes = playExtremes()
  })

  it('keeps the headline inside its word budget on every turn, brief fidelity and difficulty', () => {
    let checked = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            for (const briefed of fidelities(before)) {
              const copy = briefCopy(before, briefed)
              checked += 1
              expect(
                countWords(copy.headline),
                `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${fidelityLabel(briefed)}: "${copy.headline}"`,
              ).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(SEEDS * DIFFS.length * LINES.length * 4)
  })

  it('keeps both brief fidelities inside the headline budget, including the named-event headline', () => {
    // v1.3 Round 0: the two fidelities on every turn of a campaign stand in
    // for the four intel levels a player could buy up to. The named-event
    // headline is the briefed one on a turn with a CONFIRMED move, which
    // carries the technique tag; counted, so the sweep cannot quietly stop
    // reaching it.
    let named = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, LOSS_SCRIPT)) {
        for (const briefed of [false, true]) {
          const copy = briefCopy(before, briefed)
          if (copy.tag) named += 1
          expect(countWords(copy.headline), `${copy.headline}`).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
          expect(copy.headline.length).toBeGreaterThan(0)
          expect(copy.vector.length).toBeGreaterThan(0)
        }
      }
    }
    expect(named, 'no state named a confirmed move, so the named-event headline was not measured').toBeGreaterThan(0)
  })

  it('stays inside the reading budget before the first input on every turn of a campaign', () => {
    // Since v1.3 R2 the first screen is the deciding board (brief 5.3): the
    // HUD's figures, the TONIGHT card and the orders card, which
    // firstInputCopy mirrors. The board also reads tonight's queued orders
    // (a status turns BLOCKED, an order ticks, the intel row says ORDERED),
    // so each turn is measured twice: as it opens, and with the line's own
    // orders queued, which is what it reads just before EXECUTE.
    const overruns: string[] = []
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            for (const [queued, actions] of ordersOf(script, before)) {
              const words = firstInputWords(before, actions)
              if (words > FIRST_INPUT_WORD_BUDGET) {
                overruns.push(
                  `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${queued}: ${words} words\n  ${firstInputCopy(
                    before,
                    actions,
                  ).join(' / ')}`,
                )
              }
            }
          }
        }
      }
    }
    expect(overruns.join('\n')).toBe('')
  })

  it('stays inside the budget with the brief free on any turn, as an allied data share makes it', () => {
    // v1.3 Round 0. The intel levels the opening could reach left with the
    // intel investment; what puts the named copy on the first screen now is
    // a free brief, which an allied data share extends to later turns. The
    // sweep above meets those turns only where a seed draws the share, so
    // every turn of a campaign is measured here with the brief free, which
    // is a superset of what play reaches (no share can free turn 2).
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, LOSS_SCRIPT)) {
        const state = freeTonight(before)
        expect(briefFree(state), `turn ${state.turn}: the fixture did not free the brief`).toBe(true)
        expect(
          firstInputWords(state),
          `turn ${state.turn}, seed ${seed}, brief free: ${firstInputCopy(state).join(' / ')}`,
        ).toBeLessThanOrEqual(FIRST_INPUT_WORD_BUDGET)
      }
    }
  })

  it('actually measures the fidelity that produces the longest copy', () => {
    // The budget sweeps are only worth their green if the states they walk
    // include the expensive ones. Until Round 3.5 the campaign sweep never
    // reached effective intel 3 (it reached 2 on nine of its 1,551 turns,
    // through the mixed line's allied intel boost), so the branch carrying
    // the named lead event, the "plus N more" suffix and the carried
    // vector clause was measured nowhere. This fails if that coverage goes.
    //
    // v1.3 R2: the board names the moves where the brief is free or
    // ordered and leaves them Unidentified otherwise, so the fidelity is
    // briefActive with the queued orders. The expensive branches the sweep
    // must reach are the named cards (a name, a vector, a strength and a
    // status each), the dark cards with the intel row, a CONFIRMED slot
    // beside the drawn one, the chain banner, and turn 1's FIRST ORDERS
    // both open and set. Each is required separately.
    const reached = new Set<string>()
    let worst = 0
    let worstAt = ''
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            for (const [queued, actions] of ordersOf(script, before)) {
              const named = briefActive(before, actions)
              reached.add(fidelityLabel(named))
              const slots = planFor(before, before.turn)?.slots ?? []
              if (named && slots.some((s) => s.fixed) && slots.some((s) => !s.fixed)) reached.add('named beside a confirmed move')
              if (gnssDenied(before.conditions, before.scenario)) reached.add('under the chain banner')
              if (before.turn === 1) {
                const lines = firstOrders(before, actions)
                reached.add(lines.every((l) => l.done) ? 'first orders set' : 'first orders open')
              }
              const words = firstInputWords(before, actions)
              if (words > worst) {
                worst = words
                worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${queued}, ${fidelityLabel(named)}`
              }
            }
          }
        }
      }
    }
    for (const branch of ['brief named', 'brief dark', 'named beside a confirmed move', 'under the chain banner', 'first orders open', 'first orders set']) {
      expect([...reached], `the sweep never reaches the ${branch} branch`).toContain(branch)
    }
    // Two-sided on purpose. The ceiling is the budget; the floor is the
    // reason the coverage matters, because a sweep that stopped producing
    // long copy would pass the budget while measuring nothing.
    expect(worst, `worst board measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(FIRST_INPUT_WORD_BUDGET)
    // The exact figure, because src/ui/brief.ts quotes it as the reason the
    // budget is what it is. The message prints the new worst, so
    // re-baselining is a one-line edit that forces that comment to be
    // updated with it.
    //
    // 54 through v1.2, at top intel; 56 in v1.3 Round 0, on a dark turn.
    // WORST_BOARD since v1.3 R2, on the new board (see the constant).
    expect(worst, `worst board measured: ${worst} words at ${worstAt}`).toBe(WORST_BOARD)
  })

  it('counts every line the board is built from, so none can be dropped from the budget', () => {
    // firstInputCopy is a hand-written enumeration, and the suite is its
    // only reader: a line the board renders could be deleted from the
    // measured set and every budget test would still pass, quieter and
    // wrong. So the enumeration is checked against the pieces the board is
    // actually built from rather than trusted to list them: the deck's plan
    // for the turn, the engine's score and balance, and the orders.
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          for (const [queued, actions] of ordersOf(script, before)) {
            const measured = firstInputCopy(before, actions)
            const where = `${name}, turn ${before.turn}, seed ${seed}, ${queued}`
            const { scenario } = before
            const has = (line: string, what: string) => expect(measured, `${where}: ${what} missing`).toContain(line)
            // The HUD. The score is the one number the player steers by, and
            // it is counted rather than merely found, exactly once, as the
            // Readout prints it (one decimal while it has one).
            const score = maiScore(before)
            expect(
              measured.filter((line) => line === String(score)).length,
              `${where}: the score ${score} is not counted exactly once`,
            ).toBe(1)
            has(`${before.credits} CR`, 'the budget')
            // The margin's words left the HUD for its bar (v1.6 R3).
            expect(measured.some((line) => /WIN LINE$/.test(line) && /ABOVE|BELOW/.test(line)), `${where}: the margin's words are counted`).toBe(false)
            has(winLineLabel(scenario.winThreshold), 'the win line')
            has(`TURN ${before.turn} OF ${scenario.totalTurns}`, 'the turn')
            // The TONIGHT card: the intro, the chain banner while GNSS
            // denial is live, and every move the plan holds, named where the
            // brief names it (or the slot is fixed) and Unidentified where it
            // does not, each with its vector, and a named one with its
            // strength and its status.
            const plan = planFor(before, before.turn)
            if (plan?.intro) has(plan.intro, 'the intro')
            // The whole line the card prints, the strength it adds included.
            if (gnssDenied(before.conditions, scenario)) has(chainLine(), 'the chain banner')
            const named = briefActive(before, actions)
            const counters = countersAfter(before, actions)
            let unnamed = 0
            const statusWords = new Map<string, number>()
            for (const slot of plan?.slots ?? []) {
              for (const id of slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])) {
                const ev = eventById(scenario, id)
                has(vectorTo(ev), `${id}'s vector`)
                if (slot.fixed || named) {
                  has(shortName(ev), `${id}'s name`)
                  // An attack's strength; the debris call shows none (v1.5 R1).
                  if (showsStrength(ev)) has(strengthLine(ev), `${id}'s strength`)
                  const word = STATUS[moveStatus(before, ev, counters)].word
                  statusWords.set(word, (statusWords.get(word) ?? 0) + 1)
                } else unnamed += 1
              }
            }
            expect(measured.filter((line) => line === UNIDENTIFIED).length, `${where}: unnamed moves miscounted`).toBe(unnamed)
            // Each status counted once per card, so two cards reading the same
            // word cannot cover for each other. The key on turns 1 and 2
            // prints the word with its gloss, which is a different line.
            for (const [word, n] of statusWords) {
              expect(measured.filter((line) => line === word).length, `${where}: ${word} miscounted`).toBe(n)
            }
            // The intel row is its control alone since v1.6 R3 (H15), counted
            // as chrome; its old sentence is not read.
            expect(measured, `${where}: the intel row's sentence is counted`).not.toContain(INTEL_ROW.none)
            // The orders card.
            if (before.turn === 1) {
              // The coach shows the step in hand, and only it (v1.6 R3).
              const lines = firstOrders(before, actions)
              const next = lines.find((l) => !l.done)
              if (!next) has(FIRST_ORDERS_SET, 'first orders set')
              else {
                has(next.text, `the ${next.id} step`)
                for (const l of lines) if (l !== next) expect(measured, `${where}: the coach counts a step not in hand`).not.toContain(l.text)
              }
            } else if (before.turn === 2)
              // While tonight's moves are hidden it asks for the intel brief
              // first (R6 question 14).
              has(tonightSlots(before, actions).some((s) => s.hidden) ? hiddenOrder(before.scenario.prices.intelBrief) : SECOND_ORDER, 'the second order')
          }
        }
      }
    }
  })

  it('counts every control the chrome bound claims to cover', () => {
    // The reading-load side has had an enumeration guard since Round 3.5;
    // the chrome side had none, so an entry could be deleted and the bound
    // would simply get easier to meet. That is what a bound satisfied by
    // not counting things looks like, and it is how four controls went
    // uncounted until v0.9: the menu button, the two save controls and the
    // autosave line.
    //
    // Since v1.3 R2 the chrome is the new board's: the HUD's two labels,
    // SYSTEM, the full brief's toggle, each move's "defend ›", "details ›"
    // or "reveal ›", the brief's price button on a night it is not free,
    // and the dock's REMAINING, WORST CASE, PROCURE and EXECUTE. The step
    // numbers, the F keys, the objective line, "Skip tips" and the two
    // reference disclosures left the board with R2.
    //
    // Since v1.6 R3 (Ken's playtest items 1 and 6) TONIGHT's header carries
    // COLDVEIL's chip, the "?" and the full brief's icon, and no move card
    // carries a tap hint: the whole card is the control.
    const required = [SCORE_LABEL, BUDGET_LABEL, SYSTEM_GEAR_LABEL, COLDVEIL_LABEL, HELP_LABEL, BRIEF_LABEL, REMAINING, WORST_CASE, ...ACTIONS.map((a) => a.label)]
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          for (const [queued, actions] of ordersOf(script, before)) {
            const chrome = chromeCopy(before, actions)
            const where = `${name}, turn ${before.turn}, seed ${seed}, ${queued}`
            for (const control of required) {
              expect(chrome, `${where}: chrome no longer counts "${control}"`).toContain(control)
            }
            // No chevron anywhere in the board's chrome (v1.6 R3).
            expect(chrome.filter((c) => c.includes('›')), `${where}: a control still carries a chevron`).toEqual([])
            // The brief's row: its order button, or LOCKED once ordered
            // (v1.5 R2).
            if (!briefFree(before)) {
              const price = before.scenario.prices.intelBrief
              expect(chrome, `${where}: chrome does not count the brief's row`).toContain(actions.intelBrief ? briefLockedRow(price) : briefButton(price))
            }
          }
        }
      }
    }
    // The other direction: a control that leaves the screen but stays in
    // the list makes the bound look tighter than it is, which is the same
    // dishonesty in reverse. Pinned against the source that renders them,
    // since there is no DOM here to ask; each control is pinned where it
    // actually lives. tests/game.dom.spec.tsx asserts the counted lines
    // against a rendered DOM, which is what tells a rendered control from
    // one in a branch nothing reaches.
    const source = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')
    const hud = source('ui', 'board', 'BoardHud.tsx')
    const tonight = source('ui', 'board', 'Tonight.tsx')
    const dock = source('ui', 'board', 'Dock.tsx')
    const renderedIn: [string, string, string][] = [
      ['the score label', '{SCORE_LABEL}', hud],
      ['the budget label', '{BUDGET_LABEL}', hud],
      [SYSTEM_GEAR_LABEL, `aria-label="${SYSTEM_GEAR_LABEL}"`, hud],
      ["COLDVEIL's chip", 'aria-label={COLDVEIL_LABEL}', tonight],
      ['the "?" key', 'label={HELP_LABEL}', tonight],
      ["the full brief's icon", 'label={BRIEF_LABEL}', tonight],
      ["the brief's price button", '{briefButton(briefPrice', tonight],
      ['REMAINING', '{REMAINING}', dock],
      ['WORST CASE', '{WORST_CASE}', dock],
      // The dock spells its two actions; they must be the labels counted.
      ...ACTIONS.map((a): [string, string, string] => [a.label, a.label, dock]),
    ]
    for (const [control, piece, file] of renderedIn) {
      expect(file.includes(piece), `chrome counts ${control}, which the board no longer renders`).toBe(true)
    }
    // The system controls left the first screen for the sheet, which lists
    // them by name (src/ui/systemControls.ts since v1.3 R1, where Save left
    // with the slots and Back to menu became Back to title);
    // tests/action-bar.dom.spec.tsx renders that list.
    const systemList = source('ui', 'systemControls.ts')
    const systemSheet = source('ui', 'SystemPanel.tsx')
    for (const name of ['Copy save code', 'Back to title']) {
      expect(systemList.includes(name), `the SYSTEM sheet no longer lists "${name}"`).toBe(true)
    }
    // The two audio toggles read their names from SOUND_TOGGLE_LABELS
    // rather than spelling them, so a text pin would be circular. What has
    // to be true is that the SYSTEM sheet mounts the control and that the
    // control renders those names, and the second half is asserted against
    // a rendered DOM in tests/sound.dom.spec.tsx rather than by grep.
    expect(systemSheet.includes('<SoundToggles'), 'the SYSTEM sheet does not mount the two toggles').toBe(true)
    const toggles = source('ui', 'cues', 'SoundToggles.tsx')
    expect(toggles.includes('SOUND_TOGGLE_LABELS'), 'the toggles no longer read their names from the counted constant').toBe(
      true,
    )
  })

  it('bounds the interface chrome that the reading budget excludes', () => {
    // The budget counts the board's reading load, not navigation. The
    // excluded words are still counted here, so the exclusion cannot grow
    // into a loophole.
    for (const [, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          for (const [, actions] of ordersOf(script, before)) {
            expect(chromeWords(before, actions), chromeCopy(before, actions).join(' / ')).toBeLessThanOrEqual(CHROME_WORD_BUDGET)
          }
        }
      }
    }
  })

  it('keeps the board and its chrome together inside the two budgets on screen', () => {
    // The two budgets added: a sanity ceiling on everything the deciding
    // board puts in front of the player, badges aside.
    for (const [, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          for (const [queued, actions] of ordersOf(script, before)) {
            const total = firstInputWords(before, actions) + chromeWords(before, actions)
            expect(total, `turn ${before.turn}, seed ${seed}, ${queued}`).toBeLessThanOrEqual(
              FIRST_INPUT_WORD_BUDGET + CHROME_WORD_BUDGET,
            )
          }
        }
      }
    }
  })

  // ------------------------------------------------------------------
  // THE FLOOR (Round 7b). Everything above this point is a CEILING, and
  // the ceilings were the whole battery for eleven rounds: Round 3.5 added
  // an entire line of play to reach the longest copy the game can produce
  // and nobody ever looked at the shortest. A brief reading "Forecast dark
  // at intel level zero" scores beautifully against a sixty-word budget,
  // because an empty screen is a perfect score.
  //
  // THE FLOOR IS NOT A WORD COUNT, and refusing that is the substance of
  // this block rather than a stylistic preference. Measured over the same
  // 1,983 states these ceilings walk: the HUD contributes a CONSTANT 24
  // words to every one of them, the two emptiest briefs in the game score
  // 35 and 38, and the most informative short brief the game produces
  // scores 32, which is the global minimum. So a word floor set anywhere
  // that passes today sits BELOW both offending screens, and one set above
  // them fails on the game's best short copy. The nearest observable was
  // the count; the claim is that the player has something to look at.
  //
  // What is bounded instead is what the disclosure ADDS.

  it('expands into something the summary does not already say, at every brief fidelity', () => {
    // The dead control, measured at every level before this round: 0 novel
    // tokens at intel 0 turn 1 (the expansion was the summary concatenated
    // verbatim), 6 at intel 0 afterwards and all six of them function
    // words (`unavailable`, `0`, `in`, `the`, `procure`, `phase`), 1 to 3
    // at intel 1 where the single novel token was the word "the", and 0 at
    // intel 2. At intel 1 and 2 the expansion was also SHORTER than the
    // summary, so a player tapped "Expand full brief" and received less
    // than was already on screen. Only intel 3 earned its tap.
    //
    // Since v1.3 Round 0 the levels are the two fidelities (`fidelities`),
    // each measured on every turn that can show it.
    const dead: string[] = []
    let worstNovel = Infinity
    let worstNovelAt = ''
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    for (const { name, difficulty, seed, turns } of extremes) {
      for (const { before } of turns) {
        for (const briefed of fidelities(before)) {
          const novel = novelTokens(before, briefed)
          const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${fidelityLabel(briefed)}`
          if (novel.length < worstNovel) {
            worstNovel = novel.length
            worstNovelAt = at
          }
          if (novel.length < DISCLOSURE_NOVEL_MIN) dead.push(`${at}: ${novel.length} novel tokens behind the tap`)
        }
      }
    }
    expect([...new Set(dead)].slice(0, 12).join('\n')).toBe('')
    // The measured minimum, pinned. Without it DISCLOSURE_NOVEL_MIN can be
    // lowered to zero and nothing fails, because a threshold mutation only
    // ever weakens a threshold: the guard above would keep passing while
    // the bar it names had stopped meaning anything. A mutation proved
    // exactly that and slept. Pinning the floor's real distance from the
    // bar makes both directions have to come here and say so. Swept over
    // EXTREME_SEEDS since v1.2 R5a (see the constant).
    //
    // 31 through v1.2; 25 to 26 through v1.6 R2, the old panel's posture
    // against the summary over it. Since v1.6 R3 (Ken's playtest item 6)
    // the disclosure is the full brief's sheet, measured against the board
    // it opens over, which it may not repeat: its coverage line and, once
    // the moves are named, their techniques. The thinnest is a dark night,
    // where the techniques are not yet named.
    expect(worstNovel, `thinnest disclosure measured: ${worstNovel} novel tokens at ${worstNovelAt}`).toBe(WORST_NOVEL)
  })

  it('varies the expansion with the state it describes, so a frozen string fails', () => {
    // The positive control for the assertion above. A constant expansion
    // of twenty invented words would satisfy a novelty floor forever; what
    // has to be true is that the sheet is ABOUT this campaign. Two states
    // that differ only in what the player owns must read differently, and
    // a named night lists the techniques of its own moves.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const fresh = newGame(DEFAULT_SCENARIO, seed)
      const bought = resolveTurn(fresh, { ...NO_OP, buyAssets: [{ kind: 'drone' }] }, turnRng(fresh.seed, fresh.turn))
      const plain = resolveTurn(fresh, NO_OP, turnRng(fresh.seed, fresh.turn))
      // The drone arrives at the next close, so the turn after it reads it.
      const later = (st: GameState) => resolveTurn(st, NO_OP, turnRng(st.seed, st.turn))
      expect(fullBriefCopy(later(bought), false).coverage, `seed ${seed}: the sheet reads the same whether or not the player bought anything`).not.toBe(
        fullBriefCopy(later(plain), false).coverage,
      )
      const named = fullBriefCopy(fresh, true)
      const ids = (planFor(fresh, 1)?.slots ?? []).flatMap((sl) => (sl.fixed ? [sl.fixed] : (sl.drawFrom ?? [])))
      expect(named.moves.map((m) => m.id), `seed ${seed}: the sheet lists moves the night does not hold`).toEqual(ids)
    }
  })

  it('reports the coverage the scoring function computes, on states where it moves', () => {
    // Split out from the test above after a mutation slept through it.
    // Freezing the coverage figure to the literal 44 was invisible there,
    // because all three of its states sit at 44: a new fleet, a fleet with
    // one drone still in transit, and a fleet with nothing bought. Two
    // structures only join where they can disagree, so this walks real
    // campaigns until coverage has actually moved off its starting value
    // and fails if it never does.
    //
    // v1.3 Round 0 weighs coverage by integrity (brief 6.1), so it is
    // fractional once a tile is damaged, and `String(cov)` stopped being a
    // figure a player reads. The join is now to the EXACT figure every
    // coverage readout prints, coverageFigure (one decimal rounded down,
    // src/ui/labels.ts). The first pass accepted any figure within a
    // rounding tolerance, which also accepted 59.96 printed as "60" beside
    // a line saying the coverage bonus pays from 60 (the SLA until v1.3
    // R2 retired the word).
    let sawMoved = false
    let sawFractional = false
    let sawRoundedDown = false
    let sawClear = false
    let sawUnder = false
    const start = coverage(newGame(DEFAULT_SCENARIO, 1).assets)
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          const cov = coverage(before.assets)
          const { coverageMin, credits } = before.scenario.slaBonus
          const figure = coverageFigure(cov)
          if (cov !== start) sawMoved = true
          if (!Number.isInteger(cov)) sawFractional = true
          if (Math.round(cov * 10) / 10 !== figure) sawRoundedDown = true
          const body = coverageLine(before)
          const at = `${name}, turn ${before.turn}, seed ${seed}`
          const shown = /\bCoverage (\S+?)[.,](?:\s|$)/.exec(body)?.[1]
          expect(shown, `${at}: the panel does not report coverage ${cov}: "${body}"`).toBeDefined()
          expect(shown, `${at}: coverage ${cov} printed as "${shown}", not as ${figure}`).toBe(String(figure))
          // What a player reads, checked without the helper, so a change
          // to coverageFigure itself cannot carry the panel with it: a
          // readout (whole, or one decimal), never above the coverage, and
          // less than a tenth below it.
          expect(shown, `${at}: coverage ${cov} printed as "${shown}"`).toMatch(/^\d+(\.\d)?$/)
          expect(Number(shown), `${at}: coverage ${cov} printed above itself as "${shown}"`).toBeLessThanOrEqual(cov)
          expect(cov - Number(shown), `${at}: coverage ${cov} printed as "${shown}"`).toBeLessThan(0.1)
          // THE BRANCH AGREES WITH THE FIGURE: chosen on the exact
          // coverage, and with the figure rounded down a fleet under the
          // minimum can never print the minimum beside the under line.
          const clear = cov >= coverageMin
          expect(body.includes('clear of the'), `${at}: coverage ${cov} and the panel says "${body}"`).toBe(clear)
          if (clear) {
            sawClear = true
            expect(body, `${at}: coverage ${cov}`).toContain(`Coverage ${figure}, clear of the ${coverageMin} the coverage bonus pays at.`)
          } else {
            sawUnder = true
            expect(body, `${at}: coverage ${cov}`).toContain(`Coverage ${figure}. The coverage bonus pays ${credits} CR a turn from ${coverageMin}.`)
            expect(Number(shown), `${at}: coverage ${cov} under the minimum printed as "${shown}"`).toBeLessThan(coverageMin)
          }
        }
      }
    }
    expect(sawMoved, 'coverage never left its starting value, so the join could not disagree').toBe(true)
    expect(sawFractional, 'coverage was never fractional, so the rounding was not measured').toBe(true)
    expect(sawRoundedDown, 'no coverage told rounding down from rounding to nearest, so the direction was not measured').toBe(
      true,
    )
    expect(sawClear, 'no state in the sweep cleared the coverage minimum, so the clear branch was not measured').toBe(true)
    expect(sawUnder, 'no state in the sweep sat under the coverage minimum, so the under branch was not measured').toBe(true)
  })

  it('prints 59.9 and the under branch a hair under the coverage minimum, and 60 and the clear branch at it', () => {
    // Built by hand: no swept state lands in [59.95, 60), the band where a
    // figure rounded to the nearest tenth reads "60" (Math.round(59.95 *
    // 10) / 10 is 60) and the panel would print the minimum it says the
    // fleet has not reached. Both readouts on the brief screen are held
    // here: the posture panel, and the board (firstInputCopy mirrors it),
    // which since v1.3 R2 prints no coverage figure at all now the four
    // meters have left the HUD. The turn-start card's line is held on
    // the same states in tests/opening.spec.ts. The starter fleet covers
    // 58 (5800 hundredths: sats 13, RPO sat 8, drones 9, ground station 6,
    // times integrity); each case adds to it.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const { coverageMin, credits } = DEFAULT_SCENARIO.slaBonus
    const layerOf = (kind: AssetKind) => base.assets.find((x) => x.kind === kind)!.layer
    const rpo = base.assets.find((x) => x.kind === 'rpoSat')!.id
    const fleet = (extra: [AssetKind, number][], rpoIntegrity = 100): GameState => ({
      ...base,
      assets: [
        ...base.assets.map((x) => (x.id === rpo ? { ...x, integrity: rpoIntegrity } : x)),
        ...extra.map(([kind, integrity], i) => ({
          id: `start-${kind}-${base.assets.length + i + 1}`,
          kind,
          layer: layerOf(kind),
          integrity,
        })),
      ],
    })
    const cases: { hundredths: number; state: GameState; printed: string; clear: boolean }[] = [
      // 5800 + drone 9 x 15 + ground station 6 x 10
      { hundredths: 5995, state: fleet([['drone', 15], ['groundStation', 10]]), printed: '59.9', clear: false },
      // 5800 - RPO sat 8 x 7 + drone 9 x 28
      { hundredths: 5996, state: fleet([['drone', 28]], 93), printed: '59.9', clear: false },
      // 5800 - RPO sat 8 x 10 + drone 9 x 31
      { hundredths: 5999, state: fleet([['drone', 31]], 90), printed: '59.9', clear: false },
      // 5800 + RPO sat 8 x 25
      { hundredths: 6000, state: fleet([['rpoSat', 25]]), printed: '60', clear: true },
    ]
    for (const { hundredths, state, printed, clear } of cases) {
      const cov = coverage(state.assets)
      const at = `coverage ${hundredths / 100}`
      expect(cov, `${at}: the hand-built fleet covers ${cov}`).toBe(hundredths / 100)
      expect(cov >= coverageMin, `${at}: the case sits on the wrong side of the minimum`).toBe(clear)

      const body = coverageLine(state)
      expect(body.includes('clear of the'), `${at}: the posture panel says "${body}"`).toBe(clear)
      expect(body, `${at}: the posture panel says "${body}"`).toContain(
        clear
          ? `Coverage ${printed}, clear of the ${coverageMin} the coverage bonus pays at.`
          : `Coverage ${printed}. The coverage bonus pays ${credits} CR a turn from ${coverageMin}.`,
      )
      if (!clear) {
        expect(body, `${at}: the posture panel prints the minimum as the coverage`).not.toContain(`Coverage ${coverageMin}`)
      }

      // The board: no coverage figure on it, so a fleet under the minimum
      // cannot read as the minimum there either. (No other figure on the
      // board on these states is 59.9 or 60: the score is in the eighties,
      // the budget prints with CR.)
      const measured = firstInputCopy(state)
      expect(measured, `${at}: the board prints a coverage figure: ${measured}`).not.toContain(printed)
      expect(measured, `${at}: the board prints the minimum as a figure`).not.toContain(String(coverageMin))
    }
  })

  it('leaks nothing about the deck ahead without the brief, so the purchase keeps its value', () => {
    // The other direction, and the one that would be a design defect
    // rather than a dull screen. Everything the expansion says without the
    // brief (below top intel until v1.3 Round 0) is the player's own public
    // state, so two states differing ONLY in the campaign slots ahead of
    // them must expand identically. If a forecast ever leaks in, this
    // fails. Every turn of a campaign, read dark.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before: state } of playTurns(seed, LOSS_SCRIPT)) {
        // The same state, told a different turn is coming. Only the deck
        // ahead differs; the player's posture is identical.
        const elsewhere: GameState = {
          ...state,
          scenario: {
            ...state.scenario,
            campaign: state.scenario.campaign.map((p) =>
              p.turn === state.turn ? { ...p, slots: [{ fixed: 'blackout-chain' as const }] } : p,
            ),
          },
        }
        expect(
          JSON.stringify(fullBriefCopy(elsewhere, false)),
          `seed ${seed}, turn ${state.turn}, brief dark: the expansion changed when only the deck ahead changed`,
        ).toBe(JSON.stringify(fullBriefCopy(state, false)))
      }
    }
  })

  it('bounds the disclosure body, the channel no budget measured before', () => {
    // The ceiling half of the floor above. Brief v2.3 section 5 records
    // the disclosure body and the beat title (the night card's headline
    // since v1.3 Round 3) as two channels nothing measures. Since v1.6 R3
    // the board's one disclosure is TONIGHT's "?" (helpCopy): the rule and
    // the keys, which stood on every board until Ken's playtest item 1.
    // The full brief is a sheet, bounded as well. The worst figures are
    // printed so a change that moves them has to come here and say so.
    let worst = 0
    let worstAt = ''
    let sheetWorst = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            for (const [queued, actions] of ordersOf(script, before)) {
              const words = countWords(helpCopy(before, actions).join(' '))
              if (words > worst) {
                worst = words
                worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${queued}`
              }
            }
            for (const briefed of fidelities(before)) {
              const sheet = fullBriefCopy(before, briefed)
              sheetWorst = Math.max(sheetWorst, countWords([sheet.coverage, ...sheet.moves.flatMap((m) => [m.name, m.tag ?? '']), sheet.dark ?? ''].join(' ')))
            }
          }
        }
      }
    }
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(DISCLOSURE_WORD_BUDGETS[HELP_LABEL])
    // 31 since v1.6 R3: from turn 2, with tonight's defense ordered, the
    // rule adds "This turn's new defense is ordered." over the four keys
    // (their pick, strength, EXPOSED and BLOCKED). Budget 32.
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBe(31)
    // The sheet: the coverage line and, on the night with the most named
    // moves, each name with its technique. Measured, and pinned.
    expect(sheetWorst, `worst full brief measured: ${sheetWorst} words`).toBe(WORST_SHEET)
  })

  it('bounds the night card\'s headline, the other channel no budget measured', () => {
    // Titles rendered on the playback card, which no budget function
    // counted until Round 7b.
    //
    // THREE CORRECTIONS, each a narrower sweep than the claim. Round 7b's
    // first version swept NO_OP only, so a 37-word title on any other line
    // shipped green. Its fix swept every line but still measured INVISIBLE
    // beats, whose titles never reach the card, and still missed two kinds
    // that are visible. And its self-check named three kinds by hand, which
    // is principle 17 inside the guard written under it. Round 7 measured
    // what the player reads (visible beats only), added a line that spent
    // surge authority so `surge-spent` was reached at all, and derived the
    // required set from the director's beat kinds.
    //
    // RE-POINTED FOR v1.3 Round 3, which retired the director and its
    // playback card: what a player reads at the top of each card is now
    // the night card's headline (see nightCards). Every card is on screen
    // (the night has no invisible kind), so nothing is excused, and the
    // required set is derived from the cards' own source: every
    // `data-night-card` kind src/ui/night draws must be measured somewhere
    // in the sweep. The headlines are read off the night's copy; one card
    // of each kind, the last END OF TURN and the worst are rendered, and
    // must say the same.
    let worst = 0
    let worstAt = ''
    let worstCase: { card: NightCard; before: GameState; after: GameState } | undefined
    const firstOf = new Map<string, { card: NightCard; before: GameState; after: GameState }>()
    // The five lines of play, already played (see playExtremes).
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    for (const { name, difficulty, seed, turns } of extremes) {
      for (const { before, after } of turns) {
        for (const card of nightCards(before, after)) {
          const key = card.kind === 'end' && card.heading ? 'end, last' : card.kind
          if (!firstOf.has(key)) firstOf.set(key, { card, before, after })
          const words = countWords(card.head) + countWords(card.heading)
          if (words > worst) {
            worst = words
            worstAt = `${name}, ${card.kind}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${card.head}" / "${card.heading}"`
            worstCase = { card, before, after }
          }
        }
      }
    }
    // THE REQUIRED SET IS DERIVED, from the files that draw the cards, so a
    // card added later is required by default; and the mirror names no
    // kind those files do not draw.
    const drawn = ['cards.tsx', 'closeCards.tsx'].flatMap((f) => [...readFileSync(join(SRC, 'ui', 'night', f), 'utf8').matchAll(/\bkind="(\w+)"/g)].map((m) => m[1]))
    expect(drawn.length, 'the night draws no card this test can find').toBeGreaterThan(0)
    const measured = new Set([...firstOf.keys()].map((k) => k.split(',')[0]))
    expect(drawn.filter((k) => !measured.has(k)).join(', '), 'night cards whose headlines the sweep never measured').toBe('')
    expect([...measured].filter((k) => !drawn.includes(k)), 'the mirror measures a card the night does not draw').toEqual([])
    expect(firstOf.has('end, last'), 'the sweep never measured the last END OF TURN').toBe(true)
    // THE MIRROR IS THE CARD.
    for (const { card, before, after } of [...firstOf.values(), worstCase!]) {
      const html = renderCard(card, before, after)
      const at = `${card.kind}, turn ${before.turn}`
      expect(pick(html, /<h2 data-card-head="true"[^>]*>([\s\S]*?)<\/h2>/), `${at}: the header`).toBe(card.head)
      const heading = card.kind === 'end' ? pick(html, /<div data-ending="[^"]*"[^>]*><p[^>]*>([\s\S]*?)<\/p>/) : pick(html, /<h3[^>]*>([\s\S]*?)<\/h3>/)
      expect(heading ?? '', `${at}: the heading`).toBe(card.heading)
    }
    expect(worst, `worst card headline measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(CARD_HEADLINE_WORD_BUDGET)
    // 11 swept NO_OP only; 12 widened to every line; 13 once the
    // zero-recovery clause went back to naming the three meters. Re-pinned
    // in Round 7 against visible beats only and a surge-spending line.
    // Swept over EXTREME_SEEDS since v1.2 R5a (see the constant). 12 in
    // v1.3 Round 0, the outcome below the line, "MISSION FAILED: below the
    // win line at the end of the operation".
    //
    // 12 since v1.3 Round 3, on the night's cards (see the constant).
    expect(worst, `worst card headline measured: ${worst} words at ${worstAt}`).toBe(WORST_CARD_HEADLINE)
  })

  it('bounds the hit card\'s would-have-helped line, and pins what the card reads with it (critique row M3)', () => {
    // M3 gave the hit card a line naming the defense that was missing, and
    // made it part of the card's reading. CARD_HEADLINE_WORD_BUDGET bounds
    // the headline alone and cannot take the line as well: the line by
    // itself runs past it at its structural maximum, so a card bound of 14
    // could only be met by dropping it, which the critique rules out. So
    // the line is bounded on its own, at the structural maximum read off
    // the deck, and both worsts are pinned.
    //
    // RE-POINTED FOR v1.3 Round 3: the line is the hit card's own (see
    // helpedLine), and on an UNDEFENDED block it also says what else the
    // defense stops among the threats the player has met or named, so its
    // structural maximum is every threat's every defense against a state
    // that owns none of them, with every threat known and a turn to come.
    // The sweep reads it as a new player's first campaign meets it. The
    // verdict no longer carries a second line.
    const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat' && e.effect.special !== 'debrisStrike')
    const defense = (id: string) => DEFAULT_SCENARIO.countermeasures.find((c) => c.id === id)!
    const structural = Math.max(
      ...threats.flatMap((def) =>
        def.counters.map((c) => {
          const all = new Set(threats.map((e) => e.id))
          return countWords(`${nightCopy.wouldHaveHelped(defense(c).name, defense(c).cost).join('')} ${nightCopy.itStops(stopsKnown(defense(c), def, DEFAULT_SCENARIO, all))} ${nightCopy.IN_PROCURE}`)
        }),
      ),
    )
    type Case = { card: NightCard; before: GameState; after: GameState; line: string }
    let printed = 0
    let worstLine = 0
    let worstLineAt = ''
    let worstCard = 0
    let worstCardAt = ''
    const cases: Case[] = []
    const branchOf = new Map<string, Case>()
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    // Since R6's engine round (Decisions Q1) the rogue ground station is the
    // one move with two defenses, so a REDUCED block names a missing defense
    // only when COLDVEIL takes it with one of the two owned. None of the five
    // lines does, so one more line is played for this test alone: the ground
    // segmentation on turn 2 and the insider program on turn 4 make the rogue
    // station the move on turn 5, blunted and not stopped.
    const reducing: Campaign[] = []
    const REDUCING: Record<number, TurnActions> = { 2: { ...NO_OP, buyCounters: ['groundZeroTrust'] }, 4: { ...NO_OP, buyCounters: ['insiderProgram'] } }
    for (const difficulty of DIFFS)
      for (let seed = 1; seed <= EXTREME_SEEDS; seed += 1) reducing.push({ name: 'reducing', difficulty, seed, turns: [...playTurns(seed, REDUCING, difficulty)] })
    for (const { name, difficulty, seed, turns } of [...extremes, ...reducing]) {
      for (const { before, after } of turns) {
        const known = knownBy(after)
        const last = lastTurnOf(after)
        for (const card of nightCards(before, after)) {
          if (card.kind !== 'hit') continue
          const line = helpedLine(card.step!, known, last)
          if (line === null) continue
          printed += 1
          const found: Case = { card, before, after, line }
          const branch = card.step!.ev.outcome === 'reduced' ? 'reduced' : last ? 'undefended, last turn' : 'undefended'
          if (!branchOf.has(branch)) branchOf.set(branch, found)
          const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${card.head}" / "${card.heading}" / "${line}"`
          if (countWords(line) > worstLine) {
            worstLine = countWords(line)
            worstLineAt = at
            cases.push(found)
          }
          const headline = countWords(card.head) + countWords(card.heading)
          if (headline + countWords(line) > worstCard) {
            worstCard = headline + countWords(line)
            worstCardAt = at
            cases.push(found)
          }
        }
      }
    }
    expect(printed, 'no hit card in the sweep printed the line, so nothing was measured').toBeGreaterThan(0)
    for (const branch of ['undefended', 'undefended, last turn', 'reduced']) {
      expect([...branchOf.keys()], `the sweep never reaches the ${branch} line`).toContain(branch)
    }
    // THE MIRROR IS THE CARD: each branch and each worst, rendered.
    for (const { card, before, after, line } of [...branchOf.values(), ...cases]) {
      const html = renderCard(card, before, after)
      const shown =
        pick(html, /<p data-would-have-helped="true"[^>]*>([\s\S]*?)<\/p>/) ??
        pick(html, /<div data-outcome="reduced"[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<\/p><p[^>]*>([\s\S]*?)<\/p>/)
      expect(shown, `turn ${before.turn}, ${card.step!.def.id}: the card prints "${shown}"`).toBe(line)
    }
    expect(worstLine, `worst line ${worstLine} words at ${worstLineAt}`).toBeLessThanOrEqual(structural)
    expect(worstLine, `worst line measured: ${worstLine} words at ${worstLineAt}`).toBe(WORST_HELPED_LINE)
    expect(worstCard, `worst headline and line measured: ${worstCard} words at ${worstCardAt}`).toBe(WORST_HIT_CARD_HEADLINE_AND_LINE)
  })

  it('says "mission assurance score" in SYSTEM\'s how to play, and never MAI', () => {
    // Round 7 introduced the abbreviation in line 1, "Mission Assurance
    // Index (MAI)", because the HUD used it on every screen. v1.3 R2
    // retired the abbreviation from the player's words: the HUD reads
    // MISSION ASSURANCE SCORE, and the job names the score in full. Since
    // v1.6 R3 the job is SYSTEM's HOW TO PLAY (Ken's playtest item 6), and
    // its first line, the one that sets the win condition, must name it.
    const lines = howToLines(DEFAULT_SCENARIO)
    expect(lines[0], `the job's first line is "${lines[0]}"`).toContain('mission assurance score')
    for (const line of lines) {
      expect(line, `HOW TO PLAY still says MAI: "${line}"`).not.toMatch(/\bMAI\b/)
      expect(line, `HOW TO PLAY still says Mission Assurance Index: "${line}"`).not.toMatch(/Assurance Index/i)
    }
  })

  it('never emits an em dash in generated copy', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        const copy = briefCopy(before)
        for (const line of [copy.headline, copy.vector, copy.tag ?? '']) {
          expect(line).not.toContain('\u{2014}')
        }
      }
    }
  })
})

describe('reading diet: the fixtures themselves', () => {
  // One resolve per turn: asserted not to throw, and its result is the
  // state the loop advances with. Both tests below used to resolve every
  // turn twice, once inside the assertion and again to advance.
  const legalStep = (state: GameState, script: Record<number, TurnActions>, label: string): GameState => {
    let next: GameState | undefined
    expect(() => {
      next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    }, label).not.toThrow()
    return next as GameState
  }

  it('keeps the top-intel line legal well past the seeds the suite sweeps', () => {
    // The line this round added is checked wider than the sweep, because
    // its failure mode was latent: legal on the seeds measured, illegal a
    // few seeds later. The prepared line is checked the same way below.
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 100; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          state = legalStep(state, TOP_INTEL_SCRIPT, `top intel, ${difficulty}, seed ${seed}, turn ${state.turn}`)
        }
      }
    }
  })
  it('keeps the prepared line legal well past the seeds the suite sweeps (v1.2 R5a)', () => {
    // The assertion TOP_INTEL_SCRIPT already had. Without it the prepared
    // line's turn-9 shortfall on Expert lived in a comment for two versions,
    // failing on seeds nobody swept (see tests/scripts.ts).
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 100; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          state = legalStep(state, WIN_SCRIPT, `prepared line, ${difficulty}, seed ${seed}, turn ${state.turn}`)
        }
      }
    }
  })
})
