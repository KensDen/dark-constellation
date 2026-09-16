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

import { DEFAULT_SCENARIO } from '../src/content'
import { deriveBeats, soundFor, type Beat, type SoundCue } from '../src/director'
import { beatIntensity } from '../src/audio'
import DirectorView from '../src/director/DirectorView'
import { newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'
import { NO_OP, WIN_SCRIPT } from './scripts'
import HoldButton, { HOLD_MS } from '../src/ui/cues/HoldButton'
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
import { FakeAudioContext, FakeGain, installFakeAudioContext, removeFakeAudioContext } from './fakeAudio'

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

  it('leaves nothing attached when uninstalled before any gesture', () => {
    const uninstall = installGestureUnlock()
    uninstall()
    gesture()
    expect(contexts.length).toBe(0)
  })
})

describe('sound follows the hidden-page policy through the real document event', () => {
  const setHidden = (hidden: boolean) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible')
    document.dispatchEvent(new Event('visibilitychange'))
  }

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

describe('the two toggles are the two chrome words', () => {
  function Host() {
    const [prefs, setPrefs] = useSoundPrefs()
    return <SoundToggles prefs={prefs} onChange={setPrefs} />
  }

  function renderHost() {
    act(() => root.render(<Host />))
    const buttons = [...container.querySelectorAll('button')]
    const byName = (name: string) => {
      const found = buttons.find((b) => b.textContent?.trim() === name)
      if (!found) throw new Error(`no control named ${name}`)
      return found
    }
    return { buttons, byName }
  }

  it('renders exactly the names the chrome budget counts', () => {
    // The budget counts SOUND_TOGGLE_LABELS. If the screen said anything
    // else, the count would be honest about a screen that does not exist.
    const { buttons } = renderHost()
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      SOUND_TOGGLE_LABELS.effects,
      SOUND_TOGGLE_LABELS.music,
    ])
  })

  it('carries its state in aria-pressed rather than in a second word', () => {
    const { byName } = renderHost()
    const effects = byName(SOUND_TOGGLE_LABELS.effects)
    expect(effects.getAttribute('aria-pressed')).toBe('true')
    act(() => {
      effects.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(effects.getAttribute('aria-pressed')).toBe('false')
    expect(effects.textContent?.trim(), 'the label changed, which would cost a word it does not have').toBe(
      SOUND_TOGGLE_LABELS.effects,
    )
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
  it('sweeps once when a pointer press starts, and not again when it completes', () => {
    installGestureUnlock()
    const onConfirm = vi.fn()
    act(() => {
      root.render(<HoldButton label="EXECUTE TURN" holdingLabel="Hold..." onConfirm={onConfirm} />)
    })
    const button = container.querySelector('button')!
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 })
    Object.defineProperty(down, 'pointerId', { value: 1 })
    act(() => {
      button.dispatchEvent(down)
    })
    // The pointerdown is itself the unlocking gesture, so by the time the
    // sweep is asked for the context exists. That ordering is the reason
    // the unlock listens for pointerdown rather than for click.
    expect(contexts.length, 'the press did not unlock the context').toBe(1)
    const started = ctx().startedCount()
    expect(started, 'the ring filled in silence').toBeGreaterThan(0)
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 20)
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(ctx().startedCount(), 'the completed hold swept a second time').toBe(started)
  })

  it('sweeps for a keyboard commit, which has no ring to fill', () => {
    installGestureUnlock()
    const onConfirm = vi.fn()
    act(() => {
      root.render(<HoldButton label="EXECUTE TURN" holdingLabel="Hold..." onConfirm={onConfirm} />)
    })
    const button = container.querySelector('button')!
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(ctx().startedCount(), 'the keyboard commit was silent').toBeGreaterThan(0)
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
    // Brief section 7: "Reduced motion: instant playback, static badges,
    // no strobe, no shake; sound unaffected unless muted." The crossing is
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
          speed="1x"
          onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
            speed="1x"
            onSpeedChange={() => {}}
            onPresented={() => {}}
            onDone={() => {}}
          />,
        )
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
    // HUD update during a long dwell would stutter the sound.
    installGestureUnlock()
    gesture()
    const [only] = twoThreats()
    const props = {
      before: only.before,
      after: only.after,
      beats: [only.beat],
      speed: '1x' as const,
      onSpeedChange: () => {},
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
          speed="1x"
          onSpeedChange={() => {}}
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
          speed="1x"
          onSpeedChange={() => {}}
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
    // caused. Playback also unmounts when it simply ENDS: the last beat's
    // dwell expires, the director reports done, and Game swaps to the
    // aftermath. Silencing on that unmount cut every closing cue longer
    // than its own visual, which at 2x is the whole hum of the defeat
    // sting. Driven to its own end here rather than unmounted by hand,
    // because by-hand unmounting is exactly what cannot tell the two
    // apart.
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
          speed="1x"
          onSpeedChange={() => {}}
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
    // Run the turn out. The view unmounts itself through onDone in the
    // real app; here the callback records that the director got there.
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(finished, 'playback never reached its own end').toBe(true)
    act(() => root.unmount())
    root = createRoot(container)
    const added = cueGain.gain.events.slice(before)
    const ramped = added.some((e) => e.value === 0)
    expect(ramped, 'a playback that finished on its own had its closing cue cut short').toBe(false)
  })

  it('makes no sound at all while the page is hidden, and the beats still advance', () => {
    // The policy's whole claim: the three channels agree. The director
    // holds, and audio schedules nothing rather than queueing it up.
    installGestureUnlock()
    gesture()
    const turn = findTurn()
    act(() => {
      root.render(
        <DirectorView
          before={turn.before}
          after={turn.after}
          beats={turn.beats}
          speed="1x"
          onSpeedChange={() => {}}
          onPresented={() => {}}
          onDone={() => {}}
        />,
      )
    })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    ctx().reset()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(ctx().startedCount(), 'a hidden page kept playing sounds').toBe(0)

    // That zero is produced by the MOTION channel: the director pauses
    // while hidden, so no beat is emitted and the audio layer is never
    // asked. Removing visibility from the audio policy entirely would
    // leave it passing. So the audio half is exercised directly, with the
    // view still mounted and the page still hidden, which is the only way
    // to see that this channel refuses on its own account.
    expect(getAudioEngine().play('hit-stab'), 'the audio channel played behind a hidden page').toBe(false)
    expect(ctx().startedCount(), 'a refused cue still reached the graph').toBe(0)

    // And both channels come back together, which is what "the three
    // channels agree about what a hidden page means" has to mean.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getAudioEngine().play('hit-stab'), 'returning did not restore the audio channel').toBe(true)
  })
})
