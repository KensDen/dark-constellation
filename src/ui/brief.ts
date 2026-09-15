// Reading diet for the intel brief (brief v0.5 section 5). Before first
// input on a normal turn the player sees a headline of eight words or
// fewer, a one-line threat vector, a technique tag, and the HUD numbers;
// the full forecast moves behind EXPAND. Every line here is derived from
// the scenario and the engine's own forecast, so the copy cannot drift
// from the deck, and the word budget is enforced by a battery test rather
// than trusted.

import { SQUADRON } from '../config'
import { effectiveIntel } from '../engine/reducer'
import { coverage, maiScore } from '../engine/scoring'
import type { GameState, ThreatEvent } from '../engine/types'
import { vectorLabels } from './labels'

// The budget the brief is designed against (brief v0.7 section 5):
// "Before first input on a normal turn: 60 words or fewer of reading
// load", with the interface chrome bounded separately at 24 and the two
// together at 100. v0.5 said "on screen", which was imprecise: the
// complaint this pass answers is prose, not a credits readout.
//
// What the budget counts is therefore the reading load the brief names:
// the headline, the threat vector, the technique tag, and the HUD's meter
// labels, values and status line. What it does not count, and why:
//
//   - Interface chrome: the section heading, button labels and the
//     summary labels of the disclosures. These are navigation, not the
//     brief; they are bounded separately by CHROME_WORD_BUDGET so the
//     exclusion cannot quietly become a loophole.
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
// technique tag at once: 54 words of the 60. Round 4's two audio toggles
// are chrome, not reading load, and chrome has five words spare.
export const HEADLINE_WORD_MAX = 8
export const FIRST_INPUT_WORD_BUDGET = 60
export const CHROME_WORD_BUDGET = 24

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

export function briefCopy(state: GameState): BriefCopy {
  const turn = state.turn
  const intel = effectiveIntel(state)
  const slots = plannedEvents(state, turn)
  const events = slots.flat()
  const full = state.forecast.lines

  if (events.length === 0) {
    return { headline: 'No adversary activity forecast', vector: 'Quiet is not the same as safe.', full }
  }

  const layers = [...new Set(events.flatMap((e) => e.layers))]
  const vectors = [...new Set(events.map((e) => vectorLabels[e.vector]))]
  const layerList = layers.join(', ')

  if (intel === 0) {
    return {
      headline: 'Forecast dark at intel level zero',
      vector: 'Raise intel investment to see what is coming.',
      full,
    }
  }

  if (intel === 1) {
    return {
      headline: capWords(`Indicators point at ${layerList}`, HEADLINE_WORD_MAX),
      vector: `Segment under watch: ${layerList}.`,
      full,
    }
  }

  if (intel === 2) {
    return {
      headline: capWords(`Signature class ${vectors.join(', ')}`, HEADLINE_WORD_MAX),
      vector: `Likely target: ${layerList}. Signature: ${vectors.join(', ')}.`,
      full,
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
      full,
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
    tag: ref ? `${ref.framework} ${ref.id}` : undefined,
    tagUrl: ref?.url,
    full,
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
// transmission label, the two disclosure summaries and the one button.
// Listed here so the words excluded from the reading budget are still
// counted against a budget of their own.
export function chromeCopy(state: GameState): string[] {
  const turn = Math.min(state.turn, state.scenario.totalTurns)
  return [
    `1. Intel brief, turn ${turn}`,
    '> INCOMING TRANSMISSION_',
    'Expand full brief',
    'To procurement',
    'What these numbers mean',
    'Posture detail',
  ]
}

export function chromeWords(state: GameState): number {
  return chromeCopy(state).reduce((n, line) => n + countWords(line), 0)
}
