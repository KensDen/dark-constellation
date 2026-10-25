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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted above the import of Game, which is what vi.mock requires. The
// frame builds a WebGL renderer jsdom cannot provide, and it renders only
// on the start screen; EXECUTE is on the board (tests/game.dom.spec.tsx
// says why that is safe, and when it stops being).
vi.mock('../src/ui/Constellation', () => ({
  default: () => null,
}))

import { DEFAULT_SCENARIO } from '../src/content'
import { CONDITION_CUES, EVENT_CUES, MOMENT_CUES, SECTION_6_ROWS, VISUAL_CLASS, outcomeSound, type Moment, type SoundCue } from '../src/cues'
import { LOCK_SHARE, STRIKE_MS } from '../src/ui/board/strike'
import { ACTIONS } from '../src/ui/board/actions'
import { strikeIntensity } from '../src/audio'
import Game from '../src/ui/Game'
import { nightOf, type NightStep } from '../src/ui/night/nightModel'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { CountermeasureId, GameState } from '../src/engine/types'
import { LOSS_SCRIPT, MIXED_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'
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

// The night's modules, loaded once, so Game and the night render from
// them on the first EXECUTE (tests/night-r3.dom.spec.tsx does the same).
beforeAll(async () => {
  await import('../src/ui/night/Night')
  await import('../src/ui/night/cards')
  await import('../src/ui/night/closeCards')
})

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

// The night as a player drives it: a tap, and what it sets off, settled;
// time passing on the night's two clocks (the overlay and the strike);
// which stage is up; and the tap the card on screen asks for.
const q = (sel: string) => container.querySelector(sel)
async function tap(el: Element | null) {
  if (!el) throw new Error('nothing to tap')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  })
  await act(async () => {})
}
async function wait(ms: number) {
  await act(async () => void vi.advanceTimersByTime(ms))
  await act(async () => {})
}
const stage = () =>
  q('[data-intel-file]')
    ? 'intel'
    : (q('[data-night-card]')?.getAttribute('data-night-card') ??
      (q('[data-moving]') ? 'moving' : q('[data-strike-banner]') ? 'strike' : q('[data-dock]') ? 'board' : 'none'))
// FILE IT, HOLD on the debris call, COLLECT or CONTINUE, BEGIN TURN.
const way = () => q('[data-file-it]') ?? q('[data-call="hold"]') ?? q('[data-collect]') ?? q('[data-continue]') ?? q('[data-begin]')

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
  // tell it apart from the night's other sounds and the bed in the same
  // recording.
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

  it('sweeps once when EXECUTE is tapped, and not again as the night it opens plays out', async () => {
    installGestureUnlock()
    const execute = renderBoard()
    await act(async () => {})
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
    // The commit resolves the turn at once and the night opens. Tapped
    // through to BEGIN TURN 2 and the board, with the overlay and each
    // strike given time to run, so every sound of the night (the strikes,
    // the tiles, COLLECT, FILE IT, END OF TURN) is in the recording beside
    // the sweep.
    await act(async () => {})
    let turnEnded = false
    for (let guard = 0; guard < 100 && stage() !== 'board'; guard += 1) {
      await wait(STRIKE_MS)
      if (q('[data-begin]')) turnEnded = true
      const next = way()
      if (next) await tap(next)
    }
    expect(turnEnded, 'the night never reached END OF TURN').toBe(true)
    expect(stage(), 'the tap never ended the turn').toBe('board')
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

describe('the night sounds the moment it is showing', () => {
  // Since v1.3 Round 3 a resolved turn plays as the night (brief 5.5) and
  // not as the director's beats, so every guard that used to open
  // DirectorView on a beat now drives Game itself, as a player does:
  // EXECUTE, COLDVEIL IS MOVING, a strike and its card per move, the
  // intel card on a first meeting, END OF TURN and BEGIN TURN.
  //
  // Music is off throughout, so the bed's own notes are not in the graph
  // these cases read; the effects are what is under test.
  let mounts = 0
  let shownState: GameState | null = null
  function renderGame(state: GameState) {
    mounts += 1
    shownState = state
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={{ state, phase: 'brief' }} onExit={() => {}} />)
    })
  }
  // The same Game again, with nothing changed: a re-render, not a remount.
  function rerender() {
    act(() => {
      root.render(<Game key={`m${mounts}`} initial={{ state: shownState!, phase: 'brief' }} onExit={() => {}} />)
    })
  }
  const reducedMotion = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))

  // Every cue the game asked the engine for, in order, with the file that
  // asked: the first frame of the call under src/ and outside the audio
  // layer, which is where fireCue lives. The night's cards and the HUD's
  // readouts both play through useSound, and the score the night shows
  // moves as each move lands, so the file is the one honest way to tell
  // the night's tick from a meter's. The meters' own rows are proved in
  // the block above.
  interface Heard {
    cue: SoundCue
    from: string
  }
  let heard: Heard[] = []
  let stackLimit = Error.stackTraceLimit
  function listen() {
    const engine = getAudioEngine()
    const play = engine.play.bind(engine)
    vi.spyOn(engine, 'play').mockImplementation((...args: Parameters<typeof play>) => {
      const from = (new Error().stack ?? '')
        .split('\n')
        .map((line) => /\/src\/([\w/.-]+?\.tsx?)\b/.exec(line)?.[1])
        .find((file) => !!file && !file.startsWith('audio/'))
      heard.push({ cue: args[0], from: from ?? '?' })
      return play(...args)
    })
  }
  const take = () => heard.splice(0)
  const METER = 'ui/cues/Meter.tsx'
  const night = (list: Heard[]) => list.filter((h) => h.from !== METER)
  const cues = (list: Heard[]) => list.map((h) => h.cue)

  beforeEach(() => {
    localStorage.setItem(MUSIC_PREF_KEY, 'off')
    resetAudioEngineForTests()
    heard = []
    stackLimit = Error.stackTraceLimit
    Error.stackTraceLimit = 60
  })
  afterEach(() => {
    Error.stackTraceLimit = stackLimit
  })

  // The board before a turn, and the night EXECUTE plays from it with no
  // orders, which is what a fixture rendered on that board and executed
  // at once will see. The boards come from a few seeded operations, so
  // the defenses owned vary.
  interface Board {
    state: GameState
    steps: NightStep[]
    over: GameState['status']
  }
  function* boards(): Generator<Board> {
    for (const script of [WIN_SCRIPT, LOSS_SCRIPT, MIXED_SCRIPT]) {
      for (const seed of [24, 20260712, 1, 2, 3, 4, 5]) {
        let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
        while (state.status === 'playing') {
          const rng = () => turnRng(state.seed, state.turn)
          const next = resolveTurn(state, { ...NO_OP, debris: 'hold' }, rng())
          yield { state, steps: nightOf(state, next).steps, over: next.status }
          state = resolveTurn(state, { debris: 'hold', ...(script[state.turn] ?? NO_OP) }, rng())
        }
      }
    }
  }
  const find = (want: (b: Board) => boolean, what: string): Board => {
    for (const b of boards()) if (want(b)) return b
    throw new Error(`no board in the sweep has ${what}`)
  }
  // The first move of the night lands: the strike these cases time.
  const landsFirst = (b: Board) => b.steps[0]?.kind === 'threat' && b.steps[0].ev.effectiveSeverity > 0

  // EXECUTE pressed on a fresh board, with the night's module settled.
  async function execute(state: GameState) {
    renderGame(state)
    await act(async () => {})
    await tap(q('[data-execute]'))
  }

  describe('over two real operations, one won and one lost', () => {
    // THE BEHAVIOURAL HALF OF tests/sound.spec.ts's wiring test, and the
    // successor of its "real beats" proof: what each moment of a real
    // night sounds like, keyed by the moment that played it, never merged
    // into one set (a merged set let a row pointed at the wrong voice pass
    // whenever some OTHER moment played it). Every step is checked against
    // the engine's own record of the night as it goes, and the treatment
    // each moment claims is checked on the element that shows it: the
    // successor of tests/cues.spec.ts's "plays the visual each beat kind
    // claims, over real play rather than hand-built keys".
    //
    // Seed 1 on STANDARD meets every kind of card with these orders, and the
    // passive line on the same seed loses; seed 4 on the same plan loses
    // the satellite on the conjunction, and the operation. Between them
    // every row of the night is reached, BLACKOUT CHAIN and both debris
    // results included. The plan is scripts/phone-layout.mjs's NIGHT_PLAN,
    // one new defense a night since v1.4 (seeds 24 and 10 until then, with
    // three defenses ordered on turn 2).
    const PLAN: Record<number, CountermeasureId[]> = { 1: ['antiJam'], 2: ['encryptedBackhaul'], 3: ['linkAuth'], 4: ['pntAuth'], 5: ['sensorFusion'], 6: ['groundZeroTrust'] }
    const heardAt = new Map<Moment, SoundCue[]>()
    const endings: GameState['status'][] = []
    let metersHeard = 0
    let shields = 0

    const at = (moment: Moment, list: Heard[]) => heardAt.set(moment, [...(heardAt.get(moment) ?? []), ...cues(list)])
    const shows = (el: Element | null | undefined, moment: Moment, where: string) => {
      const className = VISUAL_CLASS[MOMENT_CUES[moment].visual]
      expect(el, `${where}: nothing on screen carries the ${moment} treatment`).toBeTruthy()
      expect(el!.classList.contains(className), `${where}: ${moment} should show .${className}`).toBe(true)
    }
    // What has played since the last look, all of it attributed, and the
    // readouts' share counted so the filter is known to be doing something.
    const since = () => {
      const all = take()
      for (const h of all) expect(h.from, `${h.cue} was played from a file the stack does not show`).not.toBe('?')
      metersHeard += all.length - night(all).length
      return night(all)
    }

    async function order(ids: CountermeasureId[]) {
      if (!ids.length) return
      await tap(q('[data-action="procure"]'))
      for (const id of ids) await tap(q(`[data-procure-defense="${id}"]`))
      await tap(q('[data-confirm]'))
    }

    async function playOperation(seed: number, plan: Record<number, CountermeasureId[]>) {
      installGestureUnlock()
      gesture()
      listen()
      let state = newGame(DEFAULT_SCENARIO, seed, 'standard')
      renderGame(state)
      await act(async () => {})
      while (state.status === 'playing') {
        const turn = state.turn
        const ids = plan[turn] ?? []
        const next = resolveTurn(state, { ...NO_OP, buyCounters: ids, debris: 'hold' }, turnRng(state.seed, state.turn))
        const steps = nightOf(state, next).steps
        await order(ids)
        take()
        await tap(q('[data-execute]'))
        // COLDVEIL IS MOVING opens on every night, not only the first, to
        // EXECUTE's sweep and nothing of its own.
        expect(stage(), `turn ${turn}: EXECUTE did not open COLDVEIL IS MOVING`).toBe('moving')
        shows(q('[data-moving]'), 'moving', `turn ${turn}`)
        const pressed = since()
        expect(cues(pressed), `turn ${turn}: EXECUTE`).toEqual(['execute-sweep'])
        at('moving', pressed)
        await wait(750)
        // What a tap sets off beyond its own cue belongs to the stage it
        // opens, and is carried there.
        let carried = since()
        expect(cues(carried), `turn ${turn}: the overlay made a sound of its own`).toEqual([])
        for (const [i, step] of steps.entries()) {
          const where = `seed ${seed} turn ${turn} step ${i} (${step.ev.eventId})`
          if (step.kind === 'threat') {
            const landed = step.ev.effectiveSeverity > 0
            expect(stage(), where).toBe('strike')
            expect(cues([...carried, ...since()]), `${where}: the lock-on made a sound`).toEqual([])
            await wait(STRIKE_MS * LOCK_SHARE + 1)
            // A move that lands strikes with the deck's own voice for it;
            // a block sounds like a block, whatever was blocked.
            const struck = since()
            expect(cues(struck), `${where}: the strike`).toEqual([landed ? EVENT_CUES[step.ev.eventId].sound : MOMENT_CUES['strike-block'].sound])
            at(landed ? 'strike-hit' : 'strike-block', struck)
            if (landed) shows(q('[data-strike-banner="hit"]'), 'strike-hit', where)
            else if (q('[data-shield="held"]')) {
              shows(q('[data-shield="held"]'), 'strike-block', where)
              shields += 1
            }
            await wait(STRIKE_MS * (1 - LOCK_SHARE) + 1)
            expect(stage(), where).toBe('hit')
            expect(q('[data-night-card]')!.getAttribute('aria-label'), `${where}: the card is not this step's`).toContain(step.def.name.split(' (')[0])
            expect(cues(since()), `${where}: the hit card arrived with a sound of its own`).toEqual([])
            // One tick per tile as it lands: up for a blocked point, down
            // for one that got through.
            const tiles = [...container.querySelectorAll('[data-tile]')]
            expect(tiles.length, where).toBe(step.ev.baseSeverity + step.ev.chainBonus)
            for (const [k, tile] of tiles.entries()) {
              await wait(k === 0 ? 250 : 220)
              const tick = since()
              const blocked = tile.getAttribute('data-tile') === 'blocked'
              expect(cues(tick), `${where}: tile ${k}`).toEqual([blocked ? 'tick-up' : 'tick-down'])
              at('result-tiles', tick)
              if (blocked) shows(tile, 'result-tiles', `${where} tile ${k}`)
            }
            // Then a new condition sounds its own alarm, or a streak its
            // fanfare; never both, since a streak is a block.
            await wait(220)
            const closing = since()
            const streak = step.ev.effectiveSeverity === 0 && step.streak >= 2
            expect(!!q('[data-streak-line]'), `${where}: the streak line`).toBe(streak)
            if (step.ev.condition) {
              expect(cues(closing), `${where}: the condition`).toEqual([CONDITION_CUES[step.ev.eventId].sound])
              at('condition', closing)
              shows(q('[data-new-condition]')?.parentElement, 'condition', where)
            } else if (streak) {
              expect(cues(closing), `${where}: the streak`).toEqual([MOMENT_CUES.streak.sound])
              at('streak', closing)
              shows(q('[data-streak-line]'), 'streak', where)
            } else expect(cues(closing), `${where}: after the tiles`).toEqual([])
            carried = []
          } else if (step.kind === 'debris') {
            // A decision, not an event: the call arrives quietly.
            expect(stage(), where).toBe('call')
            const call = [...carried, ...since()]
            expect(cues(call), `${where}: the call`).toEqual([])
            at('debris-call', call)
            shows(q('[data-night-card="call"]'), 'debris-call', where)
            await tap(q('[data-call="hold"]'))
            expect(stage(), where).toBe('debris')
            // The result: a safe satellite sounds like a block, a lost one
            // lands like a hit, in the deck's own voice.
            const result = since()
            expect(cues(result), `${where}: the call's result`).toEqual([
              step.ev.debris!.lost ? EVENT_CUES['debris-conjunction'].sound : MOMENT_CUES['debris-result'].sound,
            ])
            at('debris-result', result)
            shows(q('[data-night-card="debris"]'), 'debris-result', where)
          } else {
            expect(stage(), where).toBe('opportunity')
            const chime = [...carried, ...since()]
            expect(cues(chime), `${where}: the opportunity`).toEqual([MOMENT_CUES.opportunity.sound])
            at('opportunity', chime)
            shows(q('[data-night-card="opportunity"]'), 'opportunity', where)
          }
          // The way on: COLLECT and FILE IT on a first meeting, CONTINUE
          // on every later one.
          if (q('[data-collect]')) {
            shows(q('[data-collect]'), 'collect', where)
            await tap(q('[data-collect]'))
            const collected = since()
            expect(cues(collected), `${where}: COLLECT`).toEqual([MOMENT_CUES.collect.sound])
            at('collect', collected)
            expect(stage(), where).toBe('intel')
            shows(q('[data-intel-file]')?.firstElementChild, 'file', where)
            await tap(q('[data-file-it]'))
            const filed = since()
            expect(cues(filed.slice(0, 1)), `${where}: FILE IT`).toEqual([MOMENT_CUES.file.sound])
            at('file', filed.slice(0, 1))
            carried = filed.slice(1)
          } else {
            await tap(q('[data-continue]'))
            carried = since()
          }
        }
        // END OF TURN, or on the last night the operation's own ending.
        const last = next.status !== 'playing'
        expect(stage(), `turn ${turn}: the night did not reach END OF TURN`).toBe('end')
        const closed = [...carried, ...since()]
        expect(cues(closed), `turn ${turn}: END OF TURN`).toEqual([last ? outcomeSound(next.status === 'won') : MOMENT_CUES['end-of-turn'].sound])
        at(last ? 'outcome' : 'end-of-turn', closed)
        for (const row of container.querySelectorAll('[data-ledger-row]')) shows(row, 'end-of-turn', `turn ${turn}`)
        if (last) shows(q('[data-night-card="end"]'), 'outcome', `turn ${turn}`)
        expect(q('[data-begin]')!.textContent, `turn ${turn}`).toBe(last ? 'DEBRIEF' : `BEGIN TURN ${turn + 1}`)
        await tap(q('[data-begin]'))
        const begun = since()
        if (last) {
          // DEBRIEF goes to the score screen, which has sounds of its own;
          // the night has none left.
          expect(cues(begun.filter((h) => h.from.startsWith('ui/night/'))), 'DEBRIEF').toEqual([])
          endings.push(next.status)
        } else {
          expect(cues(begun), `BEGIN TURN ${turn + 1}`).toEqual([MOMENT_CUES['turn-start'].sound])
          at('turn-start', begun)
          expect(stage(), `BEGIN TURN ${turn + 1} did not reach the board`).toBe('board')
          shows(q('[data-intro]'), 'turn-start', `turn ${turn + 1}`)
        }
        state = next
      }
      act(() => root.unmount())
      root = createRoot(container)
      resetAudioEngineForTests()
    }

    it('sounds each moment as the registry says and shows its treatment, and hears every row the night plays', async () => {
      await playOperation(1, PLAN)
      await playOperation(1, {})
      // The same plan on seed 4 holds on the conjunction and loses the
      // satellite, so the debris result's other voice is heard too.
      await playOperation(4, PLAN)
      expect(endings.sort(), 'the operations did not end as their seeds do (won, lost, lost)').toEqual(['lost', 'lost', 'won'])
      expect(metersHeard, 'no readout ticked, so the filter that sets them aside proves nothing').toBeGreaterThan(0)
      expect(shields, 'no block landed on a tile, so the shield went unchecked').toBeGreaterThan(0)

      // Then the table: every section 6 row the night plays was heard at
      // one of its own moments over the two operations, and its partners
      // with it.
      const unheard: string[] = []
      for (const row of SECTION_6_ROWS) {
        if (!row.moments || row.sound === 'silent') continue
        const there = new Set(row.moments.flatMap((m) => heardAt.get(m) ?? []))
        if (row.soundPerSubject === 'condition') {
          // The row stands for a family, so any member heard at its moment
          // is the row; which member is checked per step above.
          const family = new Set(Object.values(CONDITION_CUES).map((c) => c.sound))
          if (![...there].some((s) => family.has(s))) unheard.push(`${row.beat}: no per-condition alarm at ${row.moments.join('/')}`)
          continue
        }
        for (const sound of [row.sound, ...(row.soundPartners ?? [])]) {
          if (!there.has(sound)) unheard.push(`${row.beat}: ${sound} never heard at ${row.moments.join('/')}`)
        }
      }
      expect(unheard.join('\n')).toBe('')
    }, 30_000)
  })

  it('plays the deck-s own alarm for the condition, not the moment-s stand-in', async () => {
    // MOMENT_CUES.condition carries one alarm as the family's stand-in, and
    // a card that played it for every condition would kill the six
    // per-condition alarms outright, which is the brief's "alarm blip,
    // unique per condition". Identified by pitch, because the pitch is the
    // only thing about a voice that reaches the graph and differs between
    // the alarms.
    reducedMotion()
    installGestureUnlock()
    gesture()
    const board = find(
      (b) => !!b.steps[0]?.ev.condition && CONDITION_CUES[b.steps[0].ev.eventId].sound !== MOMENT_CUES.condition.sound,
      'a first move that leaves a condition with an alarm of its own',
    )
    const step = board.steps[0]
    const pitchesFor = (cue: SoundCue) => {
      ctx().reset()
      getAudioEngine().play(cue)
      return ctx().oscillators().map((o) => o.frequency.first())
    }
    const own = pitchesFor(CONDITION_CUES[step.ev.eventId].sound)
    const standIn = pitchesFor(MOMENT_CUES.condition.sound)
    expect(own, 'the two candidate alarms are indistinguishable, so this proves nothing').not.toEqual(standIn)
    // Under reduced motion the card arrives at once and its tiles tick on
    // their own clock; the alarm follows the last of them.
    await execute(board.state)
    expect(stage()).toBe('hit')
    const tiles = container.querySelectorAll('[data-tile]').length
    await wait(250 + tiles * 220 - 1)
    ctx().reset()
    await wait(1)
    expect(
      ctx().oscillators().map((o) => o.frequency.first()),
      'the card played the stand-in instead of the condition-s own alarm',
    ).toEqual(own)
  })

  it('sounds the night-s first move as its strike lands, not in silence and not before', async () => {
    installGestureUnlock()
    gesture()
    await execute(find(landsFirst, 'a first move that lands').state)
    ctx().reset()
    await wait(750)
    expect(stage()).toBe('strike')
    expect(ctx().startedCount(), 'the strike sounded during its lock-on').toBe(0)
    await wait(STRIKE_MS * LOCK_SHARE + 1)
    expect(ctx().startedCount(), 'the first move landed in silence').toBeGreaterThan(0)
  })

  it('hands the move-s own severity to the voice, not a constant', async () => {
    // The gap this closes: strikeIntensity was tested as a function and the
    // stab was tested as a voice, but nothing connected them, so a night
    // passing a fixed 0.5 to every strike would sleep through both. Proven
    // by the pitch that reached the graph, since that is the only place
    // the connection is observable. Two first moves that land with the
    // plain stab and differ only in how much got through.
    installGestureUnlock()
    gesture()
    const found = new Map<number, Board>()
    for (const b of boards()) {
      if (!landsFirst(b) || EVENT_CUES[b.steps[0].ev.eventId].sound !== 'hit-stab') continue
      const effective = b.steps[0].ev.effectiveSeverity
      if (!found.has(effective)) found.set(effective, b)
    }
    const sorted = [...found.entries()].sort((x, y) => x[0] - y[0])
    expect(sorted.length, 'the sweep produced no two strikes of different severity').toBeGreaterThan(1)
    const [light, heavy] = [sorted[0][1], sorted[sorted.length - 1][1]]
    const pitchOf = async (b: Board) => {
      await execute(b.state)
      await wait(750)
      ctx().reset()
      // A hit sounds when it lands, after the lock-on, and the stab is the
      // first voice it builds: the score's readout ticks after it.
      await wait(STRIKE_MS * LOCK_SHARE + 1)
      const osc = ctx().oscillators()[0]
      expect(osc, `${b.steps[0].ev.eventId} scheduled no tone`).toBeDefined()
      act(() => root.unmount())
      root = createRoot(container)
      return osc!.frequency.first() ?? 0
    }
    expect(strikeIntensity(light.steps[0].ev.effectiveSeverity)).toBeLessThan(strikeIntensity(heavy.steps[0].ev.effectiveSeverity))
    const lightHz = await pitchOf(light)
    const heavyHz = await pitchOf(heavy)
    expect(heavyHz, 'the heavier hit did not land lower, so severity never reached the voice').toBeLessThan(lightHz)
  })

  it('sounds a strike and its card once, however many times Game re-renders them', async () => {
    // The strike's sound hangs on its clock and the card's on the card, not
    // on a render: a render that changes nothing must not re-fire either,
    // or a HUD update while a card is up would stutter the sound.
    installGestureUnlock()
    gesture()
    listen()
    const board = find(landsFirst, 'a first move that lands')
    await execute(board.state)
    await wait(750)
    rerender()
    await wait(STRIKE_MS * LOCK_SHARE + 1)
    rerender()
    rerender()
    await wait(STRIKE_MS * (1 - LOCK_SHARE) + 1)
    expect(stage()).toBe('hit')
    // The card's tiles and its closing cue, all of them, then the same
    // card re-rendered with a long wait after.
    await wait(5_000)
    const once = cues(night(take()))
    const voices = ctx().startedCount()
    const strike = EVENT_CUES[board.steps[0].ev.eventId].sound
    expect(once.filter((c) => c === strike).length, 'the strike sounded other than once').toBe(1)
    expect(once.filter((c) => c !== strike && c !== 'execute-sweep').length, 'the card made no sound of its own').toBeGreaterThan(0)
    rerender()
    rerender()
    await wait(5_000)
    expect(cues(night(take())), 'a re-render replayed the card').toEqual([])
    expect(ctx().startedCount(), 'a re-render built new voices').toBe(voices)
  })

  it('sounds the strike with its card under reduced motion, once', async () => {
    // Brief 5.5: under reduced motion the overlay and the strike are
    // skipped and the card arrives at once, so the card is where the
    // strike is heard. Reduced motion removes motion and not sound.
    reducedMotion()
    installGestureUnlock()
    gesture()
    listen()
    const board = find(landsFirst, 'a first move that lands')
    await execute(board.state)
    expect(stage(), 'reduced motion still played the overlay or the strike').toBe('hit')
    const arrived = night(take())
    expect(cues(arrived)).toEqual(['execute-sweep', EVENT_CUES[board.steps[0].ev.eventId].sound])
    rerender()
    await wait(5_000)
    expect(cues(night(take())).filter((c) => c === EVENT_CUES[board.steps[0].ev.eventId].sound), 'the card replayed its strike').toEqual([])
  })

  it('stops what it is saying when the player walks out of the night', async () => {
    // The BLACKOUT CHAIN runs 1500ms and its static does not begin until
    // 870ms in, so a player who leaves the operation partway through (the
    // HUD's SYSTEM stays live over the night, and its title and new
    // operation both unmount it) would otherwise hear it over the next
    // screen. Asserted on the graph: the gain carrying the cue is taken to
    // zero when Game goes away with the night still running.
    installGestureUnlock()
    gesture()
    const board = find(
      (b) => landsFirst(b) && b.steps[0].ev.eventId === 'blackout-chain',
      'a night that opens on a landed BLACKOUT CHAIN',
    )
    // The bus is built at unlock, so it has to be caught before the reset
    // that clears the recording.
    const bus = ctx().created.find((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx().destination))!
    expect(bus, 'the engine never built a bus').toBeDefined()
    await execute(board.state)
    await wait(750)
    ctx().reset()
    await wait(STRIKE_MS * LOCK_SHARE + 1)
    const cueGain = ctx().created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))[0]
    expect(cueGain, 'the strike scheduled no cue gain').toBeDefined()
    const before = cueGain.gain.events.length
    act(() => root.unmount())
    root = createRoot(container)
    const added = cueGain.gain.events.slice(before)
    expect(added.length, 'leaving the night scheduled nothing on the cue in flight').toBeGreaterThan(0)
    expect(added[added.length - 1].value, 'the cue was left playing over the next screen').toBe(0)
  })

  // RETIRED in v1.3 Round 3: "stops the sound when the player presses
  // SKIP". The night has no SKIP: every card waits for a tap and only the
  // overlay and the strike run on a clock (brief 5.5), and the director
  // whose playback SKIP ended is gone.

  it('lets the night-s last cue ring out over the board and the score screen', async () => {
    // The other half of the rule above, and the regression that half once
    // caused. The night also goes away when it simply ENDS: BEGIN TURN
    // plays the next night's intel burst in the same tap that hands the
    // board back, and DEBRIEF leaves END OF TURN while a lost operation's
    // sting is still humming. Silencing on that unmount would cut both
    // short of their own length. Driven to the night's own end, because
    // unmounting by hand is exactly what cannot tell the two apart.
    reducedMotion()
    installGestureUnlock()
    gesture()
    const bus = ctx().created.find((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx().destination))!
    const cueGains = (nodes: FakeNode[]) => nodes.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))
    for (const [what, board] of [
      ['BEGIN TURN', find((b) => b.over === 'playing' && b.steps.length > 0, 'a night the operation survives')],
      ['DEBRIEF', find((b) => b.over === 'lost', 'a night that loses the operation')],
    ] as const) {
      await execute(board.state)
      let mark = 0
      for (let i = 0; i < 20 && stage() !== 'end'; i += 1) {
        mark = ctx().created.length
        await tap(way())
      }
      expect(stage(), `${what}: the night never reached END OF TURN`).toBe('end')
      // The closing cue, in flight from the card's arrival (the lost
      // operation's sting among them), and BEGIN TURN's burst on its tap.
      const closing = cueGains(ctx().created.slice(mark))
      expect(closing.length, `${what}: END OF TURN arrived in silence, so this proves nothing`).toBeGreaterThan(0)
      const counts = new Map(cueGains(ctx().created).map((g) => [g, g.gain.events.length]))
      await tap(q('[data-begin]'))
      expect(q('[data-night-card]'), `${what}: the night is still up`).toBeNull()
      const cut = cueGains(ctx().created).filter((g) => g.gain.events.slice(counts.get(g) ?? 0).some((e) => e.value === 0))
      expect(cut.length, `${what}: a night that finished on its own had its closing cue cut short`).toBe(0)
      act(() => root.unmount())
      root = createRoot(container)
    }
  })

  it('makes no sound while the page is hidden, even from a strike already on its way, and sounds it on return', async () => {
    // A strike is timed: its sound comes STRIKE_MS * LOCK_SHARE in, after
    // the lock-on. Since v1.3 Round 3 the night's two clocks stop while
    // the tab is hidden (brief 8.3), so a phone locked during the lock-on
    // neither sounds the strike behind the lock screen nor skips it: the
    // player comes back to the strike, and hears it land. (The audio
    // channel refuses on its own account as well; the block above proves
    // that through the real document event.)
    installGestureUnlock()
    gesture()
    const board = find(landsFirst, 'a first move that lands')

    // The control: on a visible page the same strike sounds when it lands,
    // so the zero below is the policy's and not a silent fixture.
    await execute(board.state)
    await wait(750)
    ctx().reset()
    await wait(STRIKE_MS)
    expect(ctx().startedCount(), 'the strike never sounded on a visible page, so this proves nothing').toBeGreaterThan(0)
    act(() => root.unmount())
    root = createRoot(container)

    await execute(board.state)
    await wait(750)
    ctx().reset()
    act(() => setHidden(true))
    await wait(STRIKE_MS * 3)
    expect(ctx().startedCount(), 'a hidden page played the strike that landed behind it').toBe(0)
    expect(stage(), 'the strike ran on behind a hidden page').toBe('strike')

    // And the strike comes back with the page, and lands.
    act(() => setHidden(false))
    expect(getAudioEngine().play('hit-stab'), 'returning did not restore the audio channel').toBe(true)
    ctx().reset()
    await wait(STRIKE_MS * LOCK_SHARE + 1)
    expect(ctx().startedCount(), 'the strike never landed once the page came back').toBeGreaterThan(0)
  })
})
