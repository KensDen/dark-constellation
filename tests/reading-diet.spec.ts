// Reading diet battery (brief v0.5 section 5, Round 3). The copy budget is
// a design constraint with a number on it, so it is measured rather than
// trusted: the headline stays inside eight words, the brief phase stays
// inside sixty words before the player's first input, and the verdict line
// stays one line. Every string is derived from the deck, so a content
// change that would blow the budget fails here.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { DIFFICULTIES, effectiveIntel, newGame, resolveTurn } from '../src/engine/reducer'
import { coverage, maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions, TurnRecord } from '../src/engine/types'
import {
  CHAIN_ARMED_LINE,
  CHROME_WORD_BUDGET,
  FIRST_INPUT_WORD_BUDGET,
  HEADLINE_WORD_MAX,
  briefCopy,
  chromeCopy,
  chromeWords,
  countWords,
  firstInputCopy,
  firstInputWords,
  hudLabels,
  hudStatusLine,
} from '../src/ui/brief'
import { VERDICT_WORD_MAX, verdictFor } from '../src/ui/verdict'
import { LAZY_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, TOP_INTEL_SCRIPT, WIN_SCRIPT } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const SEEDS = 12
const DIFFS: Difficulty[] = ['easy', 'standard', 'expert']
// Five lines of play, so the copy is measured against the deck as a lazy
// player meets it as well as a prepared one. The top-intel line is the one
// that matters most to the budget and was missing until Round 3.5: the
// other four never reach effective intel 3, so the longest brief the game
// can produce was never measured at all.
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

// Every intel level a player can reach, so the brief is measured at the
// fidelity that produces the longest copy, not just the default.
function statesAtEveryIntel(seed: number): GameState[] {
  const out: GameState[] = []
  for (let level = 0; level <= 3; level += 1) {
    let state = newGame(DEFAULT_SCENARIO, seed)
    for (let i = 0; i < level; i += 1) {
      state = resolveTurn(state, { ...NO_OP, buyIntelLevel: true }, turnRng(state.seed, state.turn))
    }
    out.push(state)
  }
  return out
}

describe('reading diet: the intel brief', () => {
  it('keeps the headline inside its word budget on every turn, intel level and difficulty', () => {
    let checked = 0
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const copy = briefCopy(before)
            checked += 1
            expect(
              countWords(copy.headline),
              `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: "${copy.headline}"`,
            ).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(SEEDS * DIFFS.length * LINES.length * 4)
  })

  it('keeps every intel level inside the headline budget, including the named-event level', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const state of statesAtEveryIntel(seed)) {
        const copy = briefCopy(state)
        expect(countWords(copy.headline), `${copy.headline}`).toBeLessThanOrEqual(HEADLINE_WORD_MAX)
        expect(copy.headline.length).toBeGreaterThan(0)
        expect(copy.vector.length).toBeGreaterThan(0)
      }
    }
  })

  it('stays inside sixty words before the first input on every turn of a campaign', () => {
    const overruns: string[] = []
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const words = firstInputWords(before, DIFFICULTIES[difficulty].label)
            if (words > FIRST_INPUT_WORD_BUDGET) {
              overruns.push(
                `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}: ${words} words\n  ${firstInputCopy(
                  before,
                  DIFFICULTIES[difficulty].label,
                ).join(' / ')}`,
              )
            }
          }
        }
      }
    }
    expect(overruns.join('\n')).toBe('')
  })

  it('stays inside the budget at every intel level the opening can reach', () => {
    // Named for what it measures: these are turn-4 states, because the
    // helper buys intel on consecutive turns from turn 1 and stops. The
    // mid-campaign top-intel copy is measured by the sweep above, through
    // the top-intel line of play.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const state of statesAtEveryIntel(seed)) {
        expect(
          firstInputWords(state, DIFFICULTIES.standard.label),
          `intel ${state.intelLevel}, seed ${seed}`,
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
    // vector clause was measured nowhere. The separate top-intel test
    // measured only turn-4 states and topped out at 39 words, and the
    // campaign sweep's own worst was 46: between them they implied far
    // more headroom than the game actually has, which is six words. This
    // fails if that coverage goes.
    const levels = new Set<number>()
    let worst = 0
    let worstAt = ''
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            levels.add(effectiveIntel(before))
            const words = firstInputWords(before, DIFFICULTIES[difficulty].label)
            if (words > worst) {
              worst = words
              worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}`
            }
          }
        }
      }
    }
    expect([...levels].sort(), 'the sweep never reaches top intel').toContain(3)
    // Two-sided on purpose. The ceiling is the budget; the floor is the
    // reason the coverage matters, because a sweep that stopped producing
    // long copy would pass the budget while measuring nothing. 54 is the
    // figure the brief's six words of headroom rest on, so a change that
    // moves it should have to say so here.
    expect(worst, `worst brief measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(FIRST_INPUT_WORD_BUDGET)
    // The exact figure, because it is the one src/ui/brief.ts and the
    // brief's section 5 both quote as the reason headroom is six words and
    // not twenty. The message prints the new worst, so re-baselining is a
    // one-line edit that forces those two to be updated with it.
    expect(worst, `worst brief measured: ${worst} words at ${worstAt}`).toBe(54)
  })

  it('counts every line the brief is built from, so none can be dropped from the budget', () => {
    // firstInputCopy is a hand-written enumeration, and the suite is its
    // only reader: a line the brief renders could be deleted from the
    // measured set and every budget test would still pass, quieter and
    // wrong. So the enumeration is checked against the pieces the brief is
    // actually built from rather than trusted to list them.
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          const label = DIFFICULTIES[before.difficulty].label
          const measured = firstInputCopy(before, label)
          const copy = briefCopy(before)
          const labels = hudLabels(before)
          const where = `${name}, turn ${before.turn}, seed ${seed}`
          expect(measured, `${where}: headline missing`).toContain(copy.headline)
          expect(measured, `${where}: vector line missing`).toContain(copy.vector)
          if (copy.tag) expect(measured, `${where}: technique tag missing`).toContain(`Technique: ${copy.tag}`)
          if (before.flags.lidarFallback) {
            expect(measured, `${where}: chain banner missing`).toContain(CHAIN_ARMED_LINE)
          }
          for (const hudLabel of Object.values(labels)) {
            expect(measured, `${where}: HUD label ${hudLabel} missing`).toContain(hudLabel)
          }
          // The six numbers are reading load too, and they are exactly the
          // size of the headroom the budget claims: dropping one from the
          // enumeration would measure every turn a word light. Counted
          // rather than merely found, so two meters showing the same value
          // cannot cover for each other.
          const values = [
            String(maiScore(before)),
            String(before.credits),
            String(coverage(before.assets)),
            String(before.meters.linkAvailability),
            String(before.meters.dataIntegrity),
            String(before.meters.sensorIntegrity),
          ]
          const counts = new Map<string, number>()
          for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
          for (const [v, n] of counts) {
            const found = measured.filter((line) => line === v).length
            expect(found, `${where}: HUD value ${v} appears ${found} times, expected ${n}`).toBe(n)
          }
          const turn = Math.min(before.turn, DEFAULT_SCENARIO.totalTurns)
          expect(measured, `${where}: status line missing`).toContain(hudStatusLine(before, label, turn))
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
    // The authoritative list is what the screen renders. There is no DOM
    // here, so it is pinned by name; Round 5's rendering environment is
    // what will derive it instead.
    const required = [
      '> INCOMING TRANSMISSION_',
      'Expand full brief',
      'To procurement',
      'What these numbers mean',
      'Posture detail',
      'Back to menu',
      'Save',
      'Export code',
      'Autosaved each turn.',
    ]
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        const chrome = chromeCopy(before)
        for (const control of required) {
          expect(chrome, `chrome no longer counts "${control}"`).toContain(control)
        }
        // The heading carries the turn, so it is checked by shape.
        expect(chrome.some((line) => /^1\. Intel brief, turn \d+$/.test(line)), 'the section heading is not counted').toBe(
          true,
        )
      }
    }
    // The other direction: a control that leaves the screen but stays in
    // the list makes the bound look tighter than it is, which is the same
    // dishonesty in reverse. Pinned against the source that renders them,
    // since there is no DOM here to ask.
    const game = readFileSync(join(SRC, 'ui', 'Game.tsx'), 'utf8')
    for (const control of required.filter((c) => c !== '> INCOMING TRANSMISSION_')) {
      expect(game.includes(control), `chrome counts "${control}", which the screen no longer renders`).toBe(true)
    }
    // The transmission label is rendered as an entity by the teletype bar.
    const teletype = readFileSync(join(SRC, 'ui', 'cues', 'Teletype.tsx'), 'utf8')
    expect(teletype.includes('INCOMING TRANSMISSION_'), 'chrome counts a transmission label nothing renders').toBe(true)
  })

  it('bounds the interface chrome that the reading budget excludes', () => {
    // The budget counts the brief's reading load, not navigation. The
    // excluded words are still counted here, so the exclusion cannot grow
    // into a loophole.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        expect(chromeWords(before), chromeCopy(before).join(' / ')).toBeLessThanOrEqual(CHROME_WORD_BUDGET)
      }
    }
  })

  it('keeps the brief and its chrome together under a hundred words on screen', () => {
    // The two budgets added: a sanity ceiling on everything the brief
    // phase puts in front of the player, badges aside.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      for (const { before } of playTurns(seed, WIN_SCRIPT)) {
        const total = firstInputWords(before, DIFFICULTIES.standard.label) + chromeWords(before)
        expect(total, `turn ${before.turn}, seed ${seed}`).toBeLessThanOrEqual(
          FIRST_INPUT_WORD_BUDGET + CHROME_WORD_BUDGET,
        )
      }
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
  it('keeps the top-intel line legal well past the seeds the suite sweeps', () => {
    // The line this round added is checked wider than the sweep, because
    // its failure mode was latent: legal on the seeds measured, illegal a
    // few seeds later. Only this line is swept this wide. The other four
    // are already played end to end by every budget test in this file, so
    // an illegal cart on the swept seeds would fail those; and the
    // prepared line has a turn-9 shortfall on expert beyond them that
    // predates this round and is recorded as a finding rather than fixed
    // here.
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 100; seed += 1) {
        let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
        while (state.status === 'playing') {
          const turn = state.turn
          expect(
            () => resolveTurn(state, TOP_INTEL_SCRIPT[turn] ?? NO_OP, turnRng(state.seed, turn)),
            `top intel, ${difficulty}, seed ${seed}, turn ${turn}`,
          ).not.toThrow()
          state = resolveTurn(state, TOP_INTEL_SCRIPT[turn] ?? NO_OP, turnRng(state.seed, turn))
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
    let sawMitigated = false
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
            sawMitigated = true
            expect(verdict, `turn ${record.turn}`).toBe('Posture held; every attempt was mitigated below threshold.')
          } else {
            sawFizzled = true
            expect(verdict, `turn ${record.turn}`).toBe('Nothing landed this turn.')
          }
        }
      }
    }
    expect(sawLanded, 'no seed produced a landed event').toBe(true)
    expect(sawHeld, 'no seed produced a fully held turn').toBe(true)
    // Recorded, not required: the deck reaches the mitigated branch in
    // play and does not reach the fizzle branch, which is why the two
    // branches below are covered directly instead.
    expect(sawMitigated || sawFizzled).toBe(true)
  })

  it('reads as English on the branches the shipped deck never produces', () => {
    // Two branches are unreachable with this deck: a turn whose only event
    // is an opportunity, and a turn where every threat fizzles with no
    // countermeasure in play. The scenario schema allows both, so they are
    // correct totality over the type rather than dead code, and they are
    // covered here with synthetic records rather than deleted.
    const base: TurnRecord = {
      turn: 4,
      creditsAfter: 100,
      purchases: [],
      events: [],
      meters: { linkAvailability: 100, dataIntegrity: 100, sensorIntegrity: 100 },
      coverage: 44,
      maiScore: 83,
      flags: { lidarFallback: false },
      conditionsActive: [],
      commendations: [],
      surgeTokensAfter: 0,
      notes: [],
    }
    const resolved = (id: string, name: string, over: Partial<TurnRecord['events'][number]> = {}) => ({
      eventId: id,
      name,
      baseSeverity: 2,
      chainBonus: 0,
      mitigation: 0,
      effectiveSeverity: 0,
      repairCost: 0,
      notes: [],
      firedTechniqueRefs: [],
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
