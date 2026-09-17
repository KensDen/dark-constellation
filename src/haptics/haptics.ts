// The Chrome-family Android haptic tier (Round 6c, brief section 6).
//
// One feature-detected module, a progressive enhancement, and the FIFTH
// channel answering to the hidden-page policy in src/ui/cues/visibility.ts
// after the director, the count-up, effects and music. It answers in the
// same shape as the other two gates that have one, and deliberately: a
// cue that is not allowed FIRES NOTHING, so "nothing on desktop", "nothing
// where the API was removed" and "nothing while hidden" are answered by
// navigator.vibrate never being called rather than by a boolean somebody
// could leave true. shouldVibrate below is shouldSchedule and
// shouldPlayMusic with a fourth question, in the same order, so the
// channels cannot drift into disagreeing about what allowed means.
//
// THREE THINGS THIS TIER HAS TO GET RIGHT, and each of them is a way the
// obvious implementation is wrong rather than a refinement of it.
//
// 1. DETECTION IS ABOUT THE PROPERTY, NOT ITS RETURN VALUE. Firefox 129
//    and later removed the Vibration API outright, so `navigator.vibrate`
//    is undefined there and calling it throws rather than returning false.
//    `if (navigator.vibrate(x))` is a TypeError on a browser with real
//    users, which is why this asks whether the property is a function.
//
// 2. DESKTOP RETURNS TRUE AND DOES NOTHING. Chrome on a laptop implements
//    the API and reports success for want of anywhere to say otherwise,
//    because there is no motor and the spec has no way to admit it. So
//    capability alone tells every desktop visitor yes, and mobile has to
//    be detected separately. userAgentData.mobile is the honest signal on
//    exactly the browser family this tier targets; the UA string is the
//    fallback for the ones that have not shipped it.
//
// 3. A HIDDEN DOCUMENT CANNOT VIBRATE. The spec says so: vibration is
//    disallowed when the document is hidden, and the call is silently
//    dropped. Left to luck this would look like it worked, because
//    "nothing happened" is also what success looks like from here. So it
//    is asked explicitly, as the policy requires of every channel.
//
// REDUCED MOTION DOES NOTHING HERE, on the same reasoning as music in
// Round 6b. `prefers-reduced-motion` is about things moving on screen; a
// vestibular trigger needs something to look at. The OS owns the haptic
// setting on Android and a player who does not want buzzing turns it off
// there, where it applies to every app rather than to this one. Recorded
// as a decision rather than an omission, and guarded: nothing in this
// module's import graph can reach the reduced-motion reader.

import { hapticPatternFor, type HapticPattern, type SoundCue } from '../director/cues'
import { onVisibilityChange, pageVisible } from '../ui/cues/visibility'

// The slice of Navigator this module uses, as a structural type rather
// than lib.dom's. Two reasons, both the same one Round 4d had for
// src/audio/graph.ts: `vibrate` is typed as always present by lib.dom,
// which is the exact assumption Firefox 129 broke, and `userAgentData` is
// not in lib.dom at all. A structural type lets the suite supply an honest
// fake and forces this file to admit that both fields are optional.
export interface NavigatorLike {
  vibrate?: (pattern: number | number[]) => boolean
  userAgentData?: { mobile?: boolean }
  userAgent?: string
}

// A function, not merely present and not merely truthy. Firefox 129 and
// later removed the API, so the property is undefined there.
export function vibrateSupported(nav: NavigatorLike): boolean {
  return typeof nav.vibrate === 'function'
}

// Chrome-family Android reports this directly. Everything else falls back
// to the UA string, which is the only signal those browsers offer.
export function mobileDevice(nav: NavigatorLike): boolean {
  const flagged = nav.userAgentData?.mobile
  if (typeof flagged === 'boolean') return flagged
  return /Android/i.test(nav.userAgent ?? '')
}

export interface HapticGateState {
  supported: boolean
  mobile: boolean
  visible: boolean
}

// The whole policy, as a pure function, so the reason a cue did not fire
// can be asserted directly rather than inferred from silence.
export function shouldVibrate(state: HapticGateState, pattern: HapticPattern | null): boolean {
  if (pattern === null) return false
  return state.supported && state.mobile && state.visible
}

export interface HapticsOptions {
  navigator?: NavigatorLike
  watchVisibility?: boolean
  isVisible?: () => boolean
}

function defaultNavigator(): NavigatorLike | null {
  if (typeof navigator === 'undefined') return null
  return navigator as NavigatorLike
}

export class Haptics {
  private readonly nav: NavigatorLike | null
  private visible: boolean
  private stopWatchingVisibility: (() => void) | null = null

  constructor(options: HapticsOptions = {}) {
    this.nav = options.navigator ?? defaultNavigator()
    this.visible = (options.isVisible ?? pageVisible)()
    if (options.watchVisibility !== false) {
      // Through setVisible, not by assigning the field. The first version
      // assigned it directly, so the silence-on-hide below never ran on
      // the real event path: a pattern started just before a phone locked
      // kept running behind the lock screen, and the only thing that
      // stopped it was the pattern ending on its own.
      this.stopWatchingVisibility = onVisibilityChange((visible) => this.setVisible(visible))
    }
  }

  // Computed rather than cached, because a device can change under the
  // page: a browser can be resized into a different UA hint, and the
  // property is cheap to read. Caching it would be a snapshot of the
  // moment the app started, which is not a fact about now.
  // Whether the API is there at all. Separate from `supported` below
  // because the gate asks the two questions separately and a single
  // conflated accessor cannot serve both without one of them going unused.
  private get capable(): boolean {
    return this.nav !== null && vibrateSupported(this.nav)
  }

  // Whether this device can actually be felt: the API AND a motor. Read by
  // the dev surfaces and by anything asking whether to offer the feature.
  get supported(): boolean {
    return this.nav !== null && vibrateSupported(this.nav) && mobileDevice(this.nav)
  }

  // Returns whether the motor was asked to move, so a caller that cares
  // can say why nothing happened. Nothing here throws: a browser that
  // rejects a pattern is a browser being careful, not a game bug.
  fire(cue: SoundCue): boolean {
    const nav = this.nav
    if (!nav) return false
    const pattern = hapticPatternFor(cue)
    const state: HapticGateState = {
      // Through the same getter the outside world reads, rather than a
      // second copy of the same two calls. The first version computed
      // these inline, so `supported` was a public accessor nothing
      // internal used and no mutation of it could change what the player
      // feels: dead for behaviour while looking load-bearing.
      supported: this.capable,
      mobile: mobileDevice(nav),
      visible: this.visible,
    }
    if (!shouldVibrate(state, pattern)) return false
    try {
      nav.vibrate?.(typeof pattern === 'number' ? pattern : [...(pattern as readonly number[])])
      return true
    } catch {
      return false
    }
  }

  // Stop anything in flight. vibrate(0) is the spec's way of saying that,
  // and it is what SKIP and leaving the screen should do to a pattern the
  // way silenceAll does to a sound.
  silence(): void {
    if (!this.supported) return
    const nav = this.nav
    if (!nav) return
    try {
      nav.vibrate?.(0)
    } catch {
      // A browser refusing to stop a vibration it never started is not an
      // error worth propagating into a render.
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    // Leaving the page stops a pattern mid-way rather than letting it run
    // on behind a locked phone, which is the visibility policy's "hidden
    // means paused" as it applies to a channel that cannot be paused and
    // resumed: there is nothing to come back to, so it ends.
    if (!visible) this.silence()
  }

  dispose(): void {
    this.stopWatchingVisibility?.()
    this.stopWatchingVisibility = null
  }
}

// The app's one haptics module, a singleton for the same reason the audio
// engine is one: it holds a visibility subscription, and a second would
// mean a second subscription and two answers to the same question.
let shared: Haptics | null = null

export function getHaptics(): Haptics {
  if (!shared) shared = new Haptics()
  return shared
}

export function resetHapticsForTests(): void {
  shared?.dispose()
  shared = null
}
