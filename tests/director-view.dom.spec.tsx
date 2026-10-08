// @vitest-environment jsdom
//
// The playback view's guarantees that a source pin can only spell out: the
// layer badge restarting on a repeated layer, and the beat on screen
// waiting for the player. Both were pinned by reading DirectorView.tsx as
// text, which the Round 4c audit classified as unverified under the
// qualified principle 10: a text pin proves the spelling is present, not
// that the program behaves.
//
// v1.3 Round 0 (brief 5.5) retired the dwell, the speed control and the
// hidden-page pause: every beat now waits for a tap. The four cases that
// timed the dwell floor and the pause went with them; the hidden-page case
// is kept as the guarantee it was for, that the beat on screen when the
// phone locked is the beat on screen when it wakes.
//
// Rendering the real view against real derived beats is what proves the
// behaviour, and none of these can be satisfied by writing the code
// differently.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats, type Beat } from '../src/director'
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

function render(turn: Turn) {
  act(() => {
    root.render(
      <DirectorView
        before={turn.before}
        after={turn.after}
        beats={turn.beats}
        onPresented={() => {}}
        onDone={() => {}}
      />,
    )
  })
  const view = {
    position: () => container.textContent?.match(/beat (\d+) of (\d+)/)?.[0] ?? null,
    visibleIndex: () => Number(container.textContent?.match(/beat (\d+) of/)?.[1] ?? 0),
    badges: () => [...container.querySelectorAll('img')].filter((i) => i.className.includes('h-7')),
    // The playback's own Next control, which is what a player taps.
    next() {
      const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next')
      if (!button) throw new Error('the playback renders no Next control')
      act(() => button.click())
    },
    // Tap Next until the wanted visible beat is on screen. One tap is one
    // beat, so the walk lands on it exactly rather than overshooting.
    driveTo(index: number) {
      for (let guard = 0; guard < 100 && view.visibleIndex() < index; guard += 1) view.next()
      expect(view.visibleIndex(), `playback never reached visible beat ${index}`).toBe(index)
    },
  }
  return view
}

// The visible position (1 based) of a beat, which is what the view shows.
const visiblePositionOf = (beats: Beat[], beat: Beat) =>
  beats.slice(0, beats.indexOf(beat) + 1).filter((b) => b.visible).length

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

  it('waits for the player on every beat, hidden page or not, and moves on at a tap', () => {
    // Until v1.3 Round 0 this case proved the hidden-page pause: the
    // director stopped arming its next beat while hidden and re-armed on
    // return. The pause went with the dwell (brief 5.5), and what it was
    // for now holds because nothing moves the beat but the player. So the
    // page opens hidden, as it does when a turn is committed and the phone
    // locked, and comes back; a minute passes each way, far past any dwell
    // the v1.1 director had. A timer reintroduced in the view fails the
    // visible half even if it learned to pause, and the tap at the end is
    // the control that shows the position can move at all.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const turn = findTurn((beats) => beats.filter((b) => b.visible).length >= 3)
    const view = render(turn)
    const opening = view.position()
    expect(opening, 'playback opened on no beat').not.toBeNull()
    act(() => vi.advanceTimersByTime(60_000))
    expect(view.position(), 'playback ran on behind a hidden page').toBe(opening)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(60_000))
    expect(view.position(), 'playback moved on without the player once the page came back').toBe(opening)

    view.next()
    expect(view.position(), 'a tap on Next did not move the playback on').not.toBe(opening)
  })
})
