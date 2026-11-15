// Reading diet battery (brief v0.5 section 5, Round 3). The copy budget is
// a design constraint with a number on it, so it is measured rather than
// trusted, and every string is derived from the deck, so a content change
// that would blow a budget fails here.
//
// v2.0 R3: the pixel board is retired, and with it the reading budget this
// file was built around (src/ui/brief.ts: the headline's eight words, the
// deciding board's words before the first input, its chrome, the full
// brief's disclosure) and the pixel night's cards it measured. What is
// left is the copy that still ships and is still generated or bounded
// here: SYSTEM's HOW TO PLAY, the words an answer is offered in, the watch
// officer's lines over real play, and the scripted lines the other suites
// play.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { RESPONSE_TEXT } from '../src/content/responseText'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions } from '../src/engine/types'
import { callSigns } from '../src/ui/board/board'
import { opportunityLines } from '../src/ui/night/closeModel'
import * as nightCopy from '../src/ui/night/nightCopy'
import { nightOf } from '../src/ui/night/nightModel'
import { DECK_LINE, howToLines } from '../src/ui/systemControls'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, TOP_INTEL_SCRIPT, WIN_SCRIPT, scripted } from './scripts'

const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length

const SEEDS = 12
const DIFFS: Difficulty[] = ['easy', 'standard']
// Five lines of play, so the copy is measured against the deck as a lazy
// player meets it as well as a prepared one. Each is played as the engine
// will take it (tests/scripts.ts, scripted): an order the budget cannot
// meet is left out.
const LINES: [string, Record<number, TurnActions>][] = [
  ['prepared', WIN_SCRIPT],
  ['mixed', MIXED_SCRIPT],
  ['top intel', TOP_INTEL_SCRIPT],
  ['lazy', LAZY_SCRIPT],
  ['passive', LOSS_SCRIPT],
]

// One resolve a night: asserted not to throw, and its result is the state
// the loop advances with.
function* playTurns(seed: number, script: Record<number, TurnActions>, difficulty: Difficulty = 'standard', label = ''): Generator<{ before: GameState; after: GameState }> {
  let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
  const line = scripted(script)
  while (state.status === 'playing') {
    const before = state
    let after: GameState | undefined
    expect(() => {
      after = resolveTurn(before, line(before), turnRng(before.seed, before.turn))
    }, `${label}, ${difficulty}, seed ${seed}, night ${before.turn}`).not.toThrow()
    state = after as GameState
    yield { before, after: state }
  }
}

// The answer a move is offered in, on the button the night stops on (v1.7
// R1): a label, not a sentence. The bound and the measured worst, pinned,
// so a change that moves either comes here and says so. The worst is 9
// ("Cut the segments apart and restore from offline backups").
const RESPONSE_LABEL_WORD_BUDGET = 10
const WORST_RESPONSE_LABEL = 9

describe('reading diet: the copy that ships', () => {
  it('says "mission assurance score" in SYSTEM\'s how to play, and never MAI', () => {
    // Round 7 introduced the abbreviation in line 1, "Mission Assurance
    // Index (MAI)", because the HUD used it on every screen. v1.3 R2
    // retired the abbreviation from the player's words, and the job names
    // the score in full. Since v1.6 R3 the job is SYSTEM's HOW TO PLAY
    // (Ken's playtest item 6), and its first line, the one that sets the
    // win condition, must name it.
    const lines = howToLines(DEFAULT_SCENARIO)
    expect(lines[0], `the job's first line is "${lines[0]}"`).toContain('mission assurance score')
    for (const line of lines) {
      expect(line, `HOW TO PLAY still says MAI: "${line}"`).not.toMatch(/\bMAI\b/)
      expect(line, `HOW TO PLAY still says Mission Assurance Index: "${line}"`).not.toMatch(/Assurance Index/i)
    }
  })

  it('bounds the words an answer is offered in, for every response of every threat in the deck', () => {
    // At their structural maximum: every response of every threat,
    // whether or not a sweep offers it.
    const labels = DEFAULT_SCENARIO.events.flatMap((e) => (e.responses ?? []).map((r) => [e.id, r.id, RESPONSE_TEXT[e.id]?.[r.id] ?? ''] as const))
    expect(labels.length, 'the deck offers no response').toBeGreaterThan(0)
    for (const [event, id, label] of labels) {
      expect(countWords(label), `${event}/${id}: "${label}"`).toBeGreaterThan(0)
      expect(countWords(label), `${event}/${id}: "${label}"`).toBeLessThanOrEqual(RESPONSE_LABEL_WORD_BUDGET)
    }
    expect(Math.max(...labels.map(([, , label]) => countWords(label))), 'the longest answer in the deck').toBe(WORST_RESPONSE_LABEL)
  })

  it('never emits an em or en dash in generated copy', () => {
    const DASH = /[\u2013\u2014]/
    // SYSTEM's own lines, built from the scenario and the deck's counts.
    for (const line of [...howToLines(DEFAULT_SCENARIO), DECK_LINE]) expect(line, `"${line}"`).not.toMatch(DASH)
    // The night's generated lines over real play: the watch officer's
    // line for each move, with the asset it names, and what an opportunity
    // did.
    let officer = 0
    let windfalls = 0
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const [name, script] of LINES) {
        for (const { before, after } of playTurns(seed, script, 'standard', name)) {
          const signs = callSigns(before)
          for (const step of nightOf(before, after).steps) {
            if (step.kind === 'opportunity') {
              for (const line of opportunityLines(step, signs)) {
                windfalls += 1
                expect(line, `seed ${seed}, ${name}, night ${before.turn}: "${line}"`).not.toMatch(DASH)
              }
              continue
            }
            const said = nightCopy.officerFor(step, signs.get(step.ev.targetAssetId ?? ''))
            if (!said) continue
            officer += 1
            expect(said.line, `seed ${seed}, ${name}, night ${before.turn}: "${said.line}"`).not.toMatch(DASH)
            expect(said.line, 'the asset a line names was never filled in').not.toContain('{t}')
          }
        }
      }
    }
    expect(officer, 'the sweep met no watch officer line, so nothing was read').toBeGreaterThan(100)
    expect(windfalls, 'the sweep met no opportunity, so none was read').toBeGreaterThan(0)
  })
})

describe('reading diet: the fixtures themselves', () => {
  it('keeps every scripted line legal well past the seeds the suite sweeps (v1.2 R5a)', () => {
    // A line's failure mode was latent: legal on the seeds measured,
    // illegal a few seeds later (the prepared line's shortfall on Expert
    // lived in a comment for two versions, failing on seeds nobody swept).
    // Since v2.0 R3 the written orders are played as the engine will take
    // them (tests/scripts.ts, scripted): the budget of the 3D game does
    // not meet every one, and what it cannot meet is left out. So each
    // line is checked wider than the sweep to reach an end, the engine
    // refusing nothing on the way.
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= 100; seed += 1) {
          let nights = 0
          for (const { after } of playTurns(seed, script, difficulty, name)) {
            nights += 1
            expect(after.history.length).toBe(nights)
          }
          expect(nights, `${name}, ${difficulty}, seed ${seed} played no night`).toBeGreaterThan(0)
        }
      }
    }
  })
})
