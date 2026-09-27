// The audio engine, driven against a real graph (Round 4d).
//
// Every assertion here is about what reached the audio graph, not about a
// flag the engine set. "Nothing before a gesture" means no node was ever
// created; "muted" means nothing was scheduled, rather than something
// scheduled into a silent gain. Those are different implementations and
// only one of them is what the brief asks for, so only one of them passes.

import { beforeEach, describe, expect, it } from 'vitest'

import { AudioEngine, EFFECTS_LEVEL, MUSIC_LEVEL, SILENCE_FADE_S, shouldSchedule } from '../src/audio/engine'
import { LEVEL_FADE_S, MUSIC_LAYERS } from '../src/audio/music'
import { DEFAULT_SOUND_PREFS, parseSoundPref, serializeSoundPref } from '../src/audio/prefs'
import { VOICES } from '../src/audio/voices'
import { DUCKS_MUSIC, SOUND_MS, type SoundCue } from '../src/director'
import { FakeAudioContext, FakeGain, FakeOscillator, type FakeNode } from './fakeAudio'

// Every engine in this file gets its context injected and its visibility
// injected, and none of them watches the document: there is no document in
// the node environment, and a test that needed one would be testing the
// wrong layer. The DOM-level guarantees live in tests/sound.dom.spec.tsx.
// What one cue costs on a clean engine. "Nothing was queued" means the
// next cue schedules exactly this and not a backlog with it, which is a
// number rather than "more than zero": a flush that happens on the next
// play rather than on the unlock passes every greater-than assertion.
function footprintOf(cue: SoundCue): number {
  const ctx = new FakeAudioContext()
  const engine = new AudioEngine({
    createContext: () => ctx,
    // Explicitly, for the same reason engineWith does it below: without
    // these this was the one engine in the file taking DEFAULT_SOUND_PREFS
    // (music on) and the REAL setTimeout scheduler, so it built a bed and
    // armed a note timer that outlived the test, directly contradicting
    // the comment on engineWith. The reset below hid the bed's nodes from
    // the count but not the timer from the process.
    prefs: { effects: true, music: false },
    isVisible: () => true,
    watchVisibility: false,
    music: { schedule: () => () => {} },
  })
  engine.unlock()
  ctx.reset()
  engine.play(cue)
  const count = ctx.startedCount()
  engine.dispose()
  return count
}

// MUSIC DEFAULTS TO OFF HERE, and only here (Round 6b).
//
// This file measures the EFFECTS channel against the graph: "nothing was
// queued" and "nothing was replayed" are counts of started nodes, and the
// music bed is nine more started nodes that appear on the unlock and again
// on every return from a hidden page. Left on, it does not make these
// assertions stricter, it makes them wrong: two of them failed the moment
// the bed shipped, for the pad starting rather than for any cue being
// replayed.
//
// So each channel is measured on its own, and the two places that would
// hide are covered on purpose rather than by hope: the bed's own
// visibility and gating behaviour is asserted against the graph in
// tests/music.spec.ts, and the two channels are asserted not to interfere
// with each other in 'the two channels do not move each other' below,
// which runs with BOTH on.
function engineWith(overrides: Partial<{ effects: boolean; music: boolean; visible: boolean }> = {}) {
  const ctx = new FakeAudioContext()
  const engine = new AudioEngine({
    createContext: () => ctx,
    prefs: {
      effects: overrides.effects ?? true,
      music: overrides.music ?? false,
    },
    isVisible: () => overrides.visible ?? true,
    watchVisibility: false,
    music: { schedule: () => () => {} },
  })
  return { ctx, engine }
}

describe('nothing is audible before a gesture (brief section 8)', () => {
  it('creates no audio context at all until something unlocks it', () => {
    let built = 0
    const engine = new AudioEngine({
      createContext: () => {
        built += 1
        return new FakeAudioContext()
      },
      isVisible: () => true,
      watchVisibility: false,
    })
    engine.play('hit-stab')
    engine.play('victory-fanfare')
    expect(built, 'a context was created without a gesture').toBe(0)
    expect(engine.unlocked).toBe(false)
  })

  it('schedules nothing before the unlock and something after it', () => {
    const { ctx, engine } = engineWith()
    expect(engine.play('hit-stab')).toBe(false)
    expect(ctx.startedCount(), 'a sound was scheduled before any gesture').toBe(0)
    engine.unlock()
    expect(engine.play('hit-stab')).toBe(true)
    expect(ctx.startedCount()).toBeGreaterThan(0)
  })

  it('does not queue what it could not play', () => {
    // The policy in src/ui/cues/visibility.ts, said out loud: a cue that
    // was refused is gone, not deferred. Otherwise the first gesture would
    // fire every sound the game wanted to make while it was locked.
    //
    // Checked in both directions, because a queue can flush on the unlock
    // OR on the next cue after it, and the first version of this test saw
    // only the first of those: a mutation that deferred the flush by one
    // call slept straight through it.
    const one = footprintOf('alarm-gnss')
    const { ctx, engine } = engineWith()
    for (let i = 0; i < 5; i += 1) engine.play('alarm-gnss')
    engine.unlock()
    expect(ctx.startedCount(), 'refused cues were replayed on unlock').toBe(0)
    ctx.reset()
    engine.play('alarm-gnss')
    expect(ctx.startedCount(), 'the next cue dragged a backlog along with it').toBe(one)
  })

  it('builds the two buses once, however many gestures arrive', () => {
    let built = 0
    const ctx = new FakeAudioContext()
    const engine = new AudioEngine({
      createContext: () => {
        built += 1
        return ctx
      },
      isVisible: () => true,
      watchVisibility: false,
    })
    engine.unlock()
    engine.unlock()
    engine.unlock()
    expect(built).toBe(1)
    const buses = ctx.created.filter((n) => n instanceof FakeGain && n.connections.includes(ctx.destination))
    expect(buses.length, 'a second unlock built a second pair of buses').toBe(2)
  })

  it('builds exactly two buses, both into the destination', () => {
    // Which bus carries which level is asserted below, against what
    // actually plays through it; this is only the shape.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const buses = ctx.created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination))
    expect(buses.length).toBe(2)
  })
})

describe('the toggles reach the graph', () => {
  it('schedules nothing at all when effects are off', () => {
    const { ctx, engine } = engineWith({ effects: false })
    engine.unlock()
    ctx.reset()
    expect(engine.play('hit-stab')).toBe(false)
    expect(ctx.created.length, 'a muted cue still built nodes').toBe(0)
  })

  it('starts scheduling again the moment effects come back on', () => {
    const { ctx, engine } = engineWith({ effects: false })
    engine.unlock()
    ctx.reset()
    engine.play('hit-stab')
    expect(ctx.startedCount()).toBe(0)
    // MUSIC STAYS OFF ACROSS THIS TRANSITION. It used to be flipped on in
    // the same call, which since Round 6b builds a bed of nine
    // oscillators, so the assertion below passed on the BED starting
    // rather than on the cue being scheduled: the effects toggle could
    // have done nothing at all. Only one preference moves here, which is
    // the whole point of a test about one toggle.
    engine.setPreferences({ effects: true, music: false }, false)
    expect(engine.music, 'music came on and this test is no longer about effects').toBeNull()
    const beforeCue = ctx.startedCount()
    engine.play('hit-stab')
    expect(ctx.startedCount(), 'the cue scheduled nothing after effects came back').toBeGreaterThan(beforeCue)
  })

  it('leaves effects untouched when only music is muted', () => {
    // Two toggles that are secretly one toggle would pass a test that only
    // read the preference back.
    // Music ON to start with, because muting is the transition under test
    // and this file's helper otherwise defaults it off.
    const { ctx, engine } = engineWith({ music: true })
    engine.unlock()
    const musicBus = ctx.created.filter(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination),
    )[1]
    ctx.reset()
    engine.setPreferences({ effects: true, music: false }, false)
    // Read the AUTOMATION, not `.value`. Since Round 6b the bed RAMPS the
    // bus down over LEVEL_FADE_S instead of stepping it, because three
    // sounding pads cut to zero at once is the loudest click the game can
    // make. `.value` is the last value assigned, which is not where the
    // param is heading, and asserting on it would fail a correct fade and
    // pass a hard cut.
    const heading = musicBus.gain.events[musicBus.gain.events.length - 1]
    expect(heading.value, 'muting music did not silence the music bus').toBe(0)
    expect(heading.kind, 'muting music cut the bus rather than fading it').toBe('linear')
    expect(engine.play('resolve-chime')).toBe(true)
    expect(ctx.startedCount(), 'muting music silenced the effects too').toBeGreaterThan(0)
  })

  it('reads and writes the preference as on and off', () => {
    expect(parseSoundPref('on', false)).toBe(true)
    expect(parseSoundPref('off', true)).toBe(false)
    // Anything else is a store that was hand-edited or written by an older
    // version, and falls back rather than throwing.
    expect(parseSoundPref(null, true)).toBe(true)
    expect(parseSoundPref('true', false)).toBe(false)
    expect(parseSoundPref(undefined, DEFAULT_SOUND_PREFS.music)).toBe(DEFAULT_SOUND_PREFS.music)
    expect(serializeSoundPref(true)).toBe('on')
    expect(serializeSoundPref(false)).toBe('off')
  })
})

describe('sound is the third channel of the hidden-page policy', () => {
  it('schedules nothing while the page is hidden', () => {
    const { ctx, engine } = engineWith()
    engine.unlock()
    ctx.reset()
    engine.setVisible(false)
    expect(engine.play('hit-stab')).toBe(false)
    expect(ctx.startedCount(), 'a hidden page still made a sound').toBe(0)
  })

  it('suspends the context on hide and resumes it on return', () => {
    const { ctx, engine } = engineWith()
    engine.unlock()
    const before = { suspend: ctx.suspendCalls, resume: ctx.resumeCalls }
    engine.setVisible(false)
    expect(ctx.suspendCalls).toBe(before.suspend + 1)
    engine.setVisible(true)
    expect(ctx.resumeCalls).toBe(before.resume + 1)
    expect(engine.play('hit-stab')).toBe(true)
  })

  it('opens suspended when the first gesture lands on an already-hidden page', () => {
    const ctx = new FakeAudioContext()
    const engine = new AudioEngine({
      createContext: () => ctx,
      isVisible: () => false,
      watchVisibility: false,
    })
    engine.unlock()
    expect(ctx.suspendCalls, 'unlocking a hidden page left the context running').toBe(1)
    expect(engine.play('data-burst')).toBe(false)
  })

  it('replays nothing to catch up when the page comes back', () => {
    const one = footprintOf('alarm-ransom')
    const { ctx, engine } = engineWith()
    engine.unlock()
    engine.setVisible(false)
    for (let i = 0; i < 4; i += 1) engine.play('alarm-ransom')
    ctx.reset()
    engine.setVisible(true)
    expect(ctx.startedCount(), 'coming back replayed what the player missed').toBe(0)
    // And the first beat after the player returns is one beat, not five.
    engine.play('alarm-ransom')
    expect(ctx.startedCount(), 'the first cue after returning carried the backlog').toBe(one)
  })
})

describe('the decision and the graph agree', () => {
  it('refuses the two non-sounds by name', () => {
    const state = { unlocked: true, effects: true, visible: true }
    expect(shouldSchedule(state, 'silent')).toBe(false)
    expect(shouldSchedule(state, 'placeholder')).toBe(false)
    expect(shouldSchedule(state, 'hit-stab')).toBe(true)
  })

  it('requires all three conditions, not any of them', () => {
    const cue: SoundCue = 'hit-stab'
    expect(shouldSchedule({ unlocked: false, effects: true, visible: true }, cue)).toBe(false)
    expect(shouldSchedule({ unlocked: true, effects: false, visible: true }, cue)).toBe(false)
    expect(shouldSchedule({ unlocked: true, effects: true, visible: false }, cue)).toBe(false)
    expect(shouldSchedule({ unlocked: true, effects: true, visible: true }, cue)).toBe(true)
  })

  it('makes no sound for a silent beat even when everything is allowed', () => {
    const { ctx, engine } = engineWith()
    engine.unlock()
    ctx.reset()
    expect(engine.play('silent')).toBe(false)
    expect(ctx.created.length).toBe(0)
  })
})

describe('the voices themselves', () => {
  const sounding = (Object.keys(VOICES) as SoundCue[]).filter((c) => c !== 'silent' && c !== 'placeholder')

  it('every voice schedules something that starts and stops', () => {
    for (const cue of sounding) {
      const { ctx, engine } = engineWith()
      engine.unlock()
      ctx.reset()
      engine.play(cue)
      expect(ctx.startedCount(), `${cue} scheduled nothing`).toBeGreaterThan(0)
      for (const osc of ctx.oscillators()) {
        expect(osc.started, `${cue} left an oscillator unstarted`).not.toBeNull()
        expect(osc.stopped, `${cue} left an oscillator running forever`).not.toBeNull()
        expect(osc.stopped!, `${cue} stops before it starts`).toBeGreaterThan(osc.started!)
      }
      for (const src of ctx.sources()) {
        expect(src.started, `${cue} left a noise source unstarted`).not.toBeNull()
        expect(src.stopped, `${cue} left noise running forever`).not.toBeNull()
        // The same ordering the oscillators get. Without it a noise burst
        // stopped at its own start time is zero length and silent, which
        // takes the static out of the BLACKOUT CHAIN and the bed out of
        // the surge burn while both non-null checks still pass.
        expect(src.stopped!, `${cue} stops its noise before it starts`).toBeGreaterThan(src.started!)
      }
    }
  })

  it('every voice finishes inside its declared duration', () => {
    // SOUND_MS is what the rest of the game schedules against, so a voice
    // that outruns its own declaration would still be playing when the
    // next beat arrives.
    //
    // Measured from the context's clock at the moment of the call, not
    // from zero: the fake's clock does not start at zero precisely so that
    // this has to be a relative measurement.
    for (const cue of sounding) {
      const { ctx, engine } = engineWith()
      engine.unlock()
      ctx.reset()
      const t0 = ctx.currentTime
      engine.play(cue)
      const ends = [
        ...ctx.oscillators().map((o) => o.stopped ?? 0),
        ...ctx.sources().map((s) => s.stopped ?? 0),
      ]
      const longest = (Math.max(...ends) - t0) * 1000
      expect(longest, `${cue} runs ${longest}ms against a declared ${SOUND_MS[cue]}ms`).toBeLessThanOrEqual(
        SOUND_MS[cue] + 1,
      )
    }
  })

  it('schedules against the clock as it is now, not against zero', () => {
    // The mistake this catches is one character wide: passing 0 instead of
    // ctx.currentTime into the voice. Against a context frozen at zero the
    // two are identical and every assertion in this file agrees with both.
    // Against a context that has been open for a while, which is every
    // real session after the first second, scheduling at zero puts every
    // ramp and every start in the past and the game goes silent.
    const { ctx, engine } = engineWith()
    engine.unlock()
    ctx.reset()
    const first = ctx.currentTime
    engine.play('hit-stab')
    const startedFirst = ctx.oscillators().map((o) => o.started ?? 0)
    expect(Math.min(...startedFirst), 'a cue was scheduled before the current time').toBeGreaterThanOrEqual(first)

    ctx.advance(7)
    ctx.reset()
    engine.play('hit-stab')
    const startedLater = ctx.oscillators().map((o) => o.started ?? 0)
    expect(startedLater.length).toBe(startedFirst.length)
    for (let i = 0; i < startedLater.length; i += 1) {
      expect(startedLater[i] - startedFirst[i], 'the cue did not move with the clock').toBeCloseTo(7, 6)
    }
  })

  it('never schedules a ramp to a value a real AudioParam would refuse', () => {
    // An exponential ramp to zero throws a RangeError in every browser,
    // which is why voices.ts ramps to SILENCE instead. The fake now throws
    // the same way, so this test fails rather than recording the illegal
    // value and passing.
    for (const cue of sounding) {
      const { ctx, engine } = engineWith()
      engine.unlock()
      expect(() => engine.play(cue), `${cue} scheduled a value the browser would reject`).not.toThrow()
    }
  })

  it('every node that makes a sound has a path to the effects bus', () => {
    // A voice that connected straight to the destination would be
    // unmutable. A voice whose oscillator connected to NOTHING would be
    // inaudible, and the first version of this test could not tell the
    // difference: it asked whether any created node connected to the bus,
    // and the envelope gain always does. Deleting the one line that wires
    // an oscillator into its envelope silenced most of the game and left
    // the whole suite green.
    //
    // So the walk is transitive and it starts from the nodes that actually
    // produce audio, not from whatever happened to be created.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const effectsBus = ctx.created.filter((n) => n instanceof FakeGain && n.connections.includes(ctx.destination))[0]
    for (const cue of sounding) {
      ctx.reset()
      engine.play(cue)
      const sources = ctx.sounding()
      expect(sources.length, `${cue} started nothing`).toBeGreaterThan(0)
      for (const node of sources) {
        expect(
          ctx.reaches(node, effectsBus),
          `${cue}: a started ${node.role} has no path to the effects bus, so it is inaudible`,
        ).toBe(true)
        expect(
          ctx.reaches(node, ctx.destination, effectsBus),
          `${cue}: a started ${node.role} reaches the destination without passing the bus, so it cannot be muted`,
        ).toBe(false)
      }
    }
  })

  it('puts each level on the bus that owns it, not merely somewhere', () => {
    // Asserted as a sorted multiset at first, which proved only that the
    // two numbers both appeared: swapping the assignments left every
    // effect in the game nine decibels down with the suite green.
    //
    // Music ON, because since Round 6b the music bus opens at the mix
    // level only when music is actually on, and this test is about which
    // bus carries which level rather than about the preference.
    const { ctx, engine } = engineWith({ music: true })
    engine.unlock()
    const buses = ctx.created.filter(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination),
    )
    expect(buses.length).toBe(2)
    // Identified by what plays through it rather than by creation order,
    // which is the thing under test.
    ctx.reset()
    engine.play('hit-stab')
    const carrying = buses.filter((b) => ctx.sounding().some((n) => ctx.reaches(n, b)))
    expect(carrying.length, 'the effects did not go through exactly one bus').toBe(1)
    expect(carrying[0].gain.value, 'effects are not at the effects level').toBe(EFFECTS_LEVEL)
    const other = buses.find((b) => b !== carrying[0])!
    expect(other.gain.value, 'music is not at the music level').toBe(MUSIC_LEVEL)
    // Bus gains only, which is not loudness. The loudness relationship is
    // joined to an A-weighted render in tests/music.spec.ts; this line only
    // says the effects bus is the higher of the two gains.
    expect(EFFECTS_LEVEL).toBeGreaterThan(MUSIC_LEVEL)
  })

  it('leaves the effects bus audible when music is muted', () => {
    // The inverse of the blind spot this file's header claims to close. A
    // silent gain nobody schedules into is caught; a silent gain that
    // everything is scheduled into was not, so muting the taste toggle
    // could silence the accessibility one with every assertion green.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const buses = ctx.created.filter(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination),
    )
    ctx.reset()
    engine.play('hit-stab')
    const effectsBus = buses.find((b) => ctx.sounding().some((n) => ctx.reaches(n, b)))!
    engine.setPreferences({ effects: true, music: false }, false)
    expect(effectsBus.gain.value, 'muting music turned the effects bus down').toBe(EFFECTS_LEVEL)
    ctx.reset()
    engine.play('hit-stab')
    for (const node of ctx.sounding()) {
      expect(ctx.reaches(node, effectsBus), 'effects stopped reaching an audible bus').toBe(true)
    }
  })

  it('pitches the adversary stab by severity, and only that one', () => {
    const pitchOf = (cue: SoundCue, intensity: number) => {
      const { ctx, engine } = engineWith()
      engine.unlock()
      ctx.reset()
      engine.play(cue, { intensity })
      const osc = ctx.created.find((n): n is FakeOscillator => n instanceof FakeOscillator)
      return osc?.frequency.first() ?? 0
    }
    // The brief: "Hit stab, pitched by severity". A heavier hit lands
    // lower, which is what makes it read as heavier.
    expect(pitchOf('hit-stab', 1)).toBeLessThan(pitchOf('hit-stab', 0))
    // Nothing else varies, so a severity that leaked into another voice
    // would show up here.
    for (const cue of sounding.filter((c) => c !== 'hit-stab')) {
      expect(pitchOf(cue, 0), `${cue} changed pitch with severity`).toBe(pitchOf(cue, 1))
    }
  })
})

describe('a cue in flight can be stopped', () => {
  // The effects bus also sits at gain 1 (EFFECTS_LEVEL is 1), so a cue's
  // own gain cannot be picked out by its value; it is the gain that feeds
  // the bus. Finding it by value returned the bus itself and made the
  // reaping test assert something about a node that is never dropped.
  const busOf = (ctx: FakeAudioContext) =>
    ctx.created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination))[0]
  const cueGainsOf = (ctx: FakeAudioContext, bus: FakeGain) =>
    ctx.created.filter((n): n is FakeGain => n instanceof FakeGain && n.connections.includes(bus))

  it('fades what is playing rather than leaving it to finish', () => {
    // Fire and forget at first, which meant SKIP stopped the beats and not
    // the sound: the BLACKOUT CHAIN's static begins 870ms into a 1500ms
    // cue, so skipping at 300ms still delivered it over the next screen.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const bus = busOf(ctx)
    ctx.reset()
    engine.play('blackout-chain')
    const cueGain = cueGainsOf(ctx, bus)[0]
    expect(cueGain, 'the cue did not get a gain of its own to be stopped by').toBeDefined()
    const before = cueGain!.gain.events.length
    engine.silenceAll()
    const added = cueGain!.gain.events.slice(before)
    expect(added.length, 'silencing scheduled nothing').toBeGreaterThan(0)
    const last = added[added.length - 1]
    expect(last.value, 'the cue was not taken to silence').toBe(0)
    // Ramped, not cut: an instant change to zero clicks.
    expect(last.kind).toBe('linear')
    expect(last.time - ctx.currentTime).toBeCloseTo(SILENCE_FADE_S, 6)
  })

  it('leaves later cues audible, so silencing is not a mute', () => {
    const { ctx, engine } = engineWith()
    engine.unlock()
    const bus = busOf(ctx)
    engine.play('blackout-chain')
    engine.silenceAll()
    ctx.reset()
    expect(engine.play('hit-stab'), 'silencing turned the engine off').toBe(true)
    const fresh = cueGainsOf(ctx, bus)
    expect(fresh.length, 'the next cue got no gain of its own').toBeGreaterThan(0)
    expect(fresh[0].gain.value, 'the next cue opened already faded out').toBe(1)
    expect(ctx.startedCount()).toBeGreaterThan(0)
  })

  it('drops the gain of a cue that has already finished', () => {
    // Otherwise a campaign accumulates one dead node per cue for its whole
    // length, which for a twelve turn game is hundreds.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const bus = busOf(ctx)
    ctx.reset()
    engine.play('soft-tick')
    const first = cueGainsOf(ctx, bus)[0]
    expect(first).toBeDefined()
    expect(first.disconnected, 'the cue was dropped while it was still playing').toBe(false)
    ctx.advance(5)
    engine.play('soft-tick')
    expect(first.disconnected, 'a finished cue kept its node connected').toBe(true)
  })

  it('keeps a cue that is still sounding when the next one starts', () => {
    // The other half of the reap condition, which the test above cannot
    // reach: reap runs at the top of play, so the first cue is checked
    // against an empty list and the assertion holds for any
    // implementation. Reaping unconditionally would cut the BLACKOUT CHAIN
    // dead the moment the next beat fires, which is the exact behaviour
    // the per-cue gain exists to make possible.
    const { ctx, engine } = engineWith()
    engine.unlock()
    const bus = busOf(ctx)
    ctx.reset()
    engine.play('blackout-chain')
    const long = cueGainsOf(ctx, bus)[0]
    expect(long).toBeDefined()
    // A tenth of a second into a cue that runs a second and a half.
    ctx.advance(0.1)
    engine.play('soft-tick')
    expect(long.disconnected, 'the next cue severed one that was still playing').toBe(false)
    expect(cueGainsOf(ctx, bus).length, 'the second cue got no gain of its own').toBe(2)
    // And it does go when its own time comes.
    ctx.advance(3)
    engine.play('soft-tick')
    expect(long.disconnected, 'the long cue was never reaped').toBe(true)
  })
})

describe('disposal', () => {
  let engine: AudioEngine
  let ctx: FakeAudioContext
  beforeEach(() => {
    const made = engineWith()
    engine = made.engine
    ctx = made.ctx
    engine.unlock()
  })

  it('closes the context and stops accepting cues', () => {
    engine.dispose()
    expect(ctx.closeCalls).toBe(1)
    expect(engine.unlocked).toBe(false)
    ctx.reset()
    expect(engine.play('hit-stab')).toBe(false)
    expect(ctx.created.length).toBe(0)
  })
})

// The coverage the scoping above would otherwise have dropped: the DEFAULT
// preferences, both channels on, asserting that neither moves the other.
// Without this, every test in this file runs against a configuration no
// player has, and the interaction between the bed and the cues would be
// tested nowhere at all.
describe('the two channels do not move each other', () => {
  function bothOn() {
    const ctx = new FakeAudioContext()
    const engine = new AudioEngine({
      createContext: () => ctx,
      // The real defaults, not an override: this is what a player gets.
      prefs: { ...DEFAULT_SOUND_PREFS },
      isVisible: () => true,
      watchVisibility: false,
      music: { schedule: () => () => {} },
    })
    return { ctx, engine }
  }

  it('costs a cue exactly the same with the bed playing', () => {
    const alone = footprintOf('hit-stab')
    const { ctx, engine } = bothOn()
    engine.unlock()
    expect(engine.music, 'the default preferences did not start a bed').not.toBeNull()
    ctx.reset()
    engine.play('hit-stab')
    expect(ctx.startedCount(), 'a cue cost a different number of nodes with music on').toBe(alone)
    engine.dispose()
  })

  it('still queues nothing it could not play, with music on', () => {
    const one = footprintOf('alarm-gnss')
    const { ctx, engine } = bothOn()
    for (let i = 0; i < 5; i += 1) engine.play('alarm-gnss')
    engine.unlock()
    ctx.reset()
    engine.play('alarm-gnss')
    expect(ctx.startedCount(), 'the bed carried a backlog of refused cues in with it').toBe(one)
    engine.dispose()
  })

  it('leaves the layers where they were when a cue plays', () => {
    const { engine } = bothOn()
    engine.unlock()
    const bed = engine.music!
    // COUNT THE AUTOMATION, not `.value`. This read `.value` when the
    // production code still wrote it, and the moment that write was
    // removed the comparison became "undefined equals undefined" on both
    // sides: it went vacuous as a side effect of a fix in a different file
    // and nobody noticed until the re-review. The question it means to ask
    // is whether a cue schedules anything on a layer, and scheduling is
    // what the event list holds.
    const counts = () =>
      MUSIC_LAYERS.map((l) => ((bed.layerGain(l.name) as unknown as FakeGain | undefined)?.gain.events ?? []).length)
    const before = counts()
    expect(before.some((n) => n > 0), 'no layer has any automation, so equality proves nothing').toBe(true)
    // Every cue in the game, ducking or not: a duck moves the BUS, never a
    // layer, because a duck is the mix stepping back and a layer is the
    // state of the campaign.
    for (const cue of Object.keys(SOUND_MS) as SoundCue[]) engine.play(cue)
    expect(counts(), 'playing a cue scheduled something on a music layer').toEqual(before)
    engine.dispose()
  })

  // The clipping fix, which shipped in the first fix batch with no guard
  // and slept through its own mutation.
  it('shares each layer level across its oscillators rather than doubling it', () => {
    const { ctx, engine } = bothOn()
    engine.unlock()
    const bed = engine.music!
    // For each layer gain, the gains between it and the oscillators that
    // feed it must bring the summed voices back to unity. Derived by
    // walking the graph: count the oscillators that depend on this layer,
    // and find the gain they share.
    for (const layer of MUSIC_LAYERS) {
      const layerGain = bed.layerGain(layer.name) as unknown as FakeNode
      // carriesTo, not reaches: the layer's LFO reaches this gain through
      // the filter param it modulates, but contributes no amplitude, and
      // counting it as a voice read its depth gain of 160 as a mix level.
      const voices = ctx
        .oscillators()
        .filter((o) => o.started !== null && ctx.carriesTo(o, layerGain) && !o.connections.includes(layerGain))
      if (voices.length < 2) continue
      // Every one of them goes through a shared gain of 1/n, so n voices
      // at unity sum to unity rather than to n.
      for (const osc of voices) {
        const share = osc.connections[0] as FakeGain
        expect(share, `${layer.name}: a voice connects to nothing`).toBeDefined()
        expect(share.gain.value * voices.length, `${layer.name}: ${voices.length} voices sum past full scale`).toBeCloseTo(
          1,
          5,
        )
      }
    }
    engine.dispose()
  })

  // THE ROUND'S CRITICAL DEFECT IN ITS FINAL FORM, and the one fix that
  // still had no guard after two batches.
  //
  // A stopped bed deliberately leaves its LEVEL_FADE ramp on the shared
  // bus so the fade can be heard. Assigning `.value` is itself just
  // another automation event at `now`: it does NOT remove that pending
  // ramp. So a player double-tapping the music toggle inside LEVEL_FADE_S
  // turned music back on onto a bus that was still ramping to zero, and it
  // held there for the rest of the session with a fully built bed fading
  // in underneath it.
  it('survives the music toggle being pressed twice inside one fade', () => {
    const { ctx, engine } = bothOn()
    engine.unlock()
    const bus = ctx.created.filter(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination as unknown as FakeNode),
    )[1]
    expect(bus).toBeDefined()

    engine.setPreferences({ effects: true, music: false }, false)
    expect(engine.music, 'the bed survived being switched off').toBeNull()
    // Inside the fade the off-press left in flight, which is the whole
    // point: advancing past it would make the race impossible to hit.
    ctx.advance(LEVEL_FADE_S / 2)
    engine.setPreferences({ effects: true, music: true }, false)
    expect(engine.music, 'the bed was not rebuilt').not.toBeNull()

    // Nothing on the bus is still heading for silence. The stale ramp has
    // to be CANCELLED, not merely followed by another event: an event
    // written at `now` sorts before a ramp ending later and does not
    // remove it.
    const at = ctx.currentTime
    // effective(), not events: a cancel REMOVES what it cancels, and the
    // raw log keeps it. Reading the log here failed against correct code.
    const pending = bus.gain.effective().filter((e) => e.time >= at)
    expect(pending.length, 'nothing was scheduled for the music bus at all').toBeGreaterThan(0)
    expect(pending[pending.length - 1].value, 'the bus is still heading to silence under a live bed').toBeCloseTo(
      MUSIC_LEVEL,
    )
    expect(
      pending.some((e) => e.value === 0),
      'a ramp to silence is still pending on the bus after music came back on',
    ).toBe(false)
    engine.dispose()
  })

  // The other fix that slept: setPreferences used to react to every
  // change, so touching the EFFECTS toggle abandoned a duck in flight and
  // snapped the music bus back to full level under a playing cue.
  it('does not touch the music bus when only the effects toggle moves', () => {
    const { ctx, engine } = bothOn()
    engine.unlock()
    const bus = ctx.created.filter(
      (n): n is FakeGain => n instanceof FakeGain && n.connections.includes(ctx.destination as unknown as FakeNode),
    )[1]
    const ducking = (Object.keys(SOUND_MS) as SoundCue[]).find((c) => DUCKS_MUSIC[c])!
    engine.play(ducking)
    const mid = bus.gain.events.length
    expect(mid, 'the cue did not duck, so there is no duck to abandon').toBeGreaterThan(0)
    engine.setPreferences({ effects: false, music: true }, false)
    expect(bus.gain.events.length, 'moving the effects toggle rewrote the music bus').toBe(mid)
    expect(engine.music, 'moving the effects toggle tore down the bed').not.toBeNull()
    engine.dispose()
  })
})
