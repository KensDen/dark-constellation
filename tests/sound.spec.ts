// Sound cue coverage (Round 4d, brief section 8: "every event, condition
// and countermeasure ID in the content data resolves to a visual cue and a
// sound cue; fails the build otherwise").
//
// This is the visual coverage test's twin, and deliberately built the same
// way: the registry is walked, the section 6 table is checked against real
// beats rather than against a claim, and a placeholder anywhere fails. The
// registry is hand-keyed, so a new deck entry fails here until somebody
// decides what it sounds like.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import {
  BEAT_CUES,
  BEAT_KINDS,
  CONDITION_CUES,
  COUNTER_CUES,
  EVENT_CUES,
  LONG_SOUNDS,
  SECTION_6_ROWS,
  SOUND_MS,
  deriveBeats,
  soundFor,
  soundsAtInstantSpeed,
  type Cue,
  type SoundCue,
} from '../src/director'
import { VOICES } from '../src/audio/voices'
import { beatIntensity, MAX_EFFECTIVE_SEVERITY, NEUTRAL_INTENSITY } from '../src/audio/intensity'
import { holdSound } from '../src/ui/cues/HoldButton'
import { CROSSING_SOUND, TONE_SOUND } from '../src/ui/cues/Meter'
import { CHROME_WORD_BUDGET, SOUND_TOGGLE_LABELS, chromeCopy, chromeWords, countWords } from '../src/ui/brief'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAIN_BONUS, newGame, resolveTurn } from '../src/engine/reducer'
import { turnRng } from '../src/engine/rng'
import type { GameState, TurnActions } from '../src/engine/types'
import { LOSS_SCRIPT, NO_OP, WIN_SCRIPT } from './scripts'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const ALL_CUES: [string, Record<string, Cue>][] = [
  ['beat', BEAT_CUES as unknown as Record<string, Cue>],
  ['event', EVENT_CUES],
  ['condition', CONDITION_CUES],
  ['counter', COUNTER_CUES],
]

const events = DEFAULT_SCENARIO.events
const conditionEvents = events.filter((e) => e.duration)

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

const surgeLine = (state: GameState): TurnActions => {
  const base = WIN_SCRIPT[state.turn] ?? NO_OP
  return state.surgeTokens > 0 && state.conditions.length > 0
    ? { ...base, spendSurgeOn: state.conditions[0].instanceId }
    : base
}

function* playSurge(seed: number) {
  let state = newGame(DEFAULT_SCENARIO, seed)
  while (state.status === 'playing') {
    const next = resolveTurn(state, surgeLine(state), turnRng(state.seed, state.turn))
    yield { before: state, after: next } as { before: GameState; after: GameState }
    state = next
  }
}

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
    // them.
    const over: string[] = []
    for (const [sound, ms] of Object.entries(SOUND_MS)) {
      if (ms <= EFFECT_CEILING_MS) continue
      if (LONG_SOUNDS[sound]) continue
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
    // section 6 table, and the two component-owned maps. A voice nothing
    // reaches is either dead or a wiring that was never finished, and the
    // 4b lesson was that dead code should be removed rather than tested.
    const used = new Set<string>(SECTION_6_ROWS.map((r) => r.sound))
    for (const [, map] of ALL_CUES) for (const entry of Object.values(map)) used.add(entry.sound)
    for (const sound of Object.values(TONE_SOUND)) used.add(sound)
    for (const sound of Object.values(CROSSING_SOUND)) used.add(sound)
    for (const sound of Object.keys(VOICES)) {
      if (sound === 'placeholder') continue
      expect(used.has(sound), `voice ${sound} is declared but nothing ever plays it`).toBe(true)
    }
  })

  it('has a real sound for every row of section 6, in a file that exists', () => {
    for (const row of SECTION_6_ROWS) {
      expect(row.sound, `${row.beat} has a placeholder sound`).not.toBe('placeholder')
      expect(typeof VOICES[row.sound], `${row.beat} names a sound with no voice`).toBe('function')
      expect(existsSync(join(SRC, row.soundWhere)), `${row.beat} plays from ${row.soundWhere}, which does not exist`).toBe(
        true,
      )
    }
  })

  it('wires every section 6 row to code that actually plays its sound', () => {
    // The visual side's proof, applied to the other channel. A director
    // row is proven by a real beat of a real campaign resolving to that
    // sound; naming the helper would not be enough. A component row is
    // proven by the component naming the cue.
    const beatSounds = new Set<string>()
    // Keyed by beat kind, not merged into one set. A row repointed at an
    // unrelated voice satisfied the merged version whenever some OTHER
    // row's beat happened to play that voice, which is how the surge row
    // passed while pointing at the persistence tick.
    const soundsByKind = new Map<string, Set<string>>()
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const { before, after } of playSurge(seed)) {
        for (const beat of deriveBeats(before, after)) {
          const sound = soundFor(beat.cueKey, beat.kind, beat.title.startsWith('MISSION FAILED'))
          if (!sound) continue
          beatSounds.add(sound)
          if (!soundsByKind.has(beat.kind)) soundsByKind.set(beat.kind, new Set())
          soundsByKind.get(beat.kind)!.add(sound)
        }
      }
    }
    const unwired: string[] = []
    for (const row of SECTION_6_ROWS) {
      if (row.sound === 'silent') continue
      const fromKinds = new Set<string>()
      for (const kind of row.kinds ?? []) for (const s of soundsByKind.get(kind) ?? []) fromKinds.add(s)
      if (row.soundPerSubject === 'condition') {
        // The row stands for a family; the members are the registry's, and
        // the proof is that a real beat OF THIS ROW'S KINDS played one.
        const family = new Set(Object.values(CONDITION_CUES).map((c) => c.sound))
        if (![...family].some((s) => fromKinds.has(s))) {
          unwired.push(`${row.beat}: no beat of ${row.kinds?.join('/')} played a per-condition alarm`)
        }
        // And the row's own declared sound is a member of the family it
        // stands for. Without this the one field this branch exists to
        // describe went unread: the row could name the defeat sting and
        // nothing would notice.
        if (!family.has(row.sound)) {
          unwired.push(`${row.beat}: names ${row.sound}, which is not a member of the family it stands for`)
        }
        continue
      }
      if (row.soundWhere.startsWith('director/')) {
        if (!row.kinds?.length) {
          unwired.push(`${row.beat}: a director row must name the beat kinds that carry it`)
        } else if (!fromKinds.has(row.sound)) {
          unwired.push(`${row.beat}: no ${row.kinds.join('/')} beat ever plays ${row.sound}`)
        }
        continue
      }
      const source = readFileSync(join(SRC, row.soundWhere), 'utf8')
      if (!source.includes(row.sound)) unwired.push(`${row.beat}: ${row.soundWhere} never names ${row.sound}`)
    }
    expect(unwired.join('\n')).toBe('')
    expect(beatSounds.size, 'the sweep produced too few sounds to prove anything').toBeGreaterThan(6)
  })

  it('records which rows can sound at instant speed, derived from the table', () => {
    // Instant derives no beats, so every row the director plays is silent
    // there, and instant is what reduced motion selects by default. The
    // split is derived rather than listed, so a row that moves between a
    // component and the director moves here with it.
    // Anchored to real beats, not to the predicate. Comparing the
    // function's output against its own body proved only that it had been
    // copied correctly; what has to be true is that the rows it calls
    // silent are exactly the rows a real campaign's beats carry, because
    // those are the ones that vanish when no beats are derived.
    const fromBeats = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const { before, after } of playSurge(seed)) {
        for (const beat of deriveBeats(before, after)) {
          const sound = soundFor(beat.cueKey, beat.kind, beat.title.startsWith('MISSION FAILED'))
          if (sound && sound !== 'silent') fromBeats.add(sound)
        }
      }
    }
    const silent = SECTION_6_ROWS.filter((r) => !soundsAtInstantSpeed(r))
    const sounding = SECTION_6_ROWS.filter(soundsAtInstantSpeed)
    for (const row of silent) {
      const carried = row.soundPerSubject === 'condition'
        ? [...new Set(Object.values(CONDITION_CUES).map((c) => c.sound))].some((x) => fromBeats.has(x))
        : fromBeats.has(row.sound)
      expect(carried, `${row.beat} is called silent at instant speed but no beat carries its sound`).toBe(true)
    }
    for (const row of sounding) {
      expect(
        row.soundWhere.startsWith('director/'),
        `${row.beat} is called audible at instant speed but the director plays it`,
      ).toBe(false)
    }
    expect(silent.every((r) => !!r.kinds?.length), 'a silent-at-instant row names no beat kinds').toBe(true)
    // Recorded as a count so the balance cannot shift unnoticed: this is
    // the reduced-motion player's normal experience, and the brief has two
    // sentences about it that disagree.
    expect(silent.length).toBe(11)
    expect(sounding.length).toBe(5)
  })

  it('names only real beat kinds, and only on the rows the director plays', () => {
    for (const row of SECTION_6_ROWS) {
      if (!row.kinds) {
        expect(row.soundWhere.startsWith('director/'), `${row.beat} plays from a component but names beat kinds`).toBe(
          false,
        )
        continue
      }
      expect(row.soundWhere.startsWith('director/'), `${row.beat} names beat kinds but is not a director row`).toBe(true)
      for (const kind of row.kinds) {
        expect(BEAT_KINDS, `${row.beat} names a kind the director cannot emit: ${kind}`).toContain(kind)
      }
    }
  })

  it('sounds the two campaign outcomes differently', () => {
    // One beat kind covers both endings, so the registry alone cannot tell
    // them apart. Both are played from a real resolved campaign rather
    // than by calling soundFor with a boolean.
    const outcomes = new Map<string, string>()
    for (const [seed, script] of [
      [7, WIN_SCRIPT],
      [7, LOSS_SCRIPT],
    ] as const) {
      for (const { before, after } of playTurns(seed, script)) {
        for (const beat of deriveBeats(before, after)) {
          if (beat.kind !== 'outcome') continue
          const lost = beat.title.startsWith('MISSION FAILED')
          outcomes.set(lost ? 'lost' : 'won', soundFor(beat.cueKey, beat.kind, lost) ?? '')
        }
      }
    }
    expect([...outcomes.keys()].sort()).toEqual(['lost', 'won'])
    expect(outcomes.get('won')).toBe('victory-fanfare')
    expect(outcomes.get('lost')).toBe('defeat-sting')
    expect(outcomes.get('won')).not.toBe(outcomes.get('lost'))
  })

  it('lets the beat kind own the sound where the subject would say the wrong thing', () => {
    // A clear that played the subject's alarm would announce the problem
    // at the moment it went away, and a surge burn would announce the
    // condition it just destroyed.
    expect(soundFor('condition:pnt-jamming', 'condition-cleared')).toBe('resolve-chime')
    expect(soundFor('condition:pnt-jamming', 'surge-spent')).toBe('surge-burn')
    expect(soundFor('condition:pnt-jamming', 'condition-pressure')).toBe('soft-tick')
    // But an attaching condition keeps its own alarm, which is the whole
    // point of there being six of them.
    expect(soundFor('condition:pnt-jamming', 'condition-applied')).toBe('alarm-gnss')
    expect(soundFor('condition:ground-ransomware', 'condition-applied')).toBe('alarm-ransom')
  })

  it('returns nothing for a cue key it does not know', () => {
    expect(soundFor('event:not-real')).toBeUndefined()
    expect(soundFor('nonsense')).toBeUndefined()
  })

  it('carries a sound for every beat kind the director can emit', () => {
    for (const kind of BEAT_KINDS) {
      const sound = BEAT_CUES[kind].sound
      expect(sound, `beat kind ${kind} has no sound`).not.toBe('placeholder')
      expect(typeof VOICES[sound], `beat kind ${kind} names a sound with no voice`).toBe('function')
    }
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
    expect(beatIntensity({ severity: { base: deckMax, chain: CHAIN_BONUS, mitigation: 0, effective: deckMax + CHAIN_BONUS } })).toBe(1)
  })

  it('maps a real campaign-s severities into the unit range', () => {
    let seen = 0
    for (const { before, after } of playTurns(3, WIN_SCRIPT)) {
      for (const beat of deriveBeats(before, after)) {
        if (!beat.severity) continue
        seen += 1
        const intensity = beatIntensity(beat)
        expect(intensity, `${beat.id} produced ${intensity}`).toBeGreaterThanOrEqual(0)
        expect(intensity).toBeLessThanOrEqual(1)
      }
    }
    expect(seen, 'the campaign produced no beat carrying severity').toBeGreaterThan(0)
  })

  it('separates a mitigated hit from a full one', () => {
    const light = beatIntensity({ severity: { base: 1, chain: 0, mitigation: 0, effective: 1 } })
    const heavy = beatIntensity({ severity: { base: 3, chain: 2, mitigation: 0, effective: 5 } })
    expect(heavy).toBeGreaterThan(light)
  })

  it('gives a beat with no severity the middle of the range rather than the bottom', () => {
    // The bottom is what a fully mitigated event sounds like, and that
    // difference is the point of the cue.
    expect(beatIntensity({})).toBe(NEUTRAL_INTENSITY)
    expect(beatIntensity({ severity: undefined })).toBe(NEUTRAL_INTENSITY)
    expect(beatIntensity({ severity: { base: 0, chain: 0, mitigation: 0, effective: 0 } })).toBe(0)
  })
})

describe('the controls the player triggers themselves (Round 4d)', () => {
  it('sounds the hold when it starts, because the sweep is the ring filling', () => {
    expect(holdSound('start', false)).toBe('execute-sweep')
    expect(holdSound('cancel', true)).toBe('silent')
    expect(holdSound('none', false)).toBe('silent')
  })

  it('sounds a keyboard commit, which has no ring to fill', () => {
    // The one path with no visual feedback must not also be the one path
    // with no audible feedback.
    expect(holdSound('confirm', false)).toBe('execute-sweep')
  })

  it('does not sound the commit twice when a held press completes', () => {
    // A pointer hold already swept when it started; sweeping again on the
    // confirm would double it.
    expect(holdSound('confirm', true)).toBe('silent')
  })

  it('names both sides of the MAI crossing', () => {
    expect(CROSSING_SOUND.below).toBe('warn-low')
    expect(CROSSING_SOUND.recovered).toBe('relief-chime')
    expect(CROSSING_SOUND.below).not.toBe(CROSSING_SOUND.recovered)
  })

  it('ties the meter tick to the same tone the flash uses', () => {
    expect(TONE_SOUND.good).toBe('tick-up')
    expect(TONE_SOUND.bad).toBe('tick-down')
    // A change with no valence (a rebase, or a spend the player chose) is
    // silent rather than neutral-sounding.
    expect(TONE_SOUND.neutral).toBe('silent')
  })
})

describe('the audio toggles are chrome and are counted as chrome (Round 4d)', () => {
  it('spends exactly two words of the chrome budget', () => {
    expect(countWords(SOUND_TOGGLE_LABELS.effects)).toBe(1)
    expect(countWords(SOUND_TOGGLE_LABELS.music)).toBe(1)
  })

  it('counts both toggles in the chrome the budget bounds', () => {
    const state = newGame(DEFAULT_SCENARIO, 5)
    const chrome = chromeCopy(state)
    expect(chrome).toContain(SOUND_TOGGLE_LABELS.effects)
    expect(chrome).toContain(SOUND_TOGGLE_LABELS.music)
    expect(chromeWords(state)).toBeLessThanOrEqual(CHROME_WORD_BUDGET)
  })

  it('leaves the budget with room, so the next round is not squeezed by this one', () => {
    const state = newGame(DEFAULT_SCENARIO, 5)
    // Recorded rather than asserted loosely: Round 5 and Round 6 both add
    // controls, and a budget spent to the last word is a budget that will
    // be quietly raised.
    expect(CHROME_WORD_BUDGET - chromeWords(state)).toBeGreaterThanOrEqual(2)
  })
})
