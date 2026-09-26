// Reading diet for the intel brief (brief v0.5 section 5). Before first
// input on a normal turn the player sees a headline of eight words or
// fewer, a one-line threat vector, a technique tag, and the HUD numbers;
// the full forecast moves behind EXPAND. Every line here is derived from
// the scenario and the engine's own forecast, so the copy cannot drift
// from the deck, and the word budget is enforced by a battery test rather
// than trusted.

import { ADVERSARY, SQUADRON } from '../config'
import { SURGE_TOKEN_CAP, effectiveIntel } from '../engine/reducer'
import { coverage, maiScore } from '../engine/scoring'
import type { GameState, ThreatEvent } from '../engine/types'
import { kindLabels, techniqueLabel, vectorLabels } from './labels'
import { LAYERS } from '../engine/types'
import { SPEEDS, SPEED_LABEL } from '../director/director'

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
  // The turn-1 job, shown above `full` in the same disclosure under its
  // own heading. Kept apart from `full` after Round 7 found that folding it
  // in had merged the player's instructions and their fleet status into one
  // undifferentiated bullet list at 375px.
  framing: string[]
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
    `Finish turn ${scenario.totalTurns} with the Mission Assurance Index (MAI) at ${scenario.winThreshold} or higher.`,
    `You start above the win line. ${ADVERSARY} spends ${scenario.totalTurns} turns eroding it.`,
    `Spend credits on fleet and defenses to slow it. MAI below ${scenario.collapseThreshold}, or a budget below zero, ends the campaign early.`,
    'Some attacks become conditions that press every turn until they lift. Deployments take turns to arrive. Surge authority clears a condition.',
  ]
}

// The framing as the screen shows it: the first three lines are the
// numbered job, the fourth is context. Built here so the start screen and
// the brief's disclosure render the same strings, and so the budget below
// measures the numbers the player reads.
export function jobFramingBlocks(scenario: GameState['scenario']): string[] {
  return jobFramingLines(scenario).map((line, i) => (i < 3 ? `${i + 1}. ${line}` : line))
}

export const JOB_FRAMING_HEADING = 'Your job'

// True exactly where Game.tsx renders the framing inside the brief's
// disclosure: the opening screen of a campaign that has not resolved a
// turn yet.
export function showsJobFraming(state: GameState): boolean {
  return state.turn === 1 && state.history.length === 0
}

// The "Posture detail" disclosure's lines (Round 7), built here so the
// budget can sweep every state rather than seven a test happened to name.
// The fleet line used to list every asset one by one, so a large fleet grew
// the panel without limit: three lenses found it at 115 to 139 words in
// legal play against a budget of 110 and a pinned "worst" of 93. Grouped by
// kind and tier it is bounded by the deck's seven pairs, not the fleet size.
export type PostureTone = 'dim' | 'blue' | 'amber'
export interface PostureLine {
  text: string
  // The colour carries meaning (defences blue, the surge rule amber), so it
  // travels with the line instead of being chosen by position on the screen:
  // Round 7's first version coloured by index and painted the allied intel
  // boost, a good thing, in the warning colour.
  tone: PostureTone
}

export function postureDetailLines(state: GameState): PostureLine[] {
  const { scenario } = state
  const alive = state.assets.filter((a) => a.integrity > 0)
  const counterName = (id: string) => scenario.countermeasures.find((c) => c.id === id)?.name ?? id
  const grouped = (labels: string[]) => {
    const counts = new Map<string, number>()
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
    return [...counts].map(([l, n]) => `${n} ${l}`).join(', ')
  }
  const lines: PostureLine[] = [
    { text: `Fleet: ${alive.length} operational${alive.length ? `: ${grouped(alive.map((a) => `${kindLabels[a.kind]} ${a.tier}`))}` : ''}.`, tone: 'dim' },
    { text: `Countermeasures: ${state.counters.length ? state.counters.map(counterName).join('; ') : 'none'}.`, tone: 'blue' },
  ]
  if (state.pipeline.length || state.pendingCounters.length) {
    // Grouped by kind and tier with the SOONEST arrival, so the line is
    // bounded by the deck's kinds and tiers. Grouping by ETA as well split
    // one kind into several groups and left the line unbounded.
    const soonest = new Map<string, { n: number; eta: number }>()
    for (const p of state.pipeline) {
      const key = `${kindLabels[p.kind]} ${p.tier}`
      const cur = soonest.get(key)
      soonest.set(key, { n: (cur?.n ?? 0) + 1, eta: Math.min(cur?.eta ?? Infinity, p.etaTurns) })
    }
    const parts = [...soonest].map(([k, { n, eta }]) => `${n} ${k}, next in ${eta}`)
    for (const c of state.pendingCounters) parts.push(`${counterName(c.id)} retrofit in ${c.etaTurns}`)
    lines.push({ text: `In transit (turns to arrive): ${parts.join('; ')}.`, tone: 'dim' })
  }
  // "In any phase" was false: surge is spent in the decision phases only.
  lines.push({ text: `Surge authority: ${state.surgeTokens} of ${SURGE_TOKEN_CAP}, spent in a decision phase to clear an active condition.`, tone: 'amber' })
  if (state.intelBoostTurns > 0) {
    lines.push({ text: `Allied intel boost active for ${state.intelBoostTurns} more turn${state.intelBoostTurns === 1 ? '' : 's'}.`, tone: 'blue' })
  }
  return lines
}

// Every text block the "Expand full brief" disclosure renders, in order.
// The budget measures this and tests/game.dom.spec.tsx asserts the rendered
// panel carries exactly these words, so the two cannot drift apart again.
export function disclosureBlocks(copy: BriefCopy): string[] {
  return copy.framing.length > 0 ? [JOB_FRAMING_HEADING, ...copy.framing, ...copy.full] : copy.full
}

export function briefCopy(state: GameState): BriefCopy {
  const turn = state.turn
  // Carried beside `full` rather than inside it (Round 7): disclosureBlocks
  // joins the two in render order, and the budget measures that join.
  const framing = showsJobFraming(state) ? jobFramingBlocks(state.scenario) : []
  const intel = effectiveIntel(state)
  const slots = plannedEvents(state, turn)
  const events = slots.flat()
  const full = state.forecast.lines

  if (events.length === 0) {
    return {
      headline: 'No adversary activity forecast',
      vector: 'Quiet is not the same as safe.',
      full: postureLines(state),
      framing,
    }
  }

  const layers = [...new Set(events.flatMap((e) => e.layers))]
  const vectors = [...new Set(events.map((e) => vectorLabels[e.vector]))]
  const layerList = layers.join(', ')

  if (intel === 0) {
    return {
      headline: 'Forecast dark at intel level zero',
      vector: 'Raise intel investment to see what is coming.',
      full: postureLines(state),
      framing,
    }
  }

  if (intel === 1) {
    return {
      headline: capWords(`Indicators point at ${layerList}`, HEADLINE_WORD_MAX),
      vector: `Segment under watch: ${layerList}.`,
      full: postureLines(state),
      framing,
    }
  }

  if (intel === 2) {
    return {
      headline: capWords(`Signature class ${vectors.join(', ')}`, HEADLINE_WORD_MAX),
      vector: `Likely target: ${layerList}. Signature: ${vectors.join(', ')}.`,
      full: postureLines(state),
      framing,
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
      full: [...full, ...postureLines(state)],
      framing,
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
    full: [...full, ...postureLines(state)],
      framing,
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

// Every disclosure the brief screen renders, bounded (Round 7, brief v2.4
// section 5).
//
// Keyed by the summary the player taps, so the set is the screen's own:
// tests/game.dom.spec.tsx walks every <details> the rendered brief screen
// carries and fails on one with no entry here, which means a disclosure
// added later is bounded by default rather than silently unmeasured.
//
// Round 7b bounded ONE of these and named the constant as though it
// covered them all. The other three sat unmeasured, the largest at 263
// words, which is the shape of the defect 7b's own first ceiling had: a
// bound that covers part of what is behind a tap. Every figure below is a
// MEASURED worst plus room, and the test pins the measured worst exactly
// so re-baselining is a deliberate edit:
//
//   Expand full brief          115 on turn 1, where the job framing sits
//                              under its heading above the posture panel
//   What these numbers mean    263, the HUD's own reference: eleven lines,
//                              each a real mechanic, each interpolated from
//                              the deck. Bounded, not trimmed; it is the
//                              deep-reading layer the brief puts one tap away
//   Posture detail             164, the DECK'S structural maximum: every
//                              countermeasure owned, every kind and tier
//                              deployed and in transit. Set from that rather
//                              than from lines of play, which twice produced a
//                              "worst" legal play beat (93, then 96, against
//                              139 and 132). Raised from 110 on the record in
//                              Round 7; most of it is the countermeasure list
//   BLACKOUT CHAIN ARMED       26, rendered only while the chain is armed
export const DISCLOSURE_WORD_BUDGETS: Record<string, number> = {
  'Expand full brief': 120,
  'What these numbers mean': 280,
  'Posture detail': 170,
  [CHAIN_ARMED_LINE]: 40,
}

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
//
// v1.2 Round 1 replaced the numbered sections with the board: the section
// heading and the phase button are gone, the five action-bar labels and
// the playback speed control are on the first screen instead. The five
// labels are the buttons' visible text; RESOLVE also carries "Hold to
// resolve turn n" for assistive technology, which is not reading load on
// the screen and is not counted here.
export const ACTION_BAR_LABELS = ['PROCURE', 'HARDEN', 'INTEL', 'SURGE', 'RESOLVE'] as const

export function chromeCopy(_state: GameState): string[] {
  return [
    '> INCOMING TRANSMISSION_',
    'Expand full brief',
    ...ACTION_BAR_LABELS,
    'What these numbers mean',
    'Posture detail',
    'Save',
    'Export code',
    'Back to menu',
    SOUND_TOGGLE_LABELS.effects,
    SOUND_TOGGLE_LABELS.music,
    'Playback:',
    ...SPEEDS.map((s) => SPEED_LABEL[s]),
  ]
}

export function chromeWords(state: GameState): number {
  return chromeCopy(state).reduce((n, line) => n + countWords(line), 0)
}
