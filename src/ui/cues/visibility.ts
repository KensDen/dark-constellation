// One policy for what a hidden page does to playback (brief v0.9 Appendix
// E, carried from Round 3.5).
//
// THE POLICY: hidden means paused, and every channel lands on the truth of
// the beat currently shown.
//
// Three channels throttle differently when a page is hidden. Playback
// beats run on injected timers, which browsers clamp but keep firing;
// the meter count-up runs on requestAnimationFrame, which stops entirely;
// and a Web Audio context suspends on its own terms. Left to themselves
// each guesses, and the guesses disagree: Round 3.5 found the count-up
// falling back to a safety settle that nothing specified or tested, while
// beats kept advancing behind a locked phone. Review is primarily on
// iPhone, where locking the screen mid-playback is the normal way a turn
// gets interrupted.
//
// Pausing is safe because playback presents a turn the engine has already
// resolved: nothing is lost by stopping, and nothing is decided by
// resuming. The alternatives were rejected. Letting it run means the
// player returns to an aftermath they never saw, which is the complaint
// this whole pass exists to answer. Skipping to the end on hide throws
// away the turn's only telling.
//
// Consequences each channel answers to, rather than deciding for itself:
//   - The director stops arming its next beat while hidden and re-arms on
//     return, so the beat on screen when the phone locked is the beat on
//     screen when it wakes.
//   - The count-up snaps to the value of the beat being shown rather than
//     easing toward it, because an animation the player cannot see is not
//     an animation. This is what the safety settle was doing by accident.
//   - Sound (Round 4) must not start while hidden and must not queue what
//     it could not play. The context suspends with the page and resumes on
//     return; nothing is replayed to catch up.

export type VisibilityListener = (visible: boolean) => void

export function pageVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState !== 'hidden'
}

// Subscribe to the policy rather than to the DOM event, so the three
// channels cannot drift apart. Returns an unsubscribe.
export function onVisibilityChange(listener: VisibilityListener): () => void {
  if (typeof document === 'undefined') return () => {}
  const handler = () => listener(pageVisible())
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}

// What a value change should do, given the page and the preference. Pure,
// so the battery can assert the policy rather than infer it: a hidden page
// and a reduced-motion preference both mean "show the number, do not
// animate it".
export function countUpMode(visible: boolean, reduced: boolean): 'ease' | 'snap' {
  return visible && !reduced ? 'ease' : 'snap'
}

// Whether the director should hold its position. Exported for the same
// reason: it is the policy, not an implementation detail of the view.
export function playbackPaused(visible: boolean): boolean {
  return !visible
}
