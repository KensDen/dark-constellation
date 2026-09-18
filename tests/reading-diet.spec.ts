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
import { BEAT_KINDS, deriveBeats } from '../src/director'
import { DIFFICULTIES, effectiveIntel, newGame, resolveTurn } from '../src/engine/reducer'
import { coverage, maiScore } from '../src/engine/scoring'
import { turnRng } from '../src/engine/rng'
import type { Difficulty, GameState, TurnActions, TurnRecord } from '../src/engine/types'
import {
  CHAIN_ARMED_LINE,
  CHROME_WORD_BUDGET,
  SOUND_TOGGLE_LABELS,
  DISCLOSURE_WORD_BUDGETS,
  FIRST_INPUT_WORD_BUDGET,
  HEADLINE_WORD_MAX,
  briefCopy,
  disclosureBlocks,
  jobFramingBlocks,
  postureDetailLines,
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
  return [...tokensOf(disclosureBlocks(copy).join(' '))].filter((w) => !summary.has(w))
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
            const words = countWords(disclosureBlocks(briefCopy(before)).join(' '))
            if (words > worst) {
              worst = words
              worstAt = `${name}, turn ${before.turn}, ${difficulty}, seed ${seed}, intel ${effectiveIntel(before)}`
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
    expect(worst, `worst disclosure measured: ${worst} words at ${worstAt}`).toBe(115)
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
    // required set from BEAT_KINDS.
    let worst = 0
    let worstAt = ''
    const visibleKinds = new Set<string>()
    const surgeLine = (state: GameState): TurnActions => {
      const base = WIN_SCRIPT[state.turn] ?? NO_OP
      return state.surgeTokens > 0 && state.conditions.length > 0
        ? { ...base, spendSurgeOn: state.conditions[0].instanceId }
        : base
    }
    const lines: [string, (s: GameState) => TurnActions][] = [
      ...LINES.map(([name, script]) => [name, (st: GameState) => script[st.turn] ?? NO_OP] as [string, (s: GameState) => TurnActions]),
      ['spends surge', surgeLine],
    ]
    for (const [name, pick] of lines) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let state = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (state.status === 'playing') {
            const after = resolveTurn(state, pick(state), turnRng(state.seed, state.turn))
            for (const beat of deriveBeats(state, after)) {
              if (!beat.visible) continue
              visibleKinds.add(beat.kind)
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
    expect(worst, `worst beat title measured: ${worst} words at ${worstAt}`).toBe(13)
  })

  it('introduces the MAI abbreviation before the job framing uses it', () => {
    // Round 7b's move of the framing into this module dropped "(MAI)" from
    // line 1, so the abbreviation first appeared unintroduced in line 3,
    // "MAI below 35", while the HUD uses it on every screen. The claim is
    // about reading order, so it is asserted as reading order: the first
    // line to say MAI must be the one that says what it stands for.
    const lines = jobFramingBlocks(DEFAULT_SCENARIO)
    const first = lines.findIndex((l) => /\bMAI\b/.test(l))
    expect(first, 'the job framing never uses the abbreviation, so this proves nothing').toBeGreaterThanOrEqual(0)
    expect(lines[first], `the first mention of MAI is "${lines[first]}"`).toContain('Mission Assurance Index (MAI)')
  })

  it('bounds Posture detail at the deck\'s structural maximum, not at a line of play', () => {
    // Round 7 set this bound twice from lines of play and both were beaten:
    // seven hand-named states gave 93 when legal play reached 139, then a
    // "buy everything" line that only ever bought Tier B drones gave 96 when
    // a mixed buyer reached 132. A line of play is a declared set. The deck's
    // structure is not: every countermeasure owned, every kind and tier
    // deployed and in transit, the one retrofit pending, surge full and the
    // allied boost running. With the fleet and transit grouped by kind and
    // tier, no legal state can say more than this one.
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const pairs = [['sat', 'A'], ['sat', 'B'], ['rpoSat', 'A'], ['rpoSat', 'B'], ['drone', 'A'], ['drone', 'B'], ['groundStation', 'B']] as const
    const layerOf = (k: string) => (k === 'drone' ? 'AIR' : k === 'groundStation' ? 'GROUND' : 'ORBIT')
    const worst: GameState = {
      ...base,
      counters: DEFAULT_SCENARIO.countermeasures.map((c) => c.id).filter((id) => id !== 'intelInvestment'),
      assets: pairs.map(([kind, tier], i) => ({ id: `max-${i}`, kind, tier, layer: layerOf(kind), integrity: 100 })) as GameState['assets'],
      pipeline: pairs.map(([kind, tier], i) => ({ id: `pipe-${i}`, kind, tier, etaTurns: 3 })) as GameState['pipeline'],
      pendingCounters: [{ id: 'sensorFusion', etaTurns: 1 }],
      surgeTokens: 3,
      intelBoostTurns: 2,
    }
    const words = countWords(postureDetailLines(worst).map((l) => l.text).join(' '))
    expect(words, `structural maximum: ${words} words`).toBeLessThanOrEqual(DISCLOSURE_WORD_BUDGETS['Posture detail'])
    // Pinned: the bound is this figure, derived from the deck. Most of it is
    // the countermeasure list, eleven names at most. Re-argued on the record
    // in Round 7 (the budget rose from 110 to 170) rather than trimmed,
    // because cutting that list to a count removes information a player
    // might want and is copy the author has not seen.
    expect(words, `structural maximum: ${words} words`).toBe(164)
  })

  it('groups the fleet by kind and tier, and says surge is spent in a decision phase', () => {
    const base = newGame(DEFAULT_SCENARIO, 1, 'standard')
    const st: GameState = {
      ...base,
      assets: [
        { id: 'a', kind: 'drone', tier: 'B', layer: 'AIR', integrity: 100 },
        { id: 'b', kind: 'drone', tier: 'B', layer: 'AIR', integrity: 60 },
        { id: 'c', kind: 'drone', tier: 'A', layer: 'AIR', integrity: 100 },
        { id: 'd', kind: 'sat', tier: 'B', layer: 'ORBIT', integrity: 0 },
      ],
    }
    const text = postureDetailLines(st).map((l) => l.text)
    // Two Tier B drones grouped, the Tier A one apart, the destroyed sat not
    // counted as operational.
    expect(text[0]).toBe('Fleet: 3 operational: 2 Drone B, 1 Drone A.')
    const surge = text.find((l) => l.startsWith('Surge authority'))!
    expect(surge).toContain('a decision phase')
    expect(surge).not.toMatch(/any phase/)
  })

  it('bounds Posture detail over every state, including a player who buys everything', () => {
    // Round 7's first version of this bound came from seven states a DOM
    // test happened to name, and three lenses broke it in legal play at up
    // to 139 words against 110. The set is swept here instead: every line
    // of play, every difficulty, and a line that buys as much as each turn
    // allows, which is the state the named seven never reached.
    const buyAll = (st: GameState): TurnActions => {
      const avail = st.credits + st.scenario.incomePerTurn
      const counters: TurnActions['buyCounters'] = []
      let spend = 0
      for (const cm of [...st.scenario.countermeasures].sort((a, b) => a.cost - b.cost)) {
        if (cm.id === 'intelInvestment' || cm.id === 'irRetainer' || st.counters.includes(cm.id)) continue
        if (st.pendingCounters.some((p) => p.id === cm.id) || spend + cm.cost > avail) continue
        counters.push(cm.id)
        spend += cm.cost
      }
      const drones = Math.max(0, Math.floor((avail - spend) / st.scenario.prices.drone))
      return { ...NO_OP, buyCounters: counters, buyAssets: Array.from({ length: drones }, () => ({ kind: 'drone' as const, tier: 'B' as const })) }
    }
    const pickers: [string, (st: GameState) => TurnActions][] = [
      ...LINES.map(([n, sc]) => [n, (st: GameState) => sc[st.turn] ?? NO_OP] as [string, (st: GameState) => TurnActions]),
      ['buys everything', buyAll],
    ]
    let worst = 0
    let worstAt = ''
    for (const [name, pick] of pickers) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let st = newGame(DEFAULT_SCENARIO, seed, difficulty)
          while (st.status === 'playing') {
            const words = countWords(postureDetailLines(st).map((l) => l.text).join(' '))
            if (words > worst) {
              worst = words
              worstAt = `${name}, turn ${st.turn}, ${difficulty}, seed ${seed}`
            }
            let next: GameState
            try {
              next = resolveTurn(st, pick(st), turnRng(st.seed, st.turn))
            } catch {
              next = resolveTurn(st, NO_OP, turnRng(st.seed, st.turn))
            }
            st = next
          }
        }
      }
    }
    expect(worst, `worst Posture detail: ${worst} words at ${worstAt}`).toBeLessThanOrEqual(DISCLOSURE_WORD_BUDGETS['Posture detail'])
    // Breadth only, and not pinned. A line of play is a declared set, and
    // pinning its worst is how this panel twice carried a "worst" it was not
    // (93 from seven named states, then 96 from a line that only bought Tier
    // B drones). The bound is the structural maximum in the test above.
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
