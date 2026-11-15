// The briefing's seen-flag: whether this device has been through the
// game's opening. The 3D game reads it to start a first operation on its
// briefing and sets it when the briefing ends (src/ui/three/Game3D.tsx).
// The key is the pixel cold open's, kept so a device that saw that one is
// not briefed again.

export const INTRO_SEEN_KEY = 'dc-intro-seen'

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // A refused write means the intro plays again next visit, which is a
    // better failure than not starting at all.
  }
}
