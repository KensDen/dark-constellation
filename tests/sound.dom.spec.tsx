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
// toggles are chrome with a word budget, so what matters is the name the
// screen renders, not the constant a module exports.
//
// The engine reaches its context through its own factory here, with no
// test seam: jsdom implements no Web Audio, so installing one IS the
// platform, and the production path runs exactly as it does in a browser.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted above the import of Game, which is what vi.mock requires. The
// frame builds a WebGL renderer jsdom cannot provide, and it renders only
// on the start screen; EXECUTE is on the board (tests/game.dom.spec.tsx
// says why that is safe, and when it stops being).
vi.mock('../src/ui/Constellation', () => ({
  default: () => null,
}))

import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats, soundFor, type Beat, type SoundCue } from '../src/director'
import { LOCK_SHARE, STRIKE_MS } from '../src/ui/board/strike'
import { ACTIONS } from '../src/ui/board/actions'
import { beatIntensity } from '../src/audio'
import DirectorView from '../src/director/DirectorView'
import Game from '../src/ui/Game'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { NO_OP, WIN_SCRIPT } from './scripts'
import Readout from '../src/ui/cues/Meter'
import SoundToggles from '../src/ui/cues/SoundToggles'
import { SOUND_TOGGLE_LABELS } from '../src/ui/brief'
import {
  EFFECTS_PREF_KEY,
  MUSIC_PREF_KEY,
  getAudioEngine,
  installGestureUnlock,
  resetAudioEngineForTests,
  useSoundPrefs,
  type SoundPrefs,
} from '../src/audio'
import {
  FakeAudioContext,
  FakeGain,
  FakeOscillator,
  installFakeAudioContext,
  removeFakeAudioContext,
  type FakeNode,
} from './fakeAudio'

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
    // or OFF (Ken, 21 October 2026): they live in SYSTEM, off the board's
    // counted chrome.
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

describe('the controls that sound themselves', () => {
  // EXECUTE as the board renders it. It has been a plain button since v1.3
  // Round 0 (brief 4: "EXECUTE ends the turn"), and Game plays the sweep in
  // its click, so the fixture is Game itself rather than a control on its
  // own: the HoldButton these cases used to render is gone, and the sweep
  // with it moved from the start of a hold to the commit.
  function renderBoard(): HTMLButtonElement {
    act(() => {
      root.render(
        <Game initial={{ state: newGame(DEFAULT_SCENARIO, 20260712, 'standard'), phase: 'brief' as never }} onExit={() => {}} />,
      )
    })
    const execute = container.querySelector<HTMLButtonElement>('button[data-execute]')
    if (!execute) throw new Error('the board renders no EXECUTE control')
    return execute
  }

  // The sweep's lead voice as the engine builds it, measured rather than
  // copied out of voices.ts: an oscillator's type and opening pitch are what
  // tell it apart from the beats and the bed in the same recording.
  // Measured AFTER the case has taken its copies, since it clears the
  // recording to read the sweep alone.
  const voiceOf = (o: FakeOscillator) => `${o.type}@${o.frequency.first()}`
  function sweepVoice(): string {
    ctx().reset()
    getAudioEngine().play('execute-sweep')
    const lead = ctx().oscillators()[0]
    expect(lead, 'the sweep builds no oscillator, so nothing here can find it').toBeDefined()
    ctx().reset()
    return voiceOf(lead!)
  }
  const sweepsIn = (nodes: FakeNode[], voice: string) =>
    nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator && voiceOf(n) === voice).length

  it('sweeps once when EXECUTE is tapped, and not again as the turn it ends plays out', () => {
    installGestureUnlock()
    const execute = renderBoard()
    expect(contexts.length, 'a context existed before the tap').toBe(0)
    // A tap as a browser delivers it. It is the session's first gesture, so
    // the context does not exist until the tap itself builds it; the unlock
    // listens in the capture phase precisely so that happens before the
    // button's own handler asks for the sweep. That ordering is why the
    // first press of a session is not the silent one.
    act(() => {
      execute.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      execute.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
      execute.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })
    expect(contexts.length, 'the tap did not unlock the context').toBe(1)
    const tapped = [...ctx().created]
    // The commit resolves the turn at once and its playback opens. Tapped
    // through to the aftermath, with each strike given time to land, so
    // every beat's sound is in the recording beside the sweep.
    for (let guard = 0; guard < 100; guard += 1) {
      act(() => vi.advanceTimersByTime(STRIKE_MS))
      const next = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next')
      if (!next) break
      act(() => next.click())
    }
    const after = [...container.querySelectorAll('button')].find((b) => /NEXT TURN|FINAL REPORT/.test(b.textContent ?? ''))
    expect(after, 'the tap never ended the turn').toBeDefined()
    const played = [...ctx().created]
    const sweep = sweepVoice()
    expect(sweepsIn(tapped, sweep), 'the tap on EXECUTE did not sweep exactly once').toBe(1)
    expect(sweepsIn(played, sweep), 'the sweep played again as the turn played out').toBe(1)
  })

  it('sweeps for a keyboard commit, and not for the digit that only focuses EXECUTE', () => {
    // A keyboard player commits with Enter or Space on the focused
    // control, which the browser turns into a click with no pointer and a
    // detail of 0. jsdom does not make that click from the key, so both
    // halves are sent as the browser would send them. Before that, the
    // action bar's digit for EXECUTE moves focus to it and commits nothing
    // (a turn should not end on a stray digit), and focusing is not the
    // sound of committing.
    installGestureUnlock()
    const execute = renderBoard()
    const hotkey = ACTIONS.find((a) => a.id === 'resolve')?.hotkey
    expect(hotkey, 'EXECUTE has no digit on the action bar').toBeDefined()
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: hotkey!, bubbles: true }))
    })
    expect(document.activeElement, 'the digit did not move focus to EXECUTE').toBe(execute)
    expect(contexts.length, 'the key did not unlock the context').toBe(1)
    const focused = [...ctx().created]
    act(() => {
      execute.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      execute.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    })
    const committed = [...ctx().created]
    const sweep = sweepVoice()
    expect(sweepsIn(focused, sweep), 'focusing EXECUTE swept as if it had committed').toBe(0)
    expect(sweepsIn(committed, sweep), 'the keyboard commit did not sweep exactly once').toBe(1)
  })

  it('ticks a meter in the direction it moved, and only when it moves', () => {
    installGestureUnlock()
    gesture()
    act(() => root.render(<Readout label="MAI" value={80} max={100} />))
    ctx().reset()
    // A re-render with the same number is not a change.
    act(() => root.render(<Readout label="MAI" value={80} max={100} />))
    expect(ctx().startedCount(), 'an unchanged meter ticked').toBe(0)
    act(() => root.render(<Readout label="MAI" value={74} max={100} />))
    const down = ctx().oscillators().at(-1)
    expect(down, 'a falling meter did not tick').toBeDefined()
    const downPitch = down!.frequency.first()
    ctx().reset()
    act(() => root.render(<Readout label="MAI" value={90} max={100} />))
    const up = ctx().oscillators().at(-1)
    expect(up, 'a rising meter did not tick').toBeDefined()
    // Ordinal, not merely different. The tick's only content is which way
    // the number went, and swapping the two frequencies inverts that while
    // leaving them different, which the first version accepted.
    expect(up!.frequency.first(), 'a rising meter does not sound higher than a falling one').toBeGreaterThan(
      downPitch!,
    )
  })

  it('announces the MAI crossing once, on the crossing and not on the state', () => {
    installGestureUnlock()
    gesture()
    act(() => root.render(<Readout label="MAI" value={80} max={100} warnBelow={70} strobeOnWarn />))
    ctx().reset()
    act(() => root.render(<Readout label="MAI" value={64} max={100} warnBelow={70} strobeOnWarn />))
    const afterCrossing = ctx().startedCount()
    expect(afterCrossing, 'falling through the line was silent').toBeGreaterThan(0)
    // Still low, still falling: the tick fires, the warning does not
    // repeat. Counted rather than asserted as "some sound", because a
    // warning on every render is the failure this guards.
    ctx().reset()
    act(() => root.render(<Readout label="MAI" value={61} max={100} warnBelow={70} strobeOnWarn />))
    expect(ctx().oscillators().length, 'the warning repeated while MAI stayed low').toBe(1)
  })

  it('does not announce a meter that was already low when it mounted', () => {
    installGestureUnlock()
    gesture()
    ctx().reset()
    act(() => root.render(<Readout label="MAI" value={40} max={100} warnBelow={70} strobeOnWarn />))
    expect(ctx().startedCount(), 'mounting below the line blared').toBe(0)
  })

  it('still sounds under reduced motion, which removes motion and not sound', () => {
    // Brief v1.2 section 7: "Reduced motion: playback runs, cues take
    // their static form, meters jump rather than ease, no strobe, no
    // shake; sound unaffected unless muted." The v1.1 wording said
    // "instant playback" here and was corrected when Round 4e decoupled
    // the preference from the speed. The crossing is
    // gated on strobeOnWarn, the prop, rather than on the strobe class the
    // preference removes, and this is the difference between the two.
    //
    // Counted against the same crossing without the preference, rather
    // than asserted as "some sound happened". The falling meter ticks as
    // well as warning, so "greater than zero" was satisfied by the tick
    // alone while the warning had gone silent: a mutation gating this on
    // the strobe class slept straight through the first version.
    const crossing = (reduced: boolean) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduced && query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }))
      act(() => root.render(<Readout label="MAI" value={80} max={100} warnBelow={70} strobeOnWarn />))
      ctx().reset()
      act(() => root.render(<Readout label="MAI" value={64} max={100} warnBelow={70} strobeOnWarn />))
      const voices = ctx().oscillators().length
      const strobed = !!container.querySelector('.dc-strobe')
      act(() => root.unmount())
      root = createRoot(container)
      return { voices, strobed }
    }
    installGestureUnlock()
    gesture()
    const normal = crossing(false)
    const reduced = crossing(true)
    expect(normal.strobed, 'the meter should strobe when motion is allowed').toBe(true)
    expect(reduced.strobed, 'reduced motion still strobed').toBe(false)
    expect(normal.voices, 'the crossing made no sound at all').toBeGreaterThan(1)
    expect(reduced.voices, 'reduced motion silenced the warning as well as the strobe').toBe(normal.voices)
  })

  it('makes no sound at all on the render that first shows a meter', () => {
    // Mounting a readout is not a change, so it must not tick. The guard
    // is that a neutral tone is silent; without it, every meter on the HUD
    // would tick the moment the screen appeared.
    installGestureUnlock()
    gesture()
    ctx().reset()
    act(() => root.render(<Readout label="LINK" value={72} max={100} />))
    expect(ctx().startedCount(), 'the meter ticked as it appeared').toBe(0)
  })

  it('leaves the crossing silent on a meter that has no warning line', () => {
    // Only MAI strobes and only MAI announces; the other three meters
    // share the component and must not inherit its alarm.
    installGestureUnlock()
    gesture()
    act(() => root.render(<Readout label="LINK" value={80} max={100} warnBelow={70} />))
    ctx().reset()
    act(() => root.render(<Readout label="LINK" value={64} max={100} warnBelow={70} />))
    expect(ctx().oscillators().length, 'a meter with no strobe still announced a crossing').toBe(1)
  })
})


describe('playback sounds the beat it is showing', () => {
  // A real turn from a real campaign, chosen for having a beat whose sound
  // is not the kind default: a view that played the beat kind's sound for
  // everything would pass a weaker fixture.
  // A turn carrying a beat whose SUBJECT cue resolves to a different sound
  // from its beat kind's default. That property, not "two sounds
  // somewhere", is what distinguishes a view that reads the cue key from
  // one that reads only the kind; the first version of this fixture
  // selected for the weaker thing and the assertion it fed was weaker
  // still.
  function findTurn(): { before: GameState; after: GameState; beats: Beat[] } {
    for (const seed of [20260712, 4041, 1, 2, 3, 7, 11, 13, 17, 19, 23, 29]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        const beats = deriveBeats(state, after)
        const divergent = beats.some((b) => {
          if (!b.visible) return false
          const subject = soundFor(b.cueKey, b.kind)
          const kind = soundFor(`beat:${b.kind}`, b.kind)
          return !!subject && subject !== 'silent' && subject !== kind
        })
        if (divergent) return { before: state, after, beats }
        state = after
      }
    }
    throw new Error('no turn in the sweep carries a beat whose subject cue differs from its kind cue')
  }

  // Two real threat beats whose effective severities differ, each with the
  // turn it came from, so the view can be opened on either one.
  interface ThreatFixture {
    before: GameState
    after: GameState
    beat: Beat
  }

  function twoThreats(): [ThreatFixture, ThreatFixture] {
    const found = new Map<number, ThreatFixture>()
    for (const seed of [20260712, 4041, 1, 2, 3, 7, 11, 13, 17, 23, 29, 31]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        for (const beat of deriveBeats(state, after)) {
          if (beat.kind !== 'threat' || !beat.visible || !beat.severity) continue
          if (!found.has(beat.severity.effective)) found.set(beat.severity.effective, { before: state, after, beat })
        }
        state = after
      }
      if (found.size > 1) break
    }
    const sorted = [...found.entries()].sort((a, b) => a[0] - b[0])
    if (sorted.length < 2) throw new Error('the sweep produced no two threats of different severity')
    return [sorted[0][1], sorted[sorted.length - 1][1]]
  }

  // A real threat beat that lands on an asset the engine named, which is
  // the beat whose sound the view times to the strike rather than playing
  // at once.
  function landedHit(): ThreatFixture {
    for (const seed of [20260712, 4041, 1, 2, 3, 7, 11, 13, 17, 23, 29, 31]) {
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      while (state.status === 'playing') {
        const after = resolveTurn(state, WIN_SCRIPT[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
        for (const beat of deriveBeats(state, after)) {
          if (beat.kind !== 'threat' || !beat.visible || beat.targetAssetId === undefined) continue
          if ((beat.severity?.effective ?? 0) > 0) return { before: state, after, beat }
        }
        state = after
      }
    }
    throw new Error('the sweep produced no threat that landed on an asset')
  }

  it('plays the sound the registry gives that beat, not the beat kind-s default', () => {
    // The fixture was already selecting turns carrying two different
    // sounds, and then asserting only that something sounded. Resolving
    // every beat through `beat:${kind}` instead of its cue key passed
    // that: it kills the six per-condition alarms outright, which is the
    // brief's "alarm blip, unique per condition", and nothing noticed.
    //
    // Identified by pitch, because the pitch is the only thing about a
    // voice that reaches the graph and differs between the alarms.
    installGestureUnlock()
    gesture()
    const turn = findTurn()
    const subjectBeat = turn.beats.find(
      (b) => b.visible && soundFor(b.cueKey, b.kind) !== soundFor(`beat:${b.kind}`, b.kind),
    )
    expect(subjectBeat, 'the fixture carries no beat whose subject cue differs from its kind cue').toBeDefined()

    const pitchesFor = (cue: SoundCue) => {
      const engine = getAudioEngine()
      ctx().reset()
      engine.play(cue)
      return ctx().oscillators().map((o) => o.frequency.first())
    }
    const subjectPitches = pitchesFor(soundFor(subjectBeat!.cueKey, subjectBeat!.kind)!)
    const kindPitches = pitchesFor(soundFor(`beat:${subjectBeat!.kind}`, subjectBeat!.kind)!)
    expect(subjectPitches, 'the two candidate sounds are indistinguishable, so this proves nothing').not.toEqual(
      kindPitches,
    )

    ctx().reset()
    act(() => {
      root.render(
        <DirectorView
          before={turn.before}
          after={turn.after}
          beats={[subjectBeat!]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    expect(
      ctx().oscillators().map((o) => o.frequency.first()),
      'playback played the beat kind-s default instead of the beat-s own sound',
    ).toEqual(subjectPitches)
  })

  it('schedules the first beat-s own sound as playback opens', () => {
    installGestureUnlock()
    gesture()
    const turn = findTurn()
    ctx().reset()
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
    expect(ctx().startedCount(), 'playback opened in silence').toBeGreaterThan(0)
  })

  it('hands the beat-s own severity to the voice, not a constant', () => {
    // The gap this closes: beatIntensity was tested as a function and the
    // stab was tested as a voice, but nothing connected them, so a view
    // passing a fixed 0.5 to every beat slept through both. Proven by the
    // pitch that reached the graph, since that is the only place the
    // connection is observable.
    //
    // The view is opened once per beat rather than advanced through a
    // turn: playback opens on its first beat, so a one-beat list makes
    // "this beat produced this pitch" exact instead of inferred.
    installGestureUnlock()
    gesture()
    const [light, heavy] = twoThreats()
    const pitchOf = (beat: Beat, turn: { before: GameState; after: GameState }) => {
      ctx().reset()
      act(() => {
        root.render(
          <DirectorView
            before={turn.before}
            after={turn.after}
            beats={[beat]}
            onPresented={() => {}}
            onDone={() => {}}
          />,
        )
      })
      // A hit sounds when it lands, after the lock-on (v1.2 R3).
      act(() => {
        vi.advanceTimersByTime(STRIKE_MS * LOCK_SHARE)
      })
      const osc = ctx().oscillators()[0]
      expect(osc, `the ${beat.id} beat scheduled no tone`).toBeDefined()
      const hz = osc!.frequency.first() ?? 0
      act(() => root.unmount())
      root = createRoot(container)
      return hz
    }
    expect(beatIntensity(light.beat)).toBeLessThan(beatIntensity(heavy.beat))
    const lightHz = pitchOf(light.beat, light)
    const heavyHz = pitchOf(heavy.beat, heavy)
    expect(heavyHz, 'the heavier hit did not land lower, so severity never reached the voice').toBeLessThan(lightHz)
  })

  it('sounds a beat once, however many times the view re-renders it', () => {
    // The identity of the beat object is what makes "once per beat" true.
    // A render that changes nothing else must not re-fire the cue, or a
    // HUD update while the beat is on screen would stutter the sound.
    installGestureUnlock()
    gesture()
    const [only] = twoThreats()
    const props = {
      before: only.before,
      after: only.after,
      beats: [only.beat],
      onPresented: () => {},
      onDone: () => {},
    }
    ctx().reset()
    act(() => root.render(<DirectorView {...props} />))
    const once = ctx().startedCount()
    expect(once, 'the beat made no sound').toBeGreaterThan(0)
    act(() => root.render(<DirectorView {...props} />))
    act(() => root.render(<DirectorView {...props} />))
    expect(ctx().startedCount(), 'a re-render replayed the beat').toBe(once)
  })

  it('stops what it is saying when playback goes away', () => {
    // The BLACKOUT CHAIN runs 1500ms and its static does not begin until
    // 870ms in, so a player who backs out to the menu partway through
    // would otherwise hear it over the menu. Asserted on the graph: the
    // gain carrying the cue is taken to zero.
    installGestureUnlock()
    gesture()
    const [only] = twoThreats()
    // The bus is built at unlock, so it has to be caught before the reset
    // that clears the recording.
    const bus = ctx().created.find(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx().destination),
    )!
    expect(bus, 'the engine never built a bus').toBeDefined()
    ctx().reset()
    act(() => {
      root.render(
        <DirectorView
          before={only.before}
          after={only.after}
          beats={[only.beat]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    const cueGain = ctx().created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))[0]
    expect(cueGain, 'the beat scheduled no cue gain').toBeDefined()
    const before = cueGain.gain.events.length
    act(() => root.unmount())
    root = createRoot(container)
    const added = cueGain.gain.events.slice(before)
    expect(added.length, 'leaving playback scheduled nothing on the cue in flight').toBeGreaterThan(0)
    expect(added[added.length - 1].value, 'the cue was left playing over the next screen').toBe(0)
  })

  it('stops the sound when the player presses SKIP', () => {
    // SKIP drives the director to done, which marks playback finished,
    // which is exactly the state the unmount path deliberately does NOT
    // silence. So skip has to silence on its own account, and nothing
    // proved that it did: the walk-out test unmounts by hand without ever
    // reaching done, so it passes whether skip silences or not.
    installGestureUnlock()
    gesture()
    const [only] = twoThreats()
    const bus = ctx().created.find(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx().destination),
    )!
    ctx().reset()
    act(() => {
      root.render(
        <DirectorView
          before={only.before}
          after={only.after}
          beats={[only.beat]}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    const cueGain = ctx().created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))[0]
    expect(cueGain, 'the beat scheduled no cue gain').toBeDefined()
    const before = cueGain.gain.events.length
    const skip = [...container.querySelectorAll('button')].find((b) => /skip/i.test(b.textContent ?? ''))
    expect(skip, 'the playback view renders no SKIP control').toBeDefined()
    act(() => {
      skip!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const added = cueGain.gain.events.slice(before)
    expect(added.some((e) => e.value === 0), 'SKIP stopped the beats and left the sound playing').toBe(true)
  })

  it('lets a finished playback-s last cue ring out over the aftermath', () => {
    // The other half of the rule above, and the regression that half
    // caused. Playback also unmounts when it simply ENDS: the last beat is
    // tapped past, the director reports done, and Game swaps to the
    // aftermath. Silencing on that unmount cut every closing cue short of
    // its own length, which under the v1.1 dwell at 2x was the whole hum
    // of the defeat sting. Driven to its own end here rather than
    // unmounted by hand, because by-hand unmounting is exactly what cannot
    // tell the two apart.
    installGestureUnlock()
    gesture()
    const [only] = twoThreats()
    const bus = ctx().created.find(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx().destination),
    )!
    ctx().reset()
    let finished = false
    act(() => {
      root.render(
        <DirectorView
          before={only.before}
          after={only.after}
          beats={[only.beat]}
          onPresented={() => {}}
          onDone={() => {
            finished = true
          }}
        />,
      )
    })
    const cueGain = ctx().created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))[0]
    expect(cueGain, 'the beat scheduled no cue gain').toBeDefined()
    const before = cueGain.gain.events.length
    // Run the turn out with the tap that ends it: the one beat is the last
    // beat. The view unmounts itself through onDone in the real app; here
    // the callback records that the director got there.
    const next = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next')
    expect(next, 'the playback view renders no Next control').toBeDefined()
    act(() => {
      next!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(finished, 'playback never reached its own end').toBe(true)
    act(() => root.unmount())
    root = createRoot(container)
    const added = cueGain.gain.events.slice(before)
    const ramped = added.some((e) => e.value === 0)
    expect(ramped, 'a playback that finished on its own had its closing cue cut short').toBe(false)
  })

  it('makes no sound while the page is hidden, even from a hit already on its way, and sounds again on return', () => {
    // Until v1.3 Round 0 the zero here was the MOTION channel's: the
    // director paused while hidden, so no beat was emitted and the audio
    // layer was never asked, and the audio half had to be exercised by
    // hand to be seen at all. Playback no longer pauses, because nothing
    // moves without the player (brief 5.5). But a landed hit is still
    // timed: its stab sounds STRIKE_MS * LOCK_SHARE into the beat, after
    // the lock-on. A phone locked during the lock-on therefore has the
    // view itself asking for the stab behind a hidden page, which is the
    // audio channel refusing on its own account, through the real view.
    installGestureUnlock()
    gesture()
    const hit = landedHit()
    const open = () =>
      act(() => {
        root.render(
          <DirectorView before={hit.before} after={hit.after} beats={[hit.beat]} onPresented={() => {}} onDone={() => {}} />,
        )
      })

    // The control: on a visible page the same beat sounds when it lands, so
    // the zero below is the policy's and not a silent fixture.
    ctx().reset()
    open()
    expect(ctx().startedCount(), 'the hit sounded before it landed').toBe(0)
    act(() => {
      vi.advanceTimersByTime(STRIKE_MS)
    })
    expect(ctx().startedCount(), 'the hit never sounded on a visible page, so this proves nothing').toBeGreaterThan(0)
    act(() => root.unmount())
    root = createRoot(container)

    ctx().reset()
    open()
    act(() => setHidden(true))
    act(() => {
      vi.advanceTimersByTime(STRIKE_MS)
    })
    expect(ctx().startedCount(), 'a hidden page played the hit that landed behind it').toBe(0)

    // And the channel comes back with the page.
    act(() => setHidden(false))
    expect(getAudioEngine().play('hit-stab'), 'returning did not restore the audio channel').toBe(true)
  })
})
