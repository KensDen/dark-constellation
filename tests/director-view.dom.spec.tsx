// @vitest-environment jsdom
//
// The playback view's three guarantees that a source pin can only spell
// out: the layer badge restarting on a repeated layer, playback holding
// while the page is hidden, and the dwell floor being dropped when motion
// is off. All three were pinned by reading DirectorView.tsx as text, which
// the Round 4c audit classified as unverified under the qualified
// principle 10: a text pin proves the spelling is present, not that the
// program behaves.
//
// Rendering the real view against real derived beats is what proves the
// behaviour, and none of these can be satisfied by writing the code
// differently.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { BEAT_DWELL_MS, VISUAL_MS, deriveBeats, visualFor, type Beat } from '../src/director'
import DirectorView from '../src/director/DirectorView'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { NO_OP, WIN_SCRIPT } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  // The visibilityState spy would otherwise leak into the next test and
  // leave it running behind a hidden page.
  vi.restoreAllMocks()
})

interface Turn {
  before: GameState
  after: GameState
  beats: Beat[]
}

// Walk real play until a turn satisfies the shape a test needs, so the
// fixtures are the game's own beats rather than hand-built ones.
function findTurn(want: (beats: Beat[]) => boolean, seeds = [20260712, 4041, 1, 2, 3, 7]): Turn {
  for (const seed of seeds) {
    let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
    while (state.status === 'playing') {
      const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
      const beats = deriveBeats(state, after)
      if (want(beats)) return { before: state, after, beats }
      state = after
    }
  }
  throw new Error('no turn in the sweep has the shape this test needs')
}

function render(turn: Turn, speed: '1x' | '2x' = '1x') {
  act(() => {
    root.render(
      <DirectorView
        before={turn.before}
        after={turn.after}
        beats={turn.beats}
        speed={speed}
        onSpeedChange={() => {}}
        onPresented={() => {}}
        onDone={() => {}}
      />,
    )
  })
  const view = {
    position: () => container.textContent?.match(/beat (\d+) of (\d+)/)?.[0] ?? null,
    visibleIndex: () => Number(container.textContent?.match(/beat (\d+) of/)?.[1] ?? 0),
    badges: () => [...container.querySelectorAll('img')].filter((i) => i.className.includes('h-7')),
    // Step forward in small increments until the wanted visible beat is on
    // screen. Coarse steps overshoot: each beat arms the next, and one
    // large advance fires the whole chain inside the window.
    driveTo(index: number) {
      for (let guard = 0; guard < 4000 && view.visibleIndex() < index; guard += 1) {
        act(() => vi.advanceTimersByTime(25))
      }
      expect(view.visibleIndex(), `playback never reached visible beat ${index}`).toBe(index)
    },
  }
  return view
}

// The visible position (1 based) of a beat, which is what the view shows.
const visiblePositionOf = (beats: Beat[], beat: Beat) =>
  beats.slice(0, beats.indexOf(beat) + 1).filter((b) => b.visible).length

const stubMatchMedia = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

describe('playback: the behaviour the source pins could only spell', () => {
  it('replaces the layer badge on every beat, so a repeated layer pulses again', () => {
    // The defect: the pulse is a class on a node that never remounted, so
    // two consecutive beats on the same layer at the same tone left a
    // finished animation in place and the badge sat still. The key is what
    // makes the element new; this asserts the element, not the key.
    // Two visible beats in a row that both carry a layer badge: that
    // adjacency is the case the defect lived in.
    // The defect needed two consecutive beats on the SAME layer at the
    // SAME tone: that is when React reconciles one node with a
    // byte-identical class and the finished animation stays finished. A
    // predicate that only wants two beats with any badges can pick a pair
    // whose class differs, which would pass without the key.
    const hostile = new Set(['threat', 'condition-applied', 'condition-renewed', 'condition-pressure', 'chain-armed'])
    let pair: [Beat, Beat] | null = null
    const turn = findTurn((beats) => {
      const visible = beats.filter((b) => b.visible)
      for (let i = 0; i + 1 < visible.length; i += 1) {
        const a = visible[i]
        const b = visible[i + 1]
        const shared = a.layers?.filter((l) => b.layers?.includes(l)) ?? []
        if (shared.length > 0 && hostile.has(a.kind) === hostile.has(b.kind)) {
          pair = [a, b]
          return true
        }
      }
      return false
    })
    const [firstBeat, secondBeat] = pair!
    const view = render(turn)
    view.driveTo(visiblePositionOf(turn.beats, firstBeat))
    const first = view.badges()
    expect(first.length, 'the beat carries no layer badge').toBeGreaterThan(0)
    const before = first[0]
    view.driveTo(visiblePositionOf(turn.beats, secondBeat))
    const after = view.badges()
    expect(after.length, 'the next beat carries no layer badge').toBeGreaterThan(0)
    expect(before.isConnected, 'the badge node survived the beat change, so its animation cannot restart').toBe(false)
    expect(after[0], 'the badge is the same element as the previous beat').not.toBe(before)
  })

  it('holds its position while the page is hidden, and resumes when it comes back', () => {
    const turn = findTurn((beats) => beats.filter((b) => b.visible).length >= 3)
    const view = render(turn)
    const opening = view.position()

    // The policy reads visibilityState and listens for the event the
    // browser fires; this is what a locked phone delivers.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS * 4))
    expect(view.position(), 'playback ran on behind a hidden page').toBe(opening)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS + 50))
    expect(view.position(), 'playback did not resume when the page came back').not.toBe(opening)
  })

  it('ties the dwell floor to the cue of the beat that is playing', () => {
    // Two things the retired pin asserted that the first DOM test did not.
    // A preference captured once at construction passes a test that
    // renders each mode in a fresh tree, and a floor of any constant large
    // enough to bind at 2x passes one that only checks a long beat waits.
    // Both mutations survived the pass; these two assertions are what they
    // now have to get past.
    let slow: Beat | null = null
    let quick: Beat | null = null
    const turn = findTurn((beats) => {
      slow = null
      quick = null
      for (const b of beats) {
        if (!b.visible) continue
        const visual = visualFor(b.cueKey, b.kind)
        const ms = visual ? VISUAL_MS[visual] : 0
        if (!slow && ms > BEAT_DWELL_MS / 2) slow = b
        if (slow && !quick && ms <= BEAT_DWELL_MS / 2) quick = b
      }
      return !!slow && !!quick
    })
    const slowAt = visiblePositionOf(turn.beats, slow!)
    const quickAt = visiblePositionOf(turn.beats, quick!)
    const slowMs = VISUAL_MS[visualFor(slow!.cueKey, slow!.kind)!]

    // Tied to the beat: the long beat holds for its own cue, and a beat
    // after it with a short cue goes back to the plain dwell. A constant
    // floor would hold both.
    stubMatchMedia(false)
    const view = render(turn, '2x')
    view.driveTo(slowAt)
    const heldAt = view.position()
    act(() => vi.advanceTimersByTime(slowMs - 60))
    expect(view.position(), 'the long beat did not hold for its own cue').toBe(heldAt)
    view.driveTo(quickAt)
    const quickHeldAt = view.position()
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS / 2 + 30))
    expect(view.position(), 'a short beat was held open by the long beat floor').not.toBe(quickHeldAt)
  })

  it('reads the motion preference live, so a change lands on the next beat', () => {
    // The injection reads reducedRef.current inside the closure rather
    // than a value captured when the director was built, and the closure
    // lives in a layout effect keyed on the turn: a captured value would
    // be frozen for the whole turn. What the live read buys is the NEXT
    // arm, not the timer already running, because a preference change does
    // not reach into a scheduled timer and should not churn one.
    let reduce = false
    const listeners: Array<() => void> = []
    vi.stubGlobal('matchMedia', (query: string) => ({
      // A getter, not a captured value: the hook holds this object and
      // re-reads matches when the listener fires, exactly as a real
      // MediaQueryList behaves. A static field here would make the test
      // pass or fail on the stub rather than on the code.
      get matches() {
        return reduce && query.includes('reduce')
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => {},
      addListener: (fn: () => void) => listeners.push(fn),
      removeListener: () => {},
    }))

    // A turn with two long-cue beats, so one can play under motion and the
    // next under the preference that arrived in between.
    let slow: Beat[] = []
    const turn = findTurn((beats) => {
      slow = beats.filter((b) => {
        if (!b.visible) return false
        const visual = visualFor(b.cueKey, b.kind)
        return !!visual && VISUAL_MS[visual] > BEAT_DWELL_MS / 2
      })
      return slow.length >= 2
    })
    const view = render(turn, '2x')
    view.driveTo(visiblePositionOf(turn.beats, slow[0]))

    // The preference arrives mid-turn.
    reduce = true
    act(() => listeners.forEach((fn) => fn()))

    view.driveTo(visiblePositionOf(turn.beats, slow[1]))
    const held = view.position()
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS / 2 + 40))
    expect(view.position(), 'the second long beat still waited out an animation reduced motion never plays').not.toBe(
      held,
    )
  })

  it('starts paused when playback opens on a page that is already hidden', () => {
    // The scenario Appendix E describes: commit the turn, lock the phone.
    // No visibilitychange ever fires after that, so a view that only
    // subscribes to changes runs the whole turn behind the lock screen.
    // Adopting the state playback opens in is a separate line of code from
    // following it afterwards, and it needs its own case: retiring the
    // source pin that covered it left this bare until the audit found it.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const turn = findTurn((beats) => beats.filter((b) => b.visible).length >= 3)
    const view = render(turn)
    const opening = view.position()
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS * 4))
    expect(view.position(), 'playback ran on a page that was hidden before it started').toBe(opening)
  })

  it('drops the dwell floor when motion is off, and keeps it when motion is on', () => {
    // At 2x the dwell is 600ms while the longest treatments declare 900ms,
    // so the floor binds and holds the beat open. Under reduced motion
    // there is no animation to protect and the floor would only slow the
    // turn down.
    const longest = Math.max(...Object.values(VISUAL_MS))
    expect(longest, 'no treatment is long enough for the floor to bind at 2x').toBeGreaterThan(BEAT_DWELL_MS / 2)
    let slow: Beat | null = null
    const turn = findTurn((beats) => {
      slow =
        beats.find((b) => {
          if (!b.visible) return false
          const visual = visualFor(b.cueKey, b.kind)
          return !!visual && VISUAL_MS[visual] > BEAT_DWELL_MS / 2
        }) ?? null
      return !!slow
    })
    const slowAt = visiblePositionOf(turn.beats, slow!)

    stubMatchMedia(false)
    const motion = render(turn, '2x')
    motion.driveTo(slowAt)
    const heldAt = motion.position()
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS / 2 + 20))
    expect(motion.position(), 'the floor did not hold the beat open for its own cue').toBe(heldAt)
    act(() => vi.advanceTimersByTime(longest))
    expect(motion.position(), 'the beat never advanced at all').not.toBe(heldAt)

    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    stubMatchMedia(true)
    const reduced = render(turn, '2x')
    reduced.driveTo(slowAt)
    const reducedAt = reduced.position()
    act(() => vi.advanceTimersByTime(BEAT_DWELL_MS / 2 + 20))
    expect(reduced.position(), 'reduced motion still waited out an animation it never plays').not.toBe(reducedAt)
  })
})
