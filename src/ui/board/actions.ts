// THE ONE ARRAY OF THE BOARD'S ACTIONS (v1.2 R1b, brief 4.1 and 4.4). Each
// action's label, step number, hotkey and sheet live here and only here:
// the digit hotkeys and the wide board's F keys resolve through this list,
// and the dock renders PROCURE and EXECUTE in this order. A number or a key
// spelled anywhere else is the second structure principle 17 forbids.
//
// TWO ACTIONS since v1.3 Round 0 (brief 5.3, critique row M6): PROCURE,
// which holds assets, defenses and intel in one sheet, and EXECUTE, which
// ends the turn with a tap. Since v1.3 Round 2 the dock carries them and
// FIRST ORDERS teaches them; the objective line, its suggested next step
// and the R2b walkthrough are gone.
//
// Kept free of React and of the sheet components, so brief.ts and the
// node battery can read it.

export type SheetId = 'procure' | 'system' | 'brief'
export type StepSheet = Exclude<SheetId, 'system' | 'brief'>
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

// EXECUTE's accessible name is the instruction, "Execute turn n"; the dock
// prints EXECUTE.
export const resolveLabel = (turn: number) => `Execute turn ${turn}`
