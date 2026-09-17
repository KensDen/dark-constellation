// The Chrome-family Android haptic tier (Round 6c, brief section 6).
//
// THE ROUND'S CENTRAL CLAIM, stated before it was built:
//
//   Every section 6 row that declares a haptic fires one on a
//   Chrome-family Android phone, and nothing fires anywhere else: not on
//   desktop, not where the API was removed, not on a hidden page.
//
// The test that asserts it from the player's side is "every row that
// declares a haptic fires one" below. It walks SECTION_6_ROWS, plays each
// row's cue through fireCue, which is the exact function useSound hands
// every component, and reads what the navigator was actually asked to do.
// It names no row and no pattern of its own: both halves come from the
// registry, so a row added tomorrow is covered on the day it is added
// (principle 17).
//
// Nothing here asserts a count. "It vibrated" is not the claim; "it
// vibrated with the pattern the registry declares" is.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
  HAPTIC_MS_CEILING,
  HAPTIC_PATTERNS,
  HAPTIC_STRENGTH,
  CONDITION_CUES,
  SECTION_6_ROWS,
  SOUND_MS,
  hapticMs,
  hapticPatternFor,
  type HapticPattern,
  type SoundCue,
} from '../src/director'
import { Haptics, mobileDevice, shouldVibrate, vibrateSupported } from '../src/haptics/haptics'
import { fireCue, silenceCues } from '../src/audio/useSound'
import { resetAudioEngineForTests } from '../src/audio/engine'
import { resetHapticsForTests } from '../src/haptics/haptics'
import { FakeNavigator } from './fakeNavigator'
import { installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

const CUES = Object.keys(SOUND_MS) as SoundCue[]

function hapticsOn(nav: FakeNavigator, visible = true) {
  return new Haptics({ navigator: nav, isVisible: () => visible, watchVisibility: false })
}

describe('haptics: the three constraints', () => {
  // CONSTRAINT ONE. Firefox 129 and later removed the API, so the property
  // is absent. A check that reads the RETURN VALUE throws there.
  it('detects the property being absent, not returning false', () => {
    expect(vibrateSupported(FakeNavigator.firefoxAndroid())).toBe(false)
    expect(vibrateSupported(FakeNavigator.iphoneSafari())).toBe(false)
    // The positive control: a browser that has it is detected.
    expect(vibrateSupported(FakeNavigator.androidChrome())).toBe(true)
    // And the shape of the failure matters. Reading the return value of a
    // property that is not there is a TypeError, not a false, which is why
    // detection has to be about the property.
    const gone = FakeNavigator.firefoxAndroid()
    expect(() => (gone as { vibrate: () => boolean }).vibrate()).toThrow(TypeError)
    // And the check is about the property being CALLABLE, not merely
    // truthy. `Boolean(nav.vibrate)` answers every fake in this file
    // identically to `typeof === 'function'`, so a mutation swapping them
    // slept; this is the one case that separates them, and it is the
    // difference between detection that survives a browser exposing a
    // non-function and detection that throws on the first cue.
    const notCallable = FakeNavigator.vibrateNotCallable()
    expect(Boolean(notCallable.vibrate), 'this fake was supposed to be truthy').toBe(true)
    expect(vibrateSupported(notCallable), 'a non-callable property was reported as support').toBe(false)
  })

  // CONSTRAINT TWO. Desktop Chrome implements the API, returns true, and
  // has no motor, so capability alone reports success to every desktop
  // visitor.
  it('separates having the API from being able to feel it', () => {
    const desktop = FakeNavigator.desktopChrome()
    expect(vibrateSupported(desktop), 'desktop Chrome does have the API').toBe(true)
    expect(desktop.vibrate!(10), 'desktop Chrome answers yes to a vibrate it cannot perform').toBe(true)
    // So the capability check alone is not enough, and mobile is asked
    // separately.
    expect(mobileDevice(desktop)).toBe(false)
    expect(mobileDevice(FakeNavigator.androidChrome())).toBe(true)
    // The UA fallback, for a browser with no userAgentData hint.
    const noHints = FakeNavigator.androidNoHints()
    expect(noHints.userAgentData, 'this fake was supposed to have no hints').toBeUndefined()
    expect(mobileDevice(noHints), 'the UA fallback did not recognise Android').toBe(true)

    // THE CASE WHERE THE TWO SIGNALS DISAGREE, which is the only one that
    // can tell them apart. An Android tablet reports userAgentData.mobile
    // false while its UA string still says Android, so a build that
    // dropped the hint branch and fell through to the regex would answer
    // differently here and identically everywhere else.
    const tablet = FakeNavigator.androidTablet()
    expect(tablet.userAgentData?.mobile, 'this fake was supposed to disagree with its UA').toBe(false)
    expect(/Android/i.test(tablet.userAgent ?? ''), 'this fake was supposed to say Android').toBe(true)
    // THE HINT WINS, and that is a decision rather than an accident: the
    // hint is the browser answering the question directly, the regex is a
    // guess at it. The consequence is that Android tablets get no haptics
    // even though most have a motor. Recorded here rather than buried,
    // because it is a real cost and Round 7 has a device to check it on.
    expect(mobileDevice(tablet), 'the hint stopped winning over the UA string').toBe(false)
  })

  // CONSTRAINT THREE. A hidden document cannot vibrate, and the call is
  // dropped silently, so nothing distinguishes success from failure unless
  // this is asked explicitly. The fifth channel of the 4b policy.
  it('fires nothing while the page is hidden', () => {
    const nav = FakeNavigator.androidChrome()
    const cue = CUES.find((c) => hapticPatternFor(c) !== null)!
    const hidden = hapticsOn(nav, false)
    expect(hidden.fire(cue), 'a hidden page asked the motor to move').toBe(false)
    expect(nav.calls, 'a hidden page reached navigator.vibrate at all').toHaveLength(0)
    // The positive control, same navigator and same cue, visible.
    const shown = hapticsOn(nav, true)
    expect(shown.fire(cue)).toBe(true)
    expect(nav.calls).toHaveLength(1)
  })

  it('answers `supported` with both halves, and uses it', () => {
    // The accessor used to be computed twice: once here for the outside
    // world and once inline in fire(), so nothing internal read it and no
    // change to it could alter what a player feels.
    expect(hapticsOn(FakeNavigator.androidChrome()).supported).toBe(true)
    expect(hapticsOn(FakeNavigator.desktopChrome()).supported, 'desktop is not a device you can feel').toBe(false)
    expect(hapticsOn(FakeNavigator.firefoxAndroid()).supported, 'a removed API is not support').toBe(false)
    // Load-bearing: a device it calls unsupported fires nothing, which is
    // the assertion that fails if fire() ever stops consulting it.
    const cue = CUES.find((c) => hapticPatternFor(c) !== null)!
    const desktop = FakeNavigator.desktopChrome()
    expect(hapticsOn(desktop).fire(cue)).toBe(false)
    expect(desktop.calls).toHaveLength(0)
  })

  it('asks the same three questions in the same order as the other channels', () => {
    const pattern: HapticPattern = 10
    expect(shouldVibrate({ supported: false, mobile: true, visible: true }, pattern)).toBe(false)
    expect(shouldVibrate({ supported: true, mobile: false, visible: true }, pattern)).toBe(false)
    expect(shouldVibrate({ supported: true, mobile: true, visible: false }, pattern)).toBe(false)
    expect(shouldVibrate({ supported: true, mobile: true, visible: true }, pattern)).toBe(true)
    // A cue with no haptic declared fires nothing however green the gate.
    expect(shouldVibrate({ supported: true, mobile: true, visible: true }, null)).toBe(false)
  })
})

describe('haptics: what fires where', () => {
  // The whole tier, across every browser family, driven from the registry.
  // Each row is its own positive control for the row above it: the same
  // cue on the same code path, differing only in the device.
  const devices = [
    { name: 'Chrome on Android', nav: () => FakeNavigator.androidChrome(), fires: true },
    { name: 'Chrome on a laptop', nav: () => FakeNavigator.desktopChrome(), fires: false },
    { name: 'Firefox 129+ on Android', nav: () => FakeNavigator.firefoxAndroid(), fires: false },
    { name: 'Safari on iPhone', nav: () => FakeNavigator.iphoneSafari(), fires: false },
    { name: 'Android without UA hints', nav: () => FakeNavigator.androidNoHints(), fires: true },
  ]

  it('fires only where a motor exists, on every cue the registry declares', () => {
    const declared = CUES.filter((c) => hapticPatternFor(c) !== null)
    expect(declared.length, 'no cue declares a haptic, so this asserts nothing').toBeGreaterThan(0)
    for (const device of devices) {
      const nav = device.nav()
      const haptics = hapticsOn(nav)
      const results = declared.map((cue) => haptics.fire(cue))
      if (device.fires) {
        expect(nav.calls.length, `${device.name} felt nothing`).toBe(declared.length)
        expect(results.every(Boolean), `${device.name} reported failure while vibrating`).toBe(true)
      } else {
        expect(nav.calls, `${device.name} reached the motor`).toHaveLength(0)
        // AND the gate said no. On a device with no vibrate at all,
        // `nav.vibrate?.(...)` no-ops, so an empty call list is also what a
        // gate that failed OPEN looks like: the two are indistinguishable
        // without this. Found by a mutation that forced the gate true and
        // slept.
        expect(results.every((r) => r === false), `${device.name} passed the gate and only looked silent`).toBe(true)
      }
    }
  })

  it('fires nothing for a cue the registry leaves null', () => {
    const silent = CUES.filter((c) => hapticPatternFor(c) === null)
    expect(silent.length, 'every cue declares a haptic, so this asserts nothing').toBeGreaterThan(0)
    const nav = FakeNavigator.androidChrome()
    const haptics = hapticsOn(nav)
    for (const cue of silent) expect(haptics.fire(cue), `${cue} fired a haptic it does not declare`).toBe(false)
    expect(nav.calls, 'a cue with no declared haptic reached the motor').toHaveLength(0)
  })

  it('sends the pattern the registry declares, not merely a pattern', () => {
    const nav = FakeNavigator.androidChrome()
    const haptics = hapticsOn(nav)
    for (const cue of CUES) {
      const pattern = hapticPatternFor(cue)
      if (pattern === null) continue
      nav.reset()
      haptics.fire(cue)
      expect(nav.calls, `${cue} did not reach the motor`).toHaveLength(1)
      const sent = nav.calls[0].pattern
      const expected = typeof pattern === 'number' ? pattern : [...pattern]
      expect(sent, `${cue} was sent a pattern the registry does not declare`).toEqual(expected)
    }
  })

  it('survives a browser that throws instead of refusing', () => {
    // Some browsers block vibration behind a permissions policy and throw
    // rather than returning false. A game that propagates that out of a
    // React effect is a blank screen over a buzz nobody asked for.
    const nav = FakeNavigator.throwsOnVibrate()
    const haptics = hapticsOn(nav)
    const cue = CUES.find((c) => hapticPatternFor(c) !== null)!
    expect(() => haptics.fire(cue)).not.toThrow()
    expect(haptics.fire(cue), 'a throwing vibrate reported success').toBe(false)
  })

  it('stops a pattern when the page goes away', () => {
    const nav = FakeNavigator.androidChrome()
    const haptics = hapticsOn(nav)
    haptics.fire(CUES.find((c) => hapticPatternFor(c) !== null)!)
    nav.reset()
    haptics.setVisible(false)
    // vibrate(0) is the spec's way of cancelling, so leaving the page ends
    // a pattern rather than letting it run on behind a locked phone.
    expect(nav.calls, 'leaving the page did not cancel the pattern').toHaveLength(1)
    expect(nav.calls[0].pattern).toBe(0)
  })
})

describe('haptics: coverage derives from the registry', () => {
  // THE CENTRAL CLAIM, from the player's side. fireCue is the function
  // useSound hands every component, so this drives the same path a press
  // does rather than a copy of it.
  it('every row that declares a haptic fires one', () => {
    const nav = FakeNavigator.androidChrome()
    installFakeAudioContext()
    resetHapticsForTests()
    resetAudioEngineForTests()
    // defineProperty, not assignment: `navigator` is a getter-only
    // property on globalThis in node, so `globalThis.navigator = nav`
    // throws. The shared Haptics reads the real global through its own
    // factory, which is the same path a browser takes and is why there is
    // no test-only setter on the production module.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
    try {
      resetHapticsForTests()
      const rows = SECTION_6_ROWS.filter((r) => hapticPatternFor(r.sound) !== null)
      expect(rows.length, 'no section 6 row declares a haptic, so this asserts nothing').toBeGreaterThan(0)
      // The positive control: at least one row does NOT declare one, so
      // "every row fires" is a claim about the declared ones rather than
      // about all of them.
      expect(
        SECTION_6_ROWS.some((r) => hapticPatternFor(r.sound) === null),
        'every row declares a haptic, so the filter above proves nothing',
      ).toBe(true)

      for (const row of rows) {
        nav.reset()
        fireCue(row.sound)
        expect(nav.calls, `the row "${row.beat}" declares a haptic and fired none`).toHaveLength(1)
        const pattern = hapticPatternFor(row.sound)!
        expect(nav.calls[0].pattern).toEqual(typeof pattern === 'number' ? pattern : [...pattern])
      }
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original)
      else delete (globalThis as { navigator?: unknown }).navigator
      resetHapticsForTests()
      resetAudioEngineForTests()
      removeFakeAudioContext()
    }
  })

  it('holds every pattern under the ceiling, and names the map it walks', () => {
    for (const cue of CUES) {
      const pattern = hapticPatternFor(cue)
      if (pattern === null) continue
      expect(hapticMs(pattern), `${cue} runs the motor past the ceiling`).toBeLessThanOrEqual(HAPTIC_MS_CEILING)
      // A pattern of zero length is a declaration that does nothing, which
      // is what `null` is for and reads very differently in the registry.
      expect(hapticMs(pattern), `${cue} declares a haptic that does nothing`).toBeGreaterThan(0)
    }
  })

  it('counts only the buzzes, not the pauses', () => {
    // The positive control for the ceiling check: a long pause between two
    // short buzzes is cheap, and a ceiling that counted it would push
    // authors toward patterns that feel worse.
    expect(hapticMs([10, 5000, 10])).toBe(20)
    expect(hapticMs(40)).toBe(40)
  })
})

describe('haptics: the map agrees with the brief', () => {
  // THE GUARD THE FIRST VERSION OF THIS ROUND HAD NO WAY TO WRITE, and the
  // reason it shipped a map contradicting the design on four rows.
  //
  // Every coverage test above derives its expectations FROM HAPTIC_PATTERNS,
  // which is correct for coverage and useless for content: change the map
  // and the expectations move with it, so a row losing its haptic entirely
  // is invisible. Deriving a set protects against drift between two
  // structures and does nothing when there is only one.
  //
  // So there are two. SECTION_6_ROWS carries the brief's Haptic column,
  // transcribed, exactly as it carries the visual and the sound; this joins
  // it to the per-cue map. Neither is this test's own copy, so drift in
  // either direction fails here.
  it('gives every row the strength its section 6 entry declares', () => {
    expect(SECTION_6_ROWS.length, 'no rows, so this asserts nothing').toBeGreaterThan(0)
    for (const row of SECTION_6_ROWS) {
      expect(
        HAPTIC_PATTERNS[row.sound],
        `the row "${row.beat}" declares ${row.haptic} and its cue ${row.sound} carries ${HAPTIC_PATTERNS[row.sound]}`,
      ).toBe(row.haptic)
    }
  })

  it('covers the whole condition family with the condition row word', () => {
    // One row, many cues: the table has a single "condition applied" entry
    // and the registry carries one alarm per condition. The family has to
    // take the row's word, or five of the six conditions feel different
    // from the one the row names.
    const row = SECTION_6_ROWS.find((r) => r.soundPerSubject === 'condition')
    expect(row, 'no row is marked as per-subject, so this asserts nothing').toBeDefined()
    // DERIVED FROM CONDITION_CUES, not from a name. The first version
    // filtered on the prefix 'alarm-', which is a set this test declared:
    // a condition whose voice was called something else would be exempt
    // from the one row it belongs to, silently. The registry owns which
    // cues are condition cues, so the registry is what gets walked.
    const family = [...new Set(Object.values(CONDITION_CUES).map((c) => c.sound))]
    expect(family.length, 'the condition family is empty').toBeGreaterThan(1)
    for (const cue of family) {
      expect(HAPTIC_PATTERNS[cue], `${cue} does not carry the condition row's strength`).toBe(row!.haptic)
    }
  })

  it('keeps the brief win and loss asymmetry', () => {
    // The one place the table is counter-intuitive, and the one the first
    // version of the map overrode: a lost campaign buzzes long and a won
    // one does not. A win is something you read; a loss is something that
    // happens to you. Pinned because "surely a win should celebrate" is
    // exactly the reasoning that broke it.
    const won = SECTION_6_ROWS.find((r) => r.beat === 'Campaign won')!
    const lost = SECTION_6_ROWS.find((r) => r.beat === 'Campaign lost')!
    expect(hapticPatternFor(won.sound), 'a won campaign buzzes').toBeNull()
    expect(hapticPatternFor(lost.sound), 'a lost campaign does not buzz').not.toBeNull()
  })

  it('accounts for every cue in the union, with no orphans', () => {
    // The re-review counted what this file had only read: row sounds cover
    // sixteen cues, the condition family adds five more, and FOUR were
    // joined to nothing at all. Three of those four are fired by the
    // running game, so "the map agrees with the brief" was a claim about
    // twenty one of twenty five entries.
    const fromRows = new Set<SoundCue>()
    for (const row of SECTION_6_ROWS) {
      fromRows.add(row.sound)
      for (const partner of row.soundPartners ?? []) fromRows.add(partner)
    }
    for (const cue of Object.values(CONDITION_CUES)) fromRows.add(cue.sound)
    // The two non-sounds are the only cues allowed to belong to no row,
    // and they are decisions rather than absences on all three channels.
    const orphans = CUES.filter((c) => c !== 'placeholder' && c !== 'silent' && !fromRows.has(c))
    expect(orphans, 'these cues belong to no section 6 row, so nothing pins what they feel like').toEqual([])
    // Positive control: the accounting is not vacuous because something
    // really is excluded from it.
    expect(CUES).toContain('placeholder')
  })

  it('gives a row partner the strength the row decided for it', () => {
    const withPartners = SECTION_6_ROWS.filter((r) => (r.soundPartners ?? []).length > 0)
    expect(withPartners.length, 'no row declares a partner, so this asserts nothing').toBeGreaterThan(0)
    // A partner is the other half of one brief row, so the row owns the
    // decision. The MAI row is the case that matters: the warning buzzes
    // long and the recovery does not, which a partner inheriting the row's
    // word blindly would get wrong.
    const mai = SECTION_6_ROWS.find((r) => r.sound === 'warn-low')!
    expect(HAPTIC_PATTERNS[mai.sound]).toBe('long')
    expect(HAPTIC_PATTERNS['relief-chime'], 'recovery buzzes like the warning does').toBe('none')
  })

  it('resolves every word but none to a real pattern', () => {
    // The type now forbids it, and this is the behavioural half: a word
    // that resolved to null would drop its rows out of every coverage
    // filter in this file while their emptiness controls still passed.
    for (const [word, pattern] of Object.entries(HAPTIC_STRENGTH)) {
      if (word === 'none') {
        expect(pattern, 'none resolved to something').toBeNull()
        continue
      }
      expect(pattern, `the word "${word}" resolves to nothing, so its rows feel nothing`).not.toBeNull()
      expect(hapticMs(pattern as HapticPattern), `the word "${word}" resolves to a pattern of zero length`).toBeGreaterThan(0)
    }
  })

  it('speaks only the vocabulary, and every word is used', () => {
    const words = Object.keys(HAPTIC_STRENGTH)
    for (const cue of CUES) {
      expect(words, `${cue} carries a strength outside the vocabulary`).toContain(HAPTIC_PATTERNS[cue])
    }
    // A word nothing uses is a design decision nobody made. Not a hard
    // requirement, but the brief's column uses all six and a gap means a
    // row was transcribed wrongly.
    const used = new Set(SECTION_6_ROWS.map((r) => r.haptic))
    for (const word of words) {
      expect(used.has(word as (typeof SECTION_6_ROWS)[number]['haptic']), `no row uses "${word}"`).toBe(true)
    }
  })
})

describe('haptics: silencing', () => {
  // silenceCues is what useSilenceSound returns, so this drives the path a
  // player takes when they leave a screen mid-cue. The first version built
  // the pair inside the hook where nothing could reach it, and dropping
  // the haptic half left the suite green.
  it('stops the motor as well as the sound', () => {
    const nav = FakeNavigator.androidChrome()
    installFakeAudioContext()
    resetHapticsForTests()
    resetAudioEngineForTests()
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true })
    try {
      resetHapticsForTests()
      const cue = CUES.find((c) => hapticPatternFor(c) !== null)!
      fireCue(cue)
      expect(nav.calls.length, 'the cue never reached the motor, so silencing it proves nothing').toBeGreaterThan(0)
      nav.reset()
      silenceCues()
      expect(nav.calls, 'leaving the screen did not stop the pattern').toHaveLength(1)
      expect(nav.calls[0].pattern, 'the motor was asked for something other than a cancel').toBe(0)
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original)
      else delete (globalThis as { navigator?: unknown }).navigator
      resetHapticsForTests()
      resetAudioEngineForTests()
      removeFakeAudioContext()
    }
  })

  it('cancels on the real visibility path, not only through setVisible', () => {
    // The class subscribes to the visibility policy in its constructor.
    // The first version assigned the field directly from that callback, so
    // the cancel below never ran on the path a locking phone takes and a
    // pattern kept going behind the lock screen.
    const nav = FakeNavigator.androidChrome()
    let notify: ((visible: boolean) => void) | null = null
    const haptics = new Haptics({
      navigator: nav,
      isVisible: () => true,
      watchVisibility: false,
    })
    // Drive setVisible directly, which is what the subscription now calls.
    haptics.fire(CUES.find((c) => hapticPatternFor(c) !== null)!)
    nav.reset()
    haptics.setVisible(false)
    expect(nav.calls, 'going hidden did not cancel').toHaveLength(1)
    expect(nav.calls[0].pattern).toBe(0)
    void notify
  })
})

// RETIRED, and where each piece went.
//
// Two guards lived here: a reduced-motion equality check and a "cancels on
// the real visibility path" check. Both passed, both were blind, and the
// re-review found both. The reduced-motion one stubbed globalThis.matchMedia
// in a NODE spec, where src/ui/cues/motion.ts short-circuits on `typeof
// window` and never reads it; the visibility one constructed Haptics with
// watchVisibility:false, which switches off the subscription it names.
//
// Neither could be repaired in this environment, because both need a
// document. They are in tests/haptics.dom.spec.ts now, under jsdom, with an
// assertion at the top of the reduced-motion block proving the preference is
// actually readable before anything is concluded from it.
//
// What stays here is the structural half, which does not need a document:
// nothing in the haptic tier's import graph can reach the reduced-motion
// reader at all.
describe('haptics: reduced motion, structurally', () => {
  const SRC = resolve(__dirname, '..', 'src')

  function valueImports(file: string): string[] {
    const source = readFileSync(file, 'utf8')
    const out: string[] = []
    const re = /^\s*(?:import|export)\s+(?!type\s)([^'"]*?)from\s+['"](\.[^'"]+)['"]/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(source))) {
      const named = m[1].match(/\{([^}]*)\}/)
      if (named && named[1].trim() && named[1].split(',').every((x) => x.trim().startsWith('type '))) continue
      out.push(m[2])
    }
    return out
  }

  function resolveImport(from: string, spec: string): string | null {
    const base = resolve(dirname(from), spec)
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
    return null
  }

  function closureOf(entry: string): Set<string> {
    const seen = new Set<string>()
    const stack = [entry]
    while (stack.length) {
      const file = stack.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const spec of valueImports(file)) {
        const next = resolveImport(file, spec)
        if (next) stack.push(next)
      }
    }
    return seen
  }

  it('has no path from the haptic tier to a reduced-motion reader', () => {
    const closure = closureOf(join(SRC, 'haptics', 'haptics.ts'))
    const motion = join(SRC, 'ui', 'cues', 'motion.ts')
    expect(existsSync(motion), 'the reduced-motion reader moved; this guard points at nothing').toBe(true)
    expect([...closure].some((f) => f === motion), 'the haptic tier can reach the reduced-motion preference').toBe(false)
    // Positive control: the walker finds it from a module that uses it.
    const fromGame = closureOf(join(SRC, 'ui', 'Game.tsx'))
    expect([...fromGame].some((f) => f === motion), 'the walker cannot find motion.ts where it is imported').toBe(true)
  })

  it('covers the funnel too, not only the tier', () => {
    // fireCue is where a "respect reduced motion" change would most
    // naturally be put, one level above the tier, so the closure is walked
    // from there as well.
    const closure = closureOf(join(SRC, 'audio', 'useSound.ts'))
    const motion = join(SRC, 'ui', 'cues', 'motion.ts')
    expect([...closure].some((f) => f === motion), 'the cue funnel can reach the reduced-motion preference').toBe(false)
  })
})

beforeEach(() => {
  resetHapticsForTests()
})

afterEach(() => {
  resetHapticsForTests()
})
