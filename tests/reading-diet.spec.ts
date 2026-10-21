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
import { beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { BEAT_KINDS, deriveBeats } from '../src/director'
import { briefFree, gnssDenied, newGame, resolveTurn } from '../src/engine/reducer'
import { briefActive, countersAfter, eventById, planFor } from '../src/engine/rules'
import { coverage, maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { AssetKind, Difficulty, GameState, ResolvedEvent, TurnActions, TurnRecord } from '../src/engine/types'
import {
  chainLine,
  CHROME_WORD_BUDGET,
  DISCLOSURE_WORD_BUDGETS,
  FIRST_INPUT_WORD_BUDGET,
  HEADLINE_WORD_MAX,
  briefCopy,
  disclosureBlocks,
  jobFramingBlocks,
  chromeCopy,
  chromeWords,
  countWords,
  firstInputCopy,
  firstInputWords,
  SYSTEM_GEAR_LABEL,
} from '../src/ui/brief'
import { ACTIONS } from '../src/ui/board/actions'
import {
  BUDGET_LABEL,
  FIRST_ORDERS_SET,
  FULL_BRIEF_OPEN,
  INTEL_ROW,
  REMAINING,
  REVEAL,
  SCORE_LABEL,
  SECOND_ORDER,
  STATUS,
  UNIDENTIFIED,
  WORST_CASE,
  briefButton,
  firstOrders,
  marginChip,
  moveStatus,
  shortName,
  strengthLine,
  tapHint,
  vectorTo,
  winLineLabel,
} from '../src/ui/board/boardModel'
import { NOTHING, OPS_LOG_HEADING, OPS_LOG_TURNS, opsLogCopy, opsLogLine } from '../src/ui/board/wide'
import { coverageFigure } from '../src/ui/labels'
import { VERDICT_WORD_MAX, verdictFor } from '../src/ui/verdict'
import { short } from '../src/ui/wouldHaveHelped'
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

// The playback card's title, bounded here for the same reason. Set from
// the measured worst plus room, and the message prints the new worst so
// re-baselining forces a sentence about why.
const BEAT_TITLE_WORD_BUDGET = 14

// The hit card's "Would have helped" line (critique row M3, FIX batch 1,
// October 2026), measured over the EXTREME_SEEDS sweep the way Round 7b
// measured the title: the line alone at 14 words, which is also its
// structural maximum (two long defense names), and the card's title and
// line together at 21. Pinned, so a change that moves either comes here
// and says so.
//
// 20 since v1.3 Round 0. The 21 was "Docking LiDAR dazzle on the RPO sat"
// over a line naming "Tier A sensor procurement and firmware attestation";
// brief 6.6 renamed that defense "Firmware attestation and assured
// sourcing", two words shorter, and the worst card is now the rogue
// ground station's (6 words of title over the 14-word line, the passive
// line on turn 5 on Easy, seed 2). The line's own worst stays at 14.
const WORST_HELPED_LINE = 14
const WORST_HIT_CARD_TITLE_AND_LINE = 20

// The wide board's ops log at its longest over the EXTREME_SEEDS sweep
// (v1.2 R6), pinned so a change that moves it comes here and says so.
// Measured at 54 against a structural bound of 71, the lazy line after
// turn 11 on Easy, seed 20: three rows of long verdicts. 50 since v1.3
// Round 0, on the six-turn plan: the passive line after turn 5 on Easy,
// seed 2, whose last three verdicts are the rogue ground station "and 1
// more", the LiDAR dazzle alone (the debris call held its orbit) and
// uplink jamming "and 1 more".
const WORST_OPS_LOG = 50

// The deciding board's reading at its longest over the swept lines of play
// (v1.3 R2), pinned so a change that moves it comes here and says so;
// src/ui/brief.ts quotes it as the reason FIRST_INPUT_WORD_BUDGET is 150.
const WORST_BOARD = 142

const tokensOf = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])

// The words behind the tap that are not already above it. Derived from the
// BriefCopy the screen renders, not from a second copy of the strings.
function novelTokens(copy: ReturnType<typeof briefCopy>): string[] {
  const summary = tokensOf([copy.headline, copy.vector, copy.tag ?? ''].join(' '))
  return [...tokensOf(disclosureBlocks(copy).join(' '))].filter((w) => !summary.has(w))
}
const SEEDS = 12
// The two tests that pin a MEASURED EXTREME (the thinnest disclosure and
// the longest beat title) sweep wider. A pin is only as good as the sweep
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
              const slots = planFor(before.scenario, before.turn)?.slots ?? []
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
            has(marginChip(score, scenario.winThreshold).text, 'the margin chip')
            has(winLineLabel(scenario.winThreshold), 'the win line')
            has(`TURN ${before.turn} OF ${scenario.totalTurns}`, 'the turn')
            // The TONIGHT card: the intro, the chain banner while GNSS
            // denial is live, and every move the plan holds, named where the
            // brief names it (or the slot is fixed) and Unidentified where it
            // does not, each with its vector, and a named one with its
            // strength and its status.
            const plan = planFor(scenario, before.turn)
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
                  has(strengthLine(ev), `${id}'s strength`)
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
            if (!briefFree(before)) has(INTEL_ROW[actions.intelBrief ? 'ordered' : 'none'], 'the intel row')
            // The orders card.
            if (before.turn === 1) {
              const lines = firstOrders(before, actions)
              if (lines.every((l) => l.done)) has(FIRST_ORDERS_SET, 'first orders set')
              else for (const l of lines) has(l.text, `the ${l.id} order`)
            } else if (before.turn === 2) has(SECOND_ORDER, 'the second order')
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
    const required = [SCORE_LABEL, BUDGET_LABEL, SYSTEM_GEAR_LABEL, FULL_BRIEF_OPEN, REMAINING, WORST_CASE, ...ACTIONS.map((a) => a.label)]
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          for (const [queued, actions] of ordersOf(script, before)) {
            const chrome = chromeCopy(before, actions)
            const where = `${name}, turn ${before.turn}, seed ${seed}, ${queued}`
            for (const control of required) {
              expect(chrome, `${where}: chrome no longer counts "${control}"`).toContain(control)
            }
            // One tap hint per move card, counted from the plan rather than
            // from the slots chromeCopy reads.
            const named = briefActive(before, actions)
            const slots = planFor(before.scenario, before.turn)?.slots ?? []
            const cards = slots.reduce((n, s) => n + (s.fixed ? 1 : (s.drawFrom ?? []).length), 0)
            const hidden = slots.reduce((n, s) => n + (s.fixed || named ? 0 : (s.drawFrom ?? []).length), 0)
            const hints = chrome.filter((c) => c === tapHint('exposed') || c === tapHint('blocked')).length
            expect(hints, `${where}: tap hints miscounted`).toBe(cards - hidden)
            expect(chrome.filter((c) => c === REVEAL).length, `${where}: reveal hints miscounted`).toBe(hidden)
            if (!briefFree(before)) {
              expect(chrome, `${where}: chrome does not count the brief's price button`).toContain(
                briefButton(before.scenario.prices.intelBrief, actions.intelBrief),
              )
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
      ['the full brief toggle', 'FULL_BRIEF_OPEN}', tonight],
      ['the tap hints', '{tapHint(status)}', tonight],
      ['the reveal hint', '{REVEAL}', tonight],
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
          const copy = briefCopy(before, briefed)
          const novel = novelTokens(copy)
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
    // 31 through v1.2. 25 since v1.3 Round 0, on a dark night with the
    // fleet whole and nothing in transit (the prepared line, turn 2 on
    // Easy, seed 1): the dark summary already says "Order an intel brief to
    // name the moves" and names the layers, so the panel's last line, "An
    // intel brief costs 8 and names tonight's moves.", adds little more
    // than its price. Still four times the floor.
    expect(worstNovel, `thinnest disclosure measured: ${worstNovel} novel tokens at ${worstNovelAt}`).toBe(25)
  })

  it('varies the expansion with the state it describes, so a frozen string fails', () => {
    // The positive control for the assertion above. A constant expansion
    // of twenty invented words would satisfy a novelty floor forever; what
    // has to be true is that the panel is ABOUT this campaign. Two states
    // that differ only in what the player owns must read differently.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const fresh = newGame(DEFAULT_SCENARIO, seed)
      const bought = resolveTurn(
        fresh,
        { ...NO_OP, buyAssets: [{ kind: 'drone' }] },
        turnRng(fresh.seed, fresh.turn),
      )
      const plain = resolveTurn(fresh, NO_OP, turnRng(fresh.seed, fresh.turn))
      expect(
        briefCopy(bought).full.join(' '),
        `seed ${seed}: the expansion reads the same whether or not the player bought anything`,
      ).not.toBe(briefCopy(plain).full.join(' '))
      // "Something varies" is too weak, and a mutation proved it: freezing
      // the coverage figure to the literal 44 slept, because the in-transit
      // line varied instead and covered for it. Each fact the panel claims
      // to report is joined to the function that owns it.
      //
      // The surge authority this joined until v1.3 Round 0 left with SURGE;
      // the panel's line about the intel brief took its place, joined to
      // briefFree and the deck's price (free on turn 1, priced after it).
      for (const st of [fresh, bought, plain]) {
        const body = briefCopy(st).full.join(' ')
        expect(body, `seed ${seed}, turn ${st.turn}: the panel does not report whether tonight's brief is free`).toContain(
          briefFree(st)
            ? "Tonight's intel brief is free"
            : `An intel brief costs ${st.scenario.prices.intelBrief}`,
        )
      }
    }
  })

  it('names a destroyed asset instead of calling the fleet whole', () => {
    // The panel computed only the DEGRADED assets, so a fleet with
    // wreckage in it and no merely-damaged survivors was told "Every asset
    // at full integrity" while the badges above said otherwise. Walk real
    // campaigns until a destroyed asset exists, and fail if the panel
    // still calls the fleet whole.
    let sawLoss = false
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const lost = before.assets.filter((a) => a.integrity <= 0).length
            if (lost === 0) continue
            sawLoss = true
            const body = briefCopy(before).full.join(' ')
            const degraded = before.assets.filter((a) => a.integrity > 0 && a.integrity < 100).length
            // THE SENTENCE, built from the same three populations the
            // product builds it from. The first version asserted
            // `toContain(String(lost))`, a bare digit that "Intel level 1
            // costs 8" and "1 surge authority in hand" satisfy on their
            // own, so a fleet sentence keeping the digit and saying the
            // opposite of the truth passed. That is the third guard in
            // this round to assert the nearest observable, and the second
            // inside the batch written to fix the first two.
            const expected =
              degraded > 0
                ? `${lost} lost, ${degraded} below full integrity.`
                : `${lost} asset${lost > 1 ? 's' : ''} lost.`
            expect(
              body,
              `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: ${lost} lost and ${degraded} degraded, panel says "${body}"`,
            ).toContain(expected)
          }
        }
      }
    }
    expect(sawLoss, 'no campaign in the sweep ever destroyed an asset, so this proved nothing').toBe(true)
  })

  it('reads as English on the fleet branches the shipped deck never produces', () => {
    // Hand-built, because a wiped fleet ends the campaign before the brief
    // renders. Without this the no-live-assets arm is dead code: it used
    // to emit "Holding . Every asset at full integrity." with an empty
    // layer list beside a claim that everything was fine.
    const base = newGame(DEFAULT_SCENARIO, 1)
    const wiped: GameState = { ...base, assets: base.assets.map((a) => ({ ...a, integrity: 0 })) }
    const empty: GameState = { ...base, assets: [] }
    for (const [label, st] of [['all destroyed', wiped], ['no assets at all', empty]] as const) {
      const body = briefCopy(st).full.join(' ')
      expect(body, `${label}: still claims full integrity`).not.toContain('Every asset at full integrity')
      expect(body, `${label}: renders an empty layer list`).not.toContain('Holding .')
      expect(body, `${label}: says nothing about the fleet`).toMatch(/No layer is holding|lost/)
      expect(body).not.toContain('\u{2014}')
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
          const body = briefCopy(before).full.join(' ')
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
            expect(body, `${at}: coverage ${cov}`).toContain(`Coverage ${figure}. The coverage bonus pays ${credits} a turn from ${coverageMin}.`)
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

      const body = briefCopy(state).full.join(' ')
      expect(body.includes('clear of the'), `${at}: the posture panel says "${body}"`).toBe(clear)
      expect(body, `${at}: the posture panel says "${body}"`).toContain(
        clear
          ? `Coverage ${printed}, clear of the ${coverageMin} the coverage bonus pays at.`
          : `Coverage ${printed}. The coverage bonus pays ${credits} a turn from ${coverageMin}.`,
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
          briefCopy(elsewhere, false).full.join(' '),
          `seed ${seed}, turn ${state.turn}, brief dark: the expansion changed when only the deck ahead changed`,
        ).toBe(briefCopy(state, false).full.join(' '))
      }
    }
  })

  it('bounds the disclosure body, the channel no budget measured before', () => {
    // The ceiling half of the floor above. Brief v2.3 section 5 records
    // the disclosure body and the beat title as two channels nothing
    // measures, and this round fills both; a round that closed principle
    // 16's new level in one place and opened it in another would have
    // learned nothing. The worst figure is printed so a change that moves
    // it has to come here and say so.
    let worst = 0
    let worstAt = ''
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            for (const briefed of fidelities(before)) {
              const words = countWords(disclosureBlocks(briefCopy(before, briefed)).join(' '))
              if (words > worst) {
                worst = words
                worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, ${fidelityLabel(briefed)}`
              }
            }
          }
        }
      }
    }
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(
      DISCLOSURE_WORD_BUDGETS['Expand full brief'],
    )
    // The exact figure, for the reason the 54 pin above carries one: it is
    // the number the budget's headroom rests on, and re-baselining should
    // be a deliberate edit rather than a drift. Measured at top intel,
    // turn 11, where three named slots sit above the posture.
    // 90 until the ceiling was pointed at the whole panel rather than at
    // briefCopy's return value; 109 once it was; 115 in Round 7, when the
    // job framing got its heading and numbering back and line 1 regained
    // the "(MAI)" that introduces the abbreviation the HUD uses everywhere.
    // Measured through disclosureBlocks, the function the panel renders.
    //
    // 119 since v1.3 Round 0, and on turn 1 (every line, both
    // difficulties): the job framing (now with the upkeep sentence) above
    // the free brief's one named slot and the five posture lines. One word
    // under the cap of 120. countWords counts the " / " between the two
    // candidates as a word, which is how the DOM test counts it too.
    // 120 since the QC gauntlet (Q20, G-100, 21 October 2026): the free
    // brief "names the candidate moves" rather than "every move", which it
    // never did. At the cap, with no word to spare.
    // 122 since v1.3 R2, on turn 1 again: the retired words came back
    // longer. Line 1 says "the mission assurance score" (one word fewer
    // than the Index and its abbreviation), line 3 "Procure fleet and
    // defenses from your budget" and "A score under" (two more), and the
    // posture's coverage line "the coverage bonus pays" where it said "the
    // SLA pays" (one more). Two over the cap of 120, so R2 cut three words
    // rather than raise it: line 3 reads "Procure fleet and defenses to
    // slow it." 119, one under the cap.
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBe(119)
  })

  it('bounds the beat title, the other channel no budget measured', () => {
    // Titles render on the playback card, which no budget function counted
    // until Round 7b.
    //
    // THREE CORRECTIONS, each a narrower sweep than the claim. Round 7b's
    // first version swept NO_OP only, so a 37-word title on any other line
    // shipped green. Its fix swept every line but still measured INVISIBLE
    // beats, whose titles never reach the card, and still missed two kinds
    // that are visible. And its self-check named three kinds by hand, which
    // is principle 17 inside the guard written under it. Round 7 measures
    // what the player reads (visible beats only), adds a line that spends
    // surge authority so `surge-spent` is reached at all, and derives the
    // required set from BEAT_KINDS. (`surge-spent` and its line left with
    // SURGE in v1.3 Round 0; the five lines reach every visible kind.)
    let worst = 0
    let worstAt = ''
    const visibleKinds = new Set<string>()
    const measure = (name: string, difficulty: Difficulty, seed: number, before: GameState, after: GameState) => {
      for (const beat of deriveBeats(before, after)) {
        if (!beat.visible) continue
        visibleKinds.add(beat.kind)
        const words = countWords(beat.title)
        if (words > worst) {
          worst = words
          worstAt = `${name}, ${beat.kind}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${beat.title}"`
        }
      }
    }
    // The five lines of play, already played (see playExtremes).
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    for (const { name, difficulty, seed, turns } of extremes) {
      for (const { before, after } of turns) measure(name, difficulty, seed, before, after)
    }
    // THE REQUIRED SET IS DERIVED, and the exceptions are checked both
    // ways. Every beat kind must be seen on the card somewhere in the sweep
    // unless it is one the director always pushes invisible, and a kind on
    // that list must never be seen on the card, or the list is lying.
    const NEVER_ON_CARD = new Set(['procurement', 'end-of-turn-tick', 'settle'])
    const unreached = BEAT_KINDS.filter((k) => !NEVER_ON_CARD.has(k) && !visibleKinds.has(k))
    expect(unreached.join(', '), 'visible beat kinds whose titles the sweep never measured').toBe('')
    for (const k of NEVER_ON_CARD) {
      expect(BEAT_KINDS, `"${k}" is excused but is not a beat kind`).toContain(k)
      expect(visibleKinds.has(k), `"${k}" is excused as never visible and reached the card anyway`).toBe(false)
    }
    expect(worst, `worst beat title measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(BEAT_TITLE_WORD_BUDGET)
    // 11 swept NO_OP only; 12 widened to every line; 13 once the
    // zero-recovery clause went back to naming the three meters. Re-pinned
    // in Round 7 against visible beats only and a surge-spending line.
    // Swept over EXTREME_SEEDS since v1.2 R5a (see the constant).
    //
    // 12 since v1.3 Round 0. The 13 was the turn-start title and its
    // income, SLA and recovery clauses; the v1.3 turn card reads "Turn n:
    // COLDVEIL is moving", and the longest title on a card is now the
    // outcome below the line, "MISSION FAILED: below the win line at the
    // end of the operation".
    expect(worst, `worst beat title measured: ${worst} words at ${worstAt}`).toBe(12)
  })

  it('bounds the hit card\'s would-have-helped line, and pins what the card reads with it (critique row M3)', () => {
    // M3 gave the hit card a line under its severity line naming the
    // defense that was missing, and made it part of the card's reading.
    // BEAT_TITLE_WORD_BUDGET bounds the title alone and cannot take the
    // line as well: the line by itself reaches 14 words at its structural
    // maximum, so a card bound of 14 could only be met by dropping it,
    // which the critique rules out, and no other words on the card's
    // headline are there to shorten. So the line is bounded on its own, at
    // the structural maximum read off the deck (every threat against a
    // state that owns nothing), and both worsts are pinned. The verdict's
    // second line is the same function, so the same bound holds there.
    const nothing = { ...newGame(DEFAULT_SCENARIO, 1), counters: [] }
    const threats = DEFAULT_SCENARIO.events.filter((e) => e.kind !== 'opportunity')
    const structural = Math.max(...threats.map((e) => countWords(short({ eventId: e.id } as ResolvedEvent, nothing, DEFAULT_SCENARIO))))
    let landed = 0
    let worstLine = 0
    let worstLineAt = ''
    let worstCard = 0
    let worstCardAt = ''
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    for (const { name, difficulty, seed, turns } of extremes) {
      for (const { before, after } of turns) {
        for (const beat of deriveBeats(before, after)) {
          if (!beat.visible || beat.kind !== 'threat' || (beat.severity?.effective ?? 0) <= 0) continue
          landed += 1
          const ev = after.history[after.history.length - 1].events.find((e) => e.eventId === beat.subjectId)!
          const line = short(ev, after, after.scenario)
          const at = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${beat.title}" / "${line}"`
          if (countWords(line) > worstLine) {
            worstLine = countWords(line)
            worstLineAt = at
          }
          if (countWords(beat.title) + countWords(line) > worstCard) {
            worstCard = countWords(beat.title) + countWords(line)
            worstCardAt = at
          }
        }
      }
    }
    expect(landed, 'no threat landed in the sweep, so nothing was measured').toBeGreaterThan(0)
    expect(worstLine, `worst line ${worstLine} words at ${worstLineAt}`).toBeLessThanOrEqual(structural)
    expect(worstLine, `worst line measured: ${worstLine} words at ${worstLineAt}`).toBe(WORST_HELPED_LINE)
    expect(worstCard, `worst title and line measured: ${worstCard} words at ${worstCardAt}`).toBe(WORST_HIT_CARD_TITLE_AND_LINE)
  })

  it('bounds the ops log, the wide board\'s own reading, and pins the measured worst (v1.2 R6)', () => {
    // Desktop-only copy that no phone budget counts, so it gets its own
    // bound, derived rather than picked: the heading, then per row the
    // turn and MAI line and a verdict at the verdict's own cap. The worst
    // is read over every state the sweep reaches after a turn, which is
    // the history the log shows.
    const lineWords = countWords(opsLogLine({ turn: DEFAULT_SCENARIO.totalTurns, mai: 100, verdict: '' }))
    const bound = countWords(OPS_LOG_HEADING) + OPS_LOG_TURNS * (lineWords + VERDICT_WORD_MAX)
    const words = (s: GameState) => opsLogCopy(s).reduce((n, l) => n + countWords(l), 0)
    let worst = 0
    let worstAt = ''
    expect(extremes).toHaveLength(LINES.length * DIFFS.length * EXTREME_SEEDS)
    for (const { name, difficulty, seed, turns } of extremes) {
      for (const { after } of turns) {
        const n = words(after)
        if (n > worst) {
          worst = n
          worstAt = `${name}, after turn ${after.history[after.history.length - 1].turn}, ${difficulty}, seed ${seed}`
        }
      }
    }
    expect(worst, `worst ops log measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(bound)
    // Before any turn it says so, and nothing else.
    expect(opsLogCopy(newGame(DEFAULT_SCENARIO, 1))).toEqual([OPS_LOG_HEADING, NOTHING])
    // The exact figure, for the reason the pins above carry one.
    expect(worst, `worst ops log measured: ${worst} words at ${worstAt}`).toBe(WORST_OPS_LOG)
  })

  it('says "mission assurance score" in the job framing, and never MAI', () => {
    // Round 7 introduced the abbreviation in line 1, "Mission Assurance
    // Index (MAI)", because the HUD used it on every screen. v1.3 R2
    // retired the abbreviation from the player's words: the HUD reads
    // MISSION ASSURANCE SCORE, and the framing names the score in full.
    // The claim is about what the player reads, so every line is checked,
    // and the first line, the one that sets the win condition, must name it.
    const lines = jobFramingBlocks(DEFAULT_SCENARIO)
    expect(lines[0], `the job's first line is "${lines[0]}"`).toContain('mission assurance score')
    for (const line of lines) {
      expect(line, `the job framing still says MAI: "${line}"`).not.toMatch(/\bMAI\b/)
      expect(line, `the job framing still says Mission Assurance Index: "${line}"`).not.toMatch(/Assurance Index/i)
    }
  })

  it('never emits an em dash in generated copy', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before, after } of playTurns(seed, WIN_SCRIPT)) {
        const copy = briefCopy(before)
        const record = after.history[after.history.length - 1]
        for (const line of [copy.headline, copy.vector, copy.tag ?? '', verdictFor(record, DEFAULT_SCENARIO)]) {
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

describe('reading diet: the damage report verdict', () => {
  it('is one line inside its word cap for every turn of every line of play', () => {
    let checked = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { after } of playTurns(seed, script, difficulty)) {
            const record = after.history[after.history.length - 1]
            const verdict = verdictFor(record, DEFAULT_SCENARIO)
            checked += 1
            expect(verdict).not.toContain('\n')
            expect(
              countWords(verdict),
              `${name}, turn ${record.turn}: "${verdict}"`,
            ).toBeLessThanOrEqual(VERDICT_WORD_MAX)
            expect(verdict.endsWith('.')).toBe(true)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(SEEDS * DIFFS.length * LINES.length * 4)
  })

  it('names the heaviest landed event when anything lands, and says so plainly when nothing does', () => {
    let sawLanded = false
    let sawHeld = false
    let sawBlocked = false
    let sawFizzled = false
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { after } of playTurns(seed, WIN_SCRIPT)) {
        const record = after.history[after.history.length - 1]
        const verdict = verdictFor(record, DEFAULT_SCENARIO)
        const threats = record.events.filter((ev) => {
          const def = DEFAULT_SCENARIO.events.find((e) => e.id === ev.eventId)
          return (def?.kind ?? 'threat') === 'threat'
        })
        const landed = threats.filter((ev) => ev.effectiveSeverity > 0)
        if (landed.length > 0) {
          sawLanded = true
          const worst = landed.reduce((a, b) => (b.effectiveSeverity > a.effectiveSeverity ? b : a))
          expect(verdict, `turn ${record.turn}`).toContain(worst.name.split(' (')[0])
        } else if (threats.length > 0) {
          sawHeld = true
          // Two different verdicts, asserted separately. As one alternation
          // they covered each other: a branch that never fires read as
          // covered because the other one did.
          const countered = threats.filter((ev) => ev.mitigation > 0).length
          if (countered > 0) {
            sawBlocked = true
            expect(verdict, `turn ${record.turn}`).toBe('Posture held; every attempt was blocked.')
          } else {
            sawFizzled = true
            expect(verdict, `turn ${record.turn}`).toBe('Nothing landed this turn.')
          }
        }
      }
    }
    expect(sawLanded, 'no seed produced a landed event').toBe(true)
    expect(sawHeld, 'no seed produced a fully held turn').toBe(true)
    // Recorded, not required: the deck reaches the blocked branch in
    // play and does not reach the fizzle branch, which is why the two
    // branches below are covered directly instead.
    expect(sawBlocked || sawFizzled).toBe(true)
  })

  it('reads as English on the branches the shipped deck never produces', () => {
    // Two branches are unreachable with this deck: a turn whose only event
    // is an opportunity, and a turn where every threat fizzles with no
    // countermeasure in play. The scenario schema allows both, so they are
    // correct totality over the type rather than dead code, and they are
    // covered here with synthetic records rather than deleted.
    // The v1.3 record (Round 0): the ledger, the brief and the streak
    // joined it, and the flags, commendations and surge count left.
    const base: TurnRecord = {
      turn: 4,
      purchases: [],
      briefed: false,
      named: [],
      events: [],
      conditionsActive: [],
      ledger: {
        start: 100,
        ordered: 0,
        fuel: 0,
        windfall: 0,
        afterNight: 100,
        repairs: 0,
        repaired: [],
        upkeep: 0,
        defensesKept: 0,
        funding: 20,
        coverageBonus: 0,
        bonusCoverage: 58,
        arrivals: [],
        recovery: 2,
        after: 120,
        insolvent: false,
      },
      creditsAfter: 120,
      meters: { linkAvailability: 100, dataIntegrity: 100, sensorIntegrity: 100 },
      coverage: 58,
      maiScore: 87.4,
      streak: 0,
      bestStreak: 0,
      saved: 0,
      notes: [],
    }
    const resolved = (id: string, name: string, over: Partial<TurnRecord['events'][number]> = {}): TurnRecord['events'][number] => ({
      eventId: id,
      name,
      baseSeverity: 2,
      chainBonus: 0,
      mitigation: 0,
      effectiveSeverity: 0,
      repairCost: 0,
      notes: [],
      firedTechniqueRefs: [],
      saved: 0,
      ...over,
    })

    const opportunity = DEFAULT_SCENARIO.events.find((e) => e.kind === 'opportunity')
    expect(opportunity, 'the deck has no opportunity to build the branch from').toBeDefined()
    const opportunityOnly = verdictFor(
      { ...base, events: [resolved(opportunity!.id, opportunity!.name)] },
      DEFAULT_SCENARIO,
    )
    expect(opportunityOnly).toBe('No adversary activity; the turn broke your way.')

    const threat = DEFAULT_SCENARIO.events.find((e) => (e.kind ?? 'threat') === 'threat')
    const fizzled = verdictFor({ ...base, events: [resolved(threat!.id, threat!.name)] }, DEFAULT_SCENARIO)
    expect(fizzled).toBe('Nothing landed this turn.')

    for (const line of [opportunityOnly, fizzled]) {
      expect(countWords(line)).toBeLessThanOrEqual(VERDICT_WORD_MAX)
      expect(line.endsWith('.')).toBe(true)
      expect(line).not.toContain('\u{2014}')
    }
  })
})

