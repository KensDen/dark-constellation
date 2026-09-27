// Whether this device has played its first turn (v1.2 R2b). Until it has,
// turn 1's objective line walks the player through buying, hardening and
// resolving; the first completed resolve sets the flag and the walkthrough
// never shows again. Same shape as introSeen.ts: storage may refuse in a
// private window, and the worst case is the walkthrough showing once more.

export const FIRST_TURN_DONE_KEY = 'dc-first-turn-done'

export function hasDoneFirstTurn(): boolean {
  try {
    return localStorage.getItem(FIRST_TURN_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function markFirstTurnDone(): void {
  try {
    localStorage.setItem(FIRST_TURN_DONE_KEY, '1')
  } catch {
    // The walkthrough shows again next visit.
  }
}
