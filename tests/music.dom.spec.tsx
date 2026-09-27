// @vitest-environment jsdom
//
// The music bed's React seam, which shipped in the first fix batch with no
// guard at all (principle 16's corollary: a fix is verified where the
// player sees it, not where the cause was found).
//
// Everything else in the music suite reaches AudioEngine.setMusicState
// directly, which is the same class of gap as testing MusicBed.duck while
// AudioEngine.play was the thing that had stopped calling it. What is
// actually shipped is a HOOK, mounted once in Game.tsx, and the defect the
// re-review confirmed lives in its lifecycle: leaving a campaign left the
// bed playing the abandoned campaign's layers under every menu behind it.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import { getAudioEngine, resetAudioEngineForTests } from '../src/audio/engine'
import { MUSIC_LAYERS } from '../src/audio/music'
import { useMusicState } from '../src/audio/useSound'
import type { GameState } from '../src/engine/types'
import { installFakeAudioContext, removeFakeAudioContext, type FakeGain } from './fakeAudio'
import { LOSS_SCRIPT, NO_OP } from './scripts'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  installFakeAudioContext()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetAudioEngineForTests()
  removeFakeAudioContext()
})

function Harness({ shown }: { shown: GameState | null }) {
  useMusicState(shown)
  return null
}

// Where each layer is heading, read off the graph the shipped engine built.
function layerTargets(): number[] {
  const bed = getAudioEngine().music
  if (!bed) throw new Error('no music bed')
  return MUSIC_LAYERS.map((l) => {
    const gain = bed.layerGain(l.name) as unknown as FakeGain | undefined
    const events = gain?.gain.events.filter((e) => e.kind !== 'cancel') ?? []
    return events[events.length - 1]?.value ?? 0
  })
}

// A real campaign state that lights more layers than the menu does, found
// by playing rather than constructed, so the contrast below is one a
// player actually reaches.
function pressuredState(): GameState {
  let state = newGame(DEFAULT_SCENARIO, 11)
  for (let turn = 0; turn < DEFAULT_SCENARIO.totalTurns && state.status === 'playing'; turn += 1) {
    state = resolveTurn(state, LOSS_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    if (state.conditions.length > 0) return state
  }
  throw new Error('no turn of this campaign puts a condition on the board')
}

describe('useMusicState', () => {
  it('returns the bed to the menu when the campaign unmounts', () => {
    // The gesture, so there is a bed to observe at all.
    const engine = getAudioEngine()
    engine.unlock()
    expect(engine.music, 'no bed after the gesture').not.toBeNull()

    const menu = layerTargets()
    const pressured = pressuredState()

    act(() => root.render(<Harness shown={pressured} />))
    const underCampaign = layerTargets()
    // The positive control for the whole test: mounting a campaign must
    // actually change the bed, or the unmount assertion below is comparing
    // two identical readings and proves nothing.
    expect(underCampaign, 'mounting a campaign did not move the bed').not.toEqual(menu)

    act(() => root.render(<></>))
    expect(layerTargets(), 'leaving the campaign left its layers playing under the menu').toEqual(menu)
  })

  it('follows the state it is given while mounted', () => {
    const engine = getAudioEngine()
    engine.unlock()
    const menu = layerTargets()
    const pressured = pressuredState()

    act(() => root.render(<Harness shown={null} />))
    expect(layerTargets(), 'a null campaign is not the menu').toEqual(menu)

    act(() => root.render(<Harness shown={pressured} />))
    expect(layerTargets(), 'the bed ignored the state it was handed').not.toEqual(menu)

    // And back, without unmounting: the hook tracks, it does not latch.
    act(() => root.render(<Harness shown={null} />))
    expect(layerTargets(), 'the bed latched on the campaign it had been shown').toEqual(menu)
  })
})
