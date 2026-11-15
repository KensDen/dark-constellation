// Sound cue coverage (Round 4d, brief section 8: "every event, condition
// and countermeasure ID in the content data resolves to a visual cue and a
// sound cue; fails the build otherwise").
//
// This is the visual coverage test's twin, and deliberately built the same
// way: the registry is walked, the section 6 table is checked against the
// code rather than against a claim, and a placeholder anywhere fails. The
// registry is hand-keyed, so a new deck entry fails here until somebody
// decides what it sounds like.
//
// Since v1.3 Round 3 the registry is src/cues.ts, keyed by the night's
// moments (brief 5.5 and 8.4) rather than the retired director's beat
// kinds. This file holds the node half: the registry, the table, and the
// file each row says plays it.
//
// Since v2.0 R3 the files are the 3D game's (src/ui/three). The 3D game
// needs WebGL, which no test DOM has, so a real night is not played here:
// that each row sounds at its moment is held by reading the file the row
// names, as below.
//
// Since v2.0 R3 (Ken's ruling of 15 November 2026: voices for the threats)
// each threat has a voice of its own (THREAT_VOICES), played as its strike
// leaves. The registry half is held here: one voice a threat, none twice,
// a ceiling for the family. That each voice is a graph of its own and that
// sound off schedules none of it is in tests/audio-engine.spec.ts; that
// each sits in the mix is in tests/music.spec.ts, against the record.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  CONDITION_CUES,
  EVENT_CUES,
  LONG_SOUNDS,
  MOMENTS,
  MOMENT_CUES,
  SECTION_6_ROWS,
  SOUND_MS,
  THREAT_VOICES,
  THREAT_VOICE_CEILING_MS,
  outcomeSound,
  resolveCue,
  strikeSound,
  type Cue,
  type SoundCue,
} from '../src/cues'
import { VOICES } from '../src/audio/voices'
import { strikeIntensity, MAX_EFFECTIVE_SEVERITY, NEUTRAL_INTENSITY } from '../src/audio/intensity'
import { SOUND_TOGGLE_LABELS, SYSTEM_CONTROLS } from '../src/ui/systemControls'
import { playMotif } from '../src/ui/three/sounds3d'
import { nightOf } from '../src/ui/night/nightModel'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAIN_BONUS, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const ALL_CUES: [string, Record<string, Cue>][] = [
  ['moment', MOMENT_CUES as unknown as Record<string, Cue>],
  ['event', EVENT_CUES],
  ['condition', CONDITION_CUES],
]

const events = DEFAULT_SCENARIO.events
// Every event that leaves a condition: ThreatEvent.condition since v1.3
// Round 0, which replaced the rolled duration with a fixed clock.
const conditionEvents = events.filter((e) => e.condition)
// The deck's threats: every event that is not an opportunity.
const threats = events.filter((e) => (e.kind ?? 'threat') === 'threat')
// The voices written for the threats in v2.0 R3: the family, less the one
// member that is older than it (BLACKOUT CHAIN's set piece).
const ownVoices = new Set<string>(Object.values(THREAT_VOICES).filter((v) => v !== 'blackout-chain'))

// The brief's own ceiling: "Effects are 400 ms or shorter."
const EFFECT_CEILING_MS = 400

function* playTurns(seed: number, script: Record<number, TurnActions>) {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing') {
    const next = resolveTurn(state, script[state.turn] ?? NO_OP, turnRng(state.seed, state.turn))
    yield { before: state, after: next } as { before: GameState; after: GameState }
    state = next
  }
}

// The file a row says plays it: the first word of soundWhere, which may
// carry a note after it.
const soundFile = (soundWhere: string) => soundWhere.split(' ')[0]

const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')

describe('sound cue coverage (Round 4d)', () => {
  it('leaves no sound placeholder anywhere in the registry', () => {
    const unfinished: string[] = []
    for (const [ns, map] of ALL_CUES) {
      for (const [id, entry] of Object.entries(map)) {
        if (entry.sound === 'placeholder') unfinished.push(`${ns}:${id}`)
      }
    }
    expect(unfinished.join(', ')).toBe('')
  })

  it('backs every sound in the registry with a voice that exists', () => {
    const missing: string[] = []
    for (const [ns, map] of ALL_CUES) {
      for (const [id, entry] of Object.entries(map)) {
        if (typeof VOICES[entry.sound] !== 'function') missing.push(`${ns}:${id} -> ${entry.sound}`)
      }
    }
    expect(missing.join(', ')).toBe('')
  })

  it('declares a duration for every voice and a voice for every duration', () => {
    const sounds = Object.keys(VOICES) as SoundCue[]
    expect(sounds.length).toBeGreaterThan(0)
    for (const sound of sounds) {
      expect(SOUND_MS, `${sound} has no declared duration`).toHaveProperty(sound)
      expect(Number.isFinite(SOUND_MS[sound]), `${sound} duration is not a number`).toBe(true)
    }
    expect(Object.keys(SOUND_MS).sort()).toEqual(sounds.sort())
  })

  it('holds every effect to the brief-s four hundred millisecond ceiling', () => {
    // Section 7: "Effects are 400 ms or shorter." The two sequences the
    // brief writes as sequences are named in LONG_SOUNDS with a reason, so
    // an effect that grew past the ceiling by accident cannot hide among
    // them. Since v2.0 R3 a threat's own voice is a phrase with a ceiling
    // of its own (THREAT_VOICE_CEILING_MS), one rule for the family: it is
    // held to that below, and is exempt from this one only by being in
    // the registry's map of the threats' voices.
    const over: string[] = []
    for (const [sound, ms] of Object.entries(SOUND_MS)) {
      if (ms <= EFFECT_CEILING_MS) continue
      if (LONG_SOUNDS[sound]) continue
      if (ownVoices.has(sound)) continue
      over.push(`${sound} at ${ms}ms`)
    }
    expect(over.join(', ')).toBe('')
    // And the exemptions are real: a name in LONG_SOUNDS that is not
    // actually long is an exemption nobody needs, which would let a later
    // edit grow it silently.
    for (const [sound, why] of Object.entries(LONG_SOUNDS)) {
      expect(SOUND_MS, `${sound} is exempted but is not a declared voice`).toHaveProperty(sound)
      expect(SOUND_MS[sound as SoundCue], `${sound} is exempted but is within the ceiling`).toBeGreaterThan(
        EFFECT_CEILING_MS,
      )
      expect(why.length, `${sound} is exempted with no reason`).toBeGreaterThan(20)
    }
  })

  it('gives every condition its own alarm', () => {
    // The brief's row says "Alarm blip, unique per condition". Derived
    // from the data rather than asserted: the number of distinct alarms
    // equals the number of condition-bearing events.
    const alarms = Object.values(CONDITION_CUES).map((c) => c.sound)
    expect(alarms.length).toBe(conditionEvents.length)
    expect(new Set(alarms).size, `two conditions share an alarm: ${alarms.join(', ')}`).toBe(conditionEvents.length)
  })

  it('uses every declared voice at least once', () => {
    // Everything that can play a sound contributes: the registry, the
    // section 6 table with the partners each row owns, and each threat's
    // own voice (THREAT_VOICES, played by src/ui/three/sounds3d.ts; through
    // v2.0 R2 that file's motifs stood here). The meter's two maps stood
    // here until the pixel board's meters left in v2.0 R3. A voice nothing
    // reaches is either dead or a wiring that was never finished, and the
    // 4b lesson was that dead code should be removed rather than tested.
    const used = new Set<string>(SECTION_6_ROWS.flatMap((r) => [r.sound, ...(r.soundPartners ?? [])]))
    for (const [, map] of ALL_CUES) for (const entry of Object.values(map)) used.add(entry.sound)
    for (const voice of Object.values(THREAT_VOICES)) used.add(voice)
    for (const sound of Object.keys(VOICES)) {
      if (sound === 'placeholder') continue
      expect(used.has(sound), `voice ${sound} is declared but nothing ever plays it`).toBe(true)
    }
  })

  it('has a real sound for every row of section 6, in a file that exists', () => {
    for (const row of SECTION_6_ROWS) {
      expect(row.sound, `${row.beat} has a placeholder sound`).not.toBe('placeholder')
      expect(typeof VOICES[row.sound], `${row.beat} names a sound with no voice`).toBe('function')
      // A row played from nowhere is a row that owes its sound, and must
      // say so rather than pass as done.
      if (row.soundWhere === 'none') {
        expect(row.deferred, `${row.beat} plays from nowhere and does not say what it owes`).toBeTruthy()
        continue
      }
      const file = soundFile(row.soundWhere)
      expect(existsSync(join(SRC, file)), `${row.beat} plays from ${row.soundWhere}, which does not exist`).toBe(true)
    }
  })

  it('wires every section 6 row to the file it says plays its sound', () => {
    // The file a row names must play the row's sound, which the game's
    // files do in one of three ways: by name ('buy-click'), through the
    // registry entry of one of the row's own moments whose sound it is
    // (MOMENT_CUES.opportunity, MOMENT_CUES['end-of-turn']), or through the
    // helper that resolves it per subject (strikeSound for a strike,
    // outcomeSound for the last dawn, CONDITION_CUES for the alarm
    // family). Checked per row against the row's own moments: a merged
    // set let a row pointed at the wrong voice pass whenever some OTHER
    // row's moment played it, which is how the surge row once passed while
    // pointing at the persistence tick.
    const helpers: [string, Set<SoundCue>][] = [
      ['strikeSound', new Set(events.flatMap((e) => [strikeSound(e.id, true), strikeSound(e.id, false)]))],
      ['outcomeSound', new Set([outcomeSound(true), outcomeSound(false)])],
    ]
    const unwired: string[] = []
    let viaRegistry = 0
    for (const row of SECTION_6_ROWS) {
      if (row.sound === 'silent' || row.soundWhere === 'none') continue
      const source = withoutComments(readFileSync(join(SRC, soundFile(row.soundWhere)), 'utf8'))
      if (row.soundPerSubject === 'condition') {
        // The row stands for a family; the members are the registry's, and
        // the file must play the member for the condition at hand.
        const family = new Set(Object.values(CONDITION_CUES).map((c) => c.sound))
        if (!/\bCONDITION_CUES\[/.test(source)) unwired.push(`${row.beat}: ${row.soundWhere} never plays a per-condition alarm`)
        // And the row's own declared sound is a member of the family it
        // stands for. Without this the one field this branch exists to
        // describe went unread: the row could name the defeat sting and
        // nothing would notice.
        if (!family.has(row.sound)) {
          unwired.push(`${row.beat}: names ${row.sound}, which is not a member of the family it stands for`)
        }
        continue
      }
      if (row.soundPerSubject === 'threat') {
        // The same shape one family over: the file must play the voice of
        // the threat at hand, out of the registry's map and through the
        // play it is handed, and the row's stand-in must be a member.
        if (!/\bplay\(\s*THREAT_VOICES\[/.test(source) && !/=\s*THREAT_VOICES\[[\s\S]*?\bplay\(/.test(source)) {
          unwired.push(`${row.beat}: ${row.soundWhere} never plays a threat's own voice`)
        }
        if (!ownVoices.has(row.sound)) {
          unwired.push(`${row.beat}: names ${row.sound}, which is not one of the threats' own voices`)
        }
        continue
      }
      const byName = new RegExp(`['"\`]${row.sound}['"\`]`).test(source)
      const byMoment = (row.moments ?? []).some(
        (m) => MOMENT_CUES[m].sound === row.sound && new RegExp(`MOMENT_CUES(\\.${m}\\b|\\[\\s*'${m}'\\s*\\])`).test(source),
      )
      const byHelper = helpers.some(([name, sounds]) => sounds.has(row.sound) && new RegExp(`\\b${name}\\(`).test(source))
      if (byMoment || byHelper) viaRegistry += 1
      if (!byName && !byMoment && !byHelper) unwired.push(`${row.beat}: ${row.soundWhere} never plays ${row.sound}`)
    }
    expect(unwired.join('\n')).toBe('')
    expect(viaRegistry, 'no row is played through the registry, so the indirect proofs are untested').toBeGreaterThan(3)
  })

  // RETIRED in v1.3 Round 0: the record of which rows could still sound at
  // INSTANT speed. INSTANT is gone with the speed control, every turn now
  // plays its beats, and no row has a speed at which it falls silent.

  it('names only real moments, and sounds each row as one of its moments does', () => {
    // A row the night plays names the moments that carry it. Each moment
    // is a real one, and the row's sound is the registry's for one of
    // them, or one a helper picks for it (the deck's own voice for a
    // strike, the sting for a lost operation, the alarm of the condition
    // at hand). The one row that sounds unlike its moment is the press
    // that begins the night: its sweep is the press's own, and the moment
    // it opens, COLDVEIL IS MOVING, is itself silent. Until v2.0 R3 this
    // also held the split between the night's files and the board's; the
    // 3D game plays the plan and the night from one file.
    const perSubject = new Set<SoundCue>([
      ...events.flatMap((e) => [strikeSound(e.id, true), strikeSound(e.id, false)]),
      outcomeSound(true),
      outcomeSound(false),
      ...Object.values(CONDITION_CUES).map((c) => c.sound),
    ])
    let named = 0
    for (const row of SECTION_6_ROWS) {
      if (!row.moments) continue
      named += 1
      expect(row.moments.length, `${row.beat} names an empty list of moments`).toBeGreaterThan(0)
      for (const moment of row.moments) {
        expect(MOMENTS, `${row.beat} names a moment the night does not play: ${moment}`).toContain(moment)
      }
      const asMoment = row.moments.some((m) => MOMENT_CUES[m].sound === row.sound)
      if (asMoment || perSubject.has(row.sound)) continue
      expect(row.moments, `${row.beat} sounds like none of the moments it names`).toEqual(['moving'])
      expect(MOMENT_CUES.moving.sound, 'the night falling makes a sound of its own beside the sweep').toBe('silent')
    }
    expect(named, 'no row names a moment, so the agreement above proves nothing').toBeGreaterThan(8)
  })

  it('sounds the two campaign outcomes differently', () => {
    // One moment covers both endings, so the registry alone cannot tell
    // them apart: outcomeSound does, and the two rows agree with it.
    expect(outcomeSound(true)).toBe('victory-fanfare')
    expect(outcomeSound(false)).toBe('defeat-sting')
    expect(outcomeSound(true)).not.toBe(outcomeSound(false))
    expect(MOMENT_CUES.outcome.sound, 'the registry entry is the won one').toBe(outcomeSound(true))
    const row = (beat: string) => SECTION_6_ROWS.find((r) => r.beat === beat)
    expect(row('Campaign won')?.sound).toBe(outcomeSound(true))
    expect(row('Campaign lost')?.sound).toBe(outcomeSound(false))
  })

  it('lets the strike own the sound where the move would say the wrong thing', () => {
    // A block is the same win whatever was blocked (brief 5.5): a block
    // that played the move's own voice would announce the threat at the
    // moment it was stopped. The signature move is the one that matters,
    // since its landed voice is a sequence of its own.
    expect(strikeSound('blackout-chain', false)).toBe('all-clear')
    expect(strikeSound('pnt-jamming', false)).toBe('all-clear')
    // But a move that lands keeps the deck's own voice for it, which is
    // the whole point of the deck carrying one.
    expect(strikeSound('blackout-chain', true)).toBe('blackout-chain')
    expect(strikeSound('pnt-jamming', true)).toBe('hit-stab')
    for (const ev of events) {
      expect(strikeSound(ev.id, true), `${ev.id} lands with a voice the deck does not give it`).toBe(EVENT_CUES[ev.id].sound)
      expect(strikeSound(ev.id, false), `a block of ${ev.id} does not sound like a block`).toBe(MOMENT_CUES['strike-block'].sound)
    }
    // And an attaching condition keeps its own alarm, which is the whole
    // point of there being six of them.
    expect(CONDITION_CUES['pnt-jamming'].sound).toBe('alarm-gnss')
    expect(CONDITION_CUES['ground-ransomware'].sound).toBe('alarm-ransom')
  })

  it('returns nothing for a cue key it does not know', () => {
    expect(resolveCue('event:not-real')?.sound).toBeUndefined()
    expect(resolveCue('nonsense')?.sound).toBeUndefined()
    // A strike for a move the deck does not know still sounds like a
    // strike, rather than like nothing: the night never strikes in silence.
    expect(strikeSound('not-real', true)).toBe(MOMENT_CUES['strike-hit'].sound)
  })

  it('carries a sound for every moment the night plays', () => {
    for (const moment of MOMENTS) {
      const sound = MOMENT_CUES[moment].sound
      expect(sound, `moment ${moment} has no sound`).not.toBe('placeholder')
      expect(typeof VOICES[sound], `moment ${moment} names a sound with no voice`).toBe('function')
    }
  })
})

describe("the threats' own voices, in the registry (v2.0 R3)", () => {
  it('gives every threat in the deck exactly one voice, and no voice to anything else', () => {
    // Keyed by event id, by hand. A threat added to the deck fails here
    // until someone decides what it sounds like, and a key left behind by
    // a threat that was cut fails too. An opportunity has no voice: it is
    // not a strike, and it arrives on the resolve chime.
    expect(threats.length, 'the deck has no threats, so this asserts nothing').toBeGreaterThan(0)
    expect(threats.length, 'the deck has no opportunities, so the filter proves nothing').toBeLessThan(events.length)
    expect(Object.keys(THREAT_VOICES).sort()).toEqual(threats.map((e) => e.id).sort())
    for (const ev of threats) {
      const voice = THREAT_VOICES[ev.id]
      expect(typeof VOICES[voice], `${ev.id} names ${voice}, which has no voice`).toBe('function')
      expect(SOUND_MS[voice], `${ev.id} names ${voice}, which declares no length`).toBeGreaterThan(0)
    }
  })

  it('gives no two threats the same voice', () => {
    const voices = Object.values(THREAT_VOICES)
    expect(new Set(voices).size, `two threats share a voice: ${voices.join(', ')}`).toBe(threats.length)
  })

  it('names each voice for its threat, and borrows none', () => {
    // The point of the round: through v2.0 R2 a threat was heard as a
    // rhythm of voices that belong to other moments (alarm blips, ticks,
    // the buy click). A threat's voice now belongs to it and to nothing
    // else: no moment, event or condition in the registry plays one, and
    // only the row that stands for the family names one. The one voice
    // that is not new is BLACKOUT CHAIN's, the set piece, which is the
    // same sequence leaving as landing.
    const elsewhere = new Set<string>()
    for (const [, map] of ALL_CUES) for (const entry of Object.values(map)) elsewhere.add(entry.sound)
    for (const row of SECTION_6_ROWS) {
      if (row.soundPerSubject === 'threat') continue
      elsewhere.add(row.sound)
      for (const partner of row.soundPartners ?? []) elsewhere.add(partner)
    }
    for (const [id, voice] of Object.entries(THREAT_VOICES)) {
      if (id === 'blackout-chain') {
        expect(voice, 'the set piece lost its own voice').toBe('blackout-chain')
        continue
      }
      expect(voice, `${id} is not heard by a voice of its own`).toBe(`threat-${id}`)
      expect(elsewhere.has(voice), `${voice} is also played by something that is not the threat`).toBe(false)
    }
    // And the family is the whole of the new voices: a threat voice the
    // map does not reach would be a voice nothing plays.
    const named = Object.keys(SOUND_MS).filter((s) => s.startsWith('threat-'))
    expect(named.sort()).toEqual([...ownVoices].sort())
  })

  it('holds the family to its own ceiling, and the ceiling to under a second', () => {
    // A phrase, not an effect, so longer than 400ms; but a strike is in
    // flight for about a second and a half, less with Reduce Motion, and
    // a voice that outlasted its strike would be telling the last move
    // over the next one.
    expect(THREAT_VOICE_CEILING_MS).toBeGreaterThan(EFFECT_CEILING_MS)
    expect(THREAT_VOICE_CEILING_MS).toBeLessThan(1000)
    let long = 0
    for (const voice of ownVoices) {
      const ms = SOUND_MS[voice as SoundCue]
      expect(ms, `${voice} runs past the threats' ceiling`).toBeLessThanOrEqual(THREAT_VOICE_CEILING_MS)
      if (ms > EFFECT_CEILING_MS) long += 1
    }
    // The ceiling is used: if no voice were over 400ms the family would
    // need no rule of its own.
    expect(long, 'no threat voice is longer than an effect, so the family ceiling is an exemption nobody needs').toBeGreaterThan(0)
    for (const voice of ownVoices) expect(LONG_SOUNDS[voice], `${voice} is exempted twice`).toBeUndefined()
  })

  it('plays the voice from the one function the game calls, with nothing left on a timer', () => {
    // playMotif keeps its name and its shape for the game that calls it
    // (ui/three/Game3D.tsx): it plays the threat's voice now, through the
    // play it is handed, and hands back a cancel. An id the deck does not
    // know plays nothing, where the registry's strike falls back to the
    // stab: a strike never lands in silence, but one may leave in it.
    for (const ev of threats) {
      const played: SoundCue[] = []
      const cancel = playMotif((cue) => played.push(cue), ev.id)
      expect(played, `${ev.id} did not leave on its own voice, once`).toEqual([THREAT_VOICES[ev.id]])
      expect(() => cancel(), `${ev.id} handed back a cancel that throws`).not.toThrow()
      expect(played, `cancelling ${ev.id} played something`).toHaveLength(1)
    }
    const stray: SoundCue[] = []
    playMotif((cue) => stray.push(cue), 'not-real')
    expect(stray, 'a move the deck does not know left on a voice').toEqual([])
    const source = withoutComments(readFileSync(join(SRC, 'ui', 'three', 'sounds3d.ts'), 'utf8'))
    expect(source, 'a threat is back on a timer of borrowed notes').not.toMatch(/setTimeout/)
    const game = withoutComments(readFileSync(join(SRC, 'ui', 'three', 'Game3D.tsx'), 'utf8'))
    expect(game, 'the game no longer plays a threat as it leaves').toMatch(/playMotif\(play, s\.def\.id\)/)
  })
})

describe('severity pitches the stab (Round 4d)', () => {
  it('derives its ceiling from the deck and the engine, not from a written number', () => {
    // The exact value, recomputed here from the same two sources. Asserted
    // as "greater than the deck maximum" at first, which any literal above
    // three satisfies: a hard-coded 99 would collapse every hit to a fifth
    // of its intensity, flatten the stab's pitch spread from 260Hz to
    // about 13Hz, and pass.
    const deckMax = Math.max(...events.map((e) => Number(e.baseSeverity)))
    expect(MAX_EFFECTIVE_SEVERITY).toBe(deckMax + CHAIN_BONUS)
    // And the top of the range is actually reachable, which is what makes
    // it a ceiling rather than a number the game never approaches.
    expect(strikeIntensity(deckMax + CHAIN_BONUS)).toBe(1)
  })

  it('maps a real campaign-s severities into the unit range', () => {
    // Read off the night's own steps (src/ui/night/nightModel.ts), the
    // effective severity the night hands strikeIntensity, over a prepared
    // line and a passive one so both ends of the range occur.
    const seen = new Set<number>()
    for (const script of [WIN_SCRIPT, LOSS_SCRIPT]) {
      for (const { before, after } of playTurns(3, script)) {
        for (const step of nightOf(before, after).steps) {
          if (step.kind !== 'threat') continue
          const intensity = strikeIntensity(step.ev.effectiveSeverity)
          seen.add(step.ev.effectiveSeverity)
          expect(intensity, `${step.ev.eventId} produced ${intensity}`).toBeGreaterThanOrEqual(0)
          expect(intensity).toBeLessThanOrEqual(1)
        }
      }
    }
    expect(seen.size, 'the campaigns produced no spread of severities').toBeGreaterThan(2)
  })

  it('separates a mitigated hit from a full one', () => {
    expect(strikeIntensity(5)).toBeGreaterThan(strikeIntensity(1))
  })

  it('gives a strike with no severity the middle of the range rather than the bottom', () => {
    // The bottom is what a fully blocked move sounds like, and that
    // difference is the point of the cue.
    expect(strikeIntensity(undefined)).toBe(NEUTRAL_INTENSITY)
    expect(strikeIntensity(Number.NaN)).toBe(NEUTRAL_INTENSITY)
    expect(strikeIntensity(0)).toBe(0)
  })
})

describe('the controls the player triggers themselves (Round 4d)', () => {
  it('sounds the press that begins the night once, from the one click every input reaches', () => {
    // EXECUTE was a hold until v1.3 Round 0, and the hold needed three
    // rules to sound right: sweep when the ring started, sweep a keyboard
    // commit that had no ring, and never sweep twice when a held press
    // completed. A plain button sends a mouse click, a tap and a keyboard
    // activation to the same click handler, so the three collapse into
    // one shape: the sweep is named in code at exactly one place outside
    // the registry and the voice that synthesises it, that place is the
    // file the section 6 row says plays it, and it is the handler of the
    // one button that begins the night. A second site (a keydown path that
    // sweeps as well, say) is the double sweep coming back; none at all is
    // the silent keyboard commit.
    const row = SECTION_6_ROWS.find((r) => r.beat === 'EXECUTE TURN')
    expect(row, 'the EXECUTE TURN row is gone').toBeDefined()
    expect(row!.sound).toBe('execute-sweep')

    const registry = new Set([join(SRC, 'cues.ts'), join(SRC, 'audio', 'voices.ts')])
    const sites: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || registry.has(full)) continue
        const named = withoutComments(readFileSync(full, 'utf8')).match(/['"`]execute-sweep['"`]/g) ?? []
        for (let i = 0; i < named.length; i += 1) sites.push(full.slice(SRC.length + 1))
      }
    }
    walk(SRC)
    // One place since v2.0 R3, the 3D game's: the pixel board's EXECUTE,
    // which was the other, left with the board.
    expect(sites, 'the sweep must be played from exactly one place').toEqual([join(soundFile(row!.soundWhere))])

    // The sweep is joined to the press in two halves: the handler that
    // begins the night plays it, once the night is really begun (a night
    // that could break the budget is refused first, with the buzz), and
    // the one button that begins the night calls that handler on click.
    const source = withoutComments(readFileSync(join(SRC, soundFile(row!.soundWhere)), 'utf8'))
    const handler = /const begin = \(\) => \{([\s\S]*?)\n  \}\n/.exec(source)
    expect(handler, `${row!.soundWhere} has no handler that begins the night`).not.toBeNull()
    expect(handler![1], 'the sweep must sound from the handler that begins the night').toMatch(/\bplay\(\s*'execute-sweep'\s*\)/)
    expect(handler![1], 'the handler that sweeps does not begin the night').toMatch(/setPhase\(\s*'night'\s*\)/)
    const buttons = source.match(/<button\b(?:(?!<\/button>)[\s\S])*?\bdata-t3-begin\b[\s\S]*?<\/button>/g) ?? []
    expect(buttons, `${row!.soundWhere} must render exactly one button that begins the night`).toHaveLength(1)
    expect(buttons[0], 'the click must reach the handler that sweeps').toMatch(/onClick=\{begin\}/)
  })

  // RETIRED in v2.0 R3, with the pixel board's meters (ui/cues/Meter.tsx):
  // "names both sides of the MAI crossing" and "ties the meter tick to the
  // same tone the flash uses". The 3D game counts its score in silence;
  // the two rows say so in their `deferred` (src/cues.ts).
})

describe('the audio toggles (Round 4d)', () => {
  // The chrome word budget these were counted against (src/ui/brief.ts)
  // measured the pixel board's first screen and left with it in v2.0 R3.
  // What is left to hold is the names: one word each, and both listed
  // among SYSTEM's controls, from the one constant.
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

  it('names each toggle in one word', () => {
    expect(words(SOUND_TOGGLE_LABELS.effects)).toBe(1)
    expect(words(SOUND_TOGGLE_LABELS.music)).toBe(1)
  })

  it('lists both toggles among SYSTEM\'s controls, by the names the toggles carry', () => {
    const listed = SYSTEM_CONTROLS.map((c) => c.name)
    expect(listed).toContain(SOUND_TOGGLE_LABELS.effects)
    expect(listed).toContain(SOUND_TOGGLE_LABELS.music)
  })
})
