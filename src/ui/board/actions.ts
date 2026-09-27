// THE ONE ARRAY THAT DRIVES THE ACTION BAR (v1.2 R1b, brief 4.1 and 4.4).
// Each action's label, step number, hotkey and sheet live here and only
// here: the bar renders them in this order, the digit hotkeys resolve
// through this list, the chrome mirror in src/ui/brief.ts counts these
// labels and numbers, and tests/action-bar.dom.spec.tsx pins the rendered
// order to the array. A number or a key spelled anywhere else is the
// second structure principle 17 forbids.
//
// Since R2b the bar is a turn stepper: the four actions with a sheet sit
// in one row, RESOLVE is the full-width button under them, and an
// objective line over the bar always says what to do next. What it says,
// and which step glows, come from suggestNextStep below (or, on the first
// turn ever on a device, from the walkthrough in GUIDE), in one call.
//
// Kept free of React and of the sheet components, so brief.ts and the
// node battery can read it.

import { assetPrice } from '../../engine/scoring'
import type { GameState, TrustTier } from '../../engine/types'
import { KIND_LAYER, hardenOffers, turnBudget } from './board'

export type SheetId = 'procure' | 'harden' | 'intel' | 'surge' | 'system'
export type StepSheet = Exclude<SheetId, 'system'>
export type StepId = StepSheet | 'resolve'

export interface BoardAction {
  id: StepId
  label: string
  number: number
  hotkey: string
  // The sheet the action opens; RESOLVE opens none, it commits the turn.
  sheet: StepSheet | null
  // The HUD sprite beside the label (v1.2 R2): the eye for intel, the
  // bolt for the surge tokens. By name, so this file stays data.
  icon?: 'eye' | 'bolt'
}

export const ACTIONS: readonly BoardAction[] = [
  { id: 'procure', label: 'PROCURE', number: 1, hotkey: '1', sheet: 'procure' },
  { id: 'harden', label: 'HARDEN', number: 2, hotkey: '2', sheet: 'harden' },
  { id: 'intel', label: 'INTEL', number: 3, hotkey: '3', sheet: 'intel', icon: 'eye' },
  { id: 'surge', label: 'SURGE', number: 4, hotkey: '4', sheet: 'surge', icon: 'bolt' },
  { id: 'resolve', label: 'RESOLVE', number: 5, hotkey: '5', sheet: null },
]

// RESOLVE's label is the instruction (R2b), and it is also the control's
// accessible name: the screen shows it in capitals through CSS, so a
// screen reader hears the words and not the letters.
export const resolveLabel = (turn: number) => `Hold to resolve turn ${turn}`
export const resolvingLabel = (turn: number) => `Resolving turn ${turn} ...`

// What the objective line says, and which step glows: one of these per
// step, each naming the step it points at, so the sentence and the glow
// cannot point at different steps.
export const NEXT_STEP_SENTENCE: Record<StepId, string> = {
  procure: 'Open PROCURE to buy an asset.',
  harden: 'Open HARDEN to pick a defense.',
  intel: 'Open INTEL to see further ahead.',
  surge: 'Use SURGE to clear a condition.',
  resolve: 'Hold RESOLVE to play the turn.',
}

export interface NextStep {
  step: StepId
  sentence: string
}

const TIERS: readonly TrustTier[] = ['A', 'B']

// THE SUGGESTED NEXT STEP (R2b). Pure, and it reads only what the player
// can already see: the credits on the HUD (`credits`, which is what the
// cart leaves; the turn's budget when nothing is in it), the prices on the
// sheets, what is owned, and the conditions on the layer headers. No
// forecast, no hidden durations. `used` is the steps whose sheet was
// opened this turn.
//
// SURGE takes the same "not used" test as the three before it: a queued
// token stays in state until the turn resolves, so without it the
// suggestion would never move on to RESOLVE.
export function suggestNextStep(state: GameState, used: ReadonlySet<string>, credits: number = turnBudget(state)): NextStep {
  const scenario = state.scenario
  const open = (id: StepId) => !used.has(id)
  const pick = (step: StepId): NextStep => ({ step, sentence: NEXT_STEP_SENTENCE[step] })
  const cheapestAsset = Math.min(
    ...(Object.keys(KIND_LAYER) as (keyof typeof KIND_LAYER)[]).flatMap((kind) => TIERS.map((tier) => assetPrice(scenario, kind, tier))),
  )
  if (open('procure') && cheapestAsset <= credits) return pick('procure')
  const defenses = hardenOffers(scenario).filter((cm) => !state.counters.includes(cm.id))
  if (open('harden') && defenses.some((cm) => cm.cost <= credits)) return pick('harden')
  // The price of the next intel level; none past the top level.
  const intelPrice = (scenario.prices.intelLevels as readonly number[])[state.intelLevel]
  if (open('intel') && intelPrice !== undefined && intelPrice <= credits) return pick('intel')
  if (open('surge') && state.surgeTokens > 0 && state.conditions.length > 0) return pick('surge')
  return pick('resolve')
}

// The credits on the objective line's tag.
export const creditsTag = (credits: number) => `${credits} CR LEFT`

// THE GUIDED FIRST TURN (R2b). On the first game ever on a device, turn
// 1's objective line walks one step at a time: buy, then harden (or
// skip it), then resolve. The glow follows it.
export type GuideStage = 'start' | 'harden' | 'last'
export interface Objective {
  tag: string
  sentence: string
  // The step that glows; none while a turn plays out.
  step: StepId | null
}
export const GUIDE: Record<GuideStage, Objective> = {
  start: { tag: 'START HERE', sentence: 'Open PROCURE, buy a satellite.', step: 'procure' },
  harden: { tag: 'STEP 2', sentence: 'Open HARDEN and pick a defense.', step: 'harden' },
  last: { tag: 'LAST STEP', sentence: 'Hold RESOLVE to play the turn.', step: 'resolve' },
}
export const SKIP_TIPS = 'Skip tips'

// Where the walkthrough is: a purchase moves it on, and so does a
// hardening, or a skip (HARDEN opened and closed with nothing queued).
export function guideStage(bought: boolean, hardenedOrSkipped: boolean): GuideStage {
  if (!bought) return 'start'
  return hardenedOrSkipped ? 'last' : 'harden'
}

// What the objective line says on a turn's first screen, before any input:
// the walkthrough's first step when guided, otherwise the suggestion with
// the credits the HUD shows. The chrome count in src/ui/brief.ts reads it,
// so the words it charges are the words the bar renders.
export function openingObjective(state: GameState, guided: boolean): Objective {
  if (guided) return GUIDE.start
  const credits = turnBudget(state)
  return { tag: creditsTag(credits), ...suggestNextStep(state, new Set(), credits) }
}
