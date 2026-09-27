// The cold open's seen-flag, kept apart from the screen that sets it.
//
// App reads this synchronously on startup to decide where to land, so it
// cannot come from IntroSequence itself: a static import of that module
// would pull the whole cold open into the initial chunk and undo the
// split. A returning player pays for this file and nothing more.

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
