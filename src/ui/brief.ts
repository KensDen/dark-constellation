// Reading diet for the intel brief (brief v0.5 section 5). Before first
// input on a normal turn the player sees a headline of eight words or
// fewer, a one-line threat vector, a technique tag, and the HUD numbers;
// the full forecast moves behind EXPAND. Every line here is derived from
// the scenario and the engine's own forecast, so the copy cannot drift
// from the deck, and the word budget is enforced by a battery test rather
// than trusted.

import { ADVERSARY, SQUADRON } from '../config'
import { effectiveIntel } from '../engine/reducer'
import { coverage, maiScore } from '../engine/scoring'
import type { GameState, ThreatEvent } from '../engine/types'
import { kindLabels, techniqueLabel, vectorLabels } from './labels'
import { LAYERS } from '../engine/types'

// The budget the brief is designed against (brief v0.7 section 5):
// "Before first input on a normal turn: 60 words or fewer of reading
// load", with the interface chrome bounded separately at 32 and the two
// together at 100. v0.5 said "on screen", which was imprecise: the
// complaint this pass answers is prose, not a credits readout.
//
// What the budget counts is therefore the reading load the brief names:
// the headline, the threat vector, the technique tag, and the HUD's meter
// labels, values and status line. What it does not count, and why:
//
//   - Interface chrome: the section heading, the transmission label, the
//     button labels, the summary labels of the disclosures, the menu and
//     save controls the screen carries, and the two audio toggles. These
//     are navigation, not the brief; they are bounded separately by
//     CHROME_WORD_BUDGET so the exclusion cannot quietly become a
//     loophole. The bound was raised from 24 to 32 in v0.9 along with the
//     four controls it had not been counting: a bound satisfied by not
//     counting things is not a bound.
//   - Condition badges: at-a-glance state, read as glyphs rather than
//     prose, and their count is set by play rather than by copy.
//
// Everything else the turn could say (the full forecast, the turn-1 job
// framing, the fleet and countermeasure lists, the in-transit line, the
// surge detail, the BLACKOUT CHAIN mechanics) sits behind a disclosure,
// which is what "one tap away" means.
//
// The headroom is thinner than it looks. The suite sweeps five lines of
// play, and the top-intel line reaches the branch that carries the named
// lead event, the "plus N more" suffix, the carried vector clause and the
// technique tag at once: 54 words of the 60. Round 4d's two audio toggles
// are chrome, not reading load: they took two of the four words chrome had
// spare, and two remain.
export const HEADLINE_WORD_MAX = 8
export const FIRST_INPUT_WORD_BUDGET = 60
export const CHROME_WORD_BUDGET = 32

// The disclosure body, bounded from Round 7b (brief v2.3 section 5).
//
// This channel was measured by NOTHING. `firstInputCopy` below does not
// count it, by design, because it sits behind a tap and the budget is
// about what a player reads before their first input. But "not counted"
// and "unbounded" are different things, and Round 7b is the round that
// fills it: the same shape as an empty screen scoring perfectly against
// sixty words, one screen over. A ceiling that is measured is the point;
// the number itself is set from what the panel actually produces plus
// working room, and the brief records it once measured rather than
// inventing one first. Inventing a bound before measuring is how chrome
// sat at "about 28" for six versions while the code enforced 24 and the
// truth was 30.
//
// IT WAS 100 FOR AN HOUR AND THAT WAS THE SAME MISTAKE. The first version
// of this bound was measured against briefCopy().full while Game.tsx also
// rendered the turn-1 job framing inside the same <details>, so the number
// bounded a part of the panel and the real body was 132 words. The framing
// now lives in this module and is part of `full`, the measured worst is
// 109 on turn 1, and 120 is that figure plus room.
export const DISCLOSURE_WORD_BUDGET = 120

// The two audio toggles (Round 4d). One word each, and that is the design
// constraint rather than a preference for brevity: chrome had four words
// spare and these take two of them. The on and off state rides
// aria-pressed, which costs no words at all.
//
// They live here rather than in the component so the chrome count below is
// the same constant the screen renders, instead of a second copy of it
// that can drift; tests/sound.dom.spec.tsx asserts the rendered buttons
// carry exactly these names.
export const SOUND_TOGGLE_LABELS = { effects: 'Sound', music: 'Music' } as const

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export interface BriefCopy {
  headline: string
  vector: string
  tag?: string
  tagUrl?: string
  // The full forecast, shown only behind EXPAND.
  full: string[]
}

const shortName = (ev: ThreatEvent) => ev.name.split(' (')[0]

function plannedEvents(state: GameState, turn: number): ThreatEvent[][] {
  const plan = state.scenario.campaign.find((p) => p.turn === turn)
  if (!plan) return []
  return plan.slots.map((slot) => {
    const ids = slot.fixed ? [slot.fixed] : (slot.drawFrom ?? [])
    return ids.map((id) => state.scenario.events.find((e) => e.id === id)).filter((e): e is ThreatEvent => !!e)
  })
}

// Trim to the word budget without ever cutting mid-sentence: the headline
// is built from parts that already fit, and this is the backstop.
function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= max) return text.trim()
  return words.slice(0, max).join(' ')
}

// What the next intel level buys, in the game's own terms. The fidelity
// ladder is implemented in forecastFor and mirrored in briefCopy below, so
// this describes what those branches actually do rather than a promise.
const INTEL_BUYS: Record<number, string> = {
  0: 'names the segment under threat',
  1: 'adds the signature class',
  2: 'names the event itself',
}

// The expansion below top intel (Round 7b).
//
// THE DISCLOSURE WAS A DEAD CONTROL. Measured at every level: the
// expansion carried 0 tokens the summary did not already have at intel 0
// turn 1 and at intel 2, and at intel 1 the single novel token was the
// word "the". At intel 1 and 2 it was also SHORTER than the summary, so
// the player tapped "Expand full brief" and received less than was already
// on screen. Only intel 3 earned its tap.
//
// So below intel 3 the expansion stops trying to restate a forecast the
// player has not bought and reports what they already own instead: their
// own posture, their own pipeline, their own conditions, and the published
// price of the next level. NOTHING HERE IS DERIVED FROM THIS TURN'S
// CAMPAIGN SLOTS, which is what keeps the intel purchase worth making;
// tests/reading-diet.spec.ts holds that by comparing two states that
// differ only in their slots.
function postureLines(state: GameState): string[] {
  const { scenario } = state
  const lines: string[] = []

  const cov = coverage(state.assets)
  const min = scenario.slaBonus.coverageMin
  lines.push(
    cov >= min
      ? `Coverage ${cov}, clear of the ${min} the SLA pays at.`
      : `Coverage ${cov}. The SLA pays ${scenario.slaBonus.credits} a turn from ${min}.`,
  )

  // THREE POPULATIONS, not one. The first version computed only the
  // DEGRADED assets (0 < integrity < 100), so a fleet with wreckage in it
  // and no merely-damaged survivors was told "Every asset at full
  // integrity", which is false about the player's own state and is
  // contradicted twice on the same screen. With every asset destroyed it
  // also rendered an empty layer list beside that claim.
  const alive = state.assets.filter((a) => a.integrity > 0)
  const lost = state.assets.length - alive.length
  const degraded = alive.filter((a) => a.integrity < 100).length
  const layers = LAYERS.filter((l) => alive.some((a) => a.layer === l))
  const holding = layers.length > 0 ? `Holding ${layers.join(', ')}.` : 'No layer is holding.'
  const condition =
    lost > 0 && degraded > 0
      ? `${lost} lost, ${degraded} below full integrity.`
      : lost > 0
        ? `${lost} asset${lost > 1 ? 's' : ''} lost.`
        : degraded > 0
          ? `${degraded} asset${degraded > 1 ? 's' : ''} below full integrity.`
          : alive.length > 0
            ? 'Every asset at full integrity.'
            : 'Nothing left flying.'
  lines.push(`${holding} ${condition}`)

  lines.push(
    state.pipeline.length > 0
      ? `In transit: ${state.pipeline
          .map((p) => `${kindLabels[p.kind]} in ${p.etaTurns} turn${p.etaTurns === 1 ? '' : 's'}`)
          .join(', ')}.`
      : 'Nothing in transit.',
  )

  lines.push(
    state.conditions.length > 0
      ? `Running against you: ${state.conditions.map((c) => `${c.name} since turn ${c.startedTurn}`).join(', ')}.`
      : 'No conditions running against you.',
  )

  lines.push(
    state.surgeTokens > 0
      ? `${state.surgeTokens} surge authority in hand.`
      : 'No surge authority in hand.',
  )

  // The price is read from the deck, never spelled, so it cannot drift
  // from what procurement charges. Keyed on the PURCHASED level rather
  // than the effective one, because an allied data share lifts what the
  // brief says without changing what the next level costs.
  // `!== 3` rather than `< 3`: a comparison does not narrow a union of
  // numeric literals, and the tuple index is what catches that at compile
  // time rather than at level 3 in someone's campaign.
  const purchased = state.intelLevel
  if (purchased !== 3) {
    lines.push(`Intel level ${purchased + 1} costs ${scenario.prices.intelLevels[purchased]} and ${INTEL_BUYS[purchased]}.`)
  }

  return lines
}

// The turn-1 "Your job" framing, as text rather than as JSX.
//
// IT RENDERS INSIDE THE SAME DISCLOSURE as the posture panel, on the first
// screen of the game, and Round 7b's first disclosure ceiling did not see
// it: the ceiling measured briefCopy().full and worsted at 90 against a
// budget of 100, while the body a new player actually reads on turn 1 was
// 132 words. That is principle 16's newest level reproduced inside the
// guard written to close it, on the exact screen the round is about.
//
// So it lives here, the module the budget functions read, and Game.tsx
// renders it from this list on both screens that carry it. Every number
// is interpolated from the scenario, per the standing rule that prose
// cannot drift from mechanics.
export function jobFramingLines(scenario: GameState['scenario']): string[] {
  return [
    `Finish turn ${scenario.totalTurns} with the Mission Assurance Index at ${scenario.winThreshold} or higher.`,
    `You start above the win line. ${ADVERSARY} spends ${scenario.totalTurns} turns eroding it.`,
    `Spend credits on fleet and defenses to slow it. MAI below ${scenario.collapseThreshold}, or a budget below zero, ends the campaign early.`,
    'Some attacks become conditions that press every turn until they lift. Deployments take turns to arrive. Surge authority clears a condition.',
  ]
}

// True exactly where Game.tsx renders the framing inside the brief's
// disclosure: the opening screen of a campaign that has not resolved a
// turn yet.
export function showsJobFraming(state: GameState): boolean {
  return state.turn === 1 && state.history.length === 0
}

export function briefCopy(state: GameState): BriefCopy {
  const turn = state.turn
  // Prepended to whatever the level-specific branch builds, so `full` IS
  // the disclosure body and the ceiling that measures it measures the
  // screen rather than a part of it.
  const framing = showsJobFraming(state) ? jobFramingLines(state.scenario) : []
  const intel = effectiveIntel(state)
  const slots = plannedEvents(state, turn)
  const events = slots.flat()
  const full = state.forecast.lines

  if (events.length === 0) {
    return {
      headline: 'No adversary activity forecast',
      vector: 'Quiet is not the same as safe.',
      full: [...framing, ...postureLines(state)],
    }
  }

  const layers = [...new Set(events.flatMap((e) => e.layers))]
  const vectors = [...new Set(events.map((e) => vectorLabels[e.vector]))]
  const layerList = layers.join(', ')

  if (intel === 0) {
    return {
      headline: 'Forecast dark at intel level zero',
      vector: 'Raise intel investment to see what is coming.',
      full: [...framing, ...postureLines(state)],
    }
  }

  if (intel === 1) {
    return {
      headline: capWords(`Indicators point at ${layerList}`, HEADLINE_WORD_MAX),
      vector: `Segment under watch: ${layerList}.`,
      full: [...framing, ...postureLines(state)],
    }
  }

  if (intel === 2) {
    return {
      headline: capWords(`Signature class ${vectors.join(', ')}`, HEADLINE_WORD_MAX),
      vector: `Likely target: ${layerList}. Signature: ${vectors.join(', ')}.`,
      full: [...framing, ...postureLines(state)],
    }
  }

  // Top intel names the deck, but only where the deck is fixed. A slot the
  // engine draws from is a maybe, and its own forecast says so ("Assessed
  // likely, one of ..."); the headline must not turn that into a fact.
  const fixed = slots.filter((s) => s.length === 1).map((s) => s[0])
  const lead = fixed[0]
  const extra = slots.length - 1
  const suffix = extra > 0 ? ` plus ${extra} more` : ''
  if (!lead) {
    // Every slot is a draw, so report the shape rather than a name, and
    // count the strikes rather than one slot's candidates.
    const candidates = slots.reduce((n, slot) => n + slot.length, 0)
    const headline =
      slots.length > 1
        ? capWords(`${slots.length} strikes assessed on ${layerList}`, HEADLINE_WORD_MAX)
        : capWords(`One of ${candidates} on ${layerList}`, HEADLINE_WORD_MAX)
    return {
      headline,
      vector: `${candidates} candidates on ${layerList}; ${vectors.join(', ')} signature.`,
      full: [...framing, ...full, ...postureLines(state)],
    }
  }
  // Cap the name before the count is appended, so the trim can never bite
  // off the count and leave a dangling fragment.
  const nameBudget = HEADLINE_WORD_MAX - countWords(suffix)
  const headline = `${capWords(shortName(lead), nameBudget)}${suffix}`
  const ref = lead.techniqueRefs[0]
  // Level 3 names the fixed event, and still carries everything level 2
  // would have said, so paying for the top tier never narrows the line.
  const rest = extra > 0 ? ` Also in play: ${layerList}; ${vectors.join(', ')}.` : ''
  return {
    headline,
    vector: `Assessed on ${lead.layers.join(', ')}; ${vectorLabels[lead.vector]} signature.${rest}`,
    // techniqueLabel, not the expression written out again. The tag is
    // what the player taps to open this technique's GLOSSARY entry, and
    // the entry is found by exactly this string, so a second copy of the
    // expression would make that join a coincidence rather than a fact.
    tag: ref ? techniqueLabel(ref) : undefined,
    tagUrl: ref?.url,
    // Top intel carries the engine's named forecast AND the posture. The
    // forecast alone was not enough: on a turn with exactly one fixed
    // event the headline already names it, so the expansion added three
    // tokens, two of which were "Tier B". The dead control was at all four
    // levels, not three; only the turns with a draw disguised it.
    full: [...framing, ...full, ...postureLines(state)],
  }
}

// The HUD strings, built here so the render and the battery measure the
// same words. The budget rule counts what is on screen before the first
// input: the headline, the vector line, the technique tag, and the HUD's
// labels and numbers (brief v0.5 section 5).
export interface HudLabels {
  mai: string
  credits: string
  coverage: string
  link: string
  data: string
  sensor: string
}

export function hudLabels(state: GameState): HudLabels {
  return {
    mai: `MAI, win at ${state.scenario.winThreshold}`,
    credits: 'Credits',
    coverage: 'Coverage',
    link: 'Link',
    data: 'Data',
    sensor: 'Sensor',
  }
}

export function hudStatusLine(state: GameState, difficultyLabel: string, displayTurn: number): string {
  return `Turn ${displayTurn} of ${state.scenario.totalTurns} | Intel ${state.intelLevel} | ${difficultyLabel}`
}

// Every string on screen before the player's first input on a turn.
// Built from the fiction constant, so a rename stays a one-constant change
// and the battery never measures copy the screen no longer renders.
export const CHAIN_ARMED_LINE = `BLACKOUT CHAIN ARMED: ${SQUADRON} is on LiDAR alone.`

export function firstInputCopy(state: GameState, difficultyLabel: string): string[] {
  const copy = briefCopy(state)
  const labels = hudLabels(state)
  const turn = Math.min(state.turn, state.scenario.totalTurns)
  return [
    copy.headline,
    copy.vector,
    // Rendered whenever the chain is armed, so it is measured then too.
    ...(state.flags.lidarFallback ? [CHAIN_ARMED_LINE] : []),
    ...(copy.tag ? [`Technique: ${copy.tag}`] : []),
    labels.mai,
    String(maiScore(state)),
    labels.credits,
    String(state.credits),
    labels.coverage,
    String(coverage(state.assets)),
    labels.link,
    String(state.meters.linkAvailability),
    labels.data,
    String(state.meters.dataIntegrity),
    labels.sensor,
    String(state.meters.sensorIntegrity),
    hudStatusLine(state, difficultyLabel, turn),
  ]
}

export function firstInputWords(state: GameState, difficultyLabel: string): number {
  return firstInputCopy(state, difficultyLabel).reduce((n, line) => n + countWords(line), 0)
}

// The navigation words on screen alongside the brief: the heading, the
// transmission label, the two disclosure summaries, the button that leaves
// the phase, and the menu and save controls the campaign screen carries.
// Listed here so the words excluded from the reading budget are still
// counted against a budget of their own.
//
// The last four were not counted until v0.9, which is what a bound
// satisfied by not counting things looks like. The save row renders while
// the campaign is playing and the menu button whenever the game was
// entered from the menu, which is every normal turn.
//
// The two audio toggles join the save row in Round 4d and are read from
// SOUND_TOGGLE_LABELS rather than spelled again, so this list cannot
// disagree with what the screen renders.
export function chromeCopy(state: GameState): string[] {
  const turn = Math.min(state.turn, state.scenario.totalTurns)
  return [
    `1. Intel brief, turn ${turn}`,
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
}

export function chromeWords(state: GameState): number {
  return chromeCopy(state).reduce((n, line) => n + countWords(line), 0)
}
