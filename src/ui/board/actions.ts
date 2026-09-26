// THE ONE ARRAY THAT DRIVES THE ACTION BAR (v1.2 R1b, brief 4.1 and 4.4).
// Each action's label, step number, hotkey and sheet live here and only
// here: the bar renders them in this order, the digit hotkeys resolve
// through this list, the chrome mirror in src/ui/brief.ts counts these
// labels and numbers, and tests/action-bar.dom.spec.tsx pins the rendered
// order to the array. A number or a key spelled anywhere else is the
// second structure principle 17 forbids.
//
// Kept free of React and of the sheet components, so brief.ts and the
// node battery can read it.

export type SheetId = 'procure' | 'harden' | 'intel' | 'surge' | 'system'
export type StepSheet = Exclude<SheetId, 'system'>

export interface BoardAction {
  id: StepSheet | 'resolve'
  label: string
  number: number
  hotkey: string
  // The sheet the action opens; RESOLVE opens none, it commits the turn.
  sheet: StepSheet | null
}

export const ACTIONS: readonly BoardAction[] = [
  { id: 'procure', label: 'PROCURE', number: 1, hotkey: '1', sheet: 'procure' },
  { id: 'harden', label: 'HARDEN', number: 2, hotkey: '2', sheet: 'harden' },
  { id: 'intel', label: 'INTEL', number: 3, hotkey: '3', sheet: 'intel' },
  { id: 'surge', label: 'SURGE', number: 4, hotkey: '4', sheet: 'surge' },
  { id: 'resolve', label: 'RESOLVE', number: 5, hotkey: '5', sheet: null },
]

// The caption under RESOLVE that says how it is pressed (brief R1b).
export const HOLD_CAPTION = 'HOLD'
