// Whether this device has been shown how RESOLVE is pressed (v1.2 R1b).
// The bubble above RESOLVE reads "Hold to resolve the turn" on the first
// turn ever here, and never again once a hold completes or the bubble is
// tapped. Same shape as introSeen.ts: storage may refuse in a private
// window, and the worst case is the bubble showing once more.

export const HOLD_HINT_SEEN_KEY = 'dc-hold-hint-seen'

export function hasSeenHoldHint(): boolean {
  try {
    return localStorage.getItem(HOLD_HINT_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markHoldHintSeen(): void {
  try {
    localStorage.setItem(HOLD_HINT_SEEN_KEY, '1')
  } catch {
    // The bubble shows again next visit.
  }
}
