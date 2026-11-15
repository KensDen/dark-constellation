// Cue coverage battery (brief v0.5 section 8). Every event and condition
// id in the content data, and every moment the night plays, must resolve
// to a cue entry. Round 3 tightens the gate: a visual placeholder now
// fails, so the round's closing condition ("every row of section 6 has its
// visual") is checked against the code rather than asserted in a report.
// The registry is hand-keyed on purpose, so a new deck entry fails here
// until someone decides what it looks and sounds like. The reverse check
// catches stale keys.
//
// Since v1.3 Round 3 the registry is src/cues.ts, keyed by the night's
// moments (brief 5.5) instead of the retired director's beat kinds.
//
// Since v2.0 R3 the 3D game is the only game. The pixel board's CSS
// classes for each visual (VISUAL_CLASS, VISUAL_MS and the night's own
// stylesheet) left with the board, and the checks that read those
// stylesheets left with them; what is held here is the registry and the
// section 6 table: every row names a file of the 3D game that exists, or
// says what it still owes.

import { describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CONDITION_CUES, EVENT_CUES, MOMENTS, MOMENT_CUES, SECTION_6_ROWS, resolveCue, type Cue } from '../src/cues'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ALL_CUES: [string, Record<string, Cue>][] = [
  ['moment', MOMENT_CUES as Record<string, Cue>],
  ['event', EVENT_CUES],
  ['condition', CONDITION_CUES],
]

const events = DEFAULT_SCENARIO.events
// Every event that leaves a condition: ThreatEvent.condition since v1.3
// Round 0, which replaced the rolled duration with a fixed clock.
const conditionEvents = events.filter((e) => e.condition)

const complete = (cue: { visual: string; sound: string; label: string } | undefined) =>
  !!cue && cue.label.length > 0 && cue.visual.length > 0 && cue.sound.length > 0

describe('cue coverage', () => {
  it('every event id resolves to a cue', () => {
    for (const ev of events) {
      expect(complete(EVENT_CUES[ev.id]), `event ${ev.id} has no cue`).toBe(true)
      expect(resolveCue(`event:${ev.id}`), ev.id).toBeTruthy()
    }
  })

  it('every condition-bearing event id resolves to a condition cue', () => {
    expect(conditionEvents.length).toBeGreaterThan(0)
    for (const ev of conditionEvents) {
      expect(complete(CONDITION_CUES[ev.id]), `condition ${ev.id} has no cue`).toBe(true)
      expect(resolveCue(`condition:${ev.id}`), ev.id).toBeTruthy()
    }
  })

  // RETIRED in v1.3 Round 3: "every countermeasure id resolves to a cue".
  // COUNTER_CUES left with the director's deploy-arrived beat, the one
  // thing that played them; a defense has no moment of its own in the
  // night.

  it('every moment the night plays resolves to a cue', () => {
    for (const moment of MOMENTS) {
      expect(complete(MOMENT_CUES[moment]), `moment ${moment} has no cue`).toBe(true)
      expect(resolveCue(`moment:${moment}`), moment).toBeTruthy()
    }
  })

  it('carries no stale keys for ids the deck no longer has', () => {
    const eventIds = new Set(events.map((e) => e.id))
    const conditionIds = new Set(conditionEvents.map((e) => e.id))
    for (const key of Object.keys(EVENT_CUES)) expect(eventIds.has(key), `stale event cue ${key}`).toBe(true)
    for (const key of Object.keys(CONDITION_CUES)) expect(conditionIds.has(key), `stale condition cue ${key}`).toBe(true)
    for (const key of Object.keys(MOMENT_CUES)) expect((MOMENTS as string[]).includes(key), `stale moment cue ${key}`).toBe(true)
  })

  it('counts derive from data: the registry sizes equal the deck sizes', () => {
    expect(Object.keys(EVENT_CUES).length).toBe(events.length)
    expect(Object.keys(CONDITION_CUES).length).toBe(conditionEvents.length)
    expect(Object.keys(MOMENT_CUES).length).toBe(MOMENTS.length)
    // The list is the walk every check here takes, so a moment named twice
    // would be checked twice and a moment left out not at all.
    expect(new Set(MOMENTS).size, 'MOMENTS names a moment twice').toBe(MOMENTS.length)
  })

  it('rejects malformed or unknown cue keys', () => {
    expect(resolveCue('nonsense')).toBeUndefined()
    expect(resolveCue('event:not-a-real-event')).toBeUndefined()
    expect(resolveCue('sound:pnt-jamming')).toBeUndefined()
    // The retired director's namespaces resolve to nothing, so a caller
    // still asking for a beat or a countermeasure cue is caught rather
    // than answered.
    expect(resolveCue('beat:threat')).toBeUndefined()
    expect(resolveCue('counter:antiJam')).toBeUndefined()
  })
})

describe('visual cue vocabulary (Round 3)', () => {
  it('leaves no visual placeholder anywhere in the registry', () => {
    const unfinished: string[] = []
    for (const [ns, map] of ALL_CUES) {
      for (const [id, entry] of Object.entries(map)) {
        if (entry.visual === 'placeholder') unfinished.push(`${ns}:${id}`)
      }
    }
    expect(unfinished.join(', ')).toBe('')
  })

  // RETIRED in v2.0 R3, with the pixel board: "backs every visual with a
  // class that exists in a stylesheet" and "keeps every animation behind
  // the reduced-motion guard". Both walked VISUAL_CLASS over src/index.css
  // and the night's own stylesheet; the map and that stylesheet are gone.

  it('has a real visual for every row of section 6, in a file that exists', () => {
    expect(SECTION_6_ROWS.length).toBeGreaterThan(0)
    let shown = 0
    for (const row of SECTION_6_ROWS) {
      expect(row.visual, `${row.beat} is still a placeholder`).not.toBe('placeholder')
      // A row shown nowhere is a row that owes its visual, and must say so
      // rather than pass as done.
      if (row.where === 'none') {
        expect(row.deferred, `${row.beat} is shown nowhere and does not say what it owes`).toBeTruthy()
        continue
      }
      shown += 1
      const file = join(SRC, row.where.split(' ')[0])
      expect(existsSync(file), `${row.beat} points at ${row.where}, which does not exist`).toBe(true)
    }
    // Most rows are shown: a table of rows that all owe their visual would
    // pass the loop above without one file being looked for.
    expect(shown, 'too few rows name a file, so the existence check proves little').toBeGreaterThan(SECTION_6_ROWS.length / 2)
  })

  it('shows every row as the registry shows the moments it names', () => {
    // A row that names moments must agree with the registry about what
    // those moments look like, or the table and the registry would
    // describe two different nights. Until v2.0 R3 this also read each
    // row's file for the CSS class of its visual; the classes were the
    // pixel board's and left with it.
    const unwired: string[] = []
    for (const row of SECTION_6_ROWS) {
      for (const moment of row.moments ?? []) {
        if (MOMENT_CUES[moment].visual !== row.visual) {
          unwired.push(`${row.beat}: the row shows ${row.visual}, the registry's ${moment} shows ${MOMENT_CUES[moment].visual}`)
        }
      }
    }
    expect(unwired.join('\n')).toBe('')
    expect(
      SECTION_6_ROWS.filter((r) => r.moments?.length).length,
      'no row names a moment, so the agreement above proves nothing',
    ).toBeGreaterThan(8)
  })

  // RETIRED in v1.3 Round 3, with the rows and the director they read:
  //   - "keeps the arrival row deferred while the frame it needs is off
  //     screen": the Deployment arrives row and its deploy-arrived beat
  //     left the table; the night has no arrival moment.
  //   - "gives every cinematic row a scene" and "backs every scene with an
  //     entrance": Scene.tsx and the dc-scene-* entrances were deleted, and
  //     rows carry no scene or cinematicInRound5.
  //   - "pins CARD_SAFE_VISUALS": the set decided what DirectorView ran on
  //     its one card.

  it('records what each deferred row still owes', () => {
    // A row that ships only part of its brief treatment says so, so the
    // battery cannot report an unfinished row as done.
    for (const row of SECTION_6_ROWS) {
      if (row.deferred) expect(row.deferred.length).toBeGreaterThan(8)
    }
    expect(SECTION_6_ROWS.filter((r) => r.deferred).length).toBeGreaterThan(0)
  })

  it('resolves a visual for a moment, event or condition key, and nothing for an unknown one', () => {
    // visualClass(cueKey, kind) retired with the director; the night
    // applies classes by name. What is left to resolve is the registry
    // entry, through the one function every namespace goes through.
    expect(resolveCue('moment:strike-hit')?.visual).toBe('strike')
    expect(resolveCue('moment:strike-block')?.visual).toBe('shield')
    expect(resolveCue('condition:pnt-jamming')?.visual).toBe('chip-in')
    expect(resolveCue('event:blackout-chain')?.visual).toBe('strike')
    expect(resolveCue('event:not-real')).toBeUndefined()
  })

  // RETIRED in v1.3 Round 3: "lets the beat kind own the visual where the
  // subject cue would say the wrong thing" (KIND_OWNS_TREATMENT and
  // visualFor left with the beats), and "plays the visual each beat kind
  // claims, over real play".
  //
  // RETIRED in v2.0 R3, with VISUAL_CLASS and VISUAL_MS: "uses every
  // declared visual treatment at least once", "leaves no declared visual
  // unreachable", and the whole of "cue timing and card safety" (the
  // stylesheet durations, the treatments that end hidden, the animations
  // outside the reduced-motion guard). Each walked the pixel board's
  // classes through its stylesheets.
})
