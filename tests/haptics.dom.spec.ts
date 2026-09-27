// @vitest-environment jsdom
//
// The two haptic guards that CANNOT FAIL in the node environment, moved
// here because a document is what they need to be able to fail at all.
//
// Both were written in Round 6c's first fix batch, both passed, and the
// re-review found both blind:
//
//   - The visibility guard constructed Haptics with watchVisibility:false,
//     which switches OFF the subscription it claims to exercise, and then
//     called setVisible by hand. In a node spec onVisibilityChange returns
//     a no-op anyway, so the path was untestable as written: reverting the
//     fix left every assertion green.
//
//   - The reduced-motion guard stubbed globalThis.matchMedia, but
//     src/ui/cues/motion.ts short-circuits on `typeof window === 'undefined'`
//     and node has no window, so nothing ever read the stub. It was two
//     runs of the same closure over an input nobody consults, which is
//     WORD FOR WORD the defect Round 6b diagnosed and deleted from
//     tests/music.spec.ts one round earlier. Repeating it is the more
//     useful half of this file's existence.
//
// In jsdom `window` exists, `document.visibilityState` can be driven, and a
// real `visibilitychange` event reaches a real subscriber. So these two can
// now fail for the reasons they name.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HAPTIC_PATTERNS, SOUND_MS, hapticPatternFor, type SoundCue } from '../src/director'
import { Haptics, resetHapticsForTests } from '../src/haptics/haptics'
import { prefersReducedMotionNow } from '../src/ui/cues/motion'
import { FakeNavigator } from './fakeNavigator'

const CUES = Object.keys(SOUND_MS) as SoundCue[]
const buzzing = CUES.filter((c) => hapticPatternFor(c) !== null)

// Drive the real document rather than a flag. The property is a getter, so
// it is redefined the way a browser would change it, and a genuine event is
// dispatched afterwards.
function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function installMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  resetHapticsForTests()
  setDocumentHidden(false)
})

afterEach(() => {
  resetHapticsForTests()
  setDocumentHidden(false)
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('haptics: the real visibility path', () => {
  it('cancels a pattern when the document actually goes hidden', () => {
    const nav = FakeNavigator.androidChrome()
    // watchVisibility LEFT ON, which is the whole point: this exercises the
    // subscription the constructor installs, not setVisible by hand.
    const haptics = new Haptics({ navigator: nav })
    expect(buzzing.length, 'no cue buzzes, so this asserts nothing').toBeGreaterThan(0)
    expect(haptics.fire(buzzing[0]), 'the cue never reached the motor').toBe(true)
    nav.reset()

    setDocumentHidden(true)
    expect(nav.calls, 'the document going hidden did not cancel the pattern').toHaveLength(1)
    expect(nav.calls[0].pattern, 'the motor was asked for something other than a cancel').toBe(0)

    // And it stays refused while hidden, which is the gate rather than the
    // cancel: two different claims that a single assertion would conflate.
    nav.reset()
    expect(haptics.fire(buzzing[0]), 'a hidden document fired a haptic').toBe(false)
    expect(nav.calls).toHaveLength(0)

    setDocumentHidden(false)
    expect(haptics.fire(buzzing[0]), 'coming back did not restore haptics').toBe(true)
    haptics.dispose()
  })

  it('stops answering the document once disposed', () => {
    const nav = FakeNavigator.androidChrome()
    const haptics = new Haptics({ navigator: nav })
    haptics.dispose()
    nav.reset()
    setDocumentHidden(true)
    expect(nav.calls, 'a disposed instance is still subscribed to the document').toHaveLength(0)
  })

  // The positive control for the pair above: with the subscription switched
  // off, the document moving changes nothing. If this ever starts failing,
  // the tests above have stopped depending on the subscription.
  it('does nothing on the document event when the subscription is off', () => {
    const nav = FakeNavigator.androidChrome()
    const haptics = new Haptics({ navigator: nav, watchVisibility: false })
    nav.reset()
    setDocumentHidden(true)
    expect(nav.calls, 'an unsubscribed instance reacted to the document').toHaveLength(0)
    haptics.dispose()
  })
})

describe('haptics: reduced motion, where the preference can actually be read', () => {
  it('is readable here, which the node spec could not manage', () => {
    // The assertion that makes the two below non-vacuous. In node this is
    // false whatever the stub says, because motion.ts short-circuits on
    // `typeof window`. If this ever goes false again, the guards after it
    // have gone blind and should be believed no further.
    installMatchMedia(true)
    expect(prefersReducedMotionNow(), 'the preference is not readable, so nothing below can fail').toBe(true)
    installMatchMedia(false)
    expect(prefersReducedMotionNow()).toBe(false)
  })

  it('fires the same patterns with the preference set as without', () => {
    const shape = (reduced: boolean) => {
      installMatchMedia(reduced)
      resetHapticsForTests()
      const nav = FakeNavigator.androidChrome()
      const haptics = new Haptics({ navigator: nav, watchVisibility: false })
      for (const cue of CUES) haptics.fire(cue)
      haptics.dispose()
      return nav.calls.map((c) => JSON.stringify(c.pattern))
    }
    const withPreference = shape(true)
    const without = shape(false)
    expect(withPreference.length, 'nothing fired, so equality proves nothing').toBeGreaterThan(0)
    expect(withPreference, 'the reduced-motion preference changed what the hand feels').toEqual(without)
  })

  it('keeps every declared row buzzing under the preference', () => {
    // The other direction: not merely "the same", but "the same and not
    // empty for every row". A tier that answered the preference by firing
    // nothing at all would satisfy an equality check between two silent
    // runs; this one it would not.
    installMatchMedia(true)
    const nav = FakeNavigator.androidChrome()
    const haptics = new Haptics({ navigator: nav, watchVisibility: false })
    for (const cue of buzzing) {
      nav.reset()
      expect(haptics.fire(cue), `${cue} stopped firing under reduced motion`).toBe(true)
      expect(nav.calls).toHaveLength(1)
      expect(nav.calls[0].pattern).toEqual(
        typeof hapticPatternFor(cue) === 'number' ? hapticPatternFor(cue) : [...(hapticPatternFor(cue) as number[])],
      )
    }
    expect(HAPTIC_PATTERNS['hit-stab'], 'the registry moved under this test').toBe('medium')
    haptics.dispose()
  })
})
