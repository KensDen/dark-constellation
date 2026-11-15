// @vitest-environment jsdom
//
// The parts of Round 4d that are DOM guarantees rather than rules (brief
// v1.1: "where a guarantee is genuinely about the DOM or the audio graph,
// use the jsdom environment you built rather than a source pin").
//
// Three things here cannot be proven anywhere else. The gesture unlock is
// a listener on the document and a browser's autoplay policy, so it is
// only real if a dispatched gesture actually builds the context. The
// visibility seam is a document event, and the node suite deliberately
// switches that subscription off to test the policy in isolation, which
// means nothing there proves the subscription is wired at all. And the two
// toggles are controls a player reads, so what matters is the name the
// screen renders, not the constant a module exports.
//
// The engine reaches its context through its own factory here, with no
// test seam: jsdom implements no Web Audio, so installing one IS the
// platform, and the production path runs exactly as it does in a browser.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SoundToggles from '../src/ui/cues/SoundToggles'
import { SOUND_TOGGLE_LABELS } from '../src/ui/systemControls'
import {
  EFFECTS_PREF_KEY,
  MUSIC_PREF_KEY,
  getAudioEngine,
  installGestureUnlock,
  resetAudioEngineForTests,
  useSoundPrefs,
  type SoundPrefs,
} from '../src/audio'
import { FakeAudioContext, installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root
let contexts: FakeAudioContext[]

// jsdom under this vitest does not implement Storage at all: window
// .localStorage is undefined, and Node's own global is disabled without
// --localstorage-file. So the persistence tests below run against this.
//
// Said plainly, because Appendix E records what happens when a model is
// mistaken for an observation: this IS a model. What it can prove is that
// the round trip through src/audio/prefs.ts works, that a fresh engine
// reads back what a toggle wrote, and that the keys are the ones named.
// What it cannot prove is any real browser Storage behaviour: quota
// failures, private-mode refusals, or cross-tab events. Those paths are
// wrapped in try/catch precisely because they cannot be exercised here.
//
// The model risk is lower than the pointer-capture one, and for a stated
// reason rather than as a feeling: this code only ever calls getItem,
// setItem and removeItem on string keys, which is the whole of what the
// stub implements, so there is no behaviour left for the model to get
// wrong in the same direction as the code.
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(String(k), String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', memoryStorage())
  resetAudioEngineForTests()
  contexts = installFakeAudioContext().contexts
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetAudioEngineForTests()
  removeFakeAudioContext()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ctx = () => contexts[0]

function gesture(type = 'pointerdown') {
  document.dispatchEvent(new Event(type, { bubbles: true }))
}

// The page hiding or coming back, as the browser reports it: the state the
// policy reads, and the event it listens for.
const setHidden = (hidden: boolean) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('the first-gesture unlock is a document listener, not an intention', () => {
  it('builds no context until a real gesture reaches the document', () => {
    const uninstall = installGestureUnlock()
    const engine = getAudioEngine()
    expect(contexts.length, 'a context existed before any gesture').toBe(0)
    expect(engine.play('hit-stab')).toBe(false)
    gesture()
    expect(contexts.length, 'the gesture did not unlock anything').toBe(1)
    expect(engine.play('hit-stab')).toBe(true)
    uninstall()
  })

  it('unlocks from a keyboard gesture too, which is the only one some players make', () => {
    installGestureUnlock()
    gesture('keydown')
    expect(contexts.length).toBe(1)
  })

  it('stops listening once it has unlocked', () => {
    // A listener left on the document for the life of the session would
    // call resume on every tap the player ever makes.
    installGestureUnlock()
    gesture()
    const resumes = ctx().resumeCalls
    gesture()
    gesture()
    expect(contexts.length, 'a later gesture built a second context').toBe(1)
    expect(ctx().resumeCalls, 'the unlock listener is still attached').toBe(resumes)
  })

  it('stays armed through a gesture the browser does not count as activation (v1.2 R4)', () => {
    // A touch's pointerdown, or Escape, builds the context 'suspended': it
    // is not user activation. The same tap's pointerup is, and must reach
    // unlock() to resume it. The fake starts every context running, so a
    // context that starts suspended is made here, the way a phone makes it.
    const Installed = (globalThis as unknown as { AudioContext: new () => FakeAudioContext }).AudioContext
    ;(globalThis as { AudioContext?: unknown }).AudioContext = class extends Installed {
      constructor() {
        super()
        this.state = 'suspended'
      }
    }
    installGestureUnlock()
    gesture('pointerdown')
    expect(contexts.length).toBe(1)
    expect(ctx().state, 'the fake did not start suspended').toBe('suspended')
    const before = ctx().resumeCalls
    gesture('pointerup')
    expect(ctx().resumeCalls, "the tap's activation never reached the context").toBe(before + 1)
    expect(ctx().state).toBe('running')
    // Running now, so the listener is gone.
    const after = ctx().resumeCalls
    gesture('pointerdown')
    gesture('click')
    expect(ctx().resumeCalls, 'the unlock listener outlived the running context').toBe(after)
  })

  it('leaves nothing attached when uninstalled before any gesture', () => {
    const uninstall = installGestureUnlock()
    uninstall()
    gesture()
    expect(contexts.length).toBe(0)
  })
})

describe('sound follows the hidden-page policy through the real document event', () => {
  it('suspends when the page hides and resumes when it returns', () => {
    // The node suite turns this subscription off to test the policy alone,
    // so this is the only place the wiring itself is proven.
    installGestureUnlock()
    gesture()
    const engine = getAudioEngine()
    const before = ctx().suspendCalls
    setHidden(true)
    expect(ctx().suspendCalls, 'hiding the page did not suspend the context').toBe(before + 1)
    expect(engine.play('hit-stab'), 'a hidden page still played a cue').toBe(false)
    const resumes = ctx().resumeCalls
    setHidden(false)
    expect(ctx().resumeCalls).toBe(resumes + 1)
    expect(engine.play('hit-stab')).toBe(true)
  })
})

describe('the two sound toggles', () => {
  function Host() {
    const [prefs, setPrefs] = useSoundPrefs()
    return <SoundToggles prefs={prefs} onChange={setPrefs} />
  }

  function renderHost() {
    act(() => root.render(<Host />))
    const buttons = [...container.querySelectorAll('button')]
    const byName = (name: string) => {
      const found = buttons.find((b) => b.textContent?.trim().replace(/ (ON|OFF)$/, '') === name)
      if (!found) throw new Error(`no control named ${name}`)
      return found
    }
    return { buttons, byName }
  }

  it('renders the names in SOUND_TOGGLE_LABELS, each with its state', () => {
    // The names are read from SOUND_TOGGLE_LABELS, so the list and the
    // screen cannot disagree. Since the v1.3 R1 fixes each also says ON
    // or OFF (Ken, 21 October 2026): they live in SYSTEM.
    const { buttons } = renderHost()
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([`${SOUND_TOGGLE_LABELS.effects} ON`, `${SOUND_TOGGLE_LABELS.music} ON`])
  })

  it('says ON or OFF, and carries the same state in aria-pressed', () => {
    const { byName } = renderHost()
    const effects = byName(SOUND_TOGGLE_LABELS.effects)
    expect(effects.getAttribute('aria-pressed')).toBe('true')
    act(() => {
      effects.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(effects.getAttribute('aria-pressed')).toBe('false')
    expect(effects.textContent?.trim()).toBe(`${SOUND_TOGGLE_LABELS.effects} OFF`)
  })

  it('silences the graph when effects are switched off, and not before', () => {
    // End to end: React state, the engine, and what reached the graph.
    installGestureUnlock()
    gesture()
    const engine = getAudioEngine()
    const { byName } = renderHost()
    expect(engine.play('hit-stab')).toBe(true)
    act(() => {
      byName(SOUND_TOGGLE_LABELS.effects).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    ctx().reset()
    expect(engine.play('hit-stab'), 'the toggle did not reach the engine').toBe(false)
    expect(ctx().created.length, 'a muted cue still built nodes').toBe(0)
  })

  it('leaves effects alone when only music is switched off', () => {
    installGestureUnlock()
    gesture()
    const engine = getAudioEngine()
    const { byName } = renderHost()
    act(() => {
      byName(SOUND_TOGGLE_LABELS.music).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(engine.play('hit-stab'), 'muting music silenced the effects').toBe(true)
  })

  it('survives a reload', () => {
    // A reload is a fresh module state reading the same storage, which is
    // exactly what this does: the engine is discarded and rebuilt.
    const { byName } = renderHost()
    act(() => {
      byName(SOUND_TOGGLE_LABELS.effects).dispatchEvent(new MouseEvent('click', { bubbles: true }))
      byName(SOUND_TOGGLE_LABELS.music).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(localStorage.getItem(EFFECTS_PREF_KEY)).toBe('off')
    expect(localStorage.getItem(MUSIC_PREF_KEY)).toBe('off')
    resetAudioEngineForTests()
    expect(getAudioEngine().preferences).toEqual({ effects: false, music: false })
    // And the screen comes back showing what was stored, rather than the
    // default it would show if it read the constant instead.
    //
    // UNMOUNTED FIRST, and that is the whole test. Rendering the same
    // component onto the same root reconciles the existing fiber, so the
    // useState initializer never runs again and the values read back are
    // just the React state the clicks already set. Replacing the
    // initializer with the bare defaults passed the first version of this.
    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<Host />))
    const again = [...container.querySelectorAll('button')]
    expect(again.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
  })

  it('defaults both on for a player who has never touched them', () => {
    resetAudioEngineForTests()
    const prefs: SoundPrefs = getAudioEngine().preferences
    expect(prefs).toEqual({ effects: true, music: true })
  })
})

// RETIRED in v2.0 R3, with the pixel board these mounted (ui/Game.tsx and
// ui/cues/Meter.tsx): "the controls that sound themselves" (EXECUTE's one
// sweep from a tap and from the keyboard, the meter's tick and the score's
// crossing of the win line) and "the night sounds the moment it is
// showing" (three real operations played through the board and heard
// moment by moment, the block's own cue, the condition's own alarm, the
// severity handed to the voice, once per moment however often the board
// re-rendered, silence on walking out and while the page is hidden). The
// 3D game plays the same registry from src/ui/three/Game3D.tsx, and needs
// WebGL a test DOM lacks; tests/sound.spec.ts holds the file each row
// names to the sound it says it plays, and the one press that sweeps.
