// Reading diet (brief v0.5 section 5; re-pointed at the v1.3 board in R2).
// Every line here is derived from the scenario and the engine, so the copy
// cannot drift from the deck, and the word budgets are enforced by battery
// tests rather than trusted.

import { ADVERSARY } from '../config'
import { briefFree, gnssDenied } from '../engine/reducer'
import { planFor } from '../engine/rules'
import { coverage, maiScore } from '../engine/scoring'
import type { GameState, ThreatEvent, TurnActions } from '../engine/types'
import { coverageFigure, kindLabels, techniqueLabel, vectorLabels } from './labels'
import { LAYERS } from '../engine/types'
import { ACTIONS } from './board/actions'
import {
  BUDGET_LABEL,
  CHAIN_ARMED_LINE,
  chainLine,
  FULL_BRIEF_OPEN,
  INTEL_ROW,
  KEY_BLOCKED,
  KEY_EITHER,
  KEY_EXPOSED,
  KEY_LIKELY,
  REMAINING,
  REVEAL,
  SCORE_LABEL,
  STATUS,
  FIRST_ORDERS_SET,
  SECOND_ORDER,
  hiddenOrder,
  turns,
  TONIGHT_HIDDEN,
  TONIGHT_REASON,
  UNIDENTIFIED,
  WILL_HIT,
  WORST_CASE,
  briefButton,
  confirmedNote,
  firstOrders,
  marginChip,
  shortName,
  ordersDone,
  streakChip,
  strengthLine,
  tapHint,
  tonightSlots,
  vectorTo,
  winLineLabel,
} from './board/boardModel'

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
// THE READING BUDGET, re-baselined in v1.3 Round 2 (to confirm with Ken).
// From v1.1 to v1.3 R1 it bounded the intel brief's banner at 60 words:
// a headline, a vector line, a technique tag and the HUD's meters. The
// v1.3 board (brief 5.3) replaces that banner with the TONIGHT card and the
// orders card, which say more on purpose: each move by name with its
// status, the key on turns 1 and 2, and the turn's orders. Measured over
// every swept line of play the board reads at most 142 words (the
// prepared line, turn 5; turn 1 reads 124), so the bound is 150. Since R6
// (Decisions Q11) the rule line says what the engine does, "They go for the
// move your defenses take the fewest points off.", four words longer on
// each slot: the worst board reads 150, at the bound. After the engine
// round the rule is said once a night, on the first drawn slot, and the
// worst board reads 139 (prepared, turn 5, with a STREAK chip). The
// chrome bound stays 40: the board's labels and controls measure 29 at
// worst. The headline cap stays for the full brief's own lines.
export const HEADLINE_WORD_MAX = 8
export const FIRST_INPUT_WORD_BUDGET = 150
// THE CHROME BOUND, 40 since v1.2 R2b, raised from 32 as Ken ruled on
// 2026-09-26, in a commit of its own ahead of the round that needs it.
// The need, measured: R2b turns the action bar into a turn stepper that
// puts the instruction on the first screen. RESOLVE's label becomes "Hold
// to resolve turn n", five words for the two it replaces (RESOLVE and the
// HOLD caption), and an objective line over the bar says what to do next
// in a tag and one sentence, nine words, or the first-turn walkthrough's
// nine. That is 36 on every turn of every swept line, 4 over 32. Nothing
// was cut first because every added word is the copy of the design Ken
// approved; a shorter tag or sentence was offered and declined. Why 40:
// the reading load stays bounded at 60 and the two together at 100, as
// the text above says, and 60 + 40 is that 100 exactly, where 32 left 8
// of it assigned to nothing. It leaves 4 words spare.
export const CHROME_WORD_BUDGET = 40

// The two audio toggles' names live in ./systemControls.ts with SYSTEM's
// other controls since v1.3 R2, so this module stays out of the first
// download; re-exported for the suites that read them here.
export { SOUND_TOGGLE_LABELS } from './systemControls'

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
      ? `Coverage ${coverageFigure(cov)}, clear of the ${min} the coverage bonus pays at.`
      : `Coverage ${coverageFigure(cov)}. The coverage bonus pays ${scenario.slaBonus.credits} CR a turn from ${min}.`,
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
      ? `Running against you: ${state.conditions.map((c) => `${c.name}, ${turns(c.remainingTurns)} left`).join(', ')}.`
      : 'No conditions running against you.',
  )

  // The price is read from the deck, never spelled, so it cannot drift
  // from what procurement charges (the intel brief, D2 a).
  lines.push(
    briefFree(state)
      ? "Tonight's intel brief is free and names the candidate moves."
      : `An intel brief is ${scenario.prices.intelBrief} CR and names tonight's moves.`,
  )

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
    `Finish turn ${scenario.totalTurns} with the mission assurance score at ${scenario.winThreshold} or higher.`,
    `You start above the win line. ${ADVERSARY} spends ${scenario.totalTurns} turns eroding it.`,
    `Procure fleet and defenses to slow it. A score under ${scenario.collapseThreshold} or a negative budget ends the operation.`,
    `Some attacks become conditions that press every turn until they lift. Deployments take turns to arrive. Each defense takes ${scenario.upkeepPerDefense} CR a turn.`,
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

// Every text block the "Expand full brief" disclosure renders, in order.
// The budget measures this and tests/game.dom.spec.tsx asserts the rendered
// panel carries exactly these words, so the two cannot drift apart again.
export function disclosureBlocks(copy: BriefCopy): string[] {
  return copy.framing.length > 0 ? [JOB_FRAMING_HEADING, ...copy.framing, ...copy.full] : copy.full
}

// What the banner says on a night without the intel brief, and the gist of
// what the banner's intel card says then (v1.2 R3, brief 4.8; the intel
// brief since v1.3 Round 0, D2 a): the moves are not named.
export const FORECAST_DARK = {
  headline: 'Moves unnamed: no intel brief tonight',
  vector: 'Order an intel brief to name the moves.',
} as const

// The event the banner names under the brief, when a slot this turn is
// fixed: the lead whose technique is briefCopy's tag. Nothing without the
// brief, and nothing on a turn where every slot is a draw.
export function forecastLead(state: GameState, briefed = briefFree(state)): ThreatEvent | undefined {
  if (!briefed) return undefined
  return plannedEvents(state, state.turn).filter((s) => s.length === 1)[0]?.[0]
}

// The brief's named lines (D2 a): every slot's candidates, by name. This
// replaced the engine's forecast prose, which left with the intel levels.
function namedLines(slots: ThreatEvent[][]): string[] {
  return slots.map((slot) =>
    slot.length === 1 ? `CONFIRMED: ${shortName(slot[0])}.` : `${WILL_HIT(slot.length)}: ${slot.map(shortName).join(' / ')}.`,
  )
}

// `briefed` is whether the intel brief names tonight's moves: free on its
// free nights, or ordered (the board passes the cart's order in).
export function briefCopy(state: GameState, briefed = briefFree(state)): BriefCopy {
  const turn = state.turn
  // Carried beside `full` rather than inside it (Round 7): disclosureBlocks
  // joins the two in render order, and the budget measures that join.
  const framing = showsJobFraming(state) ? jobFramingBlocks(state.scenario) : []
  const slots = plannedEvents(state, turn)
  const events = slots.flat()
  const full = namedLines(slots)

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

  // Without the brief the moves are unnamed: the layers and the signature
  // are on the board, the names are not (brief 5.3, "Unidentified").
  if (!briefed) {
    return {
      headline: FORECAST_DARK.headline,
      vector: `On ${layerList}; ${vectors.join(', ')} signature. ${FORECAST_DARK.vector}`,
      full: postureLines(state),
      framing,
    }
  }

  // The brief names the deck, but the headline names an event only where
  // the deck is fixed. A slot the adversary chooses from is a maybe, and
  // the named lines say so; the headline must not turn that into a fact.
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
        : capWords(`1 of ${candidates} on ${layerList}`, HEADLINE_WORD_MAX)
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
  // The brief names the fixed event, and still carries the layers and the
  // signature the unbriefed line gives, so paying never narrows it.
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
    // The brief carries the named moves AND the posture. The names alone
    // were not enough: on a turn with exactly one fixed event the headline
    // already names it, so the expansion added almost nothing.
    full: [...full, ...postureLines(state)],
    framing,
  }
}

// Every string on screen before the player's first input on a turn.
// Built from the fiction constant, so a rename stays a one-constant change
// and the battery never measures copy the screen no longer renders.
export { CHAIN_ARMED_LINE, chainLine }

// Every disclosure the board renders, bounded (Round 7, brief v2.4
// section 5). Keyed by the summary the player taps, so the set is the
// screen's own: tests/game.dom.spec.tsx walks every disclosure the board
// carries and fails on one with no entry here, so a disclosure added later
// is bounded by default. The figure is a MEASURED worst plus room, and the
// test pins the measured worst exactly, so re-baselining is a deliberate
// edit:
//
//   Expand full brief   119 on turn 1, where the job framing sits under
//                       its heading above the posture lines (v1.3 R2: the
//                       retired words came back two longer, and three were
//                       cut from the framing to keep under the cap)
//
// "What these numbers mean" and "Posture detail" left with the board's
// reference panel in v1.3 R2, and the BLACKOUT CHAIN line is a line of the
// TONIGHT card now, counted with its reading (firstInputCopy).
export const DISCLOSURE_WORD_BUDGETS: Record<string, number> = {
  'Expand full brief': 120,
}

// THE BOARD'S WORDS (v1.3 R2). Everything the deciding board prints, in
// two lists: the reading (what the turn says) and the chrome (what the
// controls and labels say), each built from the strings the components
// render (./board/boardModel.ts), so the count and the screen cannot
// disagree. tests/game.dom.spec.tsx renders the board and fails on any
// line here the screen does not show.
//
// The reading is the HUD's figures, the TONIGHT card and the orders card;
// the chrome is the HUD's labels, SYSTEM, the full brief's toggle, each
// move's "defend ›", "details ›" or "reveal ›", the brief's price button,
// and the dock.
const NO_ORDERS: TurnActions = { buyAssets: [], buyCounters: [], intelBrief: false }

export function firstInputCopy(state: GameState, actions: TurnActions = NO_ORDERS): string[] {
  const { scenario } = state
  const score = maiScore(state)
  const free = briefFree(state)
  const out = [
    `OP ${scenario.name}`,
    `TURN ${Math.min(state.turn, scenario.totalTurns)} OF ${scenario.totalTurns}`,
    String(score),
    '/ 100',
    marginChip(score, scenario.winThreshold).text,
    ...(state.streak >= 2 ? [streakChip(state.streak)] : []),
    `${state.credits} CR`,
    '0',
    winLineLabel(scenario.winThreshold),
    '100',
    `TONIGHT${free ? ' · INTEL BRIEF FREE' : ''}`,
    planFor(scenario, state.turn)?.intro ?? '',
    ...(gnssDenied(state.conditions, scenario) ? [chainLine()] : []),
  ]
  const slots = tonightSlots(state, actions)
  const firstDraw = slots.findIndex((s) => !s.fixed)
  for (const [i, slot] of slots.entries()) {
    if (slot.fixed) out.push(`CONFIRMED · ${confirmedNote(slot.moves[0].ev, slot.moves[0].status)}`)
    else {
      out.push(WILL_HIT(slot.moves.length))
      if (i === firstDraw) out.push(slot.hidden ? TONIGHT_HIDDEN : TONIGHT_REASON)
      if (!slot.hidden && state.turn <= 2)
        out.push(`${STATUS.exposed.word} ${KEY_EXPOSED}`, `${STATUS.blocked.word} ${KEY_BLOCKED}`, `LIKELY TARGET ${KEY_LIKELY}`, `EITHER ${KEY_EITHER}`)
    }
    for (const { ev, status, flag } of slot.moves) {
      if (slot.hidden) out.push(UNIDENTIFIED, vectorTo(ev))
      else out.push(...(flag ? [flag] : []), shortName(ev), vectorTo(ev), strengthLine(ev), STATUS[status].word)
    }
  }
  if (!free) out.push(INTEL_ROW[actions.intelBrief ? 'ordered' : 'none'])
  if (state.turn === 1) {
    const lines = firstOrders(state, actions)
    const done = lines.filter((l) => l.done).length
    out.push(...(done === lines.length ? [FIRST_ORDERS_SET] : ['FIRST ORDERS', ordersDone(done, lines.length), ...lines.map((l) => l.text)]))
  } else if (state.turn === 2)
    out.push('SECOND ORDERS', tonightSlots(state, actions).some((s) => s.hidden) ? hiddenOrder(scenario.prices.intelBrief) : SECOND_ORDER)
  return out
}

export function firstInputWords(state: GameState, actions: TurnActions = NO_ORDERS): number {
  return firstInputCopy(state, actions).reduce((n, line) => n + countWords(line), 0)
}

export const SYSTEM_GEAR_LABEL = 'System'

export function chromeCopy(state: GameState, actions: TurnActions = NO_ORDERS): string[] {
  const slots = tonightSlots(state, actions)
  return [
    SCORE_LABEL,
    BUDGET_LABEL,
    SYSTEM_GEAR_LABEL,
    FULL_BRIEF_OPEN,
    ...slots.flatMap((slot) => slot.moves.map((m) => (slot.hidden ? REVEAL : tapHint(m.status)))),
    ...(briefFree(state) ? [] : [briefButton(state.scenario.prices.intelBrief, actions.intelBrief)]),
    REMAINING,
    WORST_CASE,
    ...ACTIONS.map((a) => a.label),
  ]
}

export function chromeWords(state: GameState, actions: TurnActions = NO_ORDERS): number {
  return chromeCopy(state, actions).reduce((n, line) => n + countWords(line), 0)
}
