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
import { deriveBeats } from '../src/director'
import { DIFFICULTIES, effectiveIntel, newGame, resolveTurn } from '../src/engine/reducer'
import { coverage, maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions, TurnRecord } from '../src/engine/types'
import {
  CHAIN_ARMED_LINE,
  CHROME_WORD_BUDGET,
  SOUND_TOGGLE_LABELS,
  DISCLOSURE_WORD_BUDGET,
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

const tokensOf = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])

// The words behind the tap that are not already above it. Derived from the
// BriefCopy the screen renders, not from a second copy of the strings.
function novelTokens(copy: ReturnType<typeof briefCopy>): string[] {
  const summary = tokensOf([copy.headline, copy.vector, copy.tag ?? ''].join(' '))
  return [...tokensOf(copy.full.join(' '))].filter((w) => !summary.has(w))
}
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
      SOUND_TOGGLE_LABELS.effects,
      SOUND_TOGGLE_LABELS.music,
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
    // Three controls are rendered by components of their own rather than
    // spelled in Game.tsx, so each is pinned where it actually lives.
    const elsewhere = new Set<string>([
      '> INCOMING TRANSMISSION_',
      SOUND_TOGGLE_LABELS.effects,
      SOUND_TOGGLE_LABELS.music,
    ])
    for (const control of required.filter((c) => !elsewhere.has(c))) {
      expect(game.includes(control), `chrome counts "${control}", which the screen no longer renders`).toBe(true)
    }
    // The transmission label is rendered as an entity by the teletype bar.
    const teletype = readFileSync(join(SRC, 'ui', 'cues', 'Teletype.tsx'), 'utf8')
    expect(teletype.includes('INCOMING TRANSMISSION_'), 'chrome counts a transmission label nothing renders').toBe(true)
    // The two audio toggles read their names from this same constant
    // rather than spelling them, so the text pin would be circular. What
    // has to be true is that Game.tsx mounts the control and that the
    // control renders those names, and the second half is asserted against
    // a rendered DOM in tests/sound.dom.spec.tsx rather than by grep.
    expect(game.includes('<SoundToggles'), 'chrome counts two toggles the campaign screen does not mount').toBe(true)
    const toggles = readFileSync(join(SRC, 'ui', 'cues', 'SoundToggles.tsx'), 'utf8')
    expect(toggles.includes('SOUND_TOGGLE_LABELS'), 'the toggles no longer read their names from the counted constant').toBe(
      true,
    )
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

  it('expands into something the summary does not already say, at every intel level', () => {
    // The dead control, measured at every level before this round: 0 novel
    // tokens at intel 0 turn 1 (the expansion was the summary concatenated
    // verbatim), 6 at intel 0 afterwards and all six of them function
    // words (`unavailable`, `0`, `in`, `the`, `procure`, `phase`), 1 to 3
    // at intel 1 where the single novel token was the word "the", and 0 at
    // intel 2. At intel 1 and 2 the expansion was also SHORTER than the
    // summary, so a player tapped "Expand full brief" and received less
    // than was already on screen. Only intel 3 earned its tap.
    const dead: string[] = []
    let worstNovel = Infinity
    let worstNovelAt = ''
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          for (const { before } of playTurns(seed, script, difficulty)) {
            const copy = briefCopy(before)
            const novel = novelTokens(copy)
            if (novel.length < worstNovel) {
              worstNovel = novel.length
              worstNovelAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, intel ${effectiveIntel(before)}`
            }
            if (novel.length < DISCLOSURE_NOVEL_MIN) {
              dead.push(
                `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, intel ${effectiveIntel(before)}: ` +
                  `${novel.length} novel tokens behind the tap`,
              )
            }
          }
        }
      }
    }
    expect([...new Set(dead)].slice(0, 12).join('\n')).toBe('')
    // The measured minimum, pinned. Without it DISCLOSURE_NOVEL_MIN can be
    // lowered to zero and nothing fails, because a threshold mutation only
    // ever weakens a threshold: the guard above would keep passing while
    // the bar it names had stopped meaning anything. A mutation proved
    // exactly that and slept. Pinning the floor's real distance from the
    // bar makes both directions have to come here and say so.
    expect(worstNovel, `thinnest disclosure measured: ${worstNovel} novel tokens at ${worstNovelAt}`).toBe(31)
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
        { ...NO_OP, buyAssets: [{ kind: 'drone', tier: 'B' }] },
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
      for (const st of [fresh, bought, plain]) {
        const body = briefCopy(st).full.join(' ')
        expect(body, `seed ${seed}: the panel does not report the real surge authority`).toContain(
          String(st.surgeTokens),
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
    let sawMoved = false
    const start = coverage(newGame(DEFAULT_SCENARIO, 1).assets)
    for (const [name, script] of LINES) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        for (const { before } of playTurns(seed, script)) {
          const cov = coverage(before.assets)
          if (cov !== start) sawMoved = true
          expect(
            briefCopy(before).full.join(' '),
            `${name}, turn ${before.turn}, seed ${seed}: the panel does not report coverage ${cov}`,
          ).toContain(String(cov))
        }
      }
    }
    expect(sawMoved, 'coverage never left its starting value, so the join could not disagree').toBe(true)
  })

  it('leaks nothing about the deck ahead below top intel, so the purchase keeps its value', () => {
    // The other direction, and the one that would be a design defect
    // rather than a dull screen. Everything the expansion says below intel
    // 3 is the player's own public state, so two states differing ONLY in
    // the campaign slots ahead of them must expand identically. If a
    // forecast ever leaks in, this fails.
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const base = newGame(DEFAULT_SCENARIO, seed)
      for (let level = 0; level <= 2; level += 1) {
        let state = base
        for (let i = 0; i < level; i += 1) {
          state = resolveTurn(state, { ...NO_OP, buyIntelLevel: true }, turnRng(state.seed, state.turn))
        }
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
          briefCopy(elsewhere).full.join(' '),
          `seed ${seed}, intel ${level}: the expansion changed when only the deck ahead changed`,
        ).toBe(briefCopy(state).full.join(' '))
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
            const words = countWords(briefCopy(before).full.join(' '))
            if (words > worst) {
              worst = words
              worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, intel ${effectiveIntel(before)}`
            }
          }
        }
      }
    }
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(
      DISCLOSURE_WORD_BUDGET,
    )
    // The exact figure, for the reason the 54 pin above carries one: it is
    // the number the budget's headroom rests on, and re-baselining should
    // be a deliberate edit rather than a drift. Measured at top intel,
    // turn 11, where three named slots sit above the posture.
    // 90 until the ceiling was pointed at the whole panel rather than at
    // briefCopy's return value. The worst is turn 1, where the job framing
    // renders with the posture below it, which is the screen the round is
    // about and the one the first version of this bound could not see.
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBe(109)
  })

  it('bounds the beat title, the other channel no budget measured', () => {
    // Round 7b rewrote the turn-start title and the quiet title. Titles
    // render on the playback card, which no budget function has ever
    // counted, so the round bounds what it touched rather than leaving the
    // next round to discover it.
    // OVER EVERY LINE OF PLAY. The first version swept NO_OP only, which
    // is the one line that never buys anything, so two whole beat kinds
    // (procurement and deploy-arrived) had no title measured at all and a
    // 37-word title on any other line shipped green. That is Round 3.5's
    // error inside the round written to name it: reach for the worst case,
    // not the convenient one.
    let worst = 0
    let worstAt = ''
    const kinds = new Set<string>()
    for (const [name, script] of LINES) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const after = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
            for (const beat of deriveBeats(state, after)) {
              kinds.add(beat.kind)
              const words = countWords(beat.title)
              if (words > worst) {
                worst = words
                worstAt = `${name}, ${beat.kind}, turn ${state.turn}, ${difficulty}, seed ${seed}: "${beat.title}"`
              }
            }
            state = after
          }
        }
      }
    }
    // The sweep must actually reach the kinds the NO_OP version could not,
    // or it has been widened in name only.
    for (const kind of ['procurement', 'deploy-arrived', 'commendation']) {
      expect(kinds.has(kind), `the title sweep never produced a ${kind} beat`).toBe(true)
    }
    expect(worst, `worst beat title measured: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(BEAT_TITLE_WORD_BUDGET)
    // 11 when this swept NO_OP only. Widened to every line of play it is
    // 12, on the turn-start card of a prepared campaign whose three meters
    // healed by different amounts.
    // 11 when this swept NO_OP only; 12 once widened; 13 once the
    // zero-recovery clause stopped saying ", no damage to recover", which
    // was four words and false, and went back to naming the three meters
    // it actually knows about. One word of the ceiling left.
    expect(worst, `worst beat title measured: ${worst} words at ${worstAt}`).toBe(13)
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
