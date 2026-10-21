// THE ONE ARRAY THAT DRIVES THE ACTION BAR (v1.2 R1b, brief 4.1 and 4.4).
// Each action's label, step number, hotkey and sheet live here and only
// here: the bar renders them in this order, the digit hotkeys resolve
// through this list, the chrome mirror in src/ui/brief.ts counts these
// labels and numbers, and tests/action-bar.dom.spec.tsx pins the rendered
// order to the array. A number or a key spelled anywhere else is the
// second structure principle 17 forbids.
//
// Since R2b the bar is a turn stepper: the actions with a sheet sit in one
// row, the commit is the full-width button under them, and an objective
// line over the bar always says what to do next. What it says, and which
// step glows, come from suggestNextStep below (or, on the first turn ever
// on a device, from the walkthrough in GUIDE), in one call.
//
// TWO ACTIONS since v1.3 Round 0 (brief 5.3, critique row M6): PROCURE,
// which holds assets, defenses and intel in one sheet, and EXECUTE, which
// ends the turn with a tap. HARDEN, INTEL and SURGE left with their
// sheets, and the hold-to-resolve button with the auto-advancing director.
//
// Kept free of React and of the sheet components, so brief.ts and the
// node battery can read it.

import { briefFree } from '../../engine/rules'
import { assetPrice } from '../../engine/scoring'
import type { GameState } from '../../engine/types'
import { KIND_LAYER, hardenOffers, turnBudget } from './board'

export type SheetId = 'procure' | 'system'
export type StepSheet = Exclude<SheetId, 'system'>
export type StepId = StepSheet | 'resolve'

export interface BoardAction {
  id: StepId
  label: string
  number: number
  hotkey: string
  // The sheet the action opens; EXECUTE opens none, it commits the turn.
  sheet: StepSheet | null
}

export const ACTIONS: readonly BoardAction[] = [
  { id: 'procure', label: 'PROCURE', number: 1, hotkey: '1', sheet: 'procure' },
  { id: 'resolve', label: 'EXECUTE', number: 2, hotkey: '2', sheet: null },
]

// The F key of an action (v1.2 R6, brief 4.6): F and its step number, so
// the chip, the key and the badge it replaces on a wide screen agree.
export const fKeyOf = (a: BoardAction) => `F${a.number}`

// EXECUTE's label is the instruction (R2b), and it is also the control's
// accessible name: the screen shows it in capitals through CSS, so a
// screen reader hears the words and not the letters. A tap since v1.3
// Round 0 (brief 4, "EXECUTE ends the turn"): the hold went with the
// auto-advancing director.
export const resolveLabel = (turn: number) => `Execute turn ${turn}`

// What the objective line says, and which step glows: one of these per
// step, each naming the step it points at, so the sentence and the glow
// cannot point at different steps.
export const NEXT_STEP_SENTENCE: Record<StepId, string> = {
  procure: 'Open PROCURE to place your orders.',
  resolve: 'Press EXECUTE to play the turn.',
}

export interface NextStep {
  step: StepId
  sentence: string
}

// THE SUGGESTED NEXT STEP (R2b). Pure, and it reads only what the player
// can already see: the credits on the HUD (`credits`, which is what the
// cart leaves; the turn's budget when nothing is in it), the prices on the
// sheet and what is owned. `used` is the steps whose sheet was opened this
// turn. PROCURE until it has been opened while something on it is
// affordable, then EXECUTE.
export function suggestNextStep(state: GameState, used: ReadonlySet<string>, credits: number = turnBudget(state)): NextStep {
  const scenario = state.scenario
  const pick = (step: StepId): NextStep => ({ step, sentence: NEXT_STEP_SENTENCE[step] })
  const cheapestAsset = Math.min(...(Object.keys(KIND_LAYER) as (keyof typeof KIND_LAYER)[]).map((kind) => assetPrice(scenario, kind)))
  const defenses = hardenOffers(scenario).filter((cm) => !state.counters.includes(cm.id))
  // The intel brief, on a night it is not already free.
  const brief = !briefFree(state) && scenario.prices.intelBrief <= credits
  const affordable = cheapestAsset <= credits || defenses.some((cm) => cm.cost <= credits) || brief
  if (!used.has('procure') && affordable) return pick('procure')
  return pick('resolve')
}

// The credits on the objective line's tag.
export const creditsTag = (credits: number) => `${credits} CR LEFT`

// THE GUIDED FIRST TURN (R2b). On the first game ever on a device, turn
// 1's objective line walks one step at a time: order, then execute. The
// glow follows it. Two stages since v1.3 Round 0, when HARDEN merged into
// PROCURE; Round 2 replaces the walkthrough with FIRST ORDERS.
export type GuideStage = 'start' | 'last'
export interface Objective {
  tag: string
  sentence: string
  // The step that glows; none while a turn plays out.
  step: StepId | null
}
export const GUIDE: Record<GuideStage, Objective> = {
  start: { tag: 'START HERE', sentence: 'Open PROCURE and place your orders.', step: 'procure' },
  last: { tag: 'LAST STEP', sentence: 'Press EXECUTE to play the turn.', step: 'resolve' },
}
export const SKIP_TIPS = 'Skip tips'

// Where the walkthrough is: an order moves it on, and so does a skip
// (PROCURE opened and closed with nothing queued).
export function guideStage(orderedOrSkipped: boolean): GuideStage {
  return orderedOrSkipped ? 'last' : 'start'
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
