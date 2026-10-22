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
// file each row says plays it. The behavioural half, that a real night
// played through Game actually sounds each row at its moment, is in
// tests/sound.dom.spec.tsx.

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
  outcomeSound,
  resolveCue,
  strikeSound,
  type Cue,
  type SoundCue,
} from '../src/cues'
import { VOICES } from '../src/audio/voices'
import { strikeIntensity, MAX_EFFECTIVE_SEVERITY, NEUTRAL_INTENSITY } from '../src/audio/intensity'
import { CROSSING_SOUND, TONE_SOUND } from '../src/ui/cues/Meter'
import { CHROME_WORD_BUDGET, SOUND_TOGGLE_LABELS, chromeCopy, chromeWords, countWords, SYSTEM_GEAR_LABEL } from '../src/ui/brief'
import { SYSTEM_CONTROLS } from '../src/ui/board/SystemSheet'
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
// carry a note after it ("ui/night/Night.tsx (BEGIN TURN n)").
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
    // The node half of the proof; tests/sound.dom.spec.tsx is the other,
    // and hears each row's sound in a real night. Here the file a row
    // names must play the row's sound, which the night's files do in one
    // of three ways: by name ('tick-up'), through the registry entry of
    // one of the row's own moments whose sound it is
    // (MOMENT_CUES['turn-start'], MOMENT_CUES.collect), or through the
    // helper that resolves it per subject (strikeSound for a strike,
    // outcomeSound for the last END OF TURN, CONDITION_CUES for the alarm
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

  it('names only real moments, and only on the rows the night plays', () => {
    // A row the night plays names the moments that carry it, so the DOM
    // sweep can hear it at one of them; a row played from anywhere else
    // (the PROCURE controls, the meters) names none. The one row that
    // names a moment and plays from Game is EXECUTE: its sweep is the
    // press that opens COLDVEIL IS MOVING, which is itself silent.
    for (const row of SECTION_6_ROWS) {
      const fromNight = soundFile(row.soundWhere).startsWith('ui/night/')
      if (!row.moments) {
        expect(fromNight, `${row.beat} plays from the night but names no moment`).toBe(false)
        continue
      }
      expect(row.moments.length, `${row.beat} names an empty list of moments`).toBeGreaterThan(0)
      for (const moment of row.moments) {
        expect(MOMENTS, `${row.beat} names a moment the night does not play: ${moment}`).toContain(moment)
      }
      if (!fromNight) {
        expect(row.moments, `${row.beat} names moments but is not a night row`).toEqual(['moving'])
        expect(MOMENT_CUES.moving.sound, 'the overlay makes a sound of its own beside the EXECUTE sweep').toBe('silent')
      }
    }
  })

  it('sounds the two campaign outcomes differently', () => {
    // One moment covers both endings, so the registry alone cannot tell
    // them apart: outcomeSound does, and the two rows agree with it. A
    // real won and lost operation, played through Game to the last END OF
    // TURN, is heard in tests/sound.dom.spec.tsx.
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
  it('sounds EXECUTE once, from the one click every input reaches', () => {
    // EXECUTE was a hold until v1.3 Round 0, and the hold needed three
    // rules to sound right: sweep when the ring started, sweep a keyboard
    // commit that had no ring, and never sweep twice when a held press
    // completed. A plain button sends a mouse click, a tap and a keyboard
    // activation to the same click handler, so the three collapse into
    // one shape: the sweep is named in code at exactly one place outside
    // the registry and the voice that synthesises it, that place is the
    // file the section 6 row says plays it, and it is EXECUTE's click.
    // A second site (a keydown path that sweeps as well, say) is the
    // double sweep coming back; none at all is the silent keyboard commit.
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
    expect(sites, 'the sweep must be played from exactly one place').toEqual([join(row!.soundWhere)])

    // Since v1.3 R2 the button lives in the dock (src/ui/board/Dock.tsx),
    // which hands its click to the prop Game.tsx passes; so the sweep is
    // joined to EXECUTE in two halves: Game.tsx's onExecute plays it, and
    // the dock's data-execute button calls onExecute on click.
    const source = withoutComments(readFileSync(join(SRC, row!.soundWhere), 'utf8'))
    const dockTag = /<Dock\b[\s\S]*?\/>/.exec(source)
    expect(dockTag, `${row!.soundWhere} renders no dock`).not.toBeNull()
    expect(dockTag![0], 'the sweep must sound from the dock\'s EXECUTE handler').toMatch(
      /onExecute=\{[^}]*?\bplay\(\s*'execute-sweep'\s*\)/,
    )
    const dock = withoutComments(readFileSync(join(SRC, 'ui', 'board', 'Dock.tsx'), 'utf8'))
    const execute = /<button\b(?:(?!<\/button>)[\s\S])*?\bdata-execute\b[\s\S]*?<\/button>/.exec(dock)
    expect(execute, 'ui/board/Dock.tsx renders no EXECUTE button').not.toBeNull()
    expect(execute![0], 'the EXECUTE click must reach the handler that sweeps').toMatch(/onClick=\{p\.onExecute\}/)
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
    // Since v1.2 R1b the toggles sit in the SYSTEM sheet behind the gear,
    // so the first screen's chrome counts the gear's one word and the
    // sheet's own list names the toggles; tests/action-bar.dom.spec.tsx
    // renders that list. The two names still come from the one constant.
    const state = newGame(DEFAULT_SCENARIO, 5)
    const chrome = chromeCopy(state)
    expect(chrome).toContain(SYSTEM_GEAR_LABEL)
    const listed = SYSTEM_CONTROLS.map((c) => c.name)
    expect(listed).toContain(SOUND_TOGGLE_LABELS.effects)
    expect(listed).toContain(SOUND_TOGGLE_LABELS.music)
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
